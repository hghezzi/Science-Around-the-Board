// src/deckLinks.js
// Shareable game links: ?deck=<question file link or shortcut>&images=<image folder link>
export const DECK_SHORTCUTS = { demo: "./examples/16S_QIIME2_demo.tsv", stats: "./examples/intro_statistics.tsv" };

/** Turn what the instructor pasted into a URL the game can fetch ("" if unusable). */
export function normalizeDeckUrl(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (DECK_SHORTCUTS[s.toLowerCase()]) return DECK_SHORTCUTS[s.toLowerCase()];
  let url;
  try { url = new URL(s); } catch { return ""; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.hostname === "docs.google.com" && url.pathname.includes("/spreadsheets/d/e/")) {
    url.pathname = url.pathname.replace(/\/pub(html)?$/, "/pub"); // "Publish to web" link → TSV
    url.searchParams.set("output", "tsv");
    return url.toString();
  }
  if (url.hostname === "github.com" && url.pathname.includes("/blob/")) {
    return `https://raw.githubusercontent.com${url.pathname.replace("/blob/", "/")}`;
  }
  return url.toString();
}

/** Folder that holds the question images ("" if unusable). GitHub folder links become raw links. */
export function normalizeImagesBase(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let url;
  try { url = new URL(s); } catch { return ""; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "";
  if (url.hostname === "github.com" && url.pathname.includes("/tree/")) {
    return `https://raw.githubusercontent.com${url.pathname.replace("/tree/", "/")}`;
  }
  return url.toString();
}

/** Google Sheets edit/share links can't be read by the game; they must be "Published to web". */
export const isUnpublishedSheet = (input) => /docs\.google\.com\/spreadsheets\/d\/(?!e\/)/.test(String(input || ""));

export function buildShareLink(pageUrl, deckInput, imagesInput = "") {
  const link = new URL(pageUrl);
  link.search = "";
  link.hash = "";
  const deck = String(deckInput || "").trim();
  link.searchParams.set("deck", DECK_SHORTCUTS[deck.toLowerCase()] ? deck.toLowerCase() : normalizeDeckUrl(deck) || deck);
  const images = normalizeImagesBase(imagesInput);
  if (images) link.searchParams.set("images", images);
  return link.toString();
}

export function readDeckParams(search) {
  const p = new URLSearchParams(search || "");
  return { deck: p.get("deck") || "", images: p.get("images") || "" };
}
