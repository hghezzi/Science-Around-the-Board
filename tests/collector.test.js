// Runs the Google Apps Script results collector against a fake spreadsheet,
// since the real Google services can't be reached from tests.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SOURCE = readFileSync(fileURLToPath(new URL("../public/tools/sab-results-collector.gs", import.meta.url)), "utf8");

function fakeSheet() {
  const cells = [];
  const sheet = {
    cells,
    frozen: 0,
    getLastRow: () => cells.length,
    getLastColumn: () => Math.max(0, ...cells.map((r) => r.length)),
    setFrozenRows: (n) => { sheet.frozen = n; },
    getRange: (row, col, numRows, numCols) => {
      const range = {
        getValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => (cells[row - 1 + i] || [])[col - 1 + j] ?? "")),
        setValues: (values) => {
          values.forEach((vals, i) => {
            cells[row - 1 + i] = cells[row - 1 + i] || [];
            vals.forEach((v, j) => { cells[row - 1 + i][col - 1 + j] = v; });
          });
          return range;
        },
        setFontWeight: () => range,
      };
      return range;
    },
  };
  return sheet;
}

function loadCollector() {
  const sheets = {};
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = fakeSheet()) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text) => ({ setMimeType: () => ({ text }) }) },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);
  const post = (data) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(data) } }).text);
  return { sheets, post, get: () => JSON.parse(context.doGet().text) };
}

const submission = (extra = {}) => ({
  app: "science-around-the-board", version: 1, sessionId: "s1", course: "BIOL 101", topic: "16S", module: "QIIME2",
  summary: [{ playerIndex: 0, team: "Red Team", members: "Ana", preScore: 4, postScore: 7 }],
  rows: [{ eventType: "TEAM_INFO", playerIndex: 0, members: "Ana" }, { phase: "pre", section: "quiz", correct: true }],
  ...extra,
});

describe("results collector (Apps Script)", () => {
  let collector;
  beforeEach(() => { collector = loadCollector(); });

  it("answers a browser visit with a running message", () => {
    expect(collector.get()).toMatchObject({ ok: true });
  });

  it("writes a header and one row per team and per detail row", () => {
    expect(collector.post(submission())).toEqual({ ok: true });
    const summary = collector.sheets.Summary.cells;
    expect(summary[0].slice(0, 6)).toEqual(["receivedAt", "sessionId", "course", "topic", "module", "playerIndex"]);
    expect(summary).toHaveLength(2);
    expect(summary[1][summary[0].indexOf("members")]).toBe("Ana");
    expect(collector.sheets.Summary.frozen).toBe(1);
    expect(collector.sheets.Details.cells).toHaveLength(3);
  });

  it("adds new columns without shifting earlier rows", () => {
    collector.post(submission());
    collector.post(submission({ sessionId: "s2", summary: [{ playerIndex: 0, team: "Solo Team", rank: 1 }] }));
    const [header, first, second] = collector.sheets.Summary.cells;
    expect(header).toContain("rank");
    expect(first[header.indexOf("sessionId")]).toBe("s1");
    expect(second[header.indexOf("sessionId")]).toBe("s2");
    expect(second[header.indexOf("rank")]).toBe(1);
    expect(second[header.indexOf("members")]).toBe("");
  });

  it("stops typed text from becoming a formula", () => {
    collector.post(submission({ summary: [{ playerIndex: 0, members: "=IMPORTXML(\"x\")" }] }));
    const [header, row] = collector.sheets.Summary.cells;
    expect(row[header.indexOf("members")]).toBe("'=IMPORTXML(\"x\")");
  });

  it("rejects anything that isn't a game submission", () => {
    expect(collector.post({ hello: "world" })).toMatchObject({ ok: false });
    expect(collector.sheets.Summary).toBeUndefined();
  });
});
