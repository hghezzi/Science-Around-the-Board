/**
 * Science Around the Board – results collector (Google Apps Script).
 *
 * Collects the results students send from the game's end screen into this Google Sheet.
 * 1. In a Google Sheet: Extensions → Apps Script, replace the code with this file, Save.
 * 2. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Deploy, authorize.
 * 3. Copy the Web app URL (ends in /exec) into your question file as a config row:
 *      id = results_url, type = config, question = <the URL>
 * Each "Send results" click adds one row per team to "Summary" and every answer/transaction to "Details".
 * Visiting the URL in a browser shows a short "running" message.
 * After editing this script, use Deploy → Manage deployments → Edit → Version: New version, so the URL stays the same.
 */
const SUMMARY_SHEET = "Summary";
const DETAIL_SHEET = "Details";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.app !== "science-around-the-board") throw new Error("Not a Science Around the Board submission");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const base = { receivedAt: new Date(), sessionId: data.sessionId || "", course: data.course || "", topic: data.topic || "", module: data.module || "" };
    appendObjects_(ss, SUMMARY_SHEET, (data.summary || []).map((r) => Object.assign({}, base, r)));
    appendObjects_(ss, DETAIL_SHEET, (data.rows || []).map((r) => Object.assign({}, base, r)));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, message: "The Science Around the Board results collector is running." });
}

function appendObjects_(ss, name, objects) {
  if (!objects.length) return;
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  const headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
  objects.forEach((o) => Object.keys(o).forEach((k) => { if (headers.indexOf(k) === -1) headers.push(k); }));
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.setFrozenRows(1);
  const values = objects.map((o) => headers.map((h) => clean_(o[h])));
  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
}

// Stop typed text such as "=IMPORTXML(...)" from being treated as a formula.
function clean_(v) {
  if (v === undefined || v === null) return "";
  if (typeof v === "string" && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
