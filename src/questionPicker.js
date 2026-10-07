// src/questionPicker.js
// Which question to ask next (pure). The whole table watches every question, so
// one shared history covers all teams:
//   1. a question answered wrongly at least REASK_AFTER_TURNS turns ago comes back
//      (spaced retrieval: the explanation has had time to sink in);
//   2. otherwise a question nobody has seen yet;
//   3. once a pool is used up, the least-asked ones, never a question still
//      waiting for its re-ask turn while another choice exists.
// History shape (JSON-safe, saved with the game): { [key]: { asked, missedAt } },
// where missedAt is the turn of the latest wrong answer, or null once answered right.
import { shuffle } from "./gameRules.js";

export const REASK_AFTER_TURNS = 6;

/** Stable key for a question (its file id, else its text). */
export const questionKey = (q) => (q ? q.id || q.prompt || q.question || "" : "");

/** History after an answer to `q` on turn `turn`. */
export function recordAnswer(history, q, correct, turn) {
  const key = questionKey(q);
  if (!key) return history;
  const prev = history[key] || { asked: 0, missedAt: null };
  return { ...history, [key]: { asked: prev.asked + 1, missedAt: correct ? null : turn } };
}

/**
 * Up to `count` different questions from `pool` (distinct unless the pool is
 * smaller than `count`), chosen by the rules above.
 */
export function pickQuestions(pool, count, history = {}, turn = 0, rng = Math.random) {
  const unique = [...new Set((pool || []).filter(Boolean))];
  if (unique.length === 0 || count <= 0) return [];
  const info = (q) => history[questionKey(q)] || { asked: 0, missedAt: null };
  const due = (q) => info(q).missedAt != null && turn - info(q).missedAt >= REASK_AFTER_TURNS;
  const waiting = (q) => info(q).missedAt != null && !due(q);

  const ranked = (list) => {
    const dueNow = list.filter(due).sort((a, b) => info(a).missedAt - info(b).missedAt);
    const rest = shuffle(list.filter((q) => !due(q)), rng)
      .sort((a, b) => (waiting(a) - waiting(b)) || (info(a).asked - info(b).asked));
    return [...dueNow, ...rest];
  };

  const out = [];
  while (out.length < count) out.push(...ranked(unique).slice(0, count - out.length));
  return out;
}

/** One question from `pool` (null when it is empty). */
export const pickQuestion = (pool, history, turn, rng) => pickQuestions(pool, 1, history, turn, rng)[0] ?? null;
