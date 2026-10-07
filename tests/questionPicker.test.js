import { describe, it, expect } from "vitest";
import { pickQuestion, pickQuestions, recordAnswer, questionKey, REASK_AFTER_TURNS } from "../src/questionPicker.js";

const qs = ["a", "b", "c", "d"].map((id) => ({ id, prompt: `Q ${id}` }));

describe("question picker", () => {
  it("asks every question once before repeating any", () => {
    let history = {};
    const seen = [];
    for (let turn = 0; turn < 4; turn++) {
      const q = pickQuestion(qs, history, turn);
      seen.push(q.id);
      history = recordAnswer(history, q, true, turn);
    }
    expect(new Set(seen).size).toBe(4);
  });

  it("brings a missed question back after a few turns, not straight away", () => {
    let history = recordAnswer({}, qs[0], false, 0);
    history = recordAnswer(history, qs[1], true, 0);
    history = recordAnswer(history, qs[2], true, 0);
    history = recordAnswer(history, qs[3], true, 0);
    // Too soon: the missed question waits while others are available.
    for (let k = 0; k < 20; k++) expect(pickQuestion(qs, history, REASK_AFTER_TURNS - 1).id).not.toBe("a");
    // Due: it comes first, even before unseen questions.
    const withNew = [...qs, { id: "e", prompt: "Q e" }];
    expect(pickQuestion(withNew, history, REASK_AFTER_TURNS).id).toBe("a");
  });

  it("stops re-asking once the question is answered correctly", () => {
    let history = recordAnswer({}, qs[0], false, 0);
    history = recordAnswer(history, qs[0], true, REASK_AFTER_TURNS);
    expect(history.a).toEqual({ asked: 2, missedAt: null });
  });

  it("draws distinct exam questions, preferring unseen ones", () => {
    const history = recordAnswer(recordAnswer({}, qs[0], true, 0), qs[1], true, 0);
    const exam = pickQuestions(qs, 2, history, 1);
    expect(exam.map((q) => q.id).sort()).toEqual(["c", "d"]);
    expect(pickQuestions(qs, 6, {}, 0)).toHaveLength(6);
    expect(new Set(pickQuestions(qs, 4, {}, 0)).size).toBe(4);
  });

  it("handles empty pools and keys questions by id, then text", () => {
    expect(pickQuestion([], {}, 0)).toBeNull();
    expect(pickQuestions(null, 3)).toEqual([]);
    expect(questionKey({ id: "x", prompt: "p" })).toBe("x");
    expect(questionKey({ prompt: "p" })).toBe("p");
    expect(recordAnswer({}, null, true, 0)).toEqual({});
  });
});
