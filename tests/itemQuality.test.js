import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTsv, parseTsvHeaders } from "../src/tsvParser.js";
import { checkItemQuality, contentWords, formatCueSummary } from "../src/itemQuality.js";
import { validateQuestionRows } from "../src/tsvValidator.js";
import { DEMO_TSV, HEADER, makeTsv } from "./helpers.js";

vi.spyOn(console, "log").mockImplementation(() => {});

const STATS_TSV = readFileSync(fileURLToPath(new URL("../public/examples/intro_statistics.tsv", import.meta.url)), "utf8");
const PY_VALIDATOR = fileURLToPath(new URL("../.claude/skills/sab-question-writer/scripts/validate_tsv.py", import.meta.url));

let n = 0;
/** One question row; `correct` is 1-based. */
const q = (question, options, correct = 1, extra = {}) => ({
  id: `q${n++}`, question, option1: options[0] || "", option2: options[1] || "", option3: options[2] || "",
  option4: options[3] || "", correctIndex: String(correct), explanation: "Why.", type: "property", ...extra,
});

// The correct answer is always the long, careful one.
const longCorrect = (k) => q(`Question number ${k} about topic ${k}?`, [
  `A careful, detailed and fully qualified statement number ${k}`, "Short wrong", "Another wrong", "Nope",
]);
// Balanced: every option has the same length, so length is no help.
const balanced = (k) => q(`Balanced question ${k}?`, ["Alpha", "Bravo", "Charl", "Delta"], (k % 4) + 1);

describe("answer-length cues", () => {
  it("flags single questions whose correct answer is much longer than the distractors", () => {
    const r = checkItemQuality([longCorrect(1)]);
    expect(r.warnings.join("\n")).toMatch(/Correct answer much longer than the other options \(1\.5× .*"q\d+" \(\d+ vs \d+ characters\)/);
  });

  it("does not flag small differences in length", () => {
    const r = checkItemQuality([q("What is it?", ["The feature table", "The tree file", "The metadata", "The taxonomy"])]);
    expect(r.warnings).toEqual([]);
  });

  it("reports the score of always picking the longest option, compared with chance", () => {
    const rows = Array.from({ length: 12 }, (_, k) => longCorrect(k));
    const r = checkItemQuality(rows);
    expect(r.cues.items).toBe(12);
    expect(r.cues.longest).toBe(1);
    expect(r.cues.chance).toBeCloseTo(0.25);
    expect(r.warnings.join("\n")).toMatch(/always picking the longest option would answer 100% of the 12 multiple-choice questions correctly \(chance is 25%\)/);
  });

  it("reports the reverse cue when correct answers are usually the shortest", () => {
    const rows = Array.from({ length: 12 }, (_, k) => q(`Q${k}?`, ["Yes", "A long but wrong answer here", "Another long wrong answer", "Third long wrong answer"]));
    const r = checkItemQuality(rows);
    expect(r.cues.shortest).toBe(1);
    expect(r.warnings.join("\n")).toMatch(/always picking the shortest option would answer 100%/);
  });

  it("splits ties at random and stays quiet when length is uninformative", () => {
    const rows = Array.from({ length: 20 }, (_, k) => balanced(k));
    const r = checkItemQuality(rows);
    expect(r.cues.longest).toBeCloseTo(0.25);
    expect(r.cues.shortest).toBeCloseTo(0.25);
    expect(r.warnings).toEqual([]);
  });

  it("needs enough questions before reporting a file-level cue", () => {
    const rows = Array.from({ length: 9 }, () => q("Q?", ["Longer right answer", "Wrong one", "Wrong two", "Wrong 3"]));
    expect(checkItemQuality(rows).warnings.join("\n")).not.toMatch(/Length cue/);
  });

  it("ignores true/false and non-multiple-choice formats", () => {
    const rows = [
      ...Array.from({ length: 12 }, () => q("True or false?", ["True", "False"])),
      ...Array.from({ length: 12 }, () => q("Order these", ["A much longer first step", "B", "C"], 1, { format: "order" })),
    ];
    const r = checkItemQuality(rows);
    expect(r.cues.items).toBe(0);
    expect(r.warnings).toEqual([]);
  });
});

describe("other answer cues", () => {
  it("flags options that refer to other options", () => {
    const r = checkItemQuality([
      q("Which?", ["Red", "Blue", "All of the above", "Green"], 3),
      q("Which two?", ["Both A and B", "Red", "Blue", "Green"]),
      q("Pick", ["Option 2 is wrong", "Red", "Blue", "Green"]),
    ]);
    expect(r.warnings.join("\n")).toMatch(/Option refers to other options .*"q\d+", "q\d+", "q\d+"/);
  });

  it("does not mistake ordinary wording for an option reference", () => {
    const r = checkItemQuality([q("Which?", ["Vitamin A and C intake", "All of the samples", "Answer a survey", "None"])]);
    expect(r.warnings.join("\n")).not.toMatch(/refers to other options/);
  });

  it("flags identical options", () => {
    expect(checkItemQuality([q("Q?", ["Same", "same", "Other", "Third"])]).warnings.join("\n")).toMatch(/identical/);
  });

  it("flags a stem ending in 'an' when some options start with a consonant", () => {
    const r = checkItemQuality([q("A rarefaction curve is an", ["Estimate of richness", "Tree", "Plot", "Table"])]);
    expect(r.warnings.join("\n")).toMatch(/ends with "a" or "an"/);
    expect(checkItemQuality([q("Pick an", ["Apple", "Egg", "Ice", "Owl"])]).warnings).toEqual([]);
  });

  it("measures the option that repeats the question's words", () => {
    const rows = Array.from({ length: 12 }, (_, k) =>
      q(`Why does rarefaction normalize sequencing depth in study ${k}?`, ["Rarefaction normalizes sequencing depth", "It removes chimeras", "It assigns taxa", "It builds a tree"]));
    const r = checkItemQuality(rows);
    expect(r.cues.overlap).toBe(1);
    expect(r.warnings.join("\n")).toMatch(/Wording cue: picking the option that repeats the most words from the question would answer 100% of the 12/);
  });

  it("flags absolute words that appear only in distractors", () => {
    const rows = Array.from({ length: 8 }, (_, k) =>
      q(`Question ${k}?`, ["It depends on the data", "It is always true", "It never happens", "Every sample fails"]));
    const r = checkItemQuality(rows);
    expect(r.cues.absoluteOptions).toBe(24);
    expect(r.cues.absoluteCorrect).toBe(0);
    expect(r.warnings.join("\n")).toMatch(/Absolute-word cue: 24 options .* but none of them are correct answers \(about 6 expected by chance\)/);
  });

  it("errors on spreadsheet error values such as #NAME?", () => {
    const r = checkItemQuality([q("Which flag is missing?", ["#NAME?", "#NAME?", "#NAME?", "#NAME?"])]);
    expect(r.errors.join("\n")).toMatch(/Spreadsheet error value \(such as #NAME\?\)/);
  });

  it.each(["#NAME?", "#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NUM!", "#NULL!"])("errors on %s in any cell", (value) => {
    expect(checkItemQuality([q("Fine question?", ["A", "B", "C", "D"], 1, { explanation: value })]).errors).toHaveLength(1);
    expect(checkItemQuality([{ id: "m", type: "mishap", question: value }]).errors).toHaveLength(1);
  });

  it("does not mistake a hashtag or note for a spreadsheet error", () => {
    expect(checkItemQuality([q("What does #N/A mean in Excel?", ["#1 ranked", "A", "B", "C"])]).errors).toEqual([]);
  });

  it("flags survey questions that repeat a board question", () => {
    const board = q("Which artifact stores the feature counts for each sample?", ["Table", "Tree", "Taxonomy", "Metadata"]);
    const survey = q("Which artifact stores the feature counts for each sample?", ["Table", "Tree", "Taxonomy", "Metadata"], 1, { type: "survey" });
    const parallel = q("You need per-sample ASV abundances for a barplot. Which file do you supply?", ["Table", "Tree", "Taxonomy", "Metadata"], 1, { type: "survey" });
    const r = checkItemQuality([board, survey, parallel]);
    expect(r.warnings.join("\n")).toMatch(new RegExp(`Survey question nearly repeats a board question.*"${survey.id}" ≈ "${board.id}"`));
    expect(r.warnings.join("\n")).not.toMatch(new RegExp(`"${parallel.id}"`));
  });

  it("extracts content words without function words or plural s", () => {
    expect([...contentWords("Which of these samples have the most reads?")]).toEqual(["sample", "read"]);
  });
});

describe("answer cues in the full validator", () => {
  const validate = (text) => validateQuestionRows(parseTsv(text), parseTsvHeaders(text));

  it("keeps the minimal test file clean", () => {
    expect(validate(makeTsv()).warnings).toEqual([]);
  });

  it("adds cue warnings and a summary line to the report", () => {
    const extra = Array.from({ length: 12 }, (_, k) =>
      [`long${k}`, `Question ${k}?`, "A careful, detailed and fully qualified correct statement", "Wrong", "Also wrong", "No", "1", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t"));
    const r = validate(makeTsv({ extra }));
    expect(r.warnings.join("\n")).toMatch(/Length cue: always picking the longest option/);
    expect(formatCueSummary(r.cues)).toMatch(/^Answer cues \(\d+ multiple-choice questions with 3\+ options\): longest option correct \d+%/);
    expect(HEADER).toContain("correctIndex");
  });

  it.each([["demo", DEMO_TSV], ["statistics example", STATS_TSV]])("the %s file shows no answer cues", (_, text) => {
    const r = validate(text);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    // A student who always picks the longest (or shortest) option scores close to chance.
    expect(Math.abs(r.cues.longest - r.cues.chance)).toBeLessThan(0.06);
    expect(Math.abs(r.cues.shortest - r.cues.chance)).toBeLessThan(0.06);
  });
});

// The question-writer skill ships a Python copy of these checks. Same input, same messages.
const python = spawnSync("python3", ["--version"]);
describe.skipIf(python.error || python.status !== 0)("Python mirror (validate_tsv.py)", () => {
  const runPython = (text) => {
    const dir = mkdtempSync(join(tmpdir(), "sab-cues-"));
    const file = join(dir, "q.tsv");
    writeFileSync(file, text);
    const out = spawnSync("python3", [PY_VALIDATOR, file, "--json"], { encoding: "utf8" });
    return JSON.parse(out.stdout);
  };
  const fixture = [
    HEADER,
    ...Array.from({ length: 12 }, (_, k) => [`long${k}`, `Why does rarefaction normalize depth ${k}?`, "Rarefaction normalizes depth by subsampling every sample", "Always wrong", "Never right", "No", "1", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t")),
    ["ref", "Which?", "Red", "Blue", "All of the above", "Green", "3", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t"),
    ["art", "A rarefaction curve is an", "Estimate", "Tree", "Plot", "Table", "1", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t"),
    ["sheet", "Which flag?", "#NAME?", "#NAME?", "#NAME?", "#NAME?", "2", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t"),
    ["dupb", "Which artifact stores the feature counts for each sample?", "Table", "Tree", "Taxonomy", "Metadata", "1", "Why.", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t"),
    ["dups", "Which artifact stores the feature counts for each sample?", "Table", "Tree", "Taxonomy", "Metadata", "1", "", "Topic", "Mod", "", "", "survey", ""].join("\t"),
  ].join("\n");

  it.each([["fixture", fixture], ["demo", DEMO_TSV], ["statistics example", STATS_TSV]])("matches the game's checker on the %s file", (_, text) => {
    const js = checkItemQuality(parseTsv(text));
    const py = runPython(text);
    js.errors.forEach((e) => expect(py.errors).toContain(e));
    js.warnings.forEach((w) => expect(py.warnings).toContain(w));
    const cues = py.stats.answer_cues;
    ["items", "overlapItems", "absoluteOptions", "absoluteCorrect"].forEach((k) => expect(cues[k]).toBe(js.cues[k]));
    ["longest", "shortest", "chance", "overlap", "absoluteChance"].forEach((k) => {
      if (js.cues[k] === null) expect(cues[k]).toBeNull();
      else expect(cues[k]).toBeCloseTo(js.cues[k], 10);
    });
  });

  it("produces every kind of message on the fixture", () => {
    const js = checkItemQuality(parseTsv(fixture));
    expect(js.errors).toHaveLength(1);
    expect(js.warnings.length).toBeGreaterThanOrEqual(6);
  });
});
