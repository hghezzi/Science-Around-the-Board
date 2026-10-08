// src/personalBest.js
// Solo personal bests, kept in this browser only (localStorage) and never sent
// anywhere. One best per question file game and session length. Never throws.
const KEY = "sab-best-v1";

const keyFor = ({ topic, module, minutes }) => [topic || "", module || "", minutes || 0].join("|");

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}

/** The best result so far for this game and session length, or null. */
export function getPersonalBest(game) {
  const best = readAll()[keyFor(game)];
  return best && Number.isFinite(best.netWorth) ? best : null;
}

/**
 * Record a finished solo game. Returns { previous, isNew }: the earlier best (or null)
 * and whether this game beat it. Storage problems are ignored.
 */
export function recordPersonalBest(game, result) {
  const previous = getPersonalBest(game);
  const isNew = !previous || result.netWorth > previous.netWorth;
  if (isNew) {
    try {
      const all = readAll();
      all[keyFor(game)] = { netWorth: result.netWorth, accuracy: result.accuracy ?? null, date: new Date().toISOString().slice(0, 10) };
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* storage full or blocked: the best just isn't kept */ }
  }
  return { previous, isNew };
}
