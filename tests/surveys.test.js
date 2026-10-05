import { describe, it, expect } from "vitest";
import { parseTsv } from "../src/tsvParser.js";
import { buildSurveySets, buildConfidenceQuestions, SURVEY_QUESTIONS_PER_PLAYER } from "../src/surveys.js";
import { DEMO_TSV } from "./helpers.js";

const rows = parseTsv(DEMO_TSV);

describe("buildSurveySets", () => {
  it.each([1, 2, 3, 4])("gives each of %i player(s) a full set of survey questions", (playerCount) => {
    const sets = buildSurveySets(rows, { topic: "16S", module: "QIIME2", playerCount });
    expect(sets).toHaveLength(playerCount);
    sets.forEach((set) => {
      expect(set).toHaveLength(SURVEY_QUESTIONS_PER_PLAYER);
      set.forEach((q) => {
        expect(q.prompt).toBeTruthy();
        expect(Array.isArray(q.options)).toBe(true);
      });
      expect(new Set(set.map((q) => q.id)).size).toBe(set.length); // no repeats within a set
    });
  });

  it("only uses survey rows for the chosen topic and module", () => {
    const extra = [{ id: "other_1", question: "Elsewhere?", option1: "a", option2: "b", correctIndex: "1", type: "survey", bigTopic: "Other", module: "" }];
    const sets = buildSurveySets([...rows, ...extra], { topic: "16S", module: "QIIME2", playerCount: 4, perPlayer: 100 });
    sets.forEach((set) => expect(set.some((q) => q.id === "other_1")).toBe(false));
  });

  it("returns empty sets when the topic has no survey rows", () => {
    const sets = buildSurveySets(rows, { topic: "Nothing here", module: null, playerCount: 3 });
    expect(sets).toEqual([[], [], []]);
  });

  it("is reproducible with a seeded random generator", () => {
    const seeded = () => { let x = 42; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
    const a = buildSurveySets(rows, { topic: "16S", module: "QIIME2", playerCount: 2, rng: seeded() });
    const b = buildSurveySets(rows, { topic: "16S", module: "QIIME2", playerCount: 2, rng: seeded() });
    expect(a.map((set) => set.map((q) => q.id))).toEqual(b.map((set) => set.map((q) => q.id)));
  });
});

describe("buildConfidenceQuestions", () => {
  it("returns the demo's confidence statements as slider items", () => {
    const items = buildConfidenceQuestions(rows, { topic: "16S", module: "QIIME2" });
    expect(items).toHaveLength(3);
    items.forEach((item) => {
      expect(item.key).toBeTruthy();
      expect(item.label).toBeTruthy();
    });
  });
});
