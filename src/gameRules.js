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
