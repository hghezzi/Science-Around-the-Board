import { describe, it, expect } from "vitest";
import { resolveImage } from "../src/images.js";

describe("resolveImage", () => {
  it("prefers uploads, then URLs, then the hosted questionImages folder", () => {
    expect(resolveImage("a.png", { "a.png": "blob:1" })).toBe("blob:1");
    expect(resolveImage("https://x.org/a.png")).toBe("https://x.org/a.png");
    expect(resolveImage("16S_target.png")).toBe("./questionImages/16S_target.png");
    expect(resolveImage("")).toBeNull();
  });
});
