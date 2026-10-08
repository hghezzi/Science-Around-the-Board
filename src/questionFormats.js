// src/questionFormats.js
// ------------------------------------------------------------
// Question formats: turning TSV rows into question objects,
// shuffling options for display, and checking responses.
//
// Every format resolves to a single correct / incorrect result,
// so game rules (buying, rent defense, milestone 5/6) are the
// same whatever the format.
//
//   format   TSV encoding                         response shape
//   mcq      option1..4 + correctIndex (1-4)      option index
//   multi    option1..4 + correctIndex "1,3"      array of option indices
//   numeric  answer (+ optional tolerance)        string or number
//   order    option1..4 written in correct order  array of option strings
//   text     answer "AUG|ATG" (accepted answers)  string
// ------------------------------------------------------------

export const FORMATS = ["mcq", "multi", "numeric", "order", "text"];

const FORMAT_ALIASES = {
  "": "mcq",
  mc: "mcq",
  mcq: "mcq",
  "multiple choice": "mcq",
  tf: "mcq",
  "true/false": "mcq",
  multi: "multi",
  multiselect: "multi",
  "multi-select": "multi",
  numeric: "numeric",
  number: "numeric",
  order: "order",
  ordering: "order",
  sequence: "order",
  text: "text",
  short: "text",
  "short text": "text",
};

/** Map a TSV `format` cell to a known format, or null if unrecognised. */
export function parseFormat(cell) {
  const key = String(cell || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(FORMAT_ALIASES, key) ? FORMAT_ALIASES[key] : null;
}

/** Parse "1,3" / "1; 3" into sorted, unique 0-based indices. Invalid entries become NaN. */
export function parseIndexList(cell) {
  return [...new Set(
    String(cell || "")
      .split(/[,;|\s]+/)
      .filter(Boolean)
      .map((s) => parseInt(s, 10) - 1)
  )].sort((a, b) => a - b);
}

/**
 * Parse a number the way people type it, anywhere in the world:
 *   "1,500" / "1 500" / "1,000.5"  -> thousands separators (groups of 3 digits)
 *   "2,5" / "0,05" / "1.000,5"     -> decimal comma
 *   "−5" (Unicode minus), " 2.5 ", "1e-3"
 * Returns NaN when the text isn't a number.
 */
export function parseNumber(value) {
  if (typeof value === "number") return value;
  let s = String(value ?? "")
    .trim()
    .replace(/[\u2212\u2012\u2013\uFE63\uFF0D]/g, "-");
  // Spaces (incl. no-break and thin spaces) as thousands separators: "1 500 000".
  if (/^[-+]?\d{1,3}([\s\u00a0\u202f\u2009]\d{3})+([.,]\d+)?$/.test(s)) s = s.replace(/[\s\u00a0\u202f\u2009]/g, "");
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    // Both present: the last one is the decimal separator, the other groups thousands.
    if (comma > dot && /^[-+]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && /^[-+]?\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
    else return NaN;
  } else if (comma >= 0) {
    const thousands = /^[-+]?[1-9]\d{0,2}(,\d{3})+$/.test(s);
    if (thousands) s = s.replace(/,/g, "");
    else if (/^[-+]?\d*,\d+$/.test(s)) s = s.replace(",", ".");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

/**
 * Parse a tolerance cell: "" -> exact, "0.5" -> absolute, "5%" -> relative.
 * Returns { abs } or { pct }, or null if invalid.
 */
export function parseTolerance(cell) {
  const s = String(cell ?? "").trim();
  if (!s) return { abs: 0 };
  if (s.endsWith("%")) {
    const pct = parseNumber(s.slice(0, -1));
    return Number.isNaN(pct) || pct < 0 ? null : { pct };
  }
  const abs = parseNumber(s);
  return Number.isNaN(abs) || abs < 0 ? null : { abs };
}

/** Lowercase, strip accents/punctuation, collapse whitespace. */
export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Roman numerals that name things ("Type I", "Photosystem II"): a typo is never forgiven in them. */
export const ROMAN_NUMERALS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
const romanTokens = (t) => t.split(" ").filter((w) => ROMAN_NUMERALS.includes(w)).join(" ");

/**
 * A numeric response with a unit after the number ("12 kg", "0.5 mL", "25 °C") counts
 * as the number: the unit is in the question. "2 × 10⁴" is still rejected.
 */
export function parseNumericResponse(value) {
  const s = String(value ?? "").trim().replace(/\s*%$/, "");
  const x = parseNumber(s);
  if (!Number.isNaN(x)) return x;
  const m = s.match(/^(.*\d)\s*([^\d]+)$/u);
  if (!m || !/^[\p{L}°µμ][\p{L}\p{No}°µμ/·.⁺⁻\s-]*$/u.test(m[2])) return NaN;
  return parseNumber(m[1].trim());
}

/** Short-answer responses need this many characters before one typo is forgiven. */
export const TYPO_MIN_LENGTH = 8;

export function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * Convert a TSV row into the question object used everywhere in the app.
 * Keeps the legacy fields (prompt, options, answer, explanation, image)
 * so older code paths keep working.
 */
export function normalizeQuestion(row) {
  const format = parseFormat(row.format) || "mcq";
  const options = [row.option1, row.option2, row.option3, row.option4]
    .map((o) => (o || "").trim())
    .filter((o) => o.length > 0);

  const q = {
    id: row.id || null,
    format,
    prompt: row.question || "",
    options,
    answer: null,
    explanation: row.explanation || "",
    theme: row.theme || "",
    subtheme: row.subtheme || "",
    image: row.imageFile || null,
  };

  if (format === "mcq") {
    const idx = parseInt(row.correctIndex, 10);
    q.answer = Number.isNaN(idx) ? null : idx - 1;
  } else if (format === "multi") {
    q.answers = parseIndexList(row.correctIndex);
  } else if (format === "numeric") {
    q.numericAnswer = parseNumber(row.answer);
    q.tolerance = parseTolerance(row.tolerance) || { abs: 0 };
  } else if (format === "order") {
    q.correctOrder = [...options];
  } else if (format === "text") {
    q.acceptedAnswers = String(row.answer || "")
      .split("|")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  return q;
}

function shuffled(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Return a copy of the question ready to display: options shuffled and
 * answer indices remapped. Ordering questions never start in the solved order.
 */
export function prepareQuestion(q, rng = Math.random) {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return q;
  const order = shuffled(q.options.map((_, i) => i), rng);

  if (q.format === "order") {
    let display = order;
    for (let tries = 0; tries < 10 && display.every((v, i) => v === i); tries++) {
      display = shuffled(display, rng);
    }
    if (display.every((v, i) => v === i)) display = [...display.slice(1), display[0]];
    return { ...q, options: display.map((i) => q.options[i]) };
  }

  const remap = (oldIdx) => order.indexOf(oldIdx);
  // optionOrder[i] = the file's option index (0-based) shown at position i.
  const out = { ...q, options: order.map((i) => q.options[i]), optionOrder: order };
  if (q.format === "multi") out.answers = (q.answers || []).map(remap).sort((a, b) => a - b);
  else if (q.format === "mcq" || !q.format) out.answer = q.answer == null ? null : remap(q.answer);
  return out;
}

/** Human-readable correct answer for feedback and the CSV. */
export function correctAnswerText(q) {
  switch (q.format) {
    case "multi":
      return (q.answers || []).map((i) => q.options[i]).filter(Boolean).join("; ");
    case "numeric": {
      const t = q.tolerance || { abs: 0 };
      const tol = t.pct ? ` (±${t.pct}%)` : t.abs ? ` (±${t.abs})` : "";
      return `${q.numericAnswer}${tol}`;
    }
    case "order":
      return (q.correctOrder || []).join(" → ");
    case "text":
      return (q.acceptedAnswers || [])[0] || "";
    default:
      return q.answer != null ? q.options[q.answer] ?? "" : "";
  }
}

function responseText(q, response) {
  if (response == null) return "";
  switch (q.format) {
    case "multi":
      return (response || []).map((i) => q.options[i]).filter(Boolean).join("; ");
    case "order":
      return (response || []).join(" → ");
    case "numeric":
    case "text":
      return String(response);
    default:
      return q.options[response] ?? "";
  }
}

/** True when a response has been given (used to enable Submit buttons). */
export function hasResponse(q, response) {
  if (response == null) return false;
  if (q.format === "multi") return Array.isArray(response) && response.length > 0;
  if (q.format === "numeric" || q.format === "text") return String(response).trim() !== "";
  return true;
}

/**
 * Check a response. Returns { correct, responseText, correctText }.
 */
export function checkAnswer(q, response) {
  let correct = false;
  if (response != null) {
    switch (q.format) {
      case "multi": {
        const got = [...new Set(response || [])].sort((a, b) => a - b);
        const want = q.answers || [];
        correct = want.length > 0 && got.length === want.length && got.every((v, i) => v === want[i]);
        break;
      }
      case "numeric": {
        // "50%" counts as 50 and "12 kg" as 12: the unit is already in the question.
        const x = parseNumericResponse(response);
        const target = q.numericAnswer;
        if (!Number.isNaN(x) && !Number.isNaN(target)) {
          const t = q.tolerance || { abs: 0 };
          const allowed = t.pct ? Math.abs(target) * (t.pct / 100) : t.abs || 0;
          correct = Math.abs(x - target) <= allowed + 1e-9;
        }
        break;
      }
      case "order": {
        const want = q.correctOrder || [];
        correct = want.length > 0 && response.length === want.length && response.every((v, i) => v === want[i]);
        break;
      }
      case "text": {
        const got = normalizeText(response);
        correct = got.length > 0 && (q.acceptedAnswers || []).some((a) => {
          const want = normalizeText(a);
          if (got === want || got.replace(/ /g, "") === want.replace(/ /g, "")) return true; // "1990's" = "1990s"
          // One typo is forgiven on answers of TYPO_MIN_LENGTH+ characters, but never in a
          // number ("1980s" is not "1990s"), a Roman numeral ("type ii" is not "type i") or
          // the first letter ("methanol" is not "ethanol"). Shorter terms must be exact:
          // "alkene" is not a typo of "alkane".
          const digits = (t) => t.replace(/\D/g, "");
          return want.length >= TYPO_MIN_LENGTH && got[0] === want[0] && digits(got) === digits(want)
            && romanTokens(got) === romanTokens(want) && editDistance(got, want) <= 1;
        });
        break;
      }
      default:
        correct = q.answer != null && response === q.answer;
    }
  }
  return { correct, responseText: responseText(q, response), correctText: correctAnswerText(q) };
}

/**
 * Read a money amount from mishap text, e.g. "Freezer failure (-$100)" -> -100,
 * "Grant renewed! +$200" -> 200. A signed dollar amount wins; an unsigned
 * one ("Lose $75") takes its sign from whether the text contains "+".
 * With no amount at all, falls back to the original +50 / -100 rule.
 */
export function parseMishapAmount(text) {
  const s = String(text || "");
  const toInt = (d) => parseInt(d.replace(/,/g, ""), 10);
  const signed = s.match(/([+\-\u2212])\s*\$\s*(\d[\d,]*)/) || s.match(/\(\s*([+\-\u2212])\s*(\d[\d,]*)\s*\)/);
  if (signed) return signed[1] === "+" ? toInt(signed[2]) : -toInt(signed[2]);
  const positive = s.includes("+");
  const unsigned = s.match(/\$\s*(\d[\d,]*)/);
  if (unsigned) return positive ? toInt(unsigned[1]) : -toInt(unsigned[1]);
  return positive ? 50 : -100;
}

/** True when mishap text states an explicit signed amount like (+$100) or -$50. */
export function hasExplicitMishapAmount(text) {
  const s = String(text || "");
  return /([+\-\u2212])\s*\$\s*\d/.test(s) || /\(\s*[+\-\u2212]\s*\d[\d,]*\s*\)/.test(s);
}
