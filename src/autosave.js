// src/autosave.js
// Best-effort session autosave in this browser (localStorage), so an accidental
// refresh doesn't lose the game. Cleared on "Back to main menu"/"Exit session".
const KEY = "lab-autosave-v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveSnapshot(snapshot) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...snapshot, version: 1, savedAt: Date.now() })); }
  catch { /* storage full or blocked: autosave is best-effort */ }
}

export function loadSnapshot() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s || s.version !== 1) return null;
    if (Date.now() - s.savedAt > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
    return s;
  } catch { return null; }
}

export function clearSnapshot() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
