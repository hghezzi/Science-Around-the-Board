import { describe, it, expect } from "vitest";
import {
  ECONOMY, QUIZ_RULES, MAX_LEVEL, shuffle, pickRandom, drawQuestions,
  canUpgradeSubgroup, nextUpgradeLevel, upgradeCost, applyUpgrade,
  liquidationValue, bankruptcyAction, downgradeSubgroup, sellDeed, releaseTiles,
  chaosStealCost, chaosFailPenalty, chaosTargets, chaosTokensForSale, computeRent, netWorth,
} from "../src/gameRules.js";
import { buildBoardFromTsv } from "../src/gameData.js";
import { parseTsv } from "../src/tsvParser.js";
import { DEMO_TSV } from "./helpers.js";

const prop = (id, sub, owner = null, level = 0, price = 100) => ({
  id, type: "property", group: "G", sub, owner, level, price, houseCost: price, castleCost: price * 2, baseRent: price * 0.2,
});
// Deterministic "random" sequence.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("economy constants (documented in the Instructor Guide)", () => {
  it("match the published rules", () => {
    expect(ECONOMY).toMatchObject({ startMoney: 2500, lapBonus: 200, wrongAnswerPenalty: 20, chaosTokenPrice: 500, rescueBonus: 500 });
    expect(QUIZ_RULES.milestone).toEqual({ questions: 6, pass: 5, maxMistakes: 2 });
    expect(QUIZ_RULES.rescue).toEqual({ questions: 3, pass: 2 });
    expect(MAX_LEVEL).toBe(4);
  });
});

describe("random selection", () => {
  it("shuffle returns a permutation and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it("pickRandom handles empty lists", () => {
    expect(pickRandom([])).toBeNull();
    expect(pickRandom(null)).toBeNull();
    expect(pickRandom(["a", "b"], () => 0.99)).toBe("b");
  });

  it("drawQuestions uses every question once before repeating any", () => {
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    for (let k = 0; k < 50; k++) {
      const exam = drawQuestions(pool, 6);
      expect(new Set(exam).size).toBe(6);
    }
    const small = drawQuestions(["a", "b"], 6);
    expect(small).toHaveLength(6);
    expect(small.filter((q) => q === "a")).toHaveLength(3);
  });

  it("drawQuestions ignores duplicates in the pool and handles empty input", () => {
    expect(new Set(drawQuestions(["a", "a", "b"], 2)).size).toBe(2);
    expect(drawQuestions([], 3)).toEqual([]);
    expect(drawQuestions(undefined, 3)).toEqual([]);
  });
});

describe("upgrades", () => {
  const owned = (level) => [prop(0, "a", 1, level), prop(1, "a", 1, level), prop(2, "a", 1, level), prop(3, "b", 1)];

  it("need the whole subgroup", () => {
    const board = [prop(0, "a", 1), prop(1, "a", 2)];
    expect(canUpgradeSubgroup(board, board[0], 1)).toBe(false);
    expect(canUpgradeSubgroup(owned(0), owned(0)[0], 1)).toBe(true);
    expect(canUpgradeSubgroup(owned(0), owned(0)[0], 2)).toBe(false);
    expect(canUpgradeSubgroup(owned(0), { type: "milestone", owner: 1 }, 1)).toBe(false);
  });

  it("raise levels evenly up to the maximum", () => {
    expect(nextUpgradeLevel(owned(0), owned(0)[0])).toBe(1);
    expect(nextUpgradeLevel(owned(3), owned(3)[0])).toBe(4);
    expect(nextUpgradeLevel(owned(4), owned(4)[0])).toBe(4);
    const uneven = [prop(0, "a", 1, 2), prop(1, "a", 1, 1)];
    expect(nextUpgradeLevel(uneven, uneven[0])).toBe(2);
  });

  it("cost the tile price, and double for the top level", () => {
    expect(upgradeCost(prop(0, "a"), 1)).toBe(100);
    expect(upgradeCost(prop(0, "a"), 4)).toBe(200);
    expect(upgradeCost({ type: "milestone", price: 500 }, 1)).toBe(0);
  });

  it("apply to the player's tiles in the subgroup only", () => {
    const board = applyUpgrade(owned(0), owned(0)[0], 1, 1);
    expect(board.map((t) => t.level)).toEqual([1, 1, 1, 0]);
  });
});

describe("bankruptcy", () => {
  const player = (money, extra = {}) => ({ id: 1, money, eliminated: false, rescueUsed: false, ...extra });

  it("values assets at half their cost, upgrades included", () => {
    const board = [prop(0, "a", 1, 2), prop(1, "a", 1, 2), { id: 2, type: "milestone", owner: 1, price: 500, level: 0, houseCost: 0 }];
    expect(liquidationValue(board, 1)).toBe(150 + 150 + 250);
    expect(liquidationValue(board, 2)).toBe(0);
  });

  it("liquidates when assets cover the debt, else offers one rescue, then eliminates", () => {
    const board = [prop(0, "a", 1)]; // worth $50 at liquidation
    expect(bankruptcyAction(player(10), board)).toBeNull();
    expect(bankruptcyAction(player(0), board)).toBeNull();
    expect(bankruptcyAction(player(-50), board)).toBe("liquidate");
    expect(bankruptcyAction(player(-51), board)).toBe("rescue");
    expect(bankruptcyAction(player(-51, { rescueUsed: true }), board)).toBe("eliminate");
    expect(bankruptcyAction(player(-1), [])).toBe("rescue");
    expect(bankruptcyAction(player(-1, { eliminated: true }), board)).toBeNull();
  });

  it("downgrades the whole subgroup by one level and refunds half the upgrade cost per tile", () => {
    const board = [prop(0, "a", 1, 2), prop(1, "a", 1, 2), prop(2, "a", 1, 2), prop(3, "b", 1, 1)];
    const r = downgradeSubgroup(board, board[0], 1);
    expect(r.refund).toBe(150);
    expect(r.board.map((t) => t.level)).toEqual([1, 1, 1, 1]);
  });

  it("does not touch (or refund) a tile of the subgroup that a rival stole", () => {
    // Team 1 upgraded "a" to level 2, then team 2 stole tile 2 with a Chaos Challenge (level reset to 0).
    const board = [prop(0, "a", 1, 2), prop(1, "a", 1, 2), prop(2, "a", 2, 0)];
    const r = downgradeSubgroup(board, board[0], 1);
    expect(r.refund).toBe(100);
    expect(r.board.map((t) => t.level)).toEqual([1, 1, 0]);
  });

  it("sells a deed for half its price and returns it to the bank", () => {
    const board = [prop(0, "a", 1, 0, 160)];
    const r = sellDeed(board, board[0]);
    expect(r.value).toBe(80);
    expect(r.board[0]).toMatchObject({ owner: null, level: 0 });
  });

  it("returns an eliminated team's tiles to the bank without upgrades", () => {
    const board = releaseTiles([prop(0, "a", 1, 3), prop(1, "a", 2, 1)], 1);
    expect(board.map((t) => [t.owner, t.level])).toEqual([[null, 0], [2, 1]]);
  });
});

describe("chaos challenge", () => {
  it("steals at half price and fines half the base rent", () => {
    expect(chaosStealCost(prop(0, "a", 1, 0, 160))).toBe(80);
    expect(chaosFailPenalty(prop(0, "a", 1, 0, 160))).toBe(16);
    expect(chaosFailPenalty({ baseRent: 0 })).toBe(10);
    expect(chaosFailPenalty({ baseRent: 1 })).toBe(20);
  });

  it("targets only rivals' properties", () => {
    const board = [prop(0, "a", 1), prop(1, "a", 2), prop(2, "a"), { id: 3, type: "milestone", owner: 2 }];
    expect(chaosTargets(board, 1).map((t) => t.id)).toEqual([1]);
  });

  it("sells tokens only once all milestones are owned", () => {
    const m = (owner) => ({ type: "milestone", owner });
    expect(chaosTokensForSale([m(0), m(1), m(null), m(0)])).toBe(false);
    expect(chaosTokensForSale([m(0), m(1), m(1), m(0)])).toBe(true);
  });
});

describe("a full game's economy on the demo board", () => {
  const board = buildBoardFromTsv("16S", parseTsv(DEMO_TSV), "QIIME2");

  it("charges rent by tile type", () => {
    const owned = board.map((t) => ({ ...t, owner: 0 }));
    expect(computeRent(owned, owned[1])).toBe(20); // sub1 property, full set, level 0
    expect(computeRent(owned, owned[4])).toBe(120); // core
    const partial = board.map((t, i) => (i === 5 ? { ...t, owner: 0 } : t));
    expect(computeRent(partial, partial[5])).toBe(16); // half rent without the full set
  });

  it("net worth counts cash plus tiles", () => {
    const owned = board.map((t) => (t.id === 1 || t.id === 9 ? { ...t, owner: 0 } : t));
    expect(netWorth({ id: 0, money: 1000 }, owned)).toBe(1000 + 100 + 500);
  });

  it("every property can be upgraded only by owning its 3-tile subgroup", () => {
    const firstSide = board.slice(1, 4).map((t) => ({ ...t, owner: 0 }));
    const rest = board.filter((t) => t.id < 1 || t.id > 3);
    const owned = [...firstSide, ...rest].sort((a, b) => a.id - b.id);
    expect(canUpgradeSubgroup(owned, owned[1], 0)).toBe(true);
    expect(canUpgradeSubgroup(owned, owned[5], 0)).toBe(false);
  });
});

describe("deterministic shuffle helper", () => {
  it("is a proper Fisher-Yates (no swaps when rng is just below 1)", () => {
    expect(shuffle([1, 2, 3], seq(0.999))).toEqual([1, 2, 3]);
    expect(shuffle([1, 2, 3], seq(0))).toEqual([2, 3, 1]);
  });
});
