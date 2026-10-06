// src/itemQuality.js
// ------------------------------------------------------------
// Item-writing checks for answer options (pure, no React).
//
// Test-wise students can often find the correct option without
// knowing the content: it is the longest one, it repeats the
// question's wording, or the distractors are the only options
// with "always" or "never". These checks measure such cues and
// report how well a blind strategy would score compared with
// chance. Used by src/tsvValidator.js.
//
// The question-writer skill has a Python mirror of this file in
// .claude/skills/sab-question-writer/scripts/validate_tsv.py.
// Keep the two in step: same rules, same thresholds, same messages.
// ------------------------------------------------------------

import { parseFormat } from "./questionFormats.js";

const QUIZ_TYPES = ["property", "milestone", "core", "survey"];
const BOARD_TYPES = ["property", "milestone", "core"];

// A file-level cue is reported when a blind strategy beats chance by more than
// 10 percentage points AND by more than a one-sided 95% margin for this many items.
export const MIN_CUE_ITEMS = 10;
const CUE_MARGIN = 0.1;
const Z_95 = 1.645;

// Per question: the correct option is the longest by at least this ratio and gap.
export const LONG_RATIO = 1.5;
const LONG_MIN_GAP = 10;

const MIN_ABSOLUTE_OPTIONS = 6;
const SURVEY_DUP_JACCARD = 0.6;

export const ABSOLUTE_WORDS = [
  "always", "never", "all", "none", "only", "every", "must", "cannot", "impossible",
  "completely", "entirely", "totally", "absolutely", "guaranteed", "guarantees",
];

const STOPWORDS = new Set([
  "about", "after", "also", "among", "another", "because", "been", "before", "being", "best",
  "between", "both", "does", "doing", "each", "either", "from", "have", "having", "here",
  "into", "just", "least", "less", "like", "many", "more", "most", "much", "must", "need",
  "only", "other", "over", "same", "should", "show", "some", "such", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "under", "used",
  "using", "very", "were", "what", "when", "where", "which", "while", "will", "with",
  "would", "your", "following", "true", "false", "statement",
]);

const SPREADSHEET_ERROR = /^#(?:NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!|SPILL!|CALC!)$/i;
const OPTION_REFERENCE = [
  /\b(?:all|none|both|neither)\s+of\s+(?:the\s+)?(?:above|below|these|those|the\s+(?:other\s+)?(?:options|answers|choices))\b/i,
  /\b(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?)\s+[A-D1-4]\b/,
  /\b(?:[Bb]oth|[Ee]ither|[Nn]either|[Oo]nly)\s+[A-D]\s+(?:and|or|nor)\s+[A-D]\b/,
];

const words = (text) => String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [];

/** Content words: 4+ characters, not a function word, with a plural "s" removed. */
export function contentWords(text) {
  const out = new Set();
  words(text).forEach((w) => {
    if (w.length < 4 || STOPWORDS.has(w)) return;
    out.add(w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
  });
  return out;
}

const hasAbsolute = (text) => words(text).some((w) => ABSOLUTE_WORDS.includes(w));
const pct = (x) => Math.round(100 * x);
const rowLabel = (row, i) => (row.id ? `"${row.id}"` : `row ${i + 2}`);

function summarize(labels, max = 5) {
  if (labels.length <= max) return labels.join(", ");
  return `${labels.slice(0, max).join(", ")} and ${labels.length - max} more`;
}

/**
 * Expected score of a strategy that picks at random among `picked` option
 * indices: 1/|picked| if the correct option is among them, otherwise 0.
 */
const strategyScore = (picked, correct) => (picked.includes(correct) ? 1 / picked.length : 0);

/** Sum of strategy scores and of chance (1/n) over the items it applies to. */
function newTally() {
  return { items: 0, score: 0, chance: 0, variance: 0 };
}
function addToTally(t, score, n) {
  t.items += 1;
  t.score += score;
  t.chance += 1 / n;
  t.variance += (1 / n) * (1 - 1 / n);
}
const beatsChance = (t) =>
  t.items >= MIN_CUE_ITEMS && t.score - t.chance > Math.max(CUE_MARGIN * t.items, Z_95 * Math.sqrt(t.variance));

/** Ratio of shared to total content words, or 0 when either text is too short to compare. */
function jaccard(a, b) {
  if (a.size < 3 || b.size < 3) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared += 1; });
  return shared / (a.size + b.size - shared);
}

/**
 * Check answer options for cues that give the correct answer away.
 * @param {object[]} rows output of parseTsv()
 * @returns {{ errors: string[], warnings: string[], cues: object }}
 */
export function checkItemQuality(rows) {
  const errors = [];
  const warnings = [];
  const spreadsheetErrors = [];
  const optionRefs = [];
  const duplicateOptions = [];
  const articleCue = [];
  const longItems = [];
  const longest = newTally();
  const shortest = newTally();
  const overlap = newTally();
  const absolute = { options: 0, correct: 0, chance: 0, variance: 0 };
  const surveyStems = [];
  const boardStems = [];

  rows.forEach((row, i) => {
    const label = rowLabel(row, i);
    const type = (row.type || "").trim().toLowerCase();
    if (!type || type === "config") return;
    const cells = ["question", "option1", "option2", "option3", "option4", "explanation", "answer"];
    if (cells.some((c) => SPREADSHEET_ERROR.test((row[c] || "").trim()))) spreadsheetErrors.push(label);
    if (!QUIZ_TYPES.includes(type)) return;

    const format = parseFormat(row.format);
    const options = [row.option1, row.option2, row.option3, row.option4].map((o) => (o || "").trim()).filter(Boolean);
    const stem = row.question || "";
    if (type === "survey") surveyStems.push({ label, words: contentWords(stem) });
    else if (BOARD_TYPES.includes(type)) boardStems.push({ label, words: contentWords(stem) });

    if (format !== "mcq" && format !== "multi") return;
    if (options.some((o) => OPTION_REFERENCE.some((re) => re.test(o)))) optionRefs.push(label);
    const lowered = options.map((o) => o.toLowerCase());
    if (new Set(lowered).size < lowered.length) duplicateOptions.push(label);
    if (format !== "mcq" || options.length < 3) return;

    const correct = parseInt(row.correctIndex, 10) - 1;
    if (Number.isNaN(correct) || correct < 0 || correct >= options.length) return;
    const n = options.length;

    // Grammatical cue: "...is an" followed by options that don't all fit.
    const end = stem.trim().replace(/[\s:._…-]+$/, "").toLowerCase();
    const article = end.match(/\b(an?)$/);
    if (article) {
      const fits = options.map((o) => /^[aeiou]/i.test(o) === (article[1] === "an"));
      if (fits.some((f) => !f)) articleCue.push(label);
    }

    // Length cues.
    const lengths = options.map((o) => o.length);
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    const longestIdx = lengths.map((l, k) => (l === maxLen ? k : -1)).filter((k) => k >= 0);
    const shortestIdx = lengths.map((l, k) => (l === minLen ? k : -1)).filter((k) => k >= 0);
    addToTally(longest, strategyScore(longestIdx, correct), n);
    addToTally(shortest, strategyScore(shortestIdx, correct), n);
    const others = lengths.filter((_, k) => k !== correct);
    const meanOther = others.reduce((a, b) => a + b, 0) / others.length;
    const lc = lengths[correct];
    if (longestIdx.length === 1 && longestIdx[0] === correct && lc >= LONG_RATIO * meanOther && lc - meanOther >= LONG_MIN_GAP) {
      longItems.push(`${label} (${lc} vs ${Math.round(meanOther)} characters)`);
    }

    // Word-overlap cue: the option that echoes the question's wording.
    const stemWords = contentWords(stem);
    const shared = options.map((o) => [...contentWords(o)].filter((w) => stemWords.has(w)).length);
    const mostShared = Math.max(...shared);
    if (mostShared > 0) {
      const picked = shared.map((s, k) => (s === mostShared ? k : -1)).filter((k) => k >= 0);
      addToTally(overlap, strategyScore(picked, correct), n);
    }

    // Absolute words ("always", "never") that only appear in distractors.
    options.forEach((o, k) => {
      if (!hasAbsolute(o)) return;
      absolute.options += 1;
      if (k === correct) absolute.correct += 1;
      absolute.chance += 1 / n;
      absolute.variance += (1 / n) * (1 - 1 / n);
    });
  });

  // Survey items that repeat a board item (the pre/post survey would measure memory of it).
  const surveyDups = [];
  surveyStems.forEach((s) => {
    const match = boardStems.find((b) => jaccard(s.words, b.words) >= SURVEY_DUP_JACCARD);
    if (match) surveyDups.push(`${s.label} ≈ ${match.label}`);
  });

  if (spreadsheetErrors.length) {
    errors.push(`Spreadsheet error value (such as #NAME?) instead of text: ${summarize(spreadsheetErrors)}. A spreadsheet treated text starting with "-", "+" or "=" as a formula. Retype it with an apostrophe in front (for example '--input-path), then export the file again.`);
  }
  if (optionRefs.length) {
    warnings.push(`Option refers to other options ("all of the above", "both A and B", "option 2"): ${summarize(optionRefs)}. Options are shuffled in the game, so use the multi (select all that apply) format instead.`);
  }
  if (duplicateOptions.length) warnings.push(`Two or more options are identical: ${summarize(duplicateOptions)}.`);
  if (articleCue.length) {
    warnings.push(`Question ends with "a" or "an", which rules out options that don't fit grammatically: ${summarize(articleCue)}. End with "a(n)" or rephrase the question.`);
  }
  if (longItems.length) {
    warnings.push(`Correct answer much longer than the other options (${LONG_RATIO}× their average length or more): ${summarize(longItems)}. Students can pick it without knowing the content; make the distractors just as detailed, or trim the correct answer.`);
  }
  if (beatsChance(longest)) {
    warnings.push(`Length cue: always picking the longest option would answer ${pct(longest.score / longest.items)}% of the ${longest.items} multiple-choice questions correctly (chance is ${pct(longest.chance / longest.items)}%). Vary which option is longest, so that length gives nothing away.`);
  }
  if (beatsChance(shortest)) {
    warnings.push(`Length cue: always picking the shortest option would answer ${pct(shortest.score / shortest.items)}% of the ${shortest.items} multiple-choice questions correctly (chance is ${pct(shortest.chance / shortest.items)}%). Vary which option is shortest, so that length gives nothing away.`);
  }
  if (beatsChance(overlap)) {
    warnings.push(`Wording cue: picking the option that repeats the most words from the question would answer ${pct(overlap.score / overlap.items)}% of the ${overlap.items} multiple-choice questions where an option repeats a question word (chance is ${pct(overlap.chance / overlap.items)}%). Echo the question's key words in the distractors too, or in none of the options.`);
  }
  if (absolute.options >= MIN_ABSOLUTE_OPTIONS && absolute.chance - absolute.correct >= Math.max(1.5, Z_95 * Math.sqrt(absolute.variance))) {
    const which = absolute.correct === 0 ? "none" : `only ${absolute.correct}`;
    warnings.push(`Absolute-word cue: ${absolute.options} options use words such as "always", "never", "all" or "only", but ${which} of them are correct answers (about ${Math.round(absolute.chance)} expected by chance). Test-wise students rule such options out; use these words in correct answers too, or avoid them.`);
  }
  if (surveyDups.length) {
    warnings.push(`Survey question nearly repeats a board question, so students practise the survey item itself during the game: ${summarize(surveyDups)}. Write a different item on the same learning objective.`);
  }

  const rate = (t) => (t.items ? t.score / t.items : null);
  const cues = {
    items: longest.items,
    chance: longest.items ? longest.chance / longest.items : null,
    longest: rate(longest),
    shortest: rate(shortest),
    overlap: rate(overlap),
    overlapItems: overlap.items,
    overlapChance: overlap.items ? overlap.chance / overlap.items : null,
    absoluteOptions: absolute.options,
    absoluteCorrect: absolute.correct,
    absoluteChance: absolute.chance,
  };
  return { errors, warnings, cues };
}

/** One-line summary of the answer cues for the CLI report. */
export function formatCueSummary(cues) {
  if (!cues || !cues.items) return "";
  const parts = [
    `longest option correct ${pct(cues.longest)}%`,
    `shortest ${pct(cues.shortest)}%`,
    `chance ${pct(cues.chance)}%`,
  ];
  if (cues.overlapItems) parts.push(`most words shared with the question ${pct(cues.overlap)}% of ${cues.overlapItems} (chance ${pct(cues.overlapChance)}%)`);
  parts.push(`absolute words in ${cues.absoluteOptions} options, ${cues.absoluteCorrect} correct (${Math.round(cues.absoluteChance)} expected)`);
  return `Answer cues (${cues.items} multiple-choice questions with 3+ options): ${parts.join(", ")}`;
}
