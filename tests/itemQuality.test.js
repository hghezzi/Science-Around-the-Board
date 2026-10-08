import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTsv, parseTsvHeaders } from "../src/tsvParser.js";
import { checkItemQuality, contentWords, formatCueSummary } from "../src/itemQuality.js";
import { validateQuestionRows, formatValidationReport } from "../src/tsvValidator.js";
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

  it.each(["#NAME?", "#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NUM!", "#NULL!", "#ERROR!"])("errors on %s in any cell", (value) => {
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

  it("reads words in any script, without accents", () => {
    expect([...contentWords("¿Qué proceso de fotosíntesis ocurre en la atmósfera?")]).toEqual(["proceso", "fotosintesi", "ocurre", "atmosfera"]);
    expect([...contentWords("Какой процесс?")]).toEqual(["какои", "процесс"]);
  });

  it("counts Spanish, French and Portuguese absolute words", () => {
    const rows = Array.from({ length: 8 }, (_, k) =>
      q(`¿Pregunta ${k}?`, ["Depende de los datos", "Siempre ocurre así", "Nunca pasa nada", "Sólo en verano"]));
    const r = checkItemQuality(rows);
    expect(r.cues.absoluteOptions).toBe(24);
    expect(r.warnings.join("\n")).toMatch(/Absolute-word cue: 24 options/);
  });

  it("reads Spanish absolutes such as ningún and nadie, but not 'todo el año'", () => {
    const absolutes = Array.from({ length: 8 }, (_, k) =>
      q(`¿Pregunta ${k}?`, ["Depende de los datos", "Ningún cambio ocurre", "Nadie lo observa", "Únicamente en verano"]));
    expect(checkItemQuality(absolutes).cues.absoluteOptions).toBe(24);
    const plain = Array.from({ length: 8 }, (_, k) =>
      q(`¿Pregunta ${k}?`, ["Llueve todo el año", "Sobre todo en verano", "En primavera", "En otoño"]));
    expect(checkItemQuality(plain).cues.absoluteOptions).toBe(0);
  });

  it("flags Spanish and Portuguese 'all of the above' options", () => {
    const r = checkItemQuality([q("¿Cuál?", ["Rojo", "Azul", "Todas las anteriores", "Verde"], 3), q("Qual?", ["A", "B", "Nenhuma das alternativas", "C"])]);
    expect(r.warnings.join("\n")).toMatch(/Option refers to other options .*"q\d+", "q\d+"/);
  });

  it("warns about a leading apostrophe, which a spreadsheet may drop", () => {
    const r = checkItemQuality([q("Which statement is a warning sign?", ["'Everyone would be better off'", "b", "c", "d"]), q("Fine?", ["\"Quoted\" speech", "b", "c", "d"])]);
    const w = r.warnings.join("\n");
    expect(w).toMatch(/Cell starts with an apostrophe \('\): "q\d+"\. Excel and Google Sheets may take/);
    expect(w.split("\n").find((l) => l.startsWith("Cell starts with an apostrophe")).match(/"q\d+"/g)).toHaveLength(1);
  });

  it("checks the milestone pool's length cue on its own", () => {
    const mile = Array.from({ length: 12 }, (_, k) => q(`M${k}?`, ["Right", "A long wrong answer", "A longer wrong answer here", "Mid wrong"], 1, { type: "milestone" }));
    const balancedProps = Array.from({ length: 60 }, (_, k) => q(`P${k}?`, ["Alpha", "Bravo", "Charl", "Delta"], (k % 4) + 1));
    const w = checkItemQuality([...mile, ...balancedProps]).warnings.join("\n");
    expect(w).toMatch(/^Length cue in the milestone questions: always picking the longest option would answer only 0% of the 12 milestone multiple-choice questions correctly \(chance is 25%\)/m);
    expect(w).not.toMatch(/^Length cue: always picking the longest/m);
  });

  it("warns about cells a spreadsheet would turn into a formula", () => {
    const r = checkItemQuality([
      q("Which flag sets the depth?", ["`--p-depth`", "x", "y", "z"], 1, { explanation: "--p-depth sets it." }),
      q("=SUM(A1)?", ["A", "B", "C", "D"]),
      q("Who?", ["@me", "B", "C", "D"]),
    ]);
    expect(r.warnings.join("\n")).toMatch(/Cell starts with "-", "\+", "=" or "@": "q\d+", "q\d+", "q\d+"\. Excel and Google Sheets/);
  });

  it("leaves numbers, placeholders and numeric answers alone", () => {
    const r = checkItemQuality([
      q("Which slope?", ["-0.2", "+5", "-12%", "0"]),
      { id: "c", type: "confidence", question: "I can do it.", option1: "-", explanation: "-" },
      q("Change?", [], 1, { format: "numeric", answer: "-3.5", tolerance: "" }),
    ]);
    expect(r.warnings.join("\n")).not.toMatch(/Cell starts with/);
  });

  it("warns when select-all questions nearly always have the same number of correct options", () => {
    const same = Array.from({ length: 6 }, (_, k) => q(`Pick all ${k}`, ["A", "B", "C", "D"], "1,3", { format: "multi" }));
    const r = checkItemQuality(same);
    expect(r.cues.multiCounts).toEqual({ 2: 6 });
    expect(r.warnings.join("\n")).toMatch(/Select-all cue: 6 of the 6 select-all-that-apply questions have exactly 2 correct options, so students can learn to tick 2/);
    const varied = ["1", "1,2", "1,2,3", "2,4", "3", "1,2,3,4"].map((c, k) => q(`Pick all ${k}`, ["A", "B", "C", "D"], c, { format: "multi" }));
    expect(checkItemQuality(varied).warnings.join("\n")).not.toMatch(/Select-all cue/);
    expect(checkItemQuality(same.slice(0, 5)).warnings.join("\n")).not.toMatch(/Select-all cue/);
  });

  it("warns when the correct answer is almost never the longest (an overcorrection)", () => {
    const rows = Array.from({ length: 20 }, (_, k) => q(`Q${k}?`, ["Right", "A long wrong answer", "A longer wrong answer here", "Mid wrong"]));
    const r = checkItemQuality(rows);
    expect(r.cues.longest).toBe(0);
    expect(r.warnings.join("\n")).toMatch(/always picking the longest option would answer only 0% of the 20 multiple-choice questions correctly \(chance is 25%\), so students can rule the longest option out/);
  });

  it("warns when a short answer would also accept a different term", () => {
    const text = (id, answer) => q("Name it", [], 1, { id, format: "text", answer });
    const r = checkItemQuality([
      text("roman", "type I error|type 1 error"),
      text("swap", "absorption"),
      q("Which?", ["adsorption", "diffusion", "osmosis", "filtration"]),
      text("plural", "make the environment safe"),
      q("Best step?", ["make the environment safer", "b", "c", "d"]),
      text("fine", "photosynthesis"),
      text("digits", "type 1 diabetes"),
    ]);
    const w = r.warnings.join("\n");
    expect(w).toMatch(/Short-answer question would also accept a different term, because the game forgives one typo in answers of 8 or more letters: "roman" \("type ii error"\), "swap" \("adsorption"\)\. Use multiple choice/);
    expect(w).not.toMatch(/"plural"|"fine"|"digits"/);
  });
});

describe("per-game answer cues", () => {
  const validate = (text) => validateQuestionRows(parseTsv(text), parseTsvHeaders(text));
  // Two games: module A has balanced options, module B always has the longest correct.
  const board = (module) => makeTsv().split("\n").slice(1).map((l) => l.replace(/\tMod\t/, `\t${module}\t`).replace(/^q(\d+)/, `${module}$1`));
  const longRows = (module) => Array.from({ length: 14 }, (_, k) =>
    [`${module}long${k}`, `Question ${k}?`, "A careful, detailed and qualified correct statement", "Wrong one", "Wrong two", "Nope", "1", "Why.", "Topic", module, "T1", "T1-a", "property", ""].join("\t"));
  const balancedRows = (module) => Array.from({ length: 40 }, (_, k) =>
    [`${module}bal${k}`, `Balanced ${k}?`, "Alpha", "Bravo", "Charl", "Delta", String((k % 4) + 1), "Why.", "Topic", module, "T1", "T1-a", "property", ""].join("\t"));
  const text = [HEADER, ...board("A"), ...balancedRows("A"), ...board("B"), ...longRows("B")].join("\n");

  it("reports a cue that only one game has, which the file-wide numbers hide", () => {
    const r = validate(text);
    expect(r.games.map((g) => g.name)).toEqual(["Topic / A", "Topic / B"]);
    expect(r.cues.games).toHaveLength(2);
    expect(r.games[1].cues.longest).toBeGreaterThan(0.4);
    expect(r.games[0].cues.longest).toBeCloseTo(0.25);
    expect(r.warnings.join("\n")).toMatch(/\[Topic \/ B\] Length cue: always picking the longest option would answer \d+% of the 57 multiple-choice questions/);
    expect(r.warnings.join("\n")).not.toMatch(/\[Topic \/ A\] Length cue/);
    expect(r.warnings.some((w) => w.startsWith("Length cue"))).toBe(false);
  });

  it("prints formats and cues per game in the report", () => {
    const report = formatValidationReport(validate(text));
    expect(report).toMatch(/Game: Topic \/ B\n(?:.*\n)*? {2}formats: mcq \d+ \(true\/false 0\), multi 0, numeric 0, order 0, text 0\n {2}Answer cues \(57 multiple-choice/);
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

  it("parses numbers like the game (decimal commas, spaced thousands, Unicode minus)", () => {
    const cases = {
      "1,500": 1500, "1 500": 1500, "1 500 000": 1500000, "2,5": 2.5, "0,05": 0.05, "1.000,5": 1000.5,
      "1,000.5": 1000.5, "−5": -5, "1e-3": 0.001, " 2.5 ": 2.5, "12,34": 12.34, "1,2.3": null, "abc": null, "": null,
    };
    const code = `import json,sys; sys.path.insert(0, ${JSON.stringify(join(PY_VALIDATOR, ".."))}); from validate_tsv import parse_number; print(json.dumps({k: parse_number(k) for k in json.loads(sys.argv[1])}))`;
    const out = spawnSync("python3", ["-c", code, JSON.stringify(Object.keys(cases))], { encoding: "utf8" });
    expect(JSON.parse(out.stdout)).toEqual(cases);
  });

  it("warns on mcq rows with several answers and errors on punctuation-only text answers", () => {
    const rows = [
      HEADER + "\tformat\tanswer\ttolerance",
      ["m", "Pick one", "A", "B", "C", "D", "1,3", "Why.", "Topic", "Mod", "T1", "T1-a", "property", "", "", "", ""].join("\t"),
      ["t", "Type it", "", "", "", "", "", "Why.", "Topic", "Mod", "T1", "T1-a", "property", "", "text", "?!|...", ""].join("\t"),
      ["c", "Case", "A", "B", "C", "D", "1", "Why.", "Topic", "Mod", "T1", "T1-a", "Property", "", "", "", ""].join("\t"),
    ].join("\n");
    const py = runPython(rows);
    expect(py.warnings).toContain('correctIndex lists several options but the format is multiple choice, so only the first counts: "m". For select-all-that-apply, set format to multi.');
    expect(py.errors).toContain('Short-text questions need accepted answers (with letters or digits) in the "answer" column, separated by | : "t".');
    expect(py.warnings).toContain('Type is not lowercase: "c". The game accepts it, but lowercase keeps the file consistent.');
  });

  it("produces every kind of message on the fixture", () => {
    const js = checkItemQuality(parseTsv(fixture));
    expect(js.errors).toHaveLength(1);
    expect(js.warnings.length).toBeGreaterThanOrEqual(6);
  });

  // Every structural and quality message, in two games, so the whole report is compared.
  const H = `${HEADER}\tformat\tanswer\ttolerance`;
  const row = (cells) => cells.concat(Array(17 - cells.length).fill("")).join("\t");
  const prop = (id, mod, theme, sub, opts, c = "1", extra = []) => row([id, `Question ${id}?`, ...opts, c, "Why.", "Topic", mod, theme, sub, "property", "", ...extra]);
  const broken = [
    H,
    // Game "One": 3 themes (error), a theme with too few milestones, cue and format problems.
    ...["T1", "T2", "T3"].flatMap((t) => [prop(`${t}p`, "One", t, `${t}a`, ["A", "B", "C", "D"]), row([`${t}m`, "Milestone?", "A", "B", "C", "D", "2", "Why.", "Topic", "One", t, "", "milestone"])]),
    ...Array.from({ length: 12 }, (_, k) => prop(`ov${k}`, "One", "T1", "T1a", ["Right", "A long wrong answer", "A longer wrong answer here", "Mid wrong"])),
    ...Array.from({ length: 6 }, (_, k) => prop(`mu${k}`, "One", "T1", "T1a", ["A", "B", "C", "D"], "2,4", ["multi"])),
    ...Array.from({ length: 8 }, (_, k) => prop(`es${k}`, "One", "T2", "T2a", ["Depende de los datos", "Siempre ocurre así", "Nunca pasa nada", "Sólo en verano"])),
    prop("roman", "One", "T2", "T2a", ["", "", "", ""], "", ["text", "Photosystem I|photosystem 1"]),
    prop("swap", "One", "T2", "T2a", ["", "", "", ""], "", ["text", "absorption"]),
    prop("adso", "One", "T2", "T2a", ["adsorption", "diffusion", "osmosis", "filtration"]),
    prop("flag", "One", "T3", "T3a", ["`--p-depth`", "x", "y", "z"], "1", []).replace("\tWhy.\t", "\t--p-depth sets it.\t"),
    prop("err", "One", "T3", "T3a", ["#ERROR!", "x", "y", "z"]),
    prop("apos", "One", "T3", "T3a", ["'Everyone would be better off'", "x", "y", "z"]),
    prop("todas", "One", "T3", "T3a", ["Todas las anteriores", "x", "y", "z"]),
    ...Array.from({ length: 12 }, (_, k) => row([`ml${k}`, `Milestone ${k}?`, "Right", "A long wrong answer", "A longer wrong answer here", "Mid wrong", "1", "Why.", "Topic", "One", "T1", "", "milestone"])),
    prop("badidx", "One", "T3", "T3a", ["A", "B", "", ""], "3"),
    prop("badmulti", "One", "T3", "T3a", ["A", "B", "C", ""], "1,4", ["multi"]),
    prop("badnum", "One", "T3", "T3a", ["", "", "", ""], "", ["numeric", "abc", "x%"]),
    prop("badfmt", "One", "T3", "T3a", ["A", "B", "", ""], "1", ["essay"]),
    prop("ov0", "One", "T3", "T3a", ["A", "B", "", ""]),
    row(["mis", "Something happened", "", "", "", "", "", "Fact.", "Topic", "One", "", "", "mishap"]),
    row(["noexp", "No explanation?", "A", "B", "", "", "1", "", "Topic", "One", "T1", "T1a", "core"]),
    row(["weird", "Post", "A", "B", "", "", "1", "E", "Topic", "One", "", "", "post"]),
    // Game "Two": a complete small board with one survey item.
    ...["U1", "U2", "U3", "U4"].flatMap((t) => [prop(`${t}p1`, "Two", t, `${t}a`, ["A", "B", "C", "D"]), prop(`${t}p2`, "Two", t, `${t}b`, ["A", "B", "C", "D"]),
      ...Array.from({ length: 6 }, (_, k) => row([`${t}m${k}`, `Milestone ${k}?`, "A", "B", "C", "D", "2", "Why.", "Topic", "Two", t, "", "milestone"]))]),
    row(["s1", "Survey?", "A", "B", "C", "D", "1", "", "Topic", "Two", "", "", "survey"]),
    // Config rows (whole file).
    row(["results_url", "https://docs.google.com/forms/d/e/1FAIpQLSf-Test/viewform", "", "", "", "", "", "", "", "", "", "", "config"]),
    row(["results_url", "https://script.google.com/macros/s/AKfyTest/exec", "", "", "", "", "", "", "", "", "", "", "config"]),
    row(["instructor_email", "prof@uni.edu", "", "", "", "", "", "", "", "", "", "", "config"]),
    row(["course", "BIOL 101", "", "", "", "", "", "", "", "", "", "", "config"]),
    row(["ask_names", "maybe", "", "", "", "", "", "", "", "", "", "", "config"]),
  ].join("\n");

  it.each([["broken two-game", broken], ["demo", DEMO_TSV], ["statistics example", STATS_TSV]])("gives the same full report as the game's validator on the %s file", (_, text) => {
    const js = validateQuestionRows(parseTsv(text), parseTsvHeaders(text));
    const py = runPython(text);
    expect(py.errors.sort()).toEqual([...js.errors].sort());
    // The Python copy adds authoring-only notes (answer positions, image folder).
    expect(py.warnings.filter((w) => !/multiple-choice answers are option|Image file\(s\) not found/.test(w)).sort()).toEqual([...js.warnings].sort());
    expect(py.delivery).toBe(js.delivery);
    expect(py.games.map((g) => g.name)).toEqual(js.games.map((g) => g.name));
    expect(py.games.map((g) => g.format_counts)).toEqual(js.games.map((g) => g.formatCounts));
    (js.cues.games || []).forEach((g, i) => {
      const pg = py.stats.answer_cues.games[i];
      ["items", "overlapItems", "absoluteOptions", "absoluteCorrect", "multiItems"].forEach((k) => expect(pg[k]).toBe(g[k]));
      expect(pg.multiCounts).toEqual(g.multiCounts);
      ["longest", "shortest", "chance"].forEach((k) => (g[k] === null ? expect(pg[k]).toBeNull() : expect(pg[k]).toBeCloseTo(g[k], 10)));
    });
  });

  it("exercises every new check on the broken file", () => {
    const js = validateQuestionRows(parseTsv(broken), parseTsvHeaders(broken));
    const all = [...js.errors, ...js.warnings].join("\n");
    [/Spreadsheet error value/, /Cell starts with/, /would also accept a different term.*"roman" \("photosystem ii"\), "swap" \("adsorption"\)/,
      /\[Topic \/ One\] Select-all cue/, /\[Topic \/ One\] Absolute-word cue/, /Cell starts with an apostrophe \('\): "apos"/,
      /Option refers to other options .*"todas"/, /\[Topic \/ One\] Length cue in the milestone questions: always picking the longest option would answer only \d+% of the 15/,
      /\[Topic \/ One\] The board needs 4 themes/, /Invalid tolerance/, /Unknown format/, /Duplicate id/, /ask_names" should be yes or no/]
      .forEach((re) => expect(all).toMatch(re));
    // The line reports what the game will do: it reads an unrecognised ask_names value ("maybe") as no.
    expect(js.delivery).toBe("Results are sent to: the results collector at https://script.google.com/macros/s/AKfyTest/exec and an email to prof@uni.edu (students attach the file). Name/ID field: optional. Course label: BIOL 101.");
    expect(all).toMatch(/is a Google Form, Google Sheet or test/);
  });
});

// build_tsv.py: JSON to TSV for the question-writer skill.
const BUILDER = fileURLToPath(new URL("../.claude/skills/sab-question-writer/scripts/build_tsv.py", import.meta.url));
describe.skipIf(python.error || python.status !== 0)("build_tsv.py", () => {
  const build = (rows, args = []) => {
    const dir = mkdtempSync(join(tmpdir(), "sab-build-"));
    writeFileSync(join(dir, "q.json"), JSON.stringify(rows));
    spawnSync("python3", [BUILDER, join(dir, "q.json"), join(dir, "q.tsv"), ...args], { encoding: "utf8" });
    return { dir, rows: parseTsv(readFileSync(join(dir, "q.tsv"), "utf8")) };
  };

  it("keeps quoted code options exactly as written", () => {
    const { rows } = build([{ id: "q1", type: "property", question: "Which mode appends?", options: ['"w"', '"a"', '"Py" + "thon"', "plain"], correct: 2 }]);
    expect([rows[0].option1, rows[0].option2, rows[0].option3, rows[0].option4]).toEqual(['"w"', '"a"', '"Py" + "thon"', "plain"]);
  });

  it("fills --bigTopic/--module only where the key is missing, so a blank stays shared", () => {
    const { rows } = build([
      { id: "a", type: "core", question: "Q", options: ["x", "y"], correct: 1 },
      { id: "b", type: "core", question: "Q", options: ["x", "y"], correct: 1, bigTopic: "", module: "" },
      { id: "c", type: "config", question: "BIOL 1" },
    ], ["--bigTopic", "Topic", "--module", "Mod"]);
    expect(rows.map((r) => [r.bigTopic, r.module])).toEqual([["Topic", "Mod"], ["", ""], ["", ""]]);
  });

  it("converts an existing file to JSON and back without changing a cell", () => {
    const dir = mkdtempSync(join(tmpdir(), "sab-rt-"));
    const src = fileURLToPath(new URL("../public/SAB_questions_Jan22_Filtered.tsv", import.meta.url));
    spawnSync("python3", [BUILDER, "--to-json", src, join(dir, "q.json")], { encoding: "utf8" });
    spawnSync("python3", [BUILDER, join(dir, "q.json"), join(dir, "q.tsv"), "--bigTopic", "X", "--module", "Y"], { encoding: "utf8" });
    expect(parseTsv(readFileSync(join(dir, "q.tsv"), "utf8"))).toEqual(parseTsv(DEMO_TSV));
  });
});
