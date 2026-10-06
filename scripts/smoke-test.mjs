#!/usr/bin/env node
// End-to-end smoke test of the built app (Playwright). Run with `npm run smoke`.
// Each scenario plays the 16S demo; it fails if a player gets fewer than 10
// survey questions, if the page throws, or if the exported CSV is incomplete.
// Pick scenarios with SCENARIOS=teams,dark and the number of rolls with ROLLS=10.
import { preview } from "vite";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import CryptoJS from "crypto-js";

const ROLLS = Number(process.env.ROLLS || 10);
const server = await preview({ preview: { port: Number(process.env.SMOKE_PORT || 4181), strictPort: false }, logLevel: "error" });
const BASE = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };

// Buttons the bot may press in game dialogs, in order of preference.
const DIALOG_BUTTONS = [/^Next question/i, /^Finish exam/i, /^Finish quiz/i, /^Start exam/i, /^Accept challenge/i,
  /^Start the rescue quiz/i, /^Keep playing/i, /^See final standings/i, /^Sell deed/i, /^Downgrade/i,
  /^Buy\b/i, /^Continue$/i, /^Skip$/i, /^Decline$/i, /^Pay full/i, /^Cancel$/i];

// Service workers are blocked except in the offline scenario: requests they answer
// from their cache would bypass page.route() mocks.
async function newPage(colorScheme = "light", { serviceWorkers = "block" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, acceptDownloads: true, serviceWorkers });
  const page = await context.newPage();
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  return { context, page };
}

async function openDemo(page, url = BASE) {
  await page.goto(url);
  const noThanks = page.getByRole("button", { name: "No thanks" });
  if (await noThanks.count()) await noThanks.click();
  if (!url.includes("deck=")) await page.getByRole("button", { name: /Play the demo/ }).click();
  await page.getByText(/Loaded \d+ questions/).waitFor({ timeout: 15000 });
}

async function setupGame(page, teams) {
  await page.getByRole("button", { name: /Continue to game setup/ }).click();
  // Topic BEFORE team count: this order used to leave extra players without survey questions.
  await page.getByRole("button", { name: /^16S/ }).click();
  await page.getByRole("button", { name: /Confirm selection/i }).click();
  await page.getByRole("button", { name: teams === 1 ? /^Solo$/ : new RegExp(`^${teams} teams$`) }).click();
  await page.getByRole("button", { name: /Start game/ }).click();
}

async function doSurvey(page, teams, label) {
  for (let p = 0; p < teams; p++) {
    await page.getByRole("button", { name: /Continue to Questions|Start Questions/ }).click();
    const counters = page.getByText(/^Question \d+ of \d+$/);
    const n = await counters.count();
    const total = n ? Number(((await counters.first().textContent()) || "").match(/of (\d+)/i)[1]) : 0;
    if (n !== 10 || total !== 10) fail(`${label}: player ${p + 1} got ${n} survey questions (expected 10)`);
    const options = page.getByRole("button", { name: /^A\./ });
    for (let k = 0; k < (await options.count()); k++) await options.nth(k).click();
    const inputs = page.locator('input[aria-label="Answer"]');
    for (let k = 0; k < (await inputs.count()); k++) await inputs.nth(k).fill("1");
    await page.getByRole("button", { name: p < teams - 1 ? /^Next Player$/ : /^(Start Game|Finish Surveys)$/ }).click();
  }
}

// Answer whatever question the dialog shows. Returns false when there is nothing to answer.
async function answerQuestion(dialog) {
  const option = dialog.getByRole("button", { name: /^A\./ });
  if (await option.count()) {
    if (await option.first().isEnabled()) { await option.first().click(); return true; }
    return false;
  }
  const submit = dialog.getByRole("button", { name: /^Submit answer$/ });
  if (!(await submit.count())) return false;
  const input = dialog.locator('input[aria-label="Answer"]');
  if ((await input.count()) && (await input.isEnabled())) await input.fill("1");
  const box = dialog.locator('input[type="checkbox"]');
  if ((await box.count()) && !(await dialog.locator('input[type="checkbox"]:checked').count())) await box.first().check();
  if (await submit.isEnabled()) { await submit.click(); return true; }
  return false;
}

async function playTurns(page, label, rolls = ROLLS) {
  let done = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (!(await page.locator(".MuiModal-root").count())) {
      if (done >= rolls) return;
      const roll = page.getByRole("button", { name: /^Roll/ });
      if ((await roll.count()) && (await roll.isEnabled())) {
        await roll.click(); done++;
        // Every landing opens a dialog once the pawn stops (up to ~3 s). Don't use a fixed wait.
        await page.locator(".MuiModal-root").first().waitFor({ timeout: 10000 }).catch(() => {});
      }
      else await page.waitForTimeout(300);
      continue;
    }
    const dialog = page.locator(".MuiModal-root").last();
    if (/Final Standings/i.test(await dialog.innerText())) return;
    if (await answerQuestion(dialog)) continue;
    let clicked = false;
    for (const name of DIALOG_BUTTONS) {
      const button = dialog.getByRole("button", { name }).first();
      if ((await button.count()) && (await button.isEnabled())) { await button.click(); clicked = true; break; }
    }
    if (!clicked) await page.waitForTimeout(300);
  }
  fail(`${label}: gave up after 400 steps (a dialog may be stuck)`);
}

async function finishGame(page, teams, label) {
  if (!(await page.getByText(/Final Standings/i).count())) await page.getByRole("button", { name: /^End game$/ }).click();
  await page.getByRole("button", { name: /Continue to post-survey/i }).click();
  await doSurvey(page, teams, `${label} post`);
  await page.getByText(/Session complete/).waitFor();
}

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

async function downloadCsv(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download results|Export CSV/ }).click(),
  ]);
  return parseCsv(readFileSync(await download.path(), "utf8"));
}

function checkCsv(rows, teams, label) {
  for (let p = 0; p < teams; p++) {
    for (const phase of ["pre", "post"]) {
      const n = rows.filter((r) => r.phase === phase && r.section === "quiz" && r.playerIndex === String(p)).length;
      if (n !== 10) fail(`${label}: CSV has ${n} ${phase}-survey answers for player ${p + 1} (expected 10)`);
    }
  }
  const results = rows.filter((r) => r.eventType === "GAME_RESULT").length;
  if (results !== teams) fail(`${label}: CSV has ${results} GAME_RESULT rows (expected ${teams})`);
  const info = rows.filter((r) => r.eventType === "TEAM_INFO").length;
  if (info !== teams) fail(`${label}: CSV has ${info} TEAM_INFO rows (expected ${teams})`);
}

async function teamScenario(teams, colorScheme = "light") {
  const label = `${colorScheme} ${teams} team(s)`;
  console.log(`▶ ${label}`);
  const { context, page } = await newPage(colorScheme);
  await openDemo(page);
  await setupGame(page, teams);
  await doSurvey(page, teams, `${label} pre`);
  await page.getByText("Game log").waitFor();
  await playTurns(page, label);
  await finishGame(page, teams, label);
  checkCsv(await downloadCsv(page), teams, label);
  await context.close();
}

// The question file gets results config rows; the Google Apps Script endpoint is mocked.
async function resultsScenario() {
  console.log("▶ results (mock Google Sheet)");
  const { context, page } = await newPage();
  const cfg = (id, value) => [id, value, ...Array(10).fill(""), "config", "", "", "", ""].join("\t");
  await page.route("**/SAB_questions_Jan22_Filtered.tsv", async (route) => {
    const response = await route.fetch();
    const text = (await response.text()).replace(/\s+$/, "");
    const extra = [cfg("results_url", "https://script.google.com/macros/s/TEST/exec"), cfg("instructor_email", "instructor@example.edu"), cfg("course", "Smoke Test 101")];
    await route.fulfill({ response, body: `${text}\r\n${extra.join("\r\n")}\r\n` });
  });
  let posted = null;
  await page.route("https://script.google.com/**", async (route) => {
    posted = JSON.parse(route.request().postData() || "null");
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: '{"ok":true}' });
  });
  await openDemo(page);
  if (!(await page.getByText(/Results will be sent to your instructor/).count())) fail("results: start page doesn't mention sending results");
  await setupGame(page, 1);
  await doSurvey(page, 1, "results pre");
  await page.getByText("Game log").waitFor();
  await finishGame(page, 1, "results");
  const send = page.getByRole("button", { name: /Send results to instructor/ });
  if (await send.isEnabled()) fail("results: Send should be disabled until names are typed");
  await page.getByLabel(/names or student IDs/).first().fill("Test Student");
  await send.click();
  await page.getByText(/^Sent!/).waitFor({ timeout: 10000 });
  if (!posted) fail("results: nothing was posted");
  else {
    if (posted.app !== "science-around-the-board" || posted.course !== "Smoke Test 101") fail("results: payload is missing the app or course");
    if (posted.summary?.[0]?.members !== "Test Student") fail("results: summary is missing the student name");
    if (!(posted.rows?.length > 10)) fail("results: payload has too few rows");
  }
  const email = page.getByRole("link", { name: /Email results to instructor/ });
  const href = (await email.count()) ? await email.getAttribute("href") : "";
  if (!href.startsWith("mailto:instructor@example.edu?subject=")) fail(`results: Email link is wrong ("${href.slice(0, 60)}")`);
  else if (!decodeURIComponent(href).includes("Test Student")) fail("results: email draft doesn't name the team members");
  await context.close();
}

// Encrypted (.lock) uploads, shared links and their error messages.
async function filesScenario() {
  console.log("▶ .lock upload and links");
  const { context, page } = await newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: "No thanks" }).click();
  const lock = CryptoJS.AES.encrypt(readFileSync("public/SAB_questions_Jan22_Filtered.tsv", "utf8"), "Class-Pass").toString();
  await page.setInputFiles('input[type="file"][accept*=".lock"]', { name: "questions.lock", mimeType: "text/plain", buffer: Buffer.from(lock) });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Class password/).fill("wrong");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await dialog.getByText(/password didn't work/).waitFor();
  await dialog.getByLabel(/Class password/).fill("Class-Pass");
  await dialog.getByRole("button", { name: "Unlock" }).click();
  await page.getByText(/Loaded 177 questions/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500); // image checks run in the background
  if (await page.getByText(/couldn't be found/).count()) fail("files: the demo reports missing images, but all its images are hosted");
  await page.getByRole("button", { name: /Use a different file/ }).click();
  // A question whose image exists nowhere is listed, and only that one.
  const stats = readFileSync("public/examples/intro_statistics.tsv", "utf8").replace(/\s+$/, "");
  const header = stats.split(/\r?\n/)[0].split("\t");
  const extra = header.map((h) => ({ id: "img_missing_1", question: "What does this figure show?", option1: "A", option2: "B", correctIndex: "1",
    explanation: "Because.", type: "survey", imageFile: "missing_figure.png" }[h] ?? "")).join("\t");
  await page.setInputFiles('input[type="file"][accept*=".lock"]', { name: "q.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from(`${stats}\n${extra}\n`) });
  await page.getByText(/1 image couldn't be found: missing_figure\.png\./).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Use a different file/ }).click();
  await page.setInputFiles('input[type="file"][accept*=".lock"]', { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("just some notes") });
  await page.getByText(/This isn't a question file/).waitFor();

  await page.goto(`${BASE}?deck=stats`);
  await page.getByText(/Loaded \d+ questions/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Continue to game setup/ }).click();
  if (!(await page.getByRole("button", { name: /^Statistics/ }).count())) fail("files: ?deck=stats didn't load the statistics example");
  await page.goto(`${BASE}?deck=${encodeURIComponent("https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0")}`);
  await page.getByText(/isn't published/).first().waitFor();
  await context.close();
}

// A shared link (?deck=demo), then a refresh mid-game and "Resume".
async function resumeScenario() {
  console.log("▶ link + resume");
  const { context, page } = await newPage();
  await openDemo(page, `${BASE}?deck=demo`);
  await setupGame(page, 2);
  await doSurvey(page, 2, "resume pre");
  await page.getByText("Game log").waitFor();
  await playTurns(page, "resume", 3);
  const turn = page.getByText(/^Turn \d+$/);
  const before = await turn.textContent();
  const worth = page.getByText(/^Net worth [-−]?\$[\d,]+$/); // team panel only (tile cards also show prices)
  const worthBefore = await worth.allTextContents();
  await page.reload();
  await page.getByRole("button", { name: /^Resume$/ }).click();
  await page.getByText("Game log").waitFor();
  const after = await turn.textContent();
  if (before !== after) fail(`resume: came back at "${after}", expected "${before}"`);
  const worthAfter = await worth.allTextContents();
  if (!worthBefore.length || worthBefore.join() !== worthAfter.join()) fail(`resume: net worth changed from ${worthBefore} to ${worthAfter}`);
  if (!(await page.getByText("Game resumed.").count())) fail("resume: the log doesn't say the game was resumed");
  // Finish the game: the CSV must still hold the pre-game surveys answered before the refresh.
  await playTurns(page, "resume after", 2);
  await finishGame(page, 2, "resume");
  checkCsv(await downloadCsv(page), 2, "resume");
  // Back to the main menu forgets the saved game.
  await page.getByRole("button", { name: /Back to main menu/ }).click();
  await page.reload();
  if (await page.getByRole("button", { name: /^Resume$/ }).count()) fail("resume: the save wasn't cleared after the main menu");
  await context.close();
}

// After one online visit the app (and the demo) must work with no network.
async function offlineScenario() {
  console.log("▶ offline after first visit");
  const { context, page } = await newPage("light", { serviceWorkers: "allow" });
  await page.goto(BASE);
  // The browser's install offer (Chrome/Edge) shows "Install as an app"; simulate it.
  await page.evaluate(() => {
    const offer = new Event("beforeinstallprompt");
    offer.prompt = () => { window.__installPrompted = true; };
    offer.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(offer);
  });
  await page.getByRole("button", { name: /Install as an app/ }).click();
  if (!(await page.evaluate(() => window.__installPrompted))) fail("offline: Install as an app didn't open the browser's install prompt");
  await page.getByRole("button", { name: /Install as an app/ }).waitFor({ state: "detached" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // let the service worker control the page
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) fail("offline: the service worker isn't controlling the page");
  await context.setOffline(true);
  await page.reload();
  const noThanks = page.getByRole("button", { name: "No thanks" });
  if (await noThanks.count()) await noThanks.click();
  await page.getByRole("button", { name: /Play the demo/ }).click();
  await page.getByText(/Loaded \d+ questions/).waitFor({ timeout: 10000 });
  await setupGame(page, 1);
  await doSurvey(page, 1, "offline pre");
  await page.getByText("Game log").waitFor();
  await context.close();
}

const SCENARIOS = {
  teams: async () => { for (const n of [1, 2, 3, 4]) await teamScenario(n); },
  dark: () => teamScenario(3, "dark"),
  results: resultsScenario,
  files: filesScenario,
  resume: resumeScenario,
  offline: offlineScenario,
};
const selected = (process.env.SCENARIOS || Object.keys(SCENARIOS).join(",")).split(",");
for (const name of selected) {
  if (!SCENARIOS[name]) { fail(`unknown scenario "${name}"`); continue; }
  try { await SCENARIOS[name](); } catch (e) { fail(`${name} crashed: ${e.message.split("\n")[0]}`); }
}
await browser.close();
server.httpServer.close();
console.log(failures.length ? `\n${failures.length} problem(s) found.` : "\nAll smoke scenarios passed.");
process.exit(failures.length ? 1 : 0);
