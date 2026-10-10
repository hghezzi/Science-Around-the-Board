// Solo play: own tiles pay rent from the bank, a net-worth goal, personal bests.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SOLO, soloGoal, soloOwnTileIncome, acquireTile, applyUpgrade, ECONOMY } from "../src/gameRules.js";
import { rulesFor, RULES } from "../src/labels.js";
import { getPersonalBest, recordPersonalBest } from "../src/personalBest.js";
import { GUEST_ACTIONS } from "../src/online/protocol.js";
import { buildBoardFromTsv } from "../src/gameData.js";
import { parseTsv } from "../src/tsvParser.js";
import { DEMO_TSV } from "./helpers.js";

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get size() { return m.size; } };
};

describe("solo goal", () => {
  it("grows with the session length, and no timer uses the 60-minute goal", () => {
    expect(soloGoal(30)).toBeLessThan(soloGoal(45));
    expect(soloGoal(45)).toBeLessThan(soloGoal(60));
    expect(soloGoal(60)).toBeLessThan(soloGoal(90));
    expect(soloGoal(0)).toBe(soloGoal(60));
    expect(soloGoal(60)).toBe(2 * ECONOMY.startMoney[1]); // "double your money"
    expect(soloGoal(17)).toBe(SOLO.goals[0]);
  });
});

describe("own tiles pay rent in solo", () => {
  const board = buildBoardFromTsv("16S", parseTsv(DEMO_TSV), "QIIME2");
  const prop = board.find((t) => t.type === "property");
  const set = board.filter((t) => t.type === "property" && t.group === prop.group && t.sub === prop.sub);

  it("pays the rent a rival would pay: half without the set, full with it, more with upgrades", () => {
    let b = acquireTile(board, prop, 0, prop.price);
    expect(soloOwnTileIncome(b, b[prop.id])).toBe(Math.floor(prop.baseRent * 0.5));
    for (const t of set) b = acquireTile(b, t, 0, t.price);
    expect(soloOwnTileIncome(b, b[prop.id])).toBe(prop.baseRent);
    b = applyUpgrade(b, b[prop.id], 0, 1);
    expect(soloOwnTileIncome(b, b[prop.id])).toBe(prop.baseRent * 3);
  });

  it("pays the milestone fee on an own milestone and grows with core tiles held", () => {
    const mile = board.find((t) => t.type === "milestone");
    expect(soloOwnTileIncome(acquireTile(board, mile, 0, mile.price), { ...mile, owner: 0 })).toBe(ECONOMY.milestoneFee);
    const cores = board.filter((t) => t.type === "sequencing_core");
    let b = acquireTile(board, cores[0], 0, cores[0].price);
    expect(soloOwnTileIncome(b, b[cores[0].id])).toBe(ECONOMY.coreRentStep);
    b = acquireTile(b, cores[1], 0, cores[1].price);
    expect(soloOwnTileIncome(b, b[cores[0].id])).toBe(2 * ECONOMY.coreRentStep);
  });

  it("can be answered from a device in an online game", () => {
    expect(GUEST_ACTIONS.has("answerOwnTile")).toBe(true);
  });
});

describe("quick rules", () => {
  it("replace rent, chaos tokens and the ranking with the solo rules", () => {
    const solo = rulesFor(1).map((r) => r.title);
    expect(solo).toContain("Your own tiles pay (solo)");
    expect(solo).toContain("Solo goal");
    expect(solo).not.toContain("Paying rent");
    expect(solo).not.toContain("Chaos tokens");
    expect(solo).not.toContain("Winning");
    expect(rulesFor(3)).toEqual(RULES);
    expect(rulesFor().length).toBe(RULES.length + 3); // the start page shows solo and bot rules too
  });
});

describe("personal best", () => {
  beforeEach(() => { globalThis.localStorage = memoryStorage(); });
  afterEach(() => { delete globalThis.localStorage; });
  const game = { topic: "16S", module: "QIIME2", minutes: 60 };

  it("keeps the best net worth per game and session length", () => {
    expect(getPersonalBest(game)).toBeNull();
    expect(recordPersonalBest(game, { netWorth: 4000, accuracy: 70 })).toEqual({ previous: null, isNew: true });
    expect(recordPersonalBest(game, { netWorth: 3500 }).isNew).toBe(false);
    const r = recordPersonalBest(game, { netWorth: 6000, accuracy: 85 });
    expect(r.isNew).toBe(true);
    expect(r.previous.netWorth).toBe(4000);
    expect(getPersonalBest(game).netWorth).toBe(6000);
    expect(getPersonalBest({ ...game, minutes: 30 })).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => recordPersonalBest(game, { netWorth: 1 })).not.toThrow();
    delete globalThis.localStorage;
    expect(getPersonalBest(game)).toBeNull();
  });
});
