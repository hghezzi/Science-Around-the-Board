// src/surveys.js
// Pre/post survey helpers (pure). Survey and confidence rows are matched to the
// chosen topic/module the same way as board questions.
import { matchesTopicAndModule } from "./tsvBoardBuilder.js";
import { normalizeQuestion, prepareQuestion } from "./questionFormats.js";

export const SURVEY_QUESTIONS_PER_PLAYER = 10;

const ofType = (rows, type, topic, module) =>
  (rows || []).filter((r) => (r.type || "").trim().toLowerCase() === type && matchesTopicAndModule(r, topic, module));

function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One shuffled set of survey questions per player (the same set is asked again after the game). */
export function buildSurveySets(rows, { topic, module, playerCount, perPlayer = SURVEY_QUESTIONS_PER_PLAYER, rng = Math.random }) {
  const pool = ofType(rows, "survey", topic, module).map(normalizeQuestion);
  return Array.from({ length: playerCount }, () =>
    shuffled(pool, rng).slice(0, perPlayer).map((q) => prepareQuestion(q, rng))
  );
}

/** Confidence statements (0–10 sliders), identical for every player. */
export function buildConfidenceQuestions(rows, { topic, module }) {
  return ofType(rows, "confidence", topic, module).map((r, i) => ({ key: r.id || `conf_${i}`, label: r.question }));
}
