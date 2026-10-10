// src/bot.js
// The computer opponent for solo games (pure, no React). The bot plays the normal
// two-player rules through the same actions a person uses (GameScreen.jsx drives it);
// this file decides what it answers and what it buys. It "knows" an answer with the
// probability of its level, so the student's chance of winning depends on how well
// they answer: matching the bot's accuracy gives about even odds. Simulated with the
// real rules (scripts/bot-sim.mjs), a student who answers 70% right wins about 3 games
// in 4 against Easy, half against Medium and 1 in 3 against Hard.
import {
  chaosStealCost, chaosTargets, canUpgradeSubgroup, nextUpgradeLevel, upgradeCost,
  getSubgroupTiles, ownsFullSubgroup,
} from "./gameRules.js";

export const BOT_LEVELS = {
  easy: { label: "Easy", accuracy: 0.5 },
  medium: { label: "Medium", accuracy: 0.7 },
  hard: { label: "Hard", accuracy: 0.85 },
};
export const BOT_LEVEL_IDS = Object.keys(BOT_LEVELS);
export const DEFAULT_BOT_LEVEL = "medium";

export const botAccuracy = (level) => (BOT_LEVELS[level] || BOT_LEVELS[DEFAULT_BOT_LEVEL]).accuracy;

// Cash the bot keeps in hand so one rent bill doesn't bankrupt it.
export const BOT_RESERVE = 200;
export const BOT_UPGRADE_RESERVE = 300;

// How long each bot step stays on screen (ms). Results stay longer so the
// explanation can be read; "Skip ahead" uses the fast timings.
export const BOT_PACE = {
  normal: { step: 700, question: 1300, result: 2200, perChar: 14, maxResult: 6000 },
  fast: { step: 120, question: 150, result: 250, perChar: 0, maxResult: 250 },
};

// Inside the bot's 6-question exams each result is shown for a shorter time, so a
// whole exam stays around half a minute.
const EXAM_SCALE = 0.6;

/** How long to leave a result with this explanation on screen (`exam`: one of the bot's exam questions). */
export function resultDelay(explanation, fast = false, exam = false) {
  const p = fast ? BOT_PACE.fast : BOT_PACE.normal;
  const ms = Math.min(p.maxResult, p.result + p.perChar * String(explanation || "").length);
  return Math.round(exam && !fast ? ms * EXAM_SCALE : ms);
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

/**
 * A response to a prepared question (see questionFormats.prepareQuestion) that
 * checkAnswer marks right when `correct` is true and wrong otherwise.
 */
export function botResponse(q, correct, rng = Math.random) {
  const options = q.options || [];
  switch (q.format) {
    case "multi": {
      const want = q.answers || [];
      if (correct) return [...want];
      // Drop one right option or add one wrong one: a near miss, like a person's.
      const wrong = options.map((_, i) => i).filter((i) => !want.includes(i));
      if (wrong.length && (want.length <= 1 || rng() < 0.5)) return [...want, pick(wrong, rng)].sort((a, b) => a - b);
      const drop = Math.floor(rng() * want.length) % want.length;
      return want.filter((_, k) => k !== drop);
    }
    case "numeric": {
      const target = q.numericAnswer;
      if (correct) return String(target);
      const t = q.tolerance || { abs: 0 };
      const allowed = t.pct ? Math.abs(target) * (t.pct / 100) : t.abs || 0;
      const miss = Math.max(allowed * 2, Math.abs(target) * 0.25, 1);
      const value = target + (rng() < 0.5 ? -miss : miss);
      return String(Number.isInteger(target) ? Math.round(value) : Number(value.toPrecision(3)));
    }
    case "order": {
      const want = q.correctOrder || options;
      if (correct || want.length < 2) return [...want];
      const i = Math.floor(rng() * (want.length - 1)) % (want.length - 1);
      const out = [...want];
      [out[i], out[i + 1]] = [out[i + 1], out[i]];
      return out;
    }
    case "text":
      return correct ? (q.acceptedAnswers || [])[0] || "" : "Not sure";
    default: {
      if (correct || options.length < 2) return q.answer ?? 0;
      return pick(options.map((_, i) => i).filter((i) => i !== q.answer), rng);
    }
  }
}

/** Does the bot know this one? */
export const botKnows = (level, rng = Math.random) => rng() < botAccuracy(level);

/** Buy a tile it answered right on, keeping a reserve. */
export const shouldBuy = (bot, tile) => bot.money - tile.price >= BOT_RESERVE;

/** Try a free milestone's exam only if it could still pay for the corner and keep a reserve. */
export const shouldTryMilestone = (bot, tile) => bot.money - tile.price >= BOT_RESERVE;

/** The cheapest upgrade it can afford with cash to spare, or null. */
export function upgradeChoice(board, botId, money) {
  const seen = new Set();
  let best = null;
  for (const t of board) {
    if (t.type !== "property" || t.owner !== botId) continue;
    const key = `${t.group}|${t.sub}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!canUpgradeSubgroup(board, t, botId)) continue;
    const level = nextUpgradeLevel(board, t);
    if (level <= (t.level || 0)) continue;
    const cost = upgradeCost(t, level);
    if (money - cost < BOT_UPGRADE_RESERVE) continue;
    if (!best || cost < best.cost) best = { tile: t, level, cost };
  }
  return best;
}

/** With a chaos token: the most valuable rival tile it can take and still keep a reserve, or null. */
export function chaosChoice(board, bot) {
  if (!bot.chaosTokens) return null;
  const options = chaosTargets(board, bot.id).filter((t) => bot.money - chaosStealCost(t) >= BOT_RESERVE);
  if (!options.length) return null;
  return options.reduce((a, b) => (b.price > a.price ? b : a));
}

/**
 * Liquidation: sell the least useful tile first (a lone deed of an incomplete set,
 * cheapest first), and break up an upgraded or complete set only when nothing else is left.
 */
export function liquidationChoice(board, botId) {
  const owned = board.filter((t) => t.owner === botId);
  if (!owned.length) return null;
  const score = (t) => {
    const fullSet = t.type === "property" && ownsFullSubgroup(board, t, botId);
    const inSet = t.type === "property" ? getSubgroupTiles(board, t).filter((g) => g.owner === botId).length : 0;
    return (t.level > 0 ? 3 : fullSet ? 2 : 0) * 10000 + inSet * 1000 + (t.price || 0);
  };
  return owned.reduce((a, b) => (score(b) < score(a) ? b : a));
}
