import { describe, it, expect } from "vitest";
import { parseTsv, parseTsvHeaders, parseList, getAllTopics, getModulesForTopic } from "../src/tsvParser.js";
import { DEMO_TSV } from "./helpers.js";

describe("parseTsv", () => {
  it("parses headers and rows, handling CRLF, comments and blank lines", () => {
    const text = "# comment\r\na\tb\r\n\r\n1\t2\r\n3\t4";
    expect(parseTsv(text)).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });

  it("strips surrounding quotes and unescapes doubled quotes", () => {
    const rows = parseTsv('q\topt\n"Say ""hi"""\t"x, y"');
    expect(rows[0]).toEqual({ q: 'Say "hi"', opt: "x, y" });
  });

  it("fills missing trailing cells with empty strings", () => {
    expect(parseTsv("a\tb\tc\n1")[0]).toEqual({ a: "1", b: "", c: "" });
  });

  it("keeps column alignment when the first cell is empty", () => {
    expect(parseTsv("a\tb\tc\n\t2\t3")[0]).toEqual({ a: "", b: "2", c: "3" });
  });

  it("returns [] when there is no data row", () => {
    expect(parseTsv("a\tb")).toEqual([]);
    expect(parseTsv("")).toEqual([]);
  });

  it("parses the demo file", () => {
    const rows = parseTsv(DEMO_TSV);
    expect(rows.length).toBe(177);
    expect(parseTsvHeaders(DEMO_TSV)).toContain("correctIndex");
  });
});

describe("topic helpers", () => {
  const rows = [
    { bigTopic: "Bio, Chem", module: "W1" },
    { bigTopic: "Bio", module: "W2, W3" },
    { bigTopic: "", module: "W9" },
  ];
  it("parseList splits and trims comma lists", () => {
    expect(parseList(' a , "b" ,c')).toEqual(["a", "b", "c"]);
    expect(parseList("")).toEqual([]);
  });
  it("collects topics and modules in order of appearance", () => {
    expect(getAllTopics(rows)).toEqual(["Bio", "Chem"]);
    expect(getModulesForTopic(rows, "Bio")).toEqual(["W1", "W2", "W3"]);
    expect(getModulesForTopic(rows, "Chem")).toEqual(["W1"]);
  });
});

describe("parseTsv edge cases", () => {
  it("ignores a UTF-8 byte-order mark (Excel's 'UTF-8' export)", () => {
    const bom = String.fromCharCode(0xfeff);
    const text = `${bom}id\tquestion\ttype\nq1\tWhat?\tproperty`;
    expect(Object.keys(parseTsv(text)[0])).toEqual(["id", "question", "type"]);
    expect(parseTsv(text)[0].id).toBe("q1");
    expect(parseTsvHeaders(text)[0]).toBe("id");
  });

  it("unwraps quoted cells but keeps a lone quote character", () => {
    const rows = parseTsv('id\tquestion\toption1\nq1\t"Say ""hi"""\t"');
    expect(rows[0].question).toBe('Say "hi"');
    expect(rows[0].option1).toBe('"');
  });

  it("keeps non-English text intact", () => {
    const rows = parseTsv("id\tquestion\nq1\t¿Qué es el ADN? β-diversité 多样性");
    expect(rows[0].question).toBe("¿Qué es el ADN? β-diversité 多样性");
  });

  it("fills missing trailing cells with empty strings", () => {
    const rows = parseTsv("id\tquestion\ttype\nq1\tWhat?");
    expect(rows[0].type).toBe("");
  });
});
