import { describe, it, expect, vi } from "vitest";
import { parseTsv, parseTsvHeaders } from "../src/tsvParser.js";
import { validateQuestionRows } from "../src/tsvValidator.js";
import { DEMO_TSV, HEADER, makeTsv } from "./helpers.js";

vi.spyOn(console, "log").mockImplementation(() => {});

const validate = (text) => validateQuestionRows(parseTsv(text), parseTsvHeaders(text));

describe("validateQuestionRows", () => {
  it("accepts a complete file with no errors or warnings", () => {
    const r = validate(makeTsv());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.games).toHaveLength(1);
    expect(r.games[0].themes).toHaveLength(4);
  });

  it("accepts the demo file without errors", () => {
    expect(validate(DEMO_TSV).errors).toEqual([]);
  });

  it("errors when the board has fewer than 4 themes", () => {
    const r = validate(makeTsv({ themes: ["A", "B", "C"] }));
    expect(r.errors.join("\n")).toMatch(/needs 4 themes .* but found 3/);
  });

  it("warns when extra themes will be ignored", () => {
    const r = validate(makeTsv({ themes: ["A", "B", "C", "D", "E"] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings.join("\n")).toMatch(/only the first 4 are used/);
  });

  it("errors on missing required columns", () => {
    const text = "id\tquestion\nq1\tWhat?";
    expect(validate(text).errors.join("\n")).toMatch(/Missing required column\(s\): type/);
  });

  it("errors when correctIndex does not point to an option", () => {
    const bad = ["x1", "Q?", "A", "B", "", "", "3", "Exp", "Topic", "Mod", "T1", "T1-a", "property", ""].join("\t");
    expect(validate(makeTsv({ extra: [bad] })).errors.join("\n")).toMatch(/correctIndex .*"x1"/);
  });

  it("warns on unknown types, duplicate ids and non-lowercase types", () => {
    const rows = [
      ["q0", "Dup id", "A", "B", "", "", "1", "E", "Topic", "Mod", "T1", "T1-a", "property", ""],
      ["p1", "Post", "A", "B", "", "", "1", "E", "Topic", "Mod", "", "", "post", ""],
      ["s1", "Case", "A", "B", "", "", "1", "E", "Topic", "Mod", "", "", "Survey", ""],
    ].map((r) => r.join("\t"));
    const w = validate(makeTsv({ extra: rows })).warnings.join("\n");
    expect(w).toMatch(/Duplicate id/);
    expect(w).toMatch(/Unknown type.*"p1" \(post\)/);
    expect(w).toMatch(/not lowercase.*"s1"/);
  });

  it("errors when a theme has no milestone questions", () => {
    const text = [HEADER, ...makeTsv().split("\n").slice(1).filter((l) => !(l.includes("\tT2\t") && l.includes("\tmilestone\t")))].join("\n");
    expect(validate(text).errors.join("\n")).toMatch(/"T2" has no milestone questions/);
  });

  it("lists referenced image files", () => {
    const img = ["i1", "Q?", "A", "B", "", "", "1", "E", "Topic", "Mod", "T1", "T1-a", "property", "fig.png"].join("\t");
    expect(validate(makeTsv({ extra: [img] })).images).toEqual(["fig.png"]);
  });
});

describe("question formats in the validator", () => {
  const H = HEADER + "\tformat\tanswer\ttolerance";
  const row = (id, { options = ["A", "B", "C", "D"], correctIndex = "", format = "", answer = "", tolerance = "", type = "property" } = {}) =>
    [id, "Q?", ...options, correctIndex, "Exp", "Topic", "Mod", "T1", "T1-a", type, "", format, answer, tolerance].join("\t");
  const base = makeTsv().split("\n").slice(1).map((l) => `${l}\t\t\t`);
  const run = (...rows) => validate([H, ...base, ...rows].join("\n"));

  it("accepts valid rows of every format", () => {
    const r = run(
      row("mu1", { format: "multi", correctIndex: "1,3" }),
      row("n1", { format: "numeric", options: ["", "", "", ""], answer: "1,500", tolerance: "10%" }),
      row("o1", { format: "order" }),
      row("t1", { format: "text", options: ["", "", "", ""], answer: "beta|beta diversity" }),
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("reports invalid format-specific fields", () => {
    const e = run(
      row("m1", { format: "multi", correctIndex: "1,7" }),
      row("n1", { format: "numeric", answer: "lots" }),
      row("n2", { format: "numeric", answer: "3", tolerance: "abc" }),
      row("t1", { format: "text", answer: "" }),
      row("x1", { format: "essay" }),
    ).errors.join("\n");
    expect(e).toMatch(/Multi-select.*"m1"/);
    expect(e).toMatch(/Numeric.*"n1"/);
    expect(e).toMatch(/Invalid tolerance.*"n2"/);
    expect(e).toMatch(/Short-text.*"t1"/);
    expect(e).toMatch(/Unknown format.*"x1" \(essay\)/);
  });

  it("warns about mishaps without an explicit amount", () => {
    const w = run(["mm", "Something broke", "", "", "", "", "", "Fact", "Topic", "Mod", "", "", "mishap", "", "", "", ""].join("\t")).warnings.join("\n");
    expect(w).toMatch(/Mishap without an explicit amount.*"mm"/);
  });
});

describe("config rows and format counts", () => {
  const cfg = (id, value) => [id, value, "", "", "", "", "", "", "", "", "", "", "config", ""].join("\t");
  const withConfig = (...rows) => validate([makeTsv(), ...rows].join("\n"));

  it("accepts valid instructor settings without errors or warnings", () => {
    const r = withConfig(
      cfg("results_url", "https://script.google.com/macros/s/AKfy123/exec"),
      cfg("instructor_email", "prof@uni.edu"),
      cfg("course", "BIOL 101"),
      cfg("ask_names", "no"),
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("explains bad links, addresses, values and unknown settings", () => {
    const r = withConfig(
      cfg("results_url", "http://example.com/collect"),
      cfg("instructor_email", "prof-at-uni"),
      cfg("course", ""),
      cfg("colour", "blue"),
      cfg("ask_names", "maybe"),
    );
    const e = r.errors.join("\n");
    const w = r.warnings.join("\n");
    expect(e).toMatch(/"results_url" must be an https:\/\/ link/);
    expect(e).toMatch(/"instructor_email" is not a valid email address/);
    expect(e).toMatch(/"course" has no value/);
    expect(w).toMatch(/Unknown config setting "colour"/);
    expect(w).toMatch(/"ask_names" should be yes or no/);
  });

  it("warns when the results link isn't an Apps Script web app", () => {
    const w = withConfig(cfg("results_url", "https://example.com/collect")).warnings.join("\n");
    expect(w).toMatch(/doesn't look like a Google Apps Script/);
  });

  it("counts questions per answer format", () => {
    const f = validate(DEMO_TSV).formatCounts;
    expect(f.mcq).toBeGreaterThan(100);
    ["multi", "numeric", "order", "text"].forEach((k) => expect(f[k]).toBeGreaterThanOrEqual(1));
    expect(validate(makeTsv()).formatCounts).toEqual({ mcq: 43, trueFalse: 0, multi: 0, numeric: 0, order: 0, text: 0 }); // 4 themes x (2 + 6) + 1 core + 10 survey
  });
});
