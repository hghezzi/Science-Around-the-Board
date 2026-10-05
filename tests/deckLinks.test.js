import { describe, it, expect } from "vitest";
import { normalizeDeckUrl, normalizeImagesBase, isUnpublishedSheet, buildShareLink, readDeckParams, DECK_SHORTCUTS } from "../src/deckLinks.js";

const SHEET = "https://docs.google.com/spreadsheets/d/e/2PACX-abc123";

describe("normalizeDeckUrl", () => {
  it("expands the built-in shortcuts", () => {
    expect(normalizeDeckUrl("demo")).toBe(DECK_SHORTCUTS.demo);
    expect(normalizeDeckUrl(" Stats ")).toBe(DECK_SHORTCUTS.stats);
  });

  it("turns a published Google Sheet into its TSV export", () => {
    expect(normalizeDeckUrl(`${SHEET}/pubhtml?gid=0&single=true`)).toBe(`${SHEET}/pub?gid=0&single=true&output=tsv`);
    expect(normalizeDeckUrl(`${SHEET}/pub?output=csv`)).toBe(`${SHEET}/pub?output=tsv`);
  });

  it("turns a GitHub file page into its raw file", () => {
    expect(normalizeDeckUrl("https://github.com/me/course/blob/main/games/week3.tsv"))
      .toBe("https://raw.githubusercontent.com/me/course/main/games/week3.tsv");
  });

  it("keeps other web links and rejects anything else", () => {
    expect(normalizeDeckUrl("https://example.edu/q.lock")).toBe("https://example.edu/q.lock");
    expect(normalizeDeckUrl("")).toBe("");
    expect(normalizeDeckUrl("not a link")).toBe("");
    expect(normalizeDeckUrl("javascript:alert(1)")).toBe("");
    expect(normalizeDeckUrl("file:///C:/q.tsv")).toBe("");
  });
});

describe("normalizeImagesBase", () => {
  it("turns a GitHub folder page into raw links and rejects non-links", () => {
    expect(normalizeImagesBase("https://github.com/me/course/tree/main/images")).toBe("https://raw.githubusercontent.com/me/course/main/images");
    expect(normalizeImagesBase("https://example.edu/img/")).toBe("https://example.edu/img/");
    expect(normalizeImagesBase("images")).toBe("");
    expect(normalizeImagesBase("javascript:alert(1)")).toBe("");
  });
});

describe("isUnpublishedSheet", () => {
  it("spots edit and share links that the game can't read", () => {
    expect(isUnpublishedSheet("https://docs.google.com/spreadsheets/d/1AbC/edit#gid=0")).toBe(true);
    expect(isUnpublishedSheet(`${SHEET}/pub?output=tsv`)).toBe(false);
    expect(isUnpublishedSheet("https://example.edu/q.tsv")).toBe(false);
  });
});

describe("buildShareLink / readDeckParams", () => {
  const page = "https://hghezzi.github.io/Science-Around-the-Board/?old=1#top";

  it("round-trips a question file and an image folder", () => {
    const link = buildShareLink(page, `${SHEET}/pubhtml`, "https://github.com/me/course/tree/main/images");
    expect(link.startsWith("https://hghezzi.github.io/Science-Around-the-Board/?deck=")).toBe(true);
    expect(readDeckParams(new URL(link).search)).toEqual({
      deck: `${SHEET}/pub?output=tsv`,
      images: "https://raw.githubusercontent.com/me/course/main/images",
    });
  });

  it("keeps shortcuts short and leaves out a missing image folder", () => {
    const link = buildShareLink(page, "Demo");
    expect(link).toBe("https://hghezzi.github.io/Science-Around-the-Board/?deck=demo");
    expect(readDeckParams(new URL(link).search)).toEqual({ deck: "demo", images: "" });
  });
});
