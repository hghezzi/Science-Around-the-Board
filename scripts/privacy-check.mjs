#!/usr/bin/env node
// Privacy and link-safety check of the built app (Playwright). Run with `npm run privacy`.
//   - Before a visitor opts in, and after "No thanks", the pages contact no other host at all.
//   - "Allow analytics" loads Google Analytics, and changing one's mind switches it off
//     and deletes its cookies.
//   - Share links can't run code: javascript:, data: and other non-web links are refused.
//   - The production Content-Security-Policy blocks nothing the pages need.
// Google is never contacted: its script is answered with an empty file.
import { preview } from "vite";
import { chromium } from "playwright";

const server = await preview({ preview: { port: Number(process.env.PORT || 4182), strictPort: false }, logLevel: "error" });
const BASE = server.resolvedUrls.local[0];
const ORIGIN = new URL(BASE).origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

async function newPage() {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const external = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    external.push(url);
    if (url.startsWith("https://www.googletagmanager.com/")) return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    return route.abort();
  });
  page.on("console", (m) => { if (m.type() === "error" && /Content Security Policy/i.test(m.text())) fail(`CSP: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  let dialogs = 0;
  page.on("dialog", (d) => { dialogs++; d.dismiss().catch(() => {}); });
  return { context, page, external, dialogs: () => dialogs };
}

console.log("▶ before consent");
{
  const { context, page, external } = await newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: /Play the demo/ }).click();
  await page.getByText(/Loaded \d+ questions/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  // GitHub Pages answers unknown paths with 404.html; the preview server needs it asked for by name.
  for (const path of ["privacy.html", "encryptor.html", "guide/", "404.html?deck=demo"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
  }
  if (!page.url().endsWith("/Learn-Around-the-Board/?deck=demo")) fail(`404 page didn't redirect to the game with ?deck= (ended at ${page.url()})`);
  if (external.length) fail(`contacted other hosts before any choice: ${[...new Set(external)].join(", ")}`);
  else ok("no request left the site before a choice was made");
  await context.close();
}

console.log("▶ local play stays offline");
{
  // A game on one computer never loads the online-play code or opens a live connection.
  const { context, page, external } = await newPage();
  const sockets = [];
  const scripts = [];
  page.on("websocket", (ws) => sockets.push(ws.url()));
  page.on("request", (r) => { if (r.resourceType() === "script") scripts.push(r.url()); });
  await page.goto(BASE);
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByRole("button", { name: /Play the demo/ }).click();
  await page.getByRole("button", { name: /Continue to game setup/ }).click();
  await page.getByRole("button", { name: /^Solo$/ }).click();
  await page.getByRole("button", { name: /^16S/ }).click();
  await page.getByRole("button", { name: /Confirm selection/i }).click();
  await page.getByRole("button", { name: /^Start game/ }).click();
  await page.getByRole("button", { name: /Continue to Questions/ }).click();
  await page.getByRole("button", { name: /^Start Game$/ }).click();
  await page.getByText("Game log").waitFor();
  await page.waitForTimeout(1500);
  const peerCode = scripts.filter((u) => /\/assets\/(bundler|peerTransport|GuestApp)-/.test(u));
  if (sockets.length || external.length || peerCode.length) fail(`local play reached out: ${[...sockets, ...external, ...peerCode].join(", ")}`);
  else ok("a local game loads no online-play code and opens no live connection");
  await context.close();
}

console.log("▶ No thanks");
{
  const { context, page, external } = await newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (await page.getByRole("button", { name: "No thanks" }).count()) fail("the banner came back after No thanks");
  if (external.length) fail(`contacted other hosts after No thanks: ${external.join(", ")}`);
  else ok("nothing loaded from Google after No thanks, also on the next visit");
  await context.close();
}

console.log("▶ Allow, then change of mind");
{
  const { context, page, external } = await newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: "Allow analytics" }).click();
  await page.waitForTimeout(500);
  if (!external.some((u) => u.startsWith("https://www.googletagmanager.com/gtag/js"))) fail("Allow analytics didn't load Google Analytics");
  else ok("Allow analytics loads Google Analytics");
  const config = await page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)).find((a) => a[0] === "config"));
  if (!config || /\?/.test(config[2]?.page_location || "?")) fail("analytics would report the page's query string (?deck= links)");
  if (config && config[2].allow_google_signals !== false) fail("Google signals aren't turned off");
  // Pretend GA set its cookies, then change our mind.
  await page.evaluate(() => { document.cookie = "_ga=GA1.1.123; path=/"; document.cookie = "_ga_TEST=GS1.1.456; path=/"; });
  await page.getByRole("link", { name: "Analytics settings" }).click();
  await page.getByRole("button", { name: "No thanks" }).click();
  const after = await page.evaluate(() => ({ cookies: document.cookie, disabled: Object.keys(window).some((k) => k.startsWith("ga-disable-") && window[k] === true) }));
  if (/_ga/.test(after.cookies)) fail(`analytics cookies remain after No thanks: ${after.cookies}`);
  if (!after.disabled) fail("analytics wasn't switched off after No thanks");
  if (!/_ga/.test(after.cookies) && after.disabled) ok("No thanks switches analytics off and deletes its cookies");
  const count = external.length;
  await page.reload();
  await page.waitForLoadState("networkidle");
  if (external.length > count) fail(`Google was contacted again after the change of mind: ${external.slice(count).join(", ")}`);
  await context.close();
}

console.log("▶ share links");
{
  const { context, page, external, dialogs } = await newPage();
  await page.goto(BASE);
  await page.getByRole("button", { name: "No thanks" }).click();
  const evil = ["javascript:alert(1)", "data:text/tab-separated-values,id%09question", "file:///etc/passwd", "vbscript:msgbox(1)", "//evil.example/q.tsv"];
  for (const deck of evil) {
    await page.goto(`${BASE}?deck=${encodeURIComponent(deck)}&images=${encodeURIComponent("javascript:alert(2)")}`);
    await page.getByText(/doesn't look like a link to a question file/).waitFor({ timeout: 5000 }).catch(() => fail(`?deck=${deck} wasn't refused`));
  }
  if (dialogs()) fail("a share link ran script (an alert opened)");
  if (external.length) fail(`share links contacted: ${external.join(", ")}`);
  else ok("javascript:, data:, file: and scheme-relative links are refused");
  await context.close();
}

await browser.close();
server.httpServer.close();
console.log(failures.length ? `\n${failures.length} problem(s) found.` : "\nAll privacy checks passed.");
process.exit(failures.length ? 1 : 0);
