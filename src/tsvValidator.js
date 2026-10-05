// src/tsvValidator.js
// ------------------------------------------------------------
// Checks a question file (TSV) against what the game engine
// actually needs, and explains problems in instructor-friendly
// language. Used by the upload screen (App.jsx), by
// `npm run validate-tsv` (scripts/validate-tsv.mjs) and by tests.
//
// Severity:
//   error   -> the game will crash, misbehave, or a question can
//              never be answered correctly
//   warning -> the game runs, but content is ignored, repeated or
//              falls back to built-in defaults
// ------------------------------------------------------------

import { getAllTopics, getModulesForTopic } from "./tsvParser.js";
import { matchesTopicAndModule } from "./tsvBoardBuilder.js";

export const KNOWN_TYPES = ["property", "milestone", "core", "mishap", "survey", "confidence"];
const QUIZ_TYPES = ["property", "milestone", "core", "survey"];
const REQUIRED_HEADERS = ["id", "question", "type"];
const QUIZ_HEADERS = ["option1", "option2", "option3", "option4", "correctIndex", "explanation"];
const BOARD_HEADERS = ["theme", "subtheme"];
const FILTER_HEADERS = ["bigTopic", "module"];

const BOARD_SIDES = 4;
const SUBTHEMES_PER_SIDE = 2;
const MILESTONE_QUIZ_SIZE = 6;
const SURVEY_QUIZ_SIZE = 10;

const rowLabel = (row, i) => (row.id ? `"${row.id}"` : `row ${i + 2}`);

function summarizeLabels(labels, max = 5) {
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} and ${labels.length - max} more`;
}

/**
 * Validate parsed TSV rows.
 * @param {object[]} rows   output of parseTsv()
 * @param {string[]} headers header names (optional; inferred from rows)
 * @returns {{ errors: string[], warnings: string[], games: object[], images: string[] }}
 */
export function validateQuestionRows(rows, headers) {
  const errors = [];
  const warnings = [];
  const cols = headers && headers.length ? headers : Object.keys(rows[0] || {});

  if (!rows.length) {
    errors.push("The file has no question rows (it needs a header line plus at least one row).");
    return { errors, warnings, games: [], images: [] };
  }

  // ---------- Headers ----------
  const missingRequired = REQUIRED_HEADERS.filter((h) => !cols.includes(h));
  if (missingRequired.length) {
    errors.push(`Missing required column(s): ${missingRequired.join(", ")}. Column names are case-sensitive.`);
  }
  const missingOther = [...QUIZ_HEADERS, ...BOARD_HEADERS, ...FILTER_HEADERS].filter((h) => !cols.includes(h));
  if (missingOther.length) {
    warnings.push(`Missing column(s): ${missingOther.join(", ")}. Column names are case-sensitive.`);
  }
  const unknownCols = cols.filter(
    (h) => h && ![...REQUIRED_HEADERS, ...QUIZ_HEADERS, ...BOARD_HEADERS, ...FILTER_HEADERS, "imageFile"].includes(h)
  );
  if (unknownCols.length) {
    warnings.push(`Unrecognised column(s) will be ignored: ${unknownCols.join(", ")}.`);
  }

  // ---------- Row-level checks ----------
  const seenIds = new Map();
  const badType = [];
  const caseType = [];
  const badAnswer = [];
  const fewOptions = [];
  const noExplanation = [];
  const noQuestion = [];
  const images = new Set();

  rows.forEach((row, i) => {
    const label = rowLabel(row, i);
    const rawType = (row.type || "").trim();
    const type = rawType.toLowerCase();

    if (row.id) seenIds.set(row.id, (seenIds.get(row.id) || 0) + 1);
    if (row.imageFile) images.add(row.imageFile.trim());

    if (!KNOWN_TYPES.includes(type)) {
      badType.push(`${label} (${rawType || "blank"})`);
      return;
    }
    if (rawType !== type) caseType.push(label);
    if (!(row.question || "").trim()) noQuestion.push(label);

    if (QUIZ_TYPES.includes(type)) {
      const options = [row.option1, row.option2, row.option3, row.option4].filter((o) => o && o.length > 0);
      if (options.length < 2) fewOptions.push(label);
      const idx = parseInt(row.correctIndex, 10);
      if (Number.isNaN(idx) || idx < 1 || idx > options.length) badAnswer.push(label);
      if (type !== "survey" && !(row.explanation || "").trim()) noExplanation.push(label);
    }
  });

  const dupIds = [...seenIds.entries()].filter(([, n]) => n > 1).map(([id]) => `"${id}"`);
  if (dupIds.length) warnings.push(`Duplicate id(s): ${summarizeLabels(dupIds)}. Ids should be unique so exported data can be traced back to questions.`);
  if (badType.length) warnings.push(`Unknown type, row will be ignored: ${summarizeLabels(badType)}. Valid types: ${KNOWN_TYPES.join(", ")}.`);
  if (caseType.length) warnings.push(`Type is not lowercase: ${summarizeLabels(caseType)}. Board questions tolerate this, but survey/confidence rows must be lowercase to be found.`);
  if (noQuestion.length) errors.push(`Empty question text: ${summarizeLabels(noQuestion)}.`);
  if (fewOptions.length) errors.push(`Fewer than 2 answer options: ${summarizeLabels(fewOptions)}.`);
  if (badAnswer.length) errors.push(`correctIndex is missing or does not point to a filled option (use 1-4): ${summarizeLabels(badAnswer)}. These questions can never be answered correctly.`);
  if (noExplanation.length) warnings.push(`No explanation: ${summarizeLabels(noExplanation)}. Explanations are shown after every answer and are the main teaching moment.`);

  // ---------- Per-game (bigTopic + module) checks ----------
  const games = [];
  let topics = getAllTopics(rows);
  if (!topics.length) topics = [null];

  topics.forEach((topic) => {
    let modules = topic ? getModulesForTopic(rows, topic) : [];
    if (!modules.length) modules = [null];

    modules.forEach((module) => {
      const name = [topic, module].filter(Boolean).join(" / ") || "(all rows)";
      const scoped = rows.filter((r) => matchesTopicAndModule(r, topic, module));
      const ofType = (t) => scoped.filter((r) => (r.type || "").trim().toLowerCase() === t);

      const boardRows = scoped.filter((r) => ["property", "milestone"].includes((r.type || "").trim().toLowerCase()));
      const themes = [];
      boardRows.forEach((r) => {
        const th = (r.theme || "").trim();
        if (th && !themes.includes(th)) themes.push(th);
      });

      const game = { name, topic, module, themes: [], counts: {} };
      KNOWN_TYPES.forEach((t) => { game.counts[t] = ofType(t).length; });

      if (themes.length < BOARD_SIDES) {
        errors.push(`[${name}] The board needs ${BOARD_SIDES} themes (one per side) but found ${themes.length}${themes.length ? `: ${themes.join(", ")}` : ""}. The board will be incomplete and the game can break.`);
      } else if (themes.length > BOARD_SIDES) {
        warnings.push(`[${name}] Found ${themes.length} themes; only the first ${BOARD_SIDES} are used (${themes.slice(0, BOARD_SIDES).join(", ")}). Ignored: ${themes.slice(BOARD_SIDES).join(", ")}.`);
      }

      themes.slice(0, BOARD_SIDES).forEach((theme) => {
        const themeRows = scoped.filter((r) => (r.theme || "").trim() === theme);
        const props = themeRows.filter((r) => (r.type || "").trim().toLowerCase() === "property");
        const miles = themeRows.filter((r) => (r.type || "").trim().toLowerCase() === "milestone");
        const subs = [];
        props.forEach((r) => {
          const st = (r.subtheme || "").trim();
          if (st && !subs.includes(st)) subs.push(st);
        });
        const subCounts = subs.map((st) => ({
          name: st,
          questions: props.filter((r) => (r.subtheme || "").trim() === st).length,
        }));
        game.themes.push({ name: theme, subthemes: subCounts, milestoneQuestions: miles.length });

        if (props.length === 0) {
          errors.push(`[${name}] Theme "${theme}" has no property questions, so its 6 property tiles cannot ask anything.`);
        } else if (subs.length < SUBTHEMES_PER_SIDE) {
          warnings.push(`[${name}] Theme "${theme}" has ${subs.length} subtheme(s); each side uses ${SUBTHEMES_PER_SIDE}. Both property groups will reuse the same questions.`);
        } else if (subs.length > SUBTHEMES_PER_SIDE) {
          warnings.push(`[${name}] Theme "${theme}" has ${subs.length} subthemes; only the first ${SUBTHEMES_PER_SIDE} are used. Ignored: ${subs.slice(SUBTHEMES_PER_SIDE).join(", ")}.`);
        }
        if (miles.length === 0) {
          errors.push(`[${name}] Theme "${theme}" has no milestone questions, so its corner exam cannot start.`);
        } else if (miles.length < MILESTONE_QUIZ_SIZE) {
          warnings.push(`[${name}] Theme "${theme}" has ${miles.length} milestone question(s); exams ask ${MILESTONE_QUIZ_SIZE}, so questions will repeat within an exam.`);
        }
      });

      if (game.counts.core === 0) warnings.push(`[${name}] No "core" questions; the 4 core tiles will show a generic event instead of a question.`);
      if (game.counts.mishap === 0) warnings.push(`[${name}] No "mishap" rows; built-in lab-themed mishaps will be used.`);
      if (game.counts.survey === 0) warnings.push(`[${name}] No "survey" questions; the pre/post knowledge check will be empty.`);
      else if (game.counts.survey < SURVEY_QUIZ_SIZE) warnings.push(`[${name}] Only ${game.counts.survey} survey question(s); each player normally gets ${SURVEY_QUIZ_SIZE}.`);
      if (game.counts.confidence === 0) warnings.push(`[${name}] No "confidence" rows; the pre/post surveys will have no confidence sliders.`);

      games.push(game);
    });
  });

  return { errors, warnings, games, images: [...images] };
}

/** Format a validation result as plain text (CLI output). */
export function formatValidationReport(result) {
  const lines = [];
  result.games.forEach((g) => {
    lines.push(`Game: ${g.name}`);
    g.themes.forEach((t, i) => {
      const subs = t.subthemes.map((s) => `${s.name} (${s.questions})`).join(", ") || "none";
      lines.push(`  Side ${i + 1}: ${t.name} | subthemes: ${subs} | milestone questions: ${t.milestoneQuestions}`);
    });
    const c = g.counts;
    lines.push(`  core: ${c.core}, mishap: ${c.mishap}, survey: ${c.survey}, confidence: ${c.confidence}`);
  });
  if (result.images.length) lines.push(`Images referenced (${result.images.length}): ${result.images.join(", ")}`);
  lines.push("");
  result.errors.forEach((e) => lines.push(`ERROR: ${e}`));
  result.warnings.forEach((w) => lines.push(`WARNING: ${w}`));
  lines.push("");
  lines.push(`${result.errors.length} error(s), ${result.warnings.length} warning(s).`);
  return lines.join("\n");
}

