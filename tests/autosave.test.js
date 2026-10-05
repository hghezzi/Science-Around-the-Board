import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveSnapshot, loadSnapshot, clearSnapshot } from "../src/autosave.js";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    get size() { return data.size; },
  };
}

describe("autosave", () => {
  beforeEach(() => { globalThis.localStorage = memoryStorage(); });
  afterEach(() => { delete globalThis.localStorage; vi.useRealTimers(); });

  it("saves and loads a snapshot", () => {
    saveSnapshot({ phase: "GAME", playerCount: 2 });
    expect(loadSnapshot()).toMatchObject({ phase: "GAME", playerCount: 2, version: 1 });
  });

  it("ignores snapshots from another version", () => {
    localStorage.setItem("sab-autosave-v1", JSON.stringify({ version: 2, savedAt: Date.now(), phase: "GAME" }));
    expect(loadSnapshot()).toBeNull();
  });

  it("drops snapshots older than 12 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
    saveSnapshot({ phase: "GAME" });
    vi.setSystemTime(new Date(2026, 9, 5, 21, 1));
    expect(loadSnapshot()).toBeNull();
    expect(localStorage.size).toBe(0);
  });

  it("clears the snapshot", () => {
    saveSnapshot({ phase: "SUMMARY" });
    clearSnapshot();
    expect(loadSnapshot()).toBeNull();
  });

  it("never throws when storage is full, blocked or corrupt", () => {
    localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
    expect(() => saveSnapshot({ phase: "GAME" })).not.toThrow();
    localStorage.getItem = () => "{not json";
    expect(loadSnapshot()).toBeNull();
    delete globalThis.localStorage;
    expect(() => clearSnapshot()).not.toThrow();
    expect(loadSnapshot()).toBeNull();
  });
});
