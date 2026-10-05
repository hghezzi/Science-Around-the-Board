#!/usr/bin/env node
// Capture current screenshots of the game for the Instructor Guide.
// Serves the production build (run `vite build` first) and drives it with
// Playwright, writing PNGs to guide/images/. Part of `npm run guide`.
import { preview } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "guide/images";
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: 4180, strictPort: false }, logLevel: "error" });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 1.5 });
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

try {
  console.log("Capturing guide screenshots from", base);
  await page.goto(base);
  await shot("01-landing");
  await page.click("text=No thanks");
  await page.click("text=Play the demo");
  await shot("02-file-check");
  await page.click("text=Continue to game setup");
  await page.click('button:has-text("2 teams")');
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
} finally {
  await browser.close();
  server.httpServer.close();
}
