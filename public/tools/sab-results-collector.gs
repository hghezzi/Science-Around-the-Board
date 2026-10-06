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
 * Privacy: "Anyone" lets anyone with the link send a submission, but only you can read the Sheet.
 * The script accepts only Science Around the Board submissions and stores typed text as plain text,
 * never as formulas. It sends nothing anywhere else.
 *
 * After editing this script, use Deploy → Manage deployments → Edit → Version: New version,
 * so the URL stays the same.
 * Full instructions: https://hghezzi.github.io/Science-Around-the-Board/guide/#collecting-results
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
