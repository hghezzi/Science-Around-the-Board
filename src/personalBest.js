// src/personalBest.js
// Solo personal bests and records against the bot, kept in this browser only
// (localStorage) and never sent anywhere. One entry per question file game, session
// length and mode (goal, or each bot level). Never throws.
const KEY = "sab-best-v1";

const keyFor = ({ topic, module, minutes, mode }) => [topic || "", module || "", minutes || 0, ...(mode ? [mode] : [])].join("|");

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

/** Record against the bot at `level` for this game: { wins, games, bestNetWorth } or null. */
export function getBotRecord(game, level) {
  const r = readAll()[keyFor({ ...game, mode: `bot-${level}` })];
  return r && Number.isFinite(r.games) ? r : null;
}

/** Count a finished game against the bot. Returns the updated record. */
export function recordBotGame(game, level, { won, netWorth }) {
  const prev = getBotRecord(game, level) || { wins: 0, games: 0, bestNetWorth: null };
  const next = {
    wins: prev.wins + (won ? 1 : 0),
    games: prev.games + 1,
    bestNetWorth: prev.bestNetWorth == null ? netWorth : Math.max(prev.bestNetWorth, netWorth),
    date: new Date().toISOString().slice(0, 10),
  };
  try {
    const all = readAll();
    all[keyFor({ ...game, mode: `bot-${level}` })] = next;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage full or blocked: the record just isn't kept */ }
  return next;
}
