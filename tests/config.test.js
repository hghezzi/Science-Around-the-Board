import { describe, it, expect } from "vitest";
import { readConfig } from "../src/config.js";

const cfg = (id, question) => ({ id, question, type: "config" });

describe("readConfig", () => {
  it("returns empty settings when there are no config rows", () => {
    expect(readConfig([{ id: "q1", question: "Why?", type: "property" }])).toEqual({ resultsUrl: "", instructorEmail: "", course: "", askNames: false });
  });

  it("reads the settings and asks for names when results are delivered", () => {
    const config = readConfig([
      cfg("results_url", "https://script.google.com/macros/s/abc/exec"),
      cfg("instructor_email", "prof@uni.edu"),
      cfg("course", "BIOL 101"),
    ]);
    expect(config).toEqual({ resultsUrl: "https://script.google.com/macros/s/abc/exec", instructorEmail: "prof@uni.edu", course: "BIOL 101", askNames: true });
  });

  it("lets the instructor turn names off or on explicitly", () => {
    expect(readConfig([cfg("instructor_email", "prof@uni.edu"), cfg("ask_names", "no")]).askNames).toBe(false);
    expect(readConfig([cfg("ask_names", "Yes")]).askNames).toBe(true);
  });

  it("ignores invalid links and addresses", () => {
    const config = readConfig([cfg("results_url", "http://example.com/collect"), cfg("instructor_email", "not-an-email")]);
    expect(config.resultsUrl).toBe("");
    expect(config.instructorEmail).toBe("");
    expect(config.askNames).toBe(false);
  });

  it("matches keys and types case-insensitively and ignores blank values", () => {
    const config = readConfig([{ id: " Course ", question: " Stats 200 ", type: "Config" }, cfg("instructor_email", "  ")]);
    expect(config.course).toBe("Stats 200");
    expect(config.instructorEmail).toBe("");
  });
});
