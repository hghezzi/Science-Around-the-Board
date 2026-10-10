#!/usr/bin/env node
// Validate a Learn Around the Board question file before sharing it.
// Usage: npm run validate-tsv -- path/to/questions.tsv
//    or: node scripts/validate-tsv.mjs path/to/questions.tsv
// Exits with code 1 if any errors are found.
import { readFileSync } from "node:fs";
import { parseTsv, parseTsvHeaders } from "../src/tsvParser.js";
import { validateQuestionRows, formatValidationReport } from "../src/tsvValidator.js";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npm run validate-tsv -- <questions.tsv> [more.tsv ...]");
  process.exit(2);
}

// The board builder logs debug output; keep the report readable.
console.log = () => {};
console.warn = () => {};

let failed = false;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("\t")) {
    process.stderr.write(`${file}: no tab characters found. If this is an encrypted .lock file, validate the original .tsv instead.\n`);
    failed = true;
    continue;
  }
  const result = validateQuestionRows(parseTsv(text), parseTsvHeaders(text));
  process.stdout.write(`== ${file} ==\n${formatValidationReport(result)}\n\n`);
  if (result.errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
