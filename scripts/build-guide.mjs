#!/usr/bin/env node
// Build the Instructor Guide from guide/instructor-guide.md:
//   public/guide/index.html (+ images)  — web version
//   public/SAB_Instructor_Guide.pdf     — printable version (same URL as before)
// Run via `npm run guide` (which also refreshes the screenshots).
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";

const SRC = "guide/instructor-guide.md";
const OUT_DIR = "public/guide";
const PDF = "public/SAB_Instructor_Guide.pdf";

let md = readFileSync(SRC, "utf8");
const front = {};
md = md.replace(/^---\n([\s\S]*?)\n---\n/, (_, body) => {
  body.split("\n").forEach((l) => { const m = l.match(/^(\w+):\s*(.*)$/); if (m) front[m[1]] = m[2]; });
  return "";
});

const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, "").replace(/[’'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const headings = [];
const renderer = new marked.Renderer();
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const id = slug(text);
  if (depth === 2 || depth === 3) headings.push({ depth, text, id });
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};
renderer.image = ({ href, title, text }) =>
  `<figure><img src="${href}" alt="${text}"${title ? ` title="${title}"` : ""} loading="lazy"><figcaption>${text}</figcaption></figure>`;
renderer.link = function ({ href, title, tokens }) {
  const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener"' : "";
  return `<a href="${href}"${title ? ` title="${title}"` : ""}${ext}>${this.parser.parseInline(tokens)}</a>`;
};

let body = marked.parse(md, { renderer, gfm: true });
const toc = `<nav class="toc" aria-label="Contents"><p class="toc-title">Contents</p><ol>${headings
  .filter((h) => h.depth === 2)
  .map((h) => `<li><a href="#${h.id}">${h.text}</a></li>`)
  .join("")}</ol></nav>`;
body = body.replace(/<p>\[\[toc\]\]<\/p>/, toc);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instructor Guide – Science Around the Board</title>
<meta name="description" content="How to design, run and assess a Science Around the Board review session.">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<style>
  :root { color-scheme: light dark; --bg:#f6f8fb; --paper:#fff; --text:#1e293b; --muted:#55627a; --accent:#2563eb; --border:#dbe2ea; --code:#eef2f7; --note:#eff6ff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f172a; --paper:#1e293b; --text:#e8edf4; --muted:#b8c4d4; --accent:#7cb8fb; --border:#334155; --code:#0f172a; --note:#13243f; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:17px/1.65 "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }
  article { background: var(--paper); border:1px solid var(--border); border-radius: 16px; padding: clamp(20px, 5vw, 56px); }
  h1 { font-size: clamp(1.8rem, 4vw, 2.5rem); line-height:1.15; margin: 0 0 8px; }
  h2 { font-size: 1.6rem; margin: 2.4em 0 .5em; padding-top: .4em; border-top: 2px solid var(--border); }
  h3 { font-size: 1.25rem; margin: 1.8em 0 .4em; }
  h4 { font-size: 1.05rem; margin: 1.5em 0 .3em; }
  h1, h2, h3, h4 { font-family: "Fredoka", "Nunito", system-ui, sans-serif; font-weight: 600; }
  a { color: var(--accent); }
  p, li { max-width: 72ch; }
  blockquote { margin: 1.2em 0; padding: 12px 18px; background: var(--note); border-left: 4px solid var(--accent); border-radius: 8px; }
  blockquote p { margin: 0; }
  code { background: var(--code); padding: 1px 6px; border-radius: 5px; font-size: .9em; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: .92em; display: block; overflow-x: auto; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--code); }
  figure { margin: 1.4em 0; }
  figure img { width: 100%; border: 1px solid var(--border); border-radius: 10px; }
  figcaption { color: var(--muted); font-size: .88em; margin-top: 6px; text-align: center; }
  .toc { background: var(--code); border-radius: 12px; padding: 14px 22px; margin: 1.5em 0; }
  .toc-title { font-weight: 800; margin: 0 0 4px; }
  .toc ol { margin: 0; padding-left: 20px; columns: 2; column-gap: 32px; }
  .meta { color: var(--muted); }
  .back { display:inline-block; margin-bottom: 16px; }
  @media (max-width: 600px) { .toc ol { columns: 1; } }
  @media print {
    :root { --bg:#fff; --paper:#fff; --text:#111; --muted:#444; --accent:#1d4ed8; --border:#ccc; --code:#f1f3f6; --note:#eef4ff; }
    body { font-size: 11pt; }
    main { padding: 0; max-width: none; }
    article { border: none; padding: 0; }
    .back { display: none; }
    h2 { margin-top: 1.6em; }
    h2, h3, h4 { break-after: avoid; }
    figure img { max-height: 105mm; width: auto; max-width: 100%; display: block; margin: 0 auto; }
    figure, table, blockquote { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
</style>
</head>
<body>
<main>
  <a class="back" href="../">← Back to the game</a>
  <article>
${body}
  </article>
</main>
</body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/index.html`, html);
if (existsSync("guide/images")) cpSync("guide/images", `${OUT_DIR}/images`, { recursive: true });
console.log(`Wrote ${OUT_DIR}/index.html (${headings.length} headings)`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.emulateMedia({ media: "print", colorScheme: "light" });
await page.goto(pathToFileURL(resolve(`${OUT_DIR}/index.html`)).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.querySelectorAll("img").forEach((i) => i.removeAttribute("loading")));
await page.waitForTimeout(500);
await page.pdf({
  path: PDF,
  format: "Letter",
  margin: { top: "18mm", bottom: "18mm", left: "17mm", right: "17mm" },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#666;">Science Around the Board · Instructor Guide · ${front.updated || ""} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
});
await browser.close();
console.log(`Wrote ${PDF}`);
