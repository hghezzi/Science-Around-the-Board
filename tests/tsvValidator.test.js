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
