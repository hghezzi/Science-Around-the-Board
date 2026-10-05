// src/tsvParser.js
// Shared TSV helpers used by the app, the board builder, the validator and tests.

/**
 * Parse TSV text into an array of row objects keyed by the header line.
 * Blank lines and lines starting with "#" are skipped.
 */
export function parseTsv(text) {
  const cleanText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Don't trim tabs: a leading tab means the first cell is empty.
  const lines = cleanText.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((ln) => {
    const cols = ln.split("\t");
    const obj = {};
    headers.forEach((h, i) => {
      let val = (cols[i] || "").trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
      obj[h.trim()] = val;
    });
    return obj;
  });
}

/** Return the header names of a TSV text (first non-comment line). */
export function parseTsvHeaders(text) {
  const first = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return first ? first.split("\t").map((h) => h.trim()) : [];
}

/** Split a comma-separated cell (e.g. bigTopic/module) into trimmed items. */
export function parseList(str) {
  if (!str) return [];
  return str.split(",").map((item) => item.trim().replace(/^"|"$/g, ""));
}

/** Unique modules (in order of appearance) for rows tagged with bigTopic. */
export function getModulesForTopic(all, bigTopic) {
  const set = new Set();
  all.forEach((r) => {
    const rowTopicStr = (r.bigTopic || "").trim();
    if (!rowTopicStr) return;
    const topics = parseList(rowTopicStr);
    if (topics.includes(bigTopic)) {
      const mStr = (r.module || "").trim();
      if (mStr) parseList(mStr).forEach((m) => set.add(m));
    }
  });
  return Array.from(set);
}

/** Unique bigTopic values (in order of appearance) across all rows. */
export function getAllTopics(all) {
  const set = new Set();
  all.forEach((r) => {
    const tStr = (r.bigTopic || "").trim();
    if (!tStr) return;
    parseList(tStr).forEach((t) => { if (t) set.add(t); });
  });
  return Array.from(set);
}
