// src/surveys.js
// Pre/post survey helpers (pure). Survey and confidence rows are matched to the
// chosen topic/module the same way as board questions.
import { matchesTopicAndModule } from "./tsvBoardBuilder.js";
import { normalizeQuestion, prepareQuestion, checkAnswer } from "./questionFormats.js";

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

/**
 * CSV rows for one survey phase. `players` lists the player indexes to include;
 * `sliders[p]` maps confidence keys to 0–10 and `answers[p][i]` is the response to
 * question i of player p's set (null when blank). Scored here, never on a guest device.
 */
export function surveyRows({ phase, players, sliders, answers, questionSets, confidence }) {
  const rows = [];
  for (const p of players) {
    const base = { phase, playerIndex: p, playerLabel: `Player ${p + 1}` };
    (confidence || []).forEach((cfg) => rows.push({ ...base, section: "confidence", questionId: cfg.key, questionPrompt: cfg.label, response: sliders?.[p]?.[cfg.key] ?? 5 }));
    (questionSets[p] || []).forEach((q, qi) => {
      const response = answers?.[p]?.[qi] ?? null;
      const result = checkAnswer(q, response);
      rows.push({
        ...base,
        section: "quiz",
        questionId: q.id || "",
        format: q.format,
        questionPrompt: q.prompt,
        // The option number in the question file (1–4, like correctIndex), not the shuffled position on screen.
        selectedIndex: q.format === "mcq" && response != null ? (q.optionOrder?.[response] ?? response) + 1 : "",
        selectedOption: result.responseText,
        correctAnswer: result.correctText,
        correct: result.correct,
      });
    });
  }
  return rows;
}
