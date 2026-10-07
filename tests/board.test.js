import { describe, it, expect, vi } from "vitest";
import { parseTsv } from "../src/tsvParser.js";
import { buildBoardQuestionSet, matchesTopicAndModule } from "../src/tsvBoardBuilder.js";
import { buildBoardFromTsv } from "../src/gameData.js";
import { DEMO_TSV, makeTsv } from "./helpers.js";

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("matchesTopicAndModule", () => {
  it("treats blank topic/module cells as matching everything", () => {
    expect(matchesTopicAndModule({ bigTopic: "", module: "" }, "Bio", "W1")).toBe(true);
    expect(matchesTopicAndModule({ bigTopic: "Bio, Chem", module: "W1" }, "Chem", "W1")).toBe(true);
    expect(matchesTopicAndModule({ bigTopic: "Bio", module: "W1" }, "Chem", "W1")).toBe(false);
    expect(matchesTopicAndModule({ bigTopic: "Bio", module: "W1" }, "Bio", "W2")).toBe(false);
  });
});

describe("buildBoardQuestionSet", () => {
  it("uses the first 4 themes and first 2 subthemes, in order of appearance", () => {
    const rows = parseTsv(makeTsv({ themes: ["A", "B", "C", "D", "E"] }));
    const qs = buildBoardQuestionSet(rows, { bigTopic: "Topic", module: "Mod" });
    expect([qs.Side1, qs.Side2, qs.Side3, qs.Side4].map((s) => s.name)).toEqual(["A", "B", "C", "D"]);
    expect(qs.Side1.sub1.name).toBe("A-a");
    expect(qs.Side1.sub2.name).toBe("A-b");
    expect(qs.Side1.quiz).toHaveLength(6);
    expect(qs.CoreTech.name).toBe("Core Lab");
    expect(qs.CoreTech.questions).toHaveLength(1);
  });

  it("converts correctIndex (1-based) to a 0-based answer", () => {
    const rows = parseTsv(makeTsv());
    const qs = buildBoardQuestionSet(rows, { bigTopic: "Topic", module: "Mod" });
    expect(qs.Side1.sub1.questions[0].answer).toBe(0);
    expect(qs.Side1.sub1.questions[0].options).toEqual(["A", "B", "C", "D"]);
  });
});

describe("board layout", () => {
  const board = buildBoardFromTsv("16S", parseTsv(DEMO_TSV), "QIIME2");

  it("builds the 36-tile loop with milestones on the 4 corners", () => {
    expect(board).toHaveLength(36);
    expect([0, 9, 18, 27].map((i) => board[i].type)).toEqual(Array(4).fill("milestone"));
    expect(board[0].isStart).toBe(true);
    board.forEach((t, i) => expect(t.id).toBe(i));
  });

  it("lays out each side as 3 x sub1, core, 3 x sub2, mishap", () => {
    for (const start of [1, 10, 19, 28]) {
      const side = board.slice(start, start + 8).map((t) => t.type);
      expect(side).toEqual([
        "property", "property", "property", "sequencing_core",
        "property", "property", "property", "chance",
      ]);
      expect(board[start].price).toBe(100);
      expect(board[start + 4].price).toBe(160);
    }
  });

  it("gives the START corner the last side's milestone quiz", () => {
    expect(board[0].name).toBe(board[27 + 1].name);
    expect(board[0].quiz.length).toBeGreaterThan(0);
  });

  it("sets base rent from price", () => {
    expect(board[1].baseRent).toBe(50);
    expect(board[5].baseRent).toBe(80);
    expect(board[4].baseRent).toBe(50);
    expect(board[9].baseRent).toBe(250);
  });
});

describe("incomplete question files", () => {
  it("still builds a full 36-tile loop when the file has fewer than 4 themes", () => {
    for (const themes of [["A", "B", "C"], ["A"], []]) {
      const board = buildBoardFromTsv("Topic", parseTsv(makeTsv({ themes })), "Mod");
      expect(board).toHaveLength(36);
      expect([0, 9, 18, 27].map((i) => board[i].type)).toEqual(Array(4).fill("milestone"));
      board.forEach((t, i) => expect(t.id).toBe(i));
    }
  });

  it("builds an empty but complete board when no rows match", () => {
    const board = buildBoardFromTsv("Nope", parseTsv(makeTsv()), "Nothing");
    expect(board).toHaveLength(36);
    expect(board.every((t) => t.questions.length === 0)).toBe(true);
  });
});
