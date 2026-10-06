// src/results.js
// End-of-session results: CSV, file name, team summary, email draft and sending
// to the instructor's results sheet (a Google Apps Script web app).
import { teamDisplayName } from "./labels.js";

// Stop spreadsheet apps from treating typed text such as "=SUM(...)" as a formula
// (OWASP CSV injection: =, +, -, @, and a leading tab or carriage return).
const safeCell = (v) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function toCsv(rows) {
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v) => `"${String(safeCell(v) ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export function resultsFilename(topic, module, date = new Date()) {
  // ASCII-only file names travel safely through every LMS; accents are dropped ("Biología" -> "biologia").
  const slug = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
  const name = [slug(topic), slug(module)].filter(Boolean).join("_") || "game";
  return `sab_results_${name}_${stamp}.csv`;
}

/** One summary per team: survey scores before/after, final rank and the names typed on the end screen. */
export function summarizeTeams({ preRows = [], postRows = [], gameRows = [], playerCount, members = [] }) {
  return Array.from({ length: playerCount }, (_, i) => {
    const quiz = (rows) => rows.filter((r) => r.section === "quiz" && r.playerIndex === i);
    const result = gameRows.find((r) => r.eventType === "GAME_RESULT" && r.playerIndex === i) || {};
    return {
      playerIndex: i,
      team: teamDisplayName(i, playerCount),
      members: String(members[i] || "").trim(),
      preScore: quiz(preRows).filter((r) => r.correct === true).length,
      postScore: quiz(postRows).filter((r) => r.correct === true).length,
      surveyQuestions: quiz(preRows).length,
      rank: result.rank ?? "",
      netWorth: result.netWorth ?? "",
      eliminated: result.eliminated ?? "",
    };
  });
}

/** CSV rows (eventType TEAM_INFO) that record who played on each team. */
export function teamInfoRows(summary, sessionId) {
  return summary.map((t) => ({
    eventType: "TEAM_INFO", sessionId, playerIndex: t.playerIndex, playerName: t.team, members: t.members,
    preScore: t.preScore, postScore: t.postScore, surveyQuestions: t.surveyQuestions, rank: t.rank, netWorth: t.netWorth,
  }));
}

export const makeSessionId = (date = new Date()) => `${date.toISOString()}-${Math.random().toString(36).slice(2, 8)}`;

export function buildPayload({ sessionId, config, topic, module, summary, rows }) {
  return {
    app: "science-around-the-board", version: 1, sessionId, sentAt: new Date().toISOString(),
    course: config.course || "", topic: topic || "", module: module || "", summary, rows,
  };
}

/** POST as plain text (no CORS preflight). Returns { status: "sent" } or { status: "error", message }. */
export async function sendResults(url, payload, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json().catch(() => null);
    if (data && data.ok) return { status: "sent" };
    return { status: "error", message: (data && data.error) || `The results sheet answered with an error (${res.status}). Use Download or Email below.` };
  } catch {
    return { status: "error", message: "Couldn't reach the results sheet. Check the internet connection and try again, or use Download or Email below." };
  }
}

export function buildMailto({ to, course, topic, module, summary, filename }) {
  const title = course || [topic, module].filter(Boolean).join(" / ") || "Science Around the Board";
  const who = (t) => `${t.team}${t.members ? ` (${t.members})` : ""}`;
  const body = [
    "Hello,", "", `Here are our Science Around the Board results for ${title}.`, "",
    ...summary.map((t) => `- ${who(t)}: pre-survey ${t.preScore}/${t.surveyQuestions}, post-survey ${t.postScore}/${t.surveyQuestions}${t.rank !== "" ? `, final rank ${t.rank}` : ""}`),
    "", `The full results file (${filename}) was downloaded to this computer. Please attach it before sending.`,
  ].join("\n");
  const subject = `SAB results – ${title} – ${summary.map(who).join(", ")}`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function downloadText(filename, text, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
