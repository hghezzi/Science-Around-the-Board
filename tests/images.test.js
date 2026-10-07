import { describe, it, expect } from "vitest";
import { resolveImage, isUploaded } from "../src/images.js";

describe("resolveImage", () => {
  it("prefers uploads, then URLs, then the hosted questionImages folder", () => {
    expect(resolveImage("a.png", { "a.png": "blob:1" })).toBe("blob:1");
    expect(resolveImage("https://x.org/a.png")).toBe("https://x.org/a.png");
    expect(resolveImage("16S_target.png")).toBe("./questionImages/16S_target.png");
    expect(resolveImage("")).toBeNull();
  });
});

describe("resolveImage with an image folder link", () => {
  it("uses the folder for plain filenames, after uploads and full links", () => {
    const base = "https://raw.githubusercontent.com/me/course/main/images/";
    expect(resolveImage("plot 1.png", {}, base)).toBe("https://raw.githubusercontent.com/me/course/main/images/plot%201.png");
    expect(resolveImage("sub/a.png", {}, base.slice(0, -1))).toBe("https://raw.githubusercontent.com/me/course/main/images/sub/a.png");
    expect(resolveImage("plot 1.png", { "plot 1.png": "blob:x" }, base)).toBe("blob:x");
    expect(resolveImage("https://x.org/a.png", {}, base)).toBe("https://x.org/a.png");
    expect(resolveImage("a.png")).toBe("./questionImages/a.png");
  });
});

describe("resolveImage matching uploads", () => {
  it("matches uploads ignoring letter case and any folder written in the TSV", () => {
    const uploads = { "fig1.png": "blob:1" };
    expect(resolveImage("Fig1.PNG", uploads)).toBe("blob:1");
    expect(resolveImage("images/fig1.png", uploads)).toBe("blob:1");
    expect(resolveImage("fig2.png", uploads)).toBe("./questionImages/fig2.png");
    expect(isUploaded("FIG1.png", uploads)).toBe(true);
    expect(isUploaded("fig2.png", uploads)).toBe(false);
    expect(isUploaded("", uploads)).toBe(false);
  });

  it("encodes hosted file names and ignores blank names", () => {
    expect(resolveImage("my plot#1.png")).toBe("./questionImages/my%20plot%231.png");
    expect(resolveImage("   ")).toBeNull();
  });
});
