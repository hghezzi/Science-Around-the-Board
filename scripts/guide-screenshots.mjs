#!/usr/bin/env node
// Capture current screenshots of the game for the Instructor Guide.
// Serves the production build (run `vite build` first) and drives it with
// Playwright, writing PNGs to guide/images/. Part of `npm run guide`.
import { preview } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { startPeerServer, routePeerJs, WEBRTC_ARGS } from "./lib/local-peer-server.mjs";

const OUT = "guide/images";
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4180, strictPort: false }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: WEBRTC_ARGS });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 1.5, serviceWorkers: "block" });
const page = await context.newPage();
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log(`  ${name}.png`);
};

// Deterministic dice and shuffles so the screenshots are stable between runs.
await page.addInitScript(() => {
  let seed = 20261005;
  Math.random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
});

async function answerOpenQuestion() {
  const modal = page.locator(".MuiModal-root").last();
  if (await modal.locator('button:has-text("A.")').count()) return modal.locator('button:has-text("A.")').first().click();
  const input = modal.locator('input[aria-label="Answer"]');
  if (await input.count()) await input.fill("1");
  const box = modal.locator('input[type="checkbox"]');
  if (await box.count()) await box.first().check();
  await modal.locator('button:has-text("Submit answer")').click();
}

// Online play: the host's lobby with one device joined, and that device's view of the game
// (a local signalling server stands in for the public one).
async function captureOnline() {
  const peers = await startPeerServer();
  const make = async (width, height = 900) => {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "light", deviceScaleFactor: 1.5, serviceWorkers: "block" });
    await routePeerJs(ctx, peers.port);
    const pg = await ctx.newPage();
    await pg.addInitScript(() => {
      let seed = 7;
      Math.random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    });
    return { ctx, pg };
  };
  const { ctx: hc, pg: host } = await make(1440);
  const { ctx: gc, pg: guest } = await make(1180, 820);
  try {
    await host.goto(base);
    await host.click("text=No thanks");
    await host.click("text=Play the demo");
    await host.click("text=Continue to game setup");
    await host.click('button:has-text("2 players")');
    await host.click("text=16S");
    await host.click("text=Confirm Selection");
    await host.getByRole("button", { name: /On their own devices/ }).click();
    await host.getByRole("button", { name: /Open the online room/ }).click();
    await host.getByText("The room is open").waitFor({ timeout: 20000 });
    const link = await host.getByLabel("Join link").inputValue();
    await guest.goto(link);
    await guest.getByText("Who are you playing as?").waitFor({ timeout: 30000 });
    await guest.getByRole("button", { name: "Play as Blue Player" }).click();
    await host.getByRole("button", { name: "Play on this computer" }).first().click();
    await host.waitForTimeout(600);
    await host.screenshot({ path: `${OUT}/11-online-lobby.png` });
    console.log("  11-online-lobby.png");
    await guest.waitForTimeout(400);
    await guest.screenshot({ path: `${OUT}/12-online-join.png` });
    console.log("  12-online-join.png");
    await host.getByRole("button", { name: /Start the game/ }).click();
    for (const pg of [host, guest]) {
      await pg.click('button:has-text("Continue to Questions")');
      const opts = pg.locator('button:has-text("A.")');
      for (let k = 0; k < (await opts.count()); k++) await opts.nth(k).click();
      await pg.click(pg === host ? 'button:has-text("Done")' : 'button:has-text("Send my answers")');
    }
    for (const pg of [host, guest]) { await pg.getByText("Game log").waitFor({ timeout: 20000 }); await pg.click('button:has-text("Got it")'); }
    // Roll for whoever's turn it is until the device shows a question being answered elsewhere.
    for (let i = 0; i < 12; i++) {
      const turn = await host.getByText(/Player's turn$/).first().textContent();
      const actor = /^Blue/.test(turn) ? guest : host;
      await actor.click('button:has-text("Roll")');
      await actor.waitForTimeout(3300);
      const text = await guest.locator(".MuiModal-root").last().innerText().catch(() => "");
      if (actor === host && text.includes("Question ·")) {
        await guest.waitForTimeout(500);
        await guest.screenshot({ path: `${OUT}/13-online-watching.png` });
        console.log("  13-online-watching.png");
        break;
      }
      for (const label of ["SKIP", "CONTINUE", "DECLINE", "PAY FULL"]) {
        const b = actor.locator(`.MuiModal-root button:has-text("${label}")`).first();
        if (await b.count()) { await b.click(); break; }
      }
      const q = actor.locator('.MuiModal-root button:has-text("A.")');
      if (await q.count()) { await q.first().click(); await actor.waitForTimeout(300); const c = actor.locator('.MuiModal-root button:has-text("CONTINUE"), .MuiModal-root button:has-text("SKIP")').first(); if (await c.count()) await c.click(); }
    }
  } finally {
    await hc.close(); await gc.close(); peers.close();
  }
}

// The end screen of a question file with results settings (config rows), so the
// guide shows all three ways to hand in results. The settings are added on the fly.
async function captureSummary() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 1.5, serviceWorkers: "block" });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    let seed = 20261005;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  });
  const cfg = (id, value) => [id, value, ...Array(10).fill(""), "config", "", "", "", ""].join("\t");
  await p.route("**/SAB_questions_Jan22_Filtered.tsv", async (route) => {
    const response = await route.fetch();
    const text = (await response.text()).replace(/\s+$/, "");
    const extra = [cfg("results_url", "https://script.google.com/macros/s/EXAMPLE/exec"), cfg("instructor_email", "instructor@university.edu")];
    await route.fulfill({ response, body: `${text}\r\n${extra.join("\r\n")}\r\n` });
  });
  await p.goto(base);
  await p.click("text=No thanks");
  await p.click("text=Play the demo");
  await p.click("text=Continue to game setup");
  await p.click('button:has-text("2 players")');
  await p.click("text=16S");
  await p.click("text=Confirm Selection");
  await p.click('button:has-text("Start game")');
  const survey = async (last) => {
    for (let i = 0; i < 2; i++) {
      await p.click('button:has-text("Continue to Questions")');
      const opts = p.locator('button:has-text("A.")');
      const n = await opts.count();
      for (let k = 0; k < n; k++) await opts.nth(k).click();
      await p.click(i === 0 ? 'button:has-text("Next Player")' : `button:has-text("${last}")`);
    }
  };
  await survey("Start Game");
  await p.click('button:has-text("Got it")'); // the quick rules a new game opens with
  await p.click('button:has-text("End game")');
  await p.click('button:has-text("CONTINUE TO POST-SURVEY")');
  await survey("Finish Surveys");
  await p.getByText("Session complete").waitFor();
  await p.getByLabel(/names or student IDs/).nth(0).fill("Ana Lee, Sam Park");
  await p.getByLabel(/names or student IDs/).nth(1).fill("Priya Shah");
  await p.locator("body").click({ position: { x: 5, y: 5 } }); // blur the field
  await p.waitForTimeout(4000); // let the confetti from the standings settle
  await p.locator(".MuiCard-root").first().screenshot({ path: `${OUT}/10-summary.png` });
  console.log("  10-summary.png");
  await ctx.close();
}

try {
  console.log("Capturing guide screenshots from", base);
  await page.goto(base);
  await shot("01-landing");
  await page.click("text=No thanks");
  // The share-link builder, with a published Google Sheet link.
  const share = page.locator(".MuiAccordion-root");
  await share.getByText(/share your questions as a link/).click();
  await page.getByLabel("Link to your question file").fill("https://docs.google.com/spreadsheets/d/e/2PACX-1vExample/pubhtml");
  await page.waitForTimeout(450);
  // Show the public site address (not the local preview server) and the start of each link.
  await page.evaluate(() => {
    document.activeElement?.blur();
    const link = [...document.querySelectorAll("input")].find((i) => i.value.includes("?deck="));
    if (link) link.value = link.value.replace(/^https?:\/\/[^/]+/, "https://hghezzi.github.io");
    document.querySelectorAll("input").forEach((i) => { i.scrollLeft = 0; });
  });
  await share.screenshot({ path: `${OUT}/11-share-link.png` });
  console.log("  11-share-link.png");
  await share.getByText(/share your questions as a link/).click();
  await page.click("text=Play the demo");
  await shot("02-file-check");
  await page.click("text=Continue to game setup");
  await page.click('button:has-text("2 players")');
  await page.click("text=16S");
  await page.waitForTimeout(450);
  await page.getByText("Select module").locator("..").screenshot({ path: `${OUT}/03-module.png` });
  console.log("  03-module.png");
  await page.click("text=Confirm Selection");
  await page.click('button:has-text("45 min")');
  await shot("04-setup");
  await page.click('button:has-text("Start game")');
  await page.click('button:has-text("Continue to Questions")');
  await page.locator('button:has-text("A.")').first().click();
  await shot("05-survey");
  for (let i = 0; i < 2; i++) {
    if (i) await page.click('button:has-text("Continue to Questions")');
    const opts = page.locator('button:has-text("A.")');
    const n = await opts.count();
    for (let k = 0; k < n; k++) await opts.nth(k).click();
    await page.click(i === 0 ? 'button:has-text("Next Player")' : 'button:has-text("Start Game")');
  }
  // A new game opens with the quick rules.
  await page.getByRole("button", { name: "Got it" }).waitFor();
  await page.waitForTimeout(400);
  await shot("06-rules");
  await page.click('button:has-text("Got it")');
  await page.waitForTimeout(400);
  await shot("06-board");

  let gotQuestion = false;
  for (let i = 0; i < 30 && !gotQuestion; i++) {
    await page.click('button:has-text("Roll")');
    await page.waitForTimeout(3300);
    const text = await page.locator(".MuiModal-root").last().innerText().catch(() => "");
    if (text.includes("Question ·") && !gotQuestion) {
      gotQuestion = true;
      await shot("07-question");
      await answerOpenQuestion();
      await shot("08-feedback");
    }
    for (const label of ["SKIP", "CONTINUE", "DECLINE", "PAY FULL"]) {
      const b = page.locator(`.MuiModal-root button:has-text("${label}")`).first();
      if (await b.count()) { await b.click(); break; }
    }
  }
  await page.click('button:has-text("End game")');
  await shot("09-standings");
  await captureSummary();
  await captureOnline();
} finally {
  await browser.close();
  server.httpServer.close();
}
// The local signalling server keeps timers running; the screenshots are done.
process.exit(0);
