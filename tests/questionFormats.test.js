import { describe, it, expect } from "vitest";
import {
  parseFormat, parseTolerance, normalizeText, normalizeQuestion, prepareQuestion,
  checkAnswer, hasResponse, parseMishapAmount, hasExplicitMishapAmount,
} from "../src/questionFormats.js";

const row = (o) => ({ id: "q1", question: "Q?", option1: "A", option2: "B", option3: "C", option4: "D", correctIndex: "2", explanation: "E", ...o });

// Deterministic "random" sequence for shuffle tests.
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe("parsing", () => {
  it("maps format aliases and defaults blank to mcq", () => {
    expect(parseFormat("")).toBe("mcq");
    expect(parseFormat(" Multi-Select ")).toBe("multi");
    expect(parseFormat("ordering")).toBe("order");
    expect(parseFormat("essay")).toBeNull();
  });
  it("parses tolerances", () => {
    expect(parseTolerance("")).toEqual({ abs: 0 });
    expect(parseTolerance("0.5")).toEqual({ abs: 0.5 });
    expect(parseTolerance("5%")).toEqual({ pct: 5 });
    expect(parseTolerance("abc")).toBeNull();
  });
  it("normalizes text for comparison", () => {
    expect(normalizeText("  Beta-Diversity! ")).toBe("beta diversity");
    expect(normalizeText("Café")).toBe("cafe");
  });
  it("keeps legacy mcq fields", () => {
    const q = normalizeQuestion(row({ imageFile: "x.png" }));
    expect(q).toMatchObject({ id: "q1", format: "mcq", prompt: "Q?", options: ["A", "B", "C", "D"], answer: 1, image: "x.png" });
  });
  it("treats blank options 3/4 as true/false", () => {
    const q = normalizeQuestion(row({ option1: "True", option2: "False", option3: "", option4: "", correctIndex: "1" }));
    expect(q.options).toEqual(["True", "False"]);
  });
});

describe("prepareQuestion", () => {
  it("shuffles mcq options and remaps the answer", () => {
    const q = normalizeQuestion(row());
    for (let k = 0; k < 20; k++) {
      const p = prepareQuestion(q);
      expect(p.options[p.answer]).toBe("B");
      expect([...p.options].sort()).toEqual(["A", "B", "C", "D"]);
    }
  });
  it("remaps multi-select answers", () => {
    const q = normalizeQuestion(row({ format: "multi", correctIndex: "1,3" }));
    for (let k = 0; k < 20; k++) {
      const p = prepareQuestion(q);
      expect(p.answers.map((i) => p.options[i]).sort()).toEqual(["A", "C"]);
    }
  });
  it("never shows an ordering question already solved", () => {
    const q = normalizeQuestion(row({ format: "order" }));
    const p = prepareQuestion(q, seq(0.99)); // identity shuffle
    expect(p.options).not.toEqual(q.correctOrder);
    expect(p.correctOrder).toEqual(["A", "B", "C", "D"]);
  });
});

describe("checkAnswer", () => {
  it("mcq", () => {
    const q = normalizeQuestion(row());
    expect(checkAnswer(q, 1)).toEqual({ correct: true, responseText: "B", correctText: "B" });
    expect(checkAnswer(q, 0).correct).toBe(false);
    expect(checkAnswer(q, null).correct).toBe(false);
  });
  it("multi requires the exact set", () => {
    const q = normalizeQuestion(row({ format: "multi", correctIndex: "1, 3" }));
    expect(checkAnswer(q, [2, 0]).correct).toBe(true);
    expect(checkAnswer(q, [0]).correct).toBe(false);
    expect(checkAnswer(q, [0, 2, 3]).correct).toBe(false);
    expect(checkAnswer(q, [0, 2]).correctText).toBe("A; C");
  });
  it("numeric with absolute and percent tolerance", () => {
    const exact = normalizeQuestion(row({ format: "numeric", answer: "9" }));
    expect(checkAnswer(exact, "9").correct).toBe(true);
    expect(checkAnswer(exact, "9.1").correct).toBe(false);
    const pct = normalizeQuestion(row({ format: "numeric", answer: "1,500", tolerance: "10%" }));
    expect(checkAnswer(pct, "1400").correct).toBe(true);
    expect(checkAnswer(pct, "1349").correct).toBe(false);
    expect(checkAnswer(pct, "abc").correct).toBe(false);
    const abs = normalizeQuestion(row({ format: "numeric", answer: "2.5", tolerance: "0.1" }));
    expect(checkAnswer(abs, 2.6).correct).toBe(true);
    expect(checkAnswer(abs, "2.61").correct).toBe(false);
  });
  it("order requires the exact sequence", () => {
    const q = normalizeQuestion(row({ format: "order" }));
    expect(checkAnswer(q, ["A", "B", "C", "D"]).correct).toBe(true);
    expect(checkAnswer(q, ["B", "A", "C", "D"]).correct).toBe(false);
    expect(checkAnswer(q, ["A", "B", "C", "D"]).correctText).toBe("A → B → C → D");
  });
  it("text accepts alternatives, ignores case/punctuation, tolerates one typo on longer answers", () => {
    const q = normalizeQuestion(row({ format: "text", answer: "beta diversity|beta|β" }));
    expect(checkAnswer(q, "Beta").correct).toBe(true);
    expect(checkAnswer(q, "beta-diversity").correct).toBe(true);
    expect(checkAnswer(q, "beta diversty").correct).toBe(true);
    expect(checkAnswer(q, "alpha").correct).toBe(false);
    expect(checkAnswer(q, "bet").correct).toBe(false);
    expect(checkAnswer(q, "").correct).toBe(false);
    const short = normalizeQuestion(row({ format: "text", answer: ".qzv" }));
    expect(checkAnswer(short, "QZV").correct).toBe(true);
    expect(checkAnswer(short, "qza").correct).toBe(false);
  });
  it("hasResponse", () => {
    const multi = normalizeQuestion(row({ format: "multi", correctIndex: "1" }));
    expect(hasResponse(multi, [])).toBe(false);
    expect(hasResponse(normalizeQuestion(row({ format: "text", answer: "x" })), "  ")).toBe(false);
  });
});

describe("parseMishapAmount", () => {
  it.each([
    ["Freezer failure! Samples thawed. (-$100)", -100],
    ["Grant received! (+$100)", 100],
    ["Grant renewed +$1,200", 1200],
    ["COVID-19 lockdown! (-$75)", -75],
    ["Server upgrade (+25)", 25],
    ["Lose $60 on reagents", -60],
    ["Found money +", 50],
    ["Something broke", -100],
  ])("%s -> %d", (text, amount) => {
    expect(parseMishapAmount(text)).toBe(amount);
  });
  it("detects explicit amounts", () => {
    expect(hasExplicitMishapAmount("Oops (-$100)")).toBe(true);
    expect(hasExplicitMishapAmount("COVID-19 lockdown")).toBe(false);
  });
});
