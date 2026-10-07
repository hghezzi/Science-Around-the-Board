// src/gameRules.js
// Pure board/rent rules shared by the game component and unit tests.

export function getSubgroupTiles(board, tile) {
  if (!tile || tile.type !== 'property') return [];
  return board.filter(
    (t) =>
      t.type === 'property' &&
      t.group === tile.group &&
      t.sub === tile.sub
  );
}

export function ownsFullSubgroup(board, tile, ownerId) {
  const groupTiles = getSubgroupTiles(board, tile);
  if (groupTiles.length === 0) return false;
  return groupTiles.every((t) => t.owner === ownerId);
}

// RENT MULTIPLIERS (Exponential Curve)
export function getRentMultiplier(board, tile) {
  if (!tile) return 0;
  if (tile.type === 'milestone') return 1.0;
  if (tile.type === 'sequencing_core') return 1.0;
  if (tile.type !== 'property') return 1.0;

  const ownerId = tile.owner;
  if (ownerId === null || ownerId === undefined) return 0;

  const fullGroup = ownsFullSubgroup(board, tile, ownerId);
  if (!fullGroup) return 0.5;

  if (tile.level === 0) return 1.0;
  if (tile.level === 1) return 3.0;
  if (tile.level === 2) return 6.0;
  if (tile.level === 3) return 10.0;
  if (tile.level >= 4) return 20.0;

  return 1.0;
}

export function computeRent(board, tile) {
  if (!tile) return 0;
  const base = tile.baseRent || 0;
  const mult = getRentMultiplier(board, tile);
  return Math.floor(base * mult);
}

// ------------------------------------------------------------------
//  VICTORY, ELIMINATION & TURN ORDER
// ------------------------------------------------------------------

/** Value of a player's tiles: purchase price plus upgrades already bought. */
export function assetValue(board, playerId) {
  return board
    .filter((t) => t.owner === playerId)
    .reduce((sum, t) => sum + (t.price || 0) + (t.level || 0) * (t.houseCost || 0), 0);
}

/** Net worth = cash + asset value (eliminated players are worth 0). */
export function netWorth(player, board) {
  if (!player || player.eliminated) return 0;
  return player.money + assetValue(board, player.id);
}

/**
 * Final standings: players still in the game first, then by net worth.
 * Eliminated players are ordered by how long they survived (later = better).
 */
export function rankPlayers(players, board) {
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      cash: p.eliminated ? 0 : p.money,
      assets: p.eliminated ? 0 : assetValue(board, p.id),
      netWorth: netWorth(p, board),
      eliminated: Boolean(p.eliminated),
      eliminatedAt: p.eliminatedAt ?? null,
    }))
    .sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (a.eliminated) return (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0);
      return b.netWorth - a.netWorth;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Players who have not been eliminated. */
export function activePlayers(players) {
  return players.filter((p) => !p.eliminated);
}

/** Index of the next non-eliminated player after `from` (wraps). Returns `from` if none. */
export function nextActivePlayer(players, from) {
  for (let step = 1; step <= players.length; step++) {
    const i = (from + step) % players.length;
    if (!players[i].eliminated) return i;
  }
  return from;
}

/**
 * Pick the starting player from pre-survey rows: highest number of correct
 * quiz answers; ties broken at random. Returns 0 when there is no data.
 */
export function bestPreSurveyPlayer(preRows, playerCount, rng = Math.random) {
  if (!playerCount) return 0;
  const scores = Array(playerCount).fill(0);
  (preRows || []).forEach((r) => {
    if (r.section === "quiz" && r.correct === true && r.playerIndex < playerCount) scores[r.playerIndex]++;
  });
  const best = Math.max(...scores);
  const tied = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
  return tied[Math.floor(rng() * tied.length)] ?? 0;
}

// ------------------------------------------------------------------
//  ECONOMY & QUIZ CONSTANTS
//  The numbers players see in the guide. Changing any of them changes
//  gameplay for every class using the live site: get the owner's approval.
// ------------------------------------------------------------------

export const ECONOMY = {
  startMoney: 2500,
  lapBonus: 200, // passing (or landing on) START
  wrongAnswerPenalty: 20, // wrong answer on an unowned tile
  chaosTokenPrice: 500, // only once all four milestones are owned
  rescueBonus: 500, // paid on top of the cleared debt after a passed Rescue Quiz
  saleShare: 0.5, // liquidation: selling a deed or an upgrade returns half its cost
  chaosStealShare: 0.5, // a successful Chaos Challenge buys the tile at half its price
};

export const MAX_LEVEL = 4;

export const QUIZ_RULES = {
  milestone: { questions: 6, pass: 5, maxMistakes: 2 }, // the exam stops on the 2nd mistake
  rescue: { questions: 3, pass: 2 },
};

// ------------------------------------------------------------------
//  RANDOM SELECTION
// ------------------------------------------------------------------

/** Fisher-Yates shuffle (a copy). */
export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One random element, or null for an empty list. */
export function pickRandom(arr, rng = Math.random) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * `count` questions from `pool`: every question once (in random order) before
 * any repeats, so a 6-question exam built from 6+ questions never repeats one.
 */
export function drawQuestions(pool, count, rng = Math.random) {
  const unique = [...new Set(pool || [])];
  if (unique.length === 0 || count <= 0) return [];
  const out = [];
  while (out.length < count) out.push(...shuffle(unique, rng));
  return out.slice(0, count);
}

// ------------------------------------------------------------------
//  UPGRADES
// ------------------------------------------------------------------

/** A player may upgrade a property only while owning its whole subgroup. */
export function canUpgradeSubgroup(board, tile, playerId) {
  if (!tile || tile.type !== "property" || tile.owner !== playerId) return false;
  return ownsFullSubgroup(board, tile, playerId);
}

/**
 * The level the subgroup would reach with one more upgrade, or the tile's own
 * level when no upgrade is possible (levels uneven, or already at MAX_LEVEL).
 */
export function nextUpgradeLevel(board, tile) {
  const levels = getSubgroupTiles(board, tile).map((t) => t.level || 0);
  if (levels.length === 0) return tile?.level || 0;
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  if (min !== max) return tile.level || 0;
  return Math.min(max + 1, MAX_LEVEL);
}

/** Cost of upgrading one property to `level` (the top level costs double). */
export function upgradeCost(tile, level) {
  if (!tile || tile.type !== "property") return 0;
  if (level >= MAX_LEVEL) return tile.castleCost || tile.price * 2;
  return tile.houseCost || tile.price;
}

/** Board after raising every tile the player owns in `tile`'s subgroup to `level`. */
export function applyUpgrade(board, tile, playerId, level) {
  const ids = new Set(getSubgroupTiles(board, tile).filter((t) => t.owner === playerId).map((t) => t.id));
  return board.map((t) => (ids.has(t.id) ? { ...t, level } : t));
}

// ------------------------------------------------------------------
//  BANKRUPTCY, LIQUIDATION & ELIMINATION
// ------------------------------------------------------------------

/** Cash a player could raise by selling every deed and upgrade they own. */
export function liquidationValue(board, playerId) {
  return board
    .filter((t) => t.owner === playerId)
    .reduce((sum, t) => sum + Math.floor(((t.price || 0) + (t.level || 0) * (t.houseCost || 0)) * ECONOMY.saleShare), 0);
}

/**
 * What happens to a player whose cash is below zero:
 *   "liquidate" – selling assets can cover the debt
 *   "rescue"    – it can't, and the one Rescue Quiz is still available
 *   "eliminate" – it can't, and the Rescue Quiz was already used
 *   null        – not in debt (or already out)
 */
export function bankruptcyAction(player, board) {
  if (!player || player.eliminated || player.money >= 0) return null;
  const owns = board.some((t) => t.owner === player.id);
  if (owns && player.money + liquidationValue(board, player.id) >= 0) return "liquidate";
  return player.rescueUsed ? "eliminate" : "rescue";
}

/**
 * Remove one upgrade level from every upgraded tile the player owns in
 * `tile`'s subgroup (levels stay even). A tile of the subgroup that a rival
 * has since stolen is left alone. Returns the new board and the refund.
 */
export function downgradeSubgroup(board, tile, playerId) {
  const ids = new Set(
    getSubgroupTiles(board, tile).filter((t) => t.owner === playerId && (t.level || 0) > 0).map((t) => t.id)
  );
  return {
    board: board.map((t) => (ids.has(t.id) ? { ...t, level: t.level - 1 } : t)),
    refund: Math.floor((tile.houseCost || tile.price || 0) * ECONOMY.saleShare * ids.size),
  };
}

/** Sell one deed back to the bank for half its price. */
export function sellDeed(board, tile) {
  return {
    board: board.map((t) => (t.id === tile.id ? { ...t, owner: null, level: 0 } : t)),
    value: Math.floor((tile.price || 0) * ECONOMY.saleShare),
  };
}

/** Every tile the player owns returns to the bank, without upgrades. */
export function releaseTiles(board, playerId) {
  return board.map((t) => (t.owner === playerId ? { ...t, owner: null, level: 0 } : t));
}

// ------------------------------------------------------------------
//  CHAOS CHALLENGE
// ------------------------------------------------------------------

/** Price of stealing a tile with a successful Chaos Challenge. */
export const chaosStealCost = (tile) => Math.floor((tile?.price || 0) * ECONOMY.chaosStealShare);

/** Fine for a failed Chaos Challenge: half the tile's base rent ($20 if that is zero). */
export const chaosFailPenalty = (tile) => Math.floor((tile?.baseRent || 20) * 0.5) || 20;

/** Rival properties the player can target with a Chaos Challenge. */
export function chaosTargets(board, playerId) {
  return board.filter((t) => t.type === "property" && t.owner != null && t.owner !== playerId);
}

/** Chaos Tokens are for sale only once every milestone has an owner. */
export const chaosTokensForSale = (board) => board.filter((t) => t.type === "milestone").every((t) => t.owner != null);
