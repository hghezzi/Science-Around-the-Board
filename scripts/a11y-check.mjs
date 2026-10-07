#!/usr/bin/env node
// Accessibility smoke test: runs axe-core on the main screens in light and dark
// mode against a running preview server (npm run build && npm run preview).
// Usage: node scripts/a11y-check.mjs [baseUrl]
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import CryptoJS from "crypto-js";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:4173/Science-Around-the-Board/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failures = 0;
// An encrypted copy of the demo, to open the password dialog.
const LOCK = CryptoJS.AES.encrypt(readFileSync("public/SAB_questions_Jan22_Filtered.tsv", "utf8"), "a11y-test").toString();

async function audit(page, label) {
  await page.waitForTimeout(400); // let MUI colour transitions finish
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = res.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  for (const v of serious) {
    failures += v.nodes.length;
    console.log(`✗ [${label}] ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} element(s)`);
    v.nodes.slice(0, 3).forEach((n) => console.log(`     ${n.target.join(" ")} ${n.failureSummary?.split("\n")[1] || ""}`));
  }
  if (!serious.length) console.log(`✓ [${label}] no serious violations`);
}

for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByText(/share your questions as a link/).click();
  await page.getByLabel("Link to your question file").fill("demo");
  await audit(page, `${scheme} landing`);
  await page.setInputFiles('input[type="file"][accept*=".lock"]', { name: "questions.lock", mimeType: "text/plain", buffer: Buffer.from(LOCK) });
  await page.getByText("This question file is protected").waitFor();
  await audit(page, `${scheme} password`);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.click("text=No thanks");
  await page.click("text=Play the demo");
  await audit(page, `${scheme} loaded`);
  await page.click("text=Continue to game setup");
  await page.click('button:has-text("Solo")');
  await page.click("text=16S");
  await page.click("text=Confirm Selection");
  await audit(page, `${scheme} setup`);
  await page.click('button:has-text("Start game")');
  await page.click('button:has-text("Continue to Questions")');
  await audit(page, `${scheme} survey`);
  await page.click('button:has-text("Start Game")');
  await page.getByRole("button", { name: "Got it" }).waitFor();
  await page.waitForTimeout(400);
  await audit(page, `${scheme} rules`);
  await page.click('button:has-text("Got it")');
  await page.waitForTimeout(400);
  await audit(page, `${scheme} board`);
  // A refresh mid-game offers to resume the autosaved game.
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.reload();
  await page.getByText("Resume your game?").waitFor();
  await audit(page, `${scheme} resume`);
  await page.click('button:has-text("Resume")');
  await page.getByText("Game log").waitFor();
  for (let i = 0; i < 12; i++) {
    await page.click('button:has-text("Roll")');
    await page.waitForTimeout(3300);
    const text = await page.locator(".MuiModal-root").last().innerText().catch(() => "");
    if (text.includes("Question ·")) {
      await audit(page, `${scheme} question`);
      const modal = page.locator(".MuiModal-root").last();
      const option = modal.locator('button:has-text("A.")');
      if (await option.count()) await option.first().click();
      else {
        const input = modal.locator('input[aria-label="Answer"]');
        if (await input.count()) await input.fill("1");
        const box = modal.locator('input[type="checkbox"]');
        if (await box.count()) await box.first().check();
        await modal.locator('button:has-text("Submit answer")').click();
      }
      await page.waitForTimeout(300);
      await audit(page, `${scheme} feedback`);
      break;
    }
    const next = page.locator('.MuiModal-root button:has-text("CONTINUE"), .MuiModal-root button:has-text("DECLINE"), .MuiModal-root button:has-text("SKIP")').first();
    if (await next.count()) await next.click();
  }
  // Close any open dialog, end the game and audit the end screen.
  for (let k = 0; k < 5 && (await page.locator(".MuiModal-root").count()); k++) {
    const close = page.locator('.MuiModal-root button:has-text("SKIP"), .MuiModal-root button:has-text("CONTINUE"), .MuiModal-root button:has-text("DECLINE")').first();
    if (await close.count()) await close.click();
    await page.waitForTimeout(400);
  }
  await page.click('button:has-text("End game")');
  await page.click('button:has-text("CONTINUE TO POST-SURVEY")');
  await page.click('button:has-text("Continue to Questions")');
  await page.click('button:has-text("Finish Surveys")');
  await page.getByText("Session complete").waitFor();
  await audit(page, `${scheme} summary`);
  await context.close();
}
await browser.close();
console.log(failures ? `\n${failures} serious/critical issue(s).` : "\nNo serious accessibility issues found.");
process.exit(failures ? 1 : 0);
