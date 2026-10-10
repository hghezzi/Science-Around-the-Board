// The solo bot: its answers for every question format, its accuracy, and its choices.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BOT_LEVELS, BOT_LEVEL_IDS, BOT_RESERVE, botAccuracy, botKnows, botResponse, resultDelay, shouldBuy,
  upgradeChoice, chaosChoice, liquidationChoice,
} from "../src/bot.js";
import { checkAnswer, normalizeQuestion, prepareQuestion } from "../src/questionFormats.js";
import { acquireTile, applyUpgrade, chaosStealCost } from "../src/gameRules.js";
import { rulesFor, RULES, BOT_RULE } from "../src/labels.js";
import { getBotRecord, recordBotGame } from "../src/personalBest.js";
import { buildBoardFromTsv } from "../src/gameData.js";
import { parseTsv } from "../src/tsvParser.js";
import { DEMO_TSV } from "./helpers.js";

const rows = parseTsv(DEMO_TSV);
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe("bot answers", () => {
  const byFormat = {};
  rows.filter((r) => ["property", "milestone", "core"].includes(r.type)).forEach((r) => {
    const q = normalizeQuestion(r);
    (byFormat[q.format || "mcq"] ||= []).push(q);
  });

  it("covers every format in the demo", () => {
    expect(Object.keys(byFormat).sort()).toEqual(["mcq", "multi", "numeric", "order", "text"]);
  });

  for (const format of ["mcq", "multi", "numeric", "order", "text"]) {
    it(`a known ${format} answer is right and an unknown one is wrong`, () => {
      const rng = seeded(7);
      for (const raw of byFormat[format]) {
        for (let k = 0; k < 5; k++) {
          const q = prepareQuestion(raw, rng);
          expect(checkAnswer(q, botResponse(q, true, rng)).correct).toBe(true);
          expect(checkAnswer(q, botResponse(q, false, rng)).correct).toBe(false);
        }
      }
    });
  }

  it("is right about as often as its level says", () => {
    const rng = seeded(3);
    for (const level of BOT_LEVEL_IDS) {
      let right = 0;
      for (let i = 0; i < 20000; i++) right += botKnows(level, rng) ? 1 : 0;
      expect(right / 20000).toBeCloseTo(botAccuracy(level), 1);
    }
  });

  it("levels get harder in order, and an unknown level plays Medium", () => {
    expect(BOT_LEVELS.easy.accuracy).toBeLessThan(BOT_LEVELS.medium.accuracy);
    expect(BOT_LEVELS.medium.accuracy).toBeLessThan(BOT_LEVELS.hard.accuracy);
    expect(botAccuracy("nope")).toBe(BOT_LEVELS.medium.accuracy);
  });

  it("leaves longer explanations on screen longer, and Skip ahead is quick", () => {
    expect(resultDelay("x".repeat(300))).toBeGreaterThan(resultDelay("short"));
    expect(resultDelay("x".repeat(5000))).toBeLessThanOrEqual(6000);
    expect(resultDelay("x".repeat(300), true)).toBeLessThan(500);
    expect(resultDelay("x".repeat(300), false, true)).toBeLessThan(resultDelay("x".repeat(300)));
  });
});

describe("bot choices", () => {
  const board = buildBoardFromTsv("16S", rows, "QIIME2");
  const prop = board.find((t) => t.type === "property");
  const set = board.filter((t) => t.type === "property" && t.group === prop.group && t.sub === prop.sub);
  const own = (b, tiles, id) => tiles.reduce((acc, t) => acquireTile(acc, t, id, t.price), b);

  it("buys only while keeping a reserve", () => {
    expect(shouldBuy({ money: prop.price + BOT_RESERVE }, prop)).toBe(true);
    expect(shouldBuy({ money: prop.price + BOT_RESERVE - 1 }, prop)).toBe(false);
  });

  it("upgrades a complete set it can afford, never below its reserve", () => {
    const b = own(board, set, 1);
    expect(upgradeChoice(b, 1, 5000)).toMatchObject({ level: 1 });
    expect(upgradeChoice(b, 1, 0)).toBeNull();
    expect(upgradeChoice(own(board, set.slice(1), 1), 1, 5000)).toBeNull(); // incomplete set
  });

  it("challenges for the most valuable unprotected rival tile it can afford", () => {
    const rivalTiles = board.filter((t) => t.type === "property").filter((_, i) => i % 3 === 0).slice(0, 4);
    const b = own(board, rivalTiles, 0);
    const pick = chaosChoice(b, { id: 1, money: 5000, chaosTokens: 1 });
    expect(rivalTiles.map((t) => t.id)).toContain(pick.id);
    expect(pick.price).toBe(Math.max(...rivalTiles.map((t) => t.price)));
    expect(chaosChoice(b, { id: 1, money: 5000, chaosTokens: 0 })).toBeNull();
    expect(chaosChoice(b, { id: 1, money: chaosStealCost(pick) + BOT_RESERVE - 1, chaosTokens: 1 })?.id).not.toBe(pick.id);
  });

  it("sells a lone deed before breaking up a complete or upgraded set", () => {
    const lone = board.find((t) => t.type === "property" && t.group !== prop.group);
    let b = own(own(board, set, 1), [lone], 1);
    expect(liquidationChoice(b, 1).id).toBe(lone.id);
    b = applyUpgrade(b, set[0], 1, 1);
    expect(liquidationChoice(b, 1).id).toBe(lone.id);
    expect(liquidationChoice(board, 1)).toBeNull();
  });
});

describe("rules and records against the bot", () => {
  it("uses the two-player rules plus the bot rule", () => {
    const r = rulesFor(1, true);
    expect(r).toContain(BOT_RULE);
    expect(r.length).toBe(RULES.length + 1);
    expect(r.at(-1).title).toBe("Winning");
  });

  let saved;
  beforeEach(() => {
    saved = globalThis.localStorage;
    const m = new Map();
    globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  });
  afterEach(() => { globalThis.localStorage = saved; });

  it("keeps wins and games per level, separate from goal-mode bests", () => {
    const game = { topic: "16S", module: "QIIME2", minutes: 30 };
    expect(getBotRecord(game, "medium")).toBeNull();
    recordBotGame(game, "medium", { won: true, netWorth: 3000 });
    recordBotGame(game, "medium", { won: false, netWorth: 4000 });
    expect(getBotRecord(game, "medium")).toMatchObject({ wins: 1, games: 2, bestNetWorth: 4000 });
    expect(getBotRecord(game, "hard")).toBeNull();
  });
});
