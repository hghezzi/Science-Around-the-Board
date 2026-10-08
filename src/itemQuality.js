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
// Students play one game (bigTopic + module) at a time, so when a
// file holds several games the statistical cues are measured per
// game; checks on single rows are reported once for the file.
//
// The question-writer skill has a Python mirror of this file in
// .claude/skills/sab-question-writer/scripts/validate_tsv.py.
// Keep the two in step: same rules, same thresholds, same messages.
// ------------------------------------------------------------

import { checkAnswer, normalizeText, parseFormat, parseIndexList, parseNumber } from "./questionFormats.js";

const QUIZ_TYPES = ["property", "milestone", "core", "survey"];
const BOARD_TYPES = ["property", "milestone", "core"];

// A file-level cue is reported when a blind strategy beats chance (or, for the
// length cues, falls below it) by more than 10 percentage points AND by more
// than a one-sided 95% margin for this many items.
export const MIN_CUE_ITEMS = 10;
const CUE_MARGIN = 0.1;
const Z_95 = 1.645;

// Per question: the correct option is the longest by at least this ratio and gap.
export const LONG_RATIO = 1.5;
const LONG_MIN_GAP = 10;

const MIN_ABSOLUTE_OPTIONS = 6;
const SURVEY_DUP_JACCARD = 0.6;

// Select-all items: warn when one number of correct options covers this share of them.
const MIN_MULTI_ITEMS = 6;
const MULTI_COUNT_SHARE = 0.7;

// English, then Spanish, French and Portuguese (accents are removed before matching).
export const ABSOLUTE_WORDS = [
  "always", "never", "all", "none", "only", "every", "must", "cannot", "impossible",
  "completely", "entirely", "totally", "absolutely", "guaranteed", "guarantees",
  "siempre", "nunca", "jamas", "solo", "solamente", "unicamente", "exclusivamente", "totalmente", "todos", "todas",
  "ninguno", "ninguna", "ningun", "nada", "nadie", "imposible",
  "toujours", "jamais", "seulement", "uniquement", "tous", "toutes", "aucun", "aucune",
  "sempre", "apenas", "somente", "nenhum", "nenhuma", "impossivel",
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

const SPREADSHEET_ERROR = /^#(?:NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!|SPILL!|CALC!|ERROR!)$/i;
const OPTION_REFERENCE = [
  /\b(?:all|none|both|neither)\s+of\s+(?:the\s+)?(?:above|below|these|those|the\s+(?:other\s+)?(?:options|answers|choices))\b/i,
  /\b(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?)\s+[A-D1-4]\b/,
  /\b(?:[Bb]oth|[Ee]ither|[Nn]either|[Oo]nly)\s+[A-D]\s+(?:and|or|nor)\s+[A-D]\b/,
  /\b(?:todas|ninguna|nenhuma)\s+(?:(?:de|das|dos)\s+)?(?:(?:las|as|os)\s+)?(?:anteriores|opciones|alternativas)\b/i,
];
const TEXT_CELLS = ["question", "option1", "option2", "option3", "option4", "explanation", "answer"];

// Words in any script: accents and punctuation removed, as the game does for typed answers.
const words = (text) => normalizeText(text).split(" ").filter(Boolean);

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

/** Text whose leading apostrophe a spreadsheet may take as its "keep as text" mark and drop. */
const leadingApostrophe = (value) => (value || "").trim().startsWith("'");

/** Text a spreadsheet would turn into a formula: starts with - + = @, and isn't just a number. */
function formulaProne(value) {
  const s = (value || "").trim();
  return s.length >= 2 && "-+=@".includes(s[0]) && Number.isNaN(parseNumber(s.replace(/%$/, "")));
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
const cueMargin = (t) => Math.max(CUE_MARGIN * t.items, Z_95 * Math.sqrt(t.variance));
const beatsChance = (t) => t.items >= MIN_CUE_ITEMS && t.score - t.chance > cueMargin(t);
const belowChance = (t) => t.items >= MIN_CUE_ITEMS && t.chance - t.score > cueMargin(t);

/** Ratio of shared to total content words, or 0 when either text is too short to compare. */
function jaccard(a, b) {
  if (a.size < 3 || b.size < 3) return 0;
  let shared = 0;
  a.forEach((w) => { if (b.has(w)) shared += 1; });
  return shared / (a.size + b.size - shared);
}

/**
 * A short-answer row's first near miss that the game's matcher would also accept,
 * because one typo is forgiven in long answers: another term from the file (an
 * option or accepted answer) one letter different from an accepted answer
 * ("adsorption" for "absorption"). Numbers and Roman numerals must match exactly in
 * the game, so "type ii" is never accepted for "type i".
 * Terms that only add or drop a letter ("safer" for "safe") are left alone.
 */
function textNearMiss(row, terms) {
  const answers = String(row.answer || "").split("|").map((a) => a.trim()).filter(Boolean);
  const own = answers.map((a) => normalizeText(a)).filter(Boolean);
  if (!own.length) return null;
  const q = { format: "text", acceptedAnswers: answers };
  const sameTerm = (c) => own.some((a) => c === a || c.replace(/ /g, "") === a.replace(/ /g, ""));
  const candidates = terms.map((t) => normalizeText(t)).filter((c) => own.some((a) => a.length === c.length));
  const seen = new Set();
  for (const c of candidates) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    if (!sameTerm(c) && checkAnswer(q, c).correct) return c;
  }
  return null;
}

/** What one quiz row contributes to the statistical cue checks. */
function rowFacts(row, label, type) {
  const format = parseFormat(row.format);
  const options = [row.option1, row.option2, row.option3, row.option4].map((o) => (o || "").trim()).filter(Boolean);
  const stem = row.question || "";
  const facts = { row, label, type, format, options, stemWords: contentWords(stem), mcq: null, multiCorrect: null };
  if (format === "multi" && options.length >= 3) {
    const idxs = parseIndexList(row.correctIndex);
    if (idxs.length && idxs.every((k) => k >= 0 && k < options.length)) facts.multiCorrect = idxs.length;
  }
  if (format !== "mcq" || options.length < 3) return facts;
  const correct = parseInt(row.correctIndex, 10) - 1;
  if (Number.isNaN(correct) || correct < 0 || correct >= options.length) return facts;
  const n = options.length;

  const lengths = options.map((o) => o.length);
  const maxLen = Math.max(...lengths);
  const minLen = Math.min(...lengths);
  const longestIdx = lengths.map((l, k) => (l === maxLen ? k : -1)).filter((k) => k >= 0);
  const shortestIdx = lengths.map((l, k) => (l === minLen ? k : -1)).filter((k) => k >= 0);

  // Word-overlap cue: the option that echoes the question's wording.
  const shared = options.map((o) => [...contentWords(o)].filter((w) => facts.stemWords.has(w)).length);
  const mostShared = Math.max(...shared);
  const overlap = mostShared > 0
    ? strategyScore(shared.map((s, k) => (s === mostShared ? k : -1)).filter((k) => k >= 0), correct)
    : null;

  facts.mcq = {
    n,
    correct,
    lengths,
    longestIdx,
    longest: strategyScore(longestIdx, correct),
    shortest: strategyScore(shortestIdx, correct),
    overlap,
    absolute: options.map((o, k) => (hasAbsolute(o) ? k : -1)).filter((k) => k >= 0),
  };
  return facts;
}

/** Statistical cues over one set of rows (the file, or one game). */
function tallyCues(facts) {
  const longest = newTally();
  const shortest = newTally();
  const mileLongest = newTally();
  const mileShortest = newTally();
  const overlap = newTally();
  const absolute = { options: 0, correct: 0, chance: 0, variance: 0 };
  const multiCounts = {};
  let multiItems = 0;
  facts.forEach((f) => {
    if (f.multiCorrect) {
      multiItems += 1;
      multiCounts[f.multiCorrect] = (multiCounts[f.multiCorrect] || 0) + 1;
    }
    if (!f.mcq) return;
    const { n, correct } = f.mcq;
    addToTally(longest, f.mcq.longest, n);
    addToTally(shortest, f.mcq.shortest, n);
    if (f.type === "milestone") {
      addToTally(mileLongest, f.mcq.longest, n);
      addToTally(mileShortest, f.mcq.shortest, n);
    }
    if (f.mcq.overlap !== null) addToTally(overlap, f.mcq.overlap, n);
    f.mcq.absolute.forEach((k) => {
      absolute.options += 1;
      if (k === correct) absolute.correct += 1;
      absolute.chance += 1 / n;
      absolute.variance += (1 / n) * (1 - 1 / n);
    });
  });

  // Survey items that repeat a board item (the pre/post survey would measure memory of it).
  const boards = facts.filter((f) => BOARD_TYPES.includes(f.type));
  const surveyDups = [];
  facts.filter((f) => f.type === "survey").forEach((s) => {
    const match = boards.find((b) => jaccard(s.stemWords, b.stemWords) >= SURVEY_DUP_JACCARD);
    if (match) surveyDups.push(`${s.label} ≈ ${match.label}`);
  });
  return { longest, shortest, mileLongest, mileShortest, overlap, absolute, multiCounts, multiItems, surveyDups };
}

function cueWarnings(t, prefix) {
  const warnings = [];
  const { longest, shortest, overlap, absolute } = t;
  [["longest", longest], ["shortest", shortest]].forEach(([which, tally]) => {
    const rate = tally.items ? pct(tally.score / tally.items) : 0;
    const chance = tally.items ? pct(tally.chance / tally.items) : 0;
    if (beatsChance(tally)) {
      warnings.push(`${prefix}Length cue: always picking the ${which} option would answer ${rate}% of the ${tally.items} multiple-choice questions correctly (chance is ${chance}%). Vary which option is ${which}, so that length gives nothing away.`);
    } else if (belowChance(tally)) {
      warnings.push(`${prefix}Length cue: always picking the ${which} option would answer only ${rate}% of the ${tally.items} multiple-choice questions correctly (chance is ${chance}%), so students can rule the ${which} option out. Vary which option is ${which}, so that length gives nothing away.`);
    }
  });
  // The milestone exam (5 of 6) is where a shape cue pays most, so its pool is checked on its own.
  [["longest", t.mileLongest], ["shortest", t.mileShortest]].forEach(([which, tally]) => {
    if (!beatsChance(tally) && !belowChance(tally)) return;
    const rate = pct(tally.score / tally.items);
    warnings.push(`${prefix}Length cue in the milestone questions: always picking the ${which} option would answer ${belowChance(tally) ? "only " : ""}${rate}% of the ${tally.items} milestone multiple-choice questions correctly (chance is ${pct(tally.chance / tally.items)}%). Vary which option is ${which} within the milestone pools too.`);
  });
  if (beatsChance(overlap)) {
    warnings.push(`${prefix}Wording cue: picking the option that repeats the most words from the question would answer ${pct(overlap.score / overlap.items)}% of the ${overlap.items} multiple-choice questions where an option repeats a question word (chance is ${pct(overlap.chance / overlap.items)}%). Echo the question's key words in the distractors too, or in none of the options.`);
  }
  if (absolute.options >= MIN_ABSOLUTE_OPTIONS && absolute.chance - absolute.correct >= Math.max(1.5, Z_95 * Math.sqrt(absolute.variance))) {
    const which = absolute.correct === 0 ? "none" : `only ${absolute.correct}`;
    warnings.push(`${prefix}Absolute-word cue: ${absolute.options} options use words such as "always", "never", "all" or "only", but ${which} of them are correct answers (about ${Math.round(absolute.chance)} expected by chance). Test-wise students rule such options out; use these words in correct answers too, or avoid them.`);
  }
  if (t.multiItems >= MIN_MULTI_ITEMS) {
    const [count, items] = Object.entries(t.multiCounts).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (items / t.multiItems >= MULTI_COUNT_SHARE) {
      warnings.push(`${prefix}Select-all cue: ${items} of the ${t.multiItems} select-all-that-apply questions have exactly ${count} correct option${count === "1" ? "" : "s"}, so students can learn to tick ${count}. Vary the number of correct options (anywhere from 1 to 4).`);
    }
  }
  if (t.surveyDups.length) {
    warnings.push(`${prefix}Survey question nearly repeats a board question, so students practise the survey item itself during the game: ${summarize(t.surveyDups)}. Write a different item on the same learning objective.`);
  }
  return warnings;
}

function cueStats(t) {
  const { longest, shortest, overlap, absolute } = t;
  const rate = (x) => (x.items ? x.score / x.items : null);
  return {
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
    multiItems: t.multiItems,
    multiCounts: { ...t.multiCounts },
  };
}

/**
 * Check answer options for cues that give the correct answer away.
 * @param {object[]} rows  output of parseTsv()
 * @param {{name: string, rows: object[]}[]} [games] the file's games; with more
 *   than one, the statistical cues are measured and reported per game
 * @returns {{ errors: string[], warnings: string[], cues: object }}
 *   `cues.games` lists each game's cues when there is more than one game.
 */
export function checkItemQuality(rows, games = []) {
  const errors = [];
  const warnings = [];
  const spreadsheetErrors = [];
  const formulaCells = [];
  const apostropheCells = [];
  const optionRefs = [];
  const duplicateOptions = [];
  const articleCue = [];
  const longItems = [];
  const nearMisses = [];
  const facts = [];

  // Terms a short answer could be confused with: every option and every accepted answer.
  const terms = [];
  rows.forEach((row) => {
    if (!QUIZ_TYPES.includes((row.type || "").trim().toLowerCase())) return;
    [row.option1, row.option2, row.option3, row.option4].forEach((o) => { if ((o || "").trim()) terms.push(o.trim()); });
    if (parseFormat(row.format) === "text") String(row.answer || "").split("|").forEach((a) => { if (a.trim()) terms.push(a.trim()); });
  });

  rows.forEach((row, i) => {
    const label = rowLabel(row, i);
    const type = (row.type || "").trim().toLowerCase();
    if (!type || type === "config") return;
    if (TEXT_CELLS.some((c) => SPREADSHEET_ERROR.test((row[c] || "").trim()))) spreadsheetErrors.push(label);
    const format = parseFormat(row.format);
    if (TEXT_CELLS.some((c) => !(c === "answer" && format === "numeric") && formulaProne(row[c]))) formulaCells.push(label);
    // The matcher ignores punctuation in text answers, so a lost apostrophe there is harmless.
    if (TEXT_CELLS.some((c) => c !== "answer" && leadingApostrophe(row[c]))) apostropheCells.push(label);
    if (!QUIZ_TYPES.includes(type)) return;

    const f = rowFacts(row, label, type);
    facts.push(f);
    if (format === "text") {
      const miss = textNearMiss(row, terms);
      if (miss) nearMisses.push(`${label} ("${miss}")`);
    }
    if (format !== "mcq" && format !== "multi") return;
    if (f.options.some((o) => OPTION_REFERENCE.some((re) => re.test(o)))) optionRefs.push(label);
    const lowered = f.options.map((o) => o.toLowerCase());
    if (new Set(lowered).size < lowered.length) duplicateOptions.push(label);
    if (!f.mcq) return;

    // Grammatical cue: "...is an" followed by options that don't all fit.
    const end = (row.question || "").trim().replace(/[\s:._…-]+$/, "").toLowerCase();
    const article = end.match(/\b(an?)$/);
    if (article) {
      const fits = f.options.map((o) => /^[aeiou]/i.test(o) === (article[1] === "an"));
      if (fits.some((ok) => !ok)) articleCue.push(label);
    }

    // A single correct answer much longer than its distractors.
    const { lengths, longestIdx, correct } = f.mcq;
    const others = lengths.filter((_, k) => k !== correct);
    const meanOther = others.reduce((a, b) => a + b, 0) / others.length;
    const lc = lengths[correct];
    if (longestIdx.length === 1 && longestIdx[0] === correct && lc >= LONG_RATIO * meanOther && lc - meanOther >= LONG_MIN_GAP) {
      longItems.push(`${label} (${lc} vs ${Math.round(meanOther)} characters)`);
    }
  });

  if (spreadsheetErrors.length) {
    errors.push(`Spreadsheet error value (such as #NAME?) instead of text: ${summarize(spreadsheetErrors)}. A spreadsheet treated text starting with "-", "+", "=" or "@" as a formula. Retype it with an apostrophe in front (for example '--input-path), then export the file again.`);
  }
  if (formulaCells.length) {
    warnings.push(`Cell starts with "-", "+", "=" or "@": ${summarize(formulaCells)}. Excel and Google Sheets turn such text into a formula (#NAME? or #ERROR!) when the file is opened there. Start the cell with a word, or wrap a command or flag in backticks (for example \`--p-trim-left\`).`);
  }
  if (apostropheCells.length) {
    warnings.push(`Cell starts with an apostrophe ('): ${summarize(apostropheCells)}. Excel and Google Sheets may take a leading apostrophe as their "keep as text" mark and drop it when the file is edited there. Use double quotes for quoted speech, or backticks for code.`);
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
  if (nearMisses.length) {
    warnings.push(`Short-answer question would also accept a different term, because the game forgives one typo in answers of 8 or more letters: ${summarize(nearMisses)}. Use multiple choice when two terms differ by one letter (absorption and adsorption), or add the other spelling to the accepted answers if it is also correct.`);
  }

  // Statistical cues: per game when the file has several, otherwise for the whole file.
  const total = tallyCues(facts);
  const cues = cueStats(total);
  if (games.length > 1) {
    cues.games = games.map((g) => {
      const inGame = new Set(g.rows);
      const t = tallyCues(facts.filter((f) => inGame.has(f.row)));
      warnings.push(...cueWarnings(t, `[${g.name}] `));
      return { name: g.name, ...cueStats(t) };
    });
  } else {
    warnings.push(...cueWarnings(total, ""));
  }
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

/** One-line summary of how many correct options the select-all questions have. */
export function formatMultiSummary(cues) {
  if (!cues || !cues.multiItems) return "";
  const parts = Object.keys(cues.multiCounts).sort((a, b) => a - b).map((k) => `${k} correct: ${cues.multiCounts[k]}`);
  return `Select-all questions (${cues.multiItems}): ${parts.join(", ")}`;
}
