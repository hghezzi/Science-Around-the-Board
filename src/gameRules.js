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
  // Core tiles: $50 for each of the 4 core tiles the owner holds ($50, $100, $150, $200).
  if (tile.type === 'sequencing_core') {
    if (tile.owner == null) return 0;
    return board.filter((t) => t.type === 'sequencing_core' && t.owner === tile.owner).length;
  }
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

/** What the current owner paid for a tile: its price, or less after a Chaos steal. */
export const tilePaid = (tile) => (tile?.owner == null ? 0 : tile.paid ?? tile.price ?? 0);

/** Total cost of raising a subgroup from level 0 to `level` (paid once per subgroup). */
export function upgradeSpend(tile, level) {
  let sum = 0;
  for (let l = 1; l <= level; l++) sum += upgradeCost(tile, l);
  return sum;
}

/**
 * Money a player has spent on the tiles they own: what they paid for each deed,
 * plus each upgrade they bought (once per subgroup, as it was charged).
 */
export function assetValue(board, playerId) {
  const owned = board.filter((t) => t.owner === playerId);
  const upgraded = new Set();
  return owned.reduce((sum, t) => {
    let v = sum + tilePaid(t);
    const key = `${t.group}|${t.sub}`;
    if ((t.level || 0) > 0 && !upgraded.has(key)) {
      upgraded.add(key);
      v += upgradeSpend(t, t.level);
    }
    return v;
  }, 0);
}

/** Net worth = cash + money spent on tiles still owned (eliminated players are worth 0). */
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
  // Starting cash by number of players. Fewer players get more rolls and more tiles
  // each, so they need more cash; these keep the pressure on cash similar for 2–4
  // players (simulated with these rules). Solo play has no rent income.
  startMoney: { 1: 2500, 2: 2000, 3: 1500, 4: 1250 },
  rentScale: 2.5, // property base rent is 2.5 × 20% = 50% of the price
  coreRentStep: 50, // a core tile's rent is $50 per core tile its owner holds
  milestoneFee: 250, // landing on a rival's milestone (half after a passed expert challenge)
  lapBonus: 200, // passing (or landing on) START
  wrongAnswerPenalty: 20, // wrong answer on an unowned tile
  chaosTokenPrice: 500, // only once all four milestones are owned
  rescueBonus: 500, // paid on top of the cleared debt after a passed Rescue Quiz
  saleShare: 0.5, // liquidation: selling a deed or an upgrade returns half of what was paid for it
  chaosStealShare: 0.5, // a successful Chaos Challenge buys the tile at half its price
};

/** Starting cash for each player in a game with `playerCount` players. */
export const startingMoney = (playerCount) => ECONOMY.startMoney[playerCount] ?? ECONOMY.startMoney[4];

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

/** Cash a player could raise by selling every deed and upgrade they own (half of what they paid). */
export function liquidationValue(board, playerId) {
  const owned = board.filter((t) => t.owner === playerId);
  const upgraded = new Set();
  return owned.reduce((sum, t) => {
    let v = sum + Math.floor(tilePaid(t) * ECONOMY.saleShare);
    const key = `${t.group}|${t.sub}`;
    if ((t.level || 0) > 0 && !upgraded.has(key)) {
      upgraded.add(key);
      for (let l = 1; l <= t.level; l++) v += Math.floor(upgradeCost(t, l) * ECONOMY.saleShare);
    }
    return v;
  }, 0);
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
 * Sell the top upgrade level of `tile`'s subgroup: every tile the player owns
 * there drops one level (levels stay even) and the player gets back half of
 * what that level cost (it was charged once for the whole subgroup).
 */
export function downgradeSubgroup(board, tile, playerId) {
  const ids = new Set(
    getSubgroupTiles(board, tile).filter((t) => t.owner === playerId && (t.level || 0) > 0).map((t) => t.id)
  );
  const level = tile.level || 0;
  return {
    board: board.map((t) => (ids.has(t.id) ? { ...t, level: t.level - 1 } : t)),
    refund: ids.size && level > 0 ? Math.floor(upgradeCost(tile, level) * ECONOMY.saleShare) : 0,
  };
}

/** Sell one deed back to the bank for half of what its owner paid. */
export function sellDeed(board, tile) {
  return {
    board: board.map((t) => (t.id === tile.id ? { ...t, owner: null, level: 0, paid: 0 } : t)),
    value: Math.floor(tilePaid(tile) * ECONOMY.saleShare),
  };
}

/** Every tile the player owns returns to the bank, without upgrades. */
export function releaseTiles(board, playerId) {
  return board.map((t) => (t.owner === playerId ? { ...t, owner: null, level: 0, paid: 0 } : t));
}

/** Board after `playerId` acquires `tile` for `paid` (a purchase, a captured milestone or a Chaos steal). */
export function acquireTile(board, tile, playerId, paid) {
  return board.map((t) => (t.id === tile.id ? { ...t, owner: playerId, level: 0, paid } : t));
}

// ------------------------------------------------------------------
//  CHAOS CHALLENGE
// ------------------------------------------------------------------

/** Price of stealing a tile with a successful Chaos Challenge. */
export const chaosStealCost = (tile) => Math.floor((tile?.price || 0) * ECONOMY.chaosStealShare);

/** Fine for a failed Chaos Challenge: half the tile's base rent ($20 if that is zero). */
export const chaosFailPenalty = (tile) => Math.floor((tile?.baseRent || 20) * 0.5) || 20;

/**
 * Rival properties the player can target with a Chaos Challenge. A complete
 * set (the owner holds all of its tiles, upgraded or not) is protected.
 */
export function chaosTargets(board, playerId) {
  return board.filter((t) => t.type === "property" && t.owner != null && t.owner !== playerId
    && (t.level || 0) === 0 && !ownsFullSubgroup(board, t, t.owner));
}

/** Chaos Tokens are for sale only once every milestone has an owner. */
export const chaosTokensForSale = (board) => board.filter((t) => t.type === "milestone").every((t) => t.owner != null);
