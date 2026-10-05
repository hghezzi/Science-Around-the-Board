import { describe, it, expect } from "vitest";
import { toCsv, resultsFilename, summarizeTeams, teamInfoRows, buildMailto, buildPayload, sendResults } from "../src/results.js";

const quiz = (playerIndex, correct) => ({ section: "quiz", playerIndex, correct });

describe("toCsv", () => {
  it("quotes every cell, escapes quotes and keeps false/0 values", () => {
    const csv = toCsv([{ a: 'say "hi"', b: 0 }, { a: false, c: "x,y" }]);
    expect(csv).toBe('a,b,c\n"say ""hi""","0",""\n"false","","x,y"');
  });

  it("stops typed text from becoming a spreadsheet formula, but leaves numbers alone", () => {
    const csv = toCsv([{ text: "=SUM(A1:A9)", other: "+1", at: "@cmd", amount: -100 }]);
    expect(csv.split("\n")[1]).toBe(`"'=SUM(A1:A9)","'+1","'@cmd","-100"`);
  });
});

describe("resultsFilename", () => {
  it("names the file after the topic, module, date and time", () => {
    const name = resultsFilename("16S", "QIIME 2 / Week 3", new Date(2026, 9, 5, 9, 7));
    expect(name).toBe("sab_results_16s_qiime-2-week-3_2026-10-05_0907.csv");
  });

  it("falls back to 'game' without a topic", () => {
    expect(resultsFilename("", null, new Date(2026, 0, 2, 13, 45))).toBe("sab_results_game_2026-01-02_1345.csv");
  });
});

describe("summarizeTeams", () => {
  const preRows = [quiz(0, true), quiz(0, false), quiz(1, false), quiz(1, false), { section: "confidence", playerIndex: 0, response: 5 }];
  const postRows = [quiz(0, true), quiz(0, true), quiz(1, true), quiz(1, false)];
  const gameRows = [
    { eventType: "TRANSACTION", playerIndex: 0 },
    { eventType: "GAME_RESULT", playerIndex: 0, rank: 2, netWorth: 1800, eliminated: false },
    { eventType: "GAME_RESULT", playerIndex: 1, rank: 1, netWorth: 3100, eliminated: false },
  ];

  it("counts survey scores and copies the final result per team", () => {
    const summary = summarizeTeams({ preRows, postRows, gameRows, playerCount: 2, members: [" Ana, Sam ", ""] });
    expect(summary[0]).toEqual({ playerIndex: 0, team: "Red Team", members: "Ana, Sam", preScore: 1, postScore: 2, surveyQuestions: 2, rank: 2, netWorth: 1800, eliminated: false });
    expect(summary[1]).toMatchObject({ team: "Blue Team", members: "", preScore: 0, postScore: 1, rank: 1 });
  });

  it("calls a single team the Solo Team", () => {
    expect(summarizeTeams({ playerCount: 1 })[0].team).toBe("Solo Team");
  });

  it("turns the summary into TEAM_INFO rows", () => {
    const rows = teamInfoRows(summarizeTeams({ preRows, postRows, gameRows, playerCount: 2, members: ["Ana"] }), "s1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ eventType: "TEAM_INFO", sessionId: "s1", playerIndex: 0, playerName: "Red Team", members: "Ana" });
  });
});

describe("buildMailto", () => {
  it("addresses the instructor and mentions the file to attach", () => {
    const summary = summarizeTeams({ playerCount: 1, members: ["Ana Lee"] });
    const link = buildMailto({ to: "a@b.edu", course: "BIOL 101", summary, filename: "sab_results_x.csv" });
    expect(link.startsWith("mailto:a@b.edu?subject=")).toBe(true);
    expect(link).toContain(encodeURIComponent("sab_results_x.csv"));
    expect(decodeURIComponent(link)).toContain("Solo Team (Ana Lee)");
  });
});

describe("sendResults", () => {
  const payload = buildPayload({ sessionId: "s1", config: { course: "C" }, topic: "T", module: "M", summary: [], rows: [] });
  const fakeFetch = (body, status = 200) => async () => ({ status, json: async () => body });

  it("builds a payload the collector script recognises", () => {
    expect(payload).toMatchObject({ app: "science-around-the-board", version: 1, sessionId: "s1", course: "C", topic: "T", module: "M" });
  });

  it("posts the payload as plain text JSON", async () => {
    let seen;
    await sendResults("https://x", payload, async (url, init) => { seen = { url, init }; return { status: 200, json: async () => ({ ok: true }) }; });
    expect(seen.url).toBe("https://x");
    expect(seen.init.method).toBe("POST");
    expect(JSON.parse(seen.init.body).sessionId).toBe("s1");
    expect(seen.init.headers).toBeUndefined(); // no custom headers, so no CORS preflight
  });

  it("reports success, a script error, or a network failure", async () => {
    expect(await sendResults("https://x", payload, fakeFetch({ ok: true }))).toEqual({ status: "sent" });
    expect(await sendResults("https://x", payload, fakeFetch({ ok: false, error: "x" }))).toEqual({ status: "error", message: "x" });
    const down = await sendResults("https://x", payload, async () => { throw new Error("offline"); });
    expect(down.status).toBe("error");
    expect(down.message).toMatch(/Couldn't reach/);
  });
});
