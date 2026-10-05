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
