/**
 * Science Around the Board – results collector (Google Apps Script).
 *
 * Collects the results students send from the game's end screen ("Send results to instructor")
 * into the Google Sheet this script is attached to. Setup takes about 5 minutes:
 * 1. In a new Google Sheet: Extensions → Apps Script. Replace the sample code with this file and click Save.
 * 2. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
 *    Click Deploy and authorize the script with your Google account.
 * 3. Copy the Web app URL (it ends in /exec) into your question file as a config row:
 *      id = results_url, type = config, question = <the URL>   (leave the other columns blank)
 * 4. Test it: play a quick solo game with that file and click "Send results to instructor".
 *
 * Each submission adds one row per team to the "Summary" tab (names or IDs, survey scores, rank)
 * and every answer, survey response and transaction to the "Details" tab. Both tabs are created
 * automatically. Every row carries a sessionId, so a result sent twice is easy to spot.
 * Visiting the URL in a browser only shows a short "running" message.
 *
 * Safety and privacy: "Anyone" lets anyone with the link send a submission, but only you can read
 * the Sheet. The script accepts only Science Around the Board submissions of a sensible size, keeps
 * column names simple, shortens very long text, stores typed text as plain text (never as formulas),
 * limits how many submissions it takes per minute and sends nothing anywhere else.
 * Version 2 (October 2026).
 *
 * After editing this script, use Deploy → Manage deployments → Edit → Version: New version,
 * so the URL stays the same.
 * Full instructions: https://hghezzi.github.io/Science-Around-the-Board/guide/#collecting-results
 */
const SUMMARY_SHEET = "Summary";
const DETAIL_SHEET = "Details";
const LIMITS = {
  bodyChars: 2000000,   // a long 4-team game is a few hundred kB
  summaryRows: 20,      // teams per submission
  detailRows: 5000,     // answers and transactions per submission
  columns: 80,          // columns per sheet
  cellChars: 2000,      // longer text is shortened
  perMinute: 120,       // submissions per minute, for the whole Sheet
};
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    const body = e && e.postData && typeof e.postData.contents === "string" ? e.postData.contents : "";
    if (!body || body.length > LIMITS.bodyChars) throw new Error("The submission is empty or too large.");
    const data = JSON.parse(body);
    if (!data || data.app !== "science-around-the-board") throw new Error("Not a Science Around the Board submission");
    const summary = Array.isArray(data.summary) ? data.summary : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (summary.length > LIMITS.summaryRows || rows.length > LIMITS.detailRows) throw new Error("The submission has too many rows.");
    if (!withinRate_()) throw new Error("The results sheet is busy. Please try again in a minute.");
    locked = lock.tryLock(30000);
    if (!locked) throw new Error("The results sheet is busy. Please try again in a minute.");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const base = { receivedAt: new Date(), sessionId: text_(data.sessionId), course: text_(data.course), topic: text_(data.topic), module: text_(data.module) };
    appendObjects_(ss, SUMMARY_SHEET, summary.filter(isPlainObject_).map((r) => Object.assign({}, base, r)));
    appendObjects_(ss, DETAIL_SHEET, rows.filter(isPlainObject_).map((r) => Object.assign({}, base, r)));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, message: "The Science Around the Board results collector is running." });
}

function appendObjects_(ss, name, objects) {
  if (!objects.length) return;
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  objects.forEach((o) => Object.keys(o).forEach((k) => {
    if (headers.indexOf(k) === -1 && KEY_PATTERN.test(k) && headers.length < LIMITS.columns) headers.push(k);
  }));
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  const values = objects.map((o) => headers.map((h) => clean_(Object.prototype.hasOwnProperty.call(o, h) ? o[h] : "")));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

// Numbers, booleans and dates are kept; everything else becomes (shortened) text, and
// typed text such as "=IMPORTXML(...)" is stopped from being treated as a formula.
function clean_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "number") return isFinite(v) ? v : "";
  if (typeof v === "boolean" || v instanceof Date) return v;
  const s = text_(typeof v === "object" ? JSON.stringify(v) : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function text_(v) {
  return v === undefined || v === null ? "" : String(v).slice(0, LIMITS.cellChars);
}

function isPlainObject_(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// A simple per-minute counter for the whole Sheet (CacheService is shared by all requests).
function withinRate_() {
  if (typeof CacheService === "undefined") return true;
  const cache = CacheService.getScriptCache();
  const key = "sab-rate-" + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 120);
  return count <= LIMITS.perMinute;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
