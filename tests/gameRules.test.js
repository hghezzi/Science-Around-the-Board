import { describe, it, expect } from "vitest";
import { getSubgroupTiles, ownsFullSubgroup, getRentMultiplier, computeRent } from "../src/gameRules.js";

const prop = (id, sub, owner = null, level = 0) => ({
  id, type: "property", group: "G", sub, owner, level, baseRent: 20,
});

describe("rent rules", () => {
  it("finds tiles in the same theme + subtheme", () => {
    const board = [prop(0, "a"), prop(1, "a"), prop(2, "b")];
    expect(getSubgroupTiles(board, board[0]).map((t) => t.id)).toEqual([0, 1]);
  });

  it("charges nothing on unowned tiles", () => {
    const board = [prop(0, "a")];
    expect(computeRent(board, board[0])).toBe(0);
  });

  it("charges half rent without the full subgroup", () => {
    const board = [prop(0, "a", 1), prop(1, "a", null)];
    expect(ownsFullSubgroup(board, board[0], 1)).toBe(false);
    expect(computeRent(board, board[0])).toBe(10);
  });

  it("scales rent 1/3/6/10/20x with level once the subgroup is complete", () => {
    const expected = [20, 60, 120, 200, 400];
    expected.forEach((rent, level) => {
      const board = [prop(0, "a", 1, level), prop(1, "a", 1, level)];
      expect(getRentMultiplier(board, board[0])).toBe(rent / 20);
      expect(computeRent(board, board[0])).toBe(rent);
    });
  });

  it("uses a flat multiplier for milestones, and counts the owner's core tiles for cores", () => {
    expect(getRentMultiplier([], { type: "milestone" })).toBe(1);
    const core = (id, owner) => ({ id, type: "sequencing_core", owner, baseRent: 50 });
    const board = [core(0, 1), core(1, 1), core(2, 2), core(3, null)];
    expect(getRentMultiplier(board, board[0])).toBe(2);
    expect(getRentMultiplier(board, board[2])).toBe(1);
    expect(getRentMultiplier(board, board[3])).toBe(0);
    expect(computeRent(board, board[0])).toBe(100);
    const all = board.map((t) => ({ ...t, owner: 1 }));
    expect(computeRent(all, all[0])).toBe(200);
  });
});

import { assetValue, netWorth, rankPlayers, nextActivePlayer, bestPreSurveyPlayer } from "../src/gameRules.js";

describe("victory helpers", () => {
  const board = [
    { id: 0, type: "property", group: "G", sub: "a", owner: 0, price: 100, level: 2, houseCost: 100 },
    { id: 1, owner: 1, price: 500, level: 0, houseCost: 0 },
    { id: 2, owner: null, price: 160, level: 0, houseCost: 160 },
  ];
  const players = [
    { id: 0, name: "Red", money: 1000 },
    { id: 1, name: "Blue", money: 900 },
    { id: 2, name: "Green", money: 5000, eliminated: true, eliminatedAt: 3 },
    { id: 3, name: "Orange", money: 0, eliminated: true, eliminatedAt: 7 },
  ];

  it("values assets at the money spent: price plus upgrades", () => {
    expect(assetValue(board, 0)).toBe(300);
    expect(netWorth(players[0], board)).toBe(1300);
    expect(netWorth(players[2], board)).toBe(0);
  });

  it("ranks active players by net worth, then eliminated by survival", () => {
    expect(rankPlayers(players, board).map((r) => r.name)).toEqual(["Blue", "Red", "Orange", "Green"]);
  });

  it("skips eliminated players when passing the turn", () => {
    expect(nextActivePlayer(players, 1)).toBe(0);
    expect(nextActivePlayer(players, 0)).toBe(1);
    const allOut = players.map((p) => ({ ...p, eliminated: true }));
    expect(nextActivePlayer(allOut, 2)).toBe(2);
  });

  it("picks the best pre-survey scorer to start, breaking ties randomly", () => {
    const rows = [
      { section: "quiz", playerIndex: 0, correct: true },
      { section: "quiz", playerIndex: 1, correct: true },
      { section: "quiz", playerIndex: 1, correct: true },
      { section: "confidence", playerIndex: 0, correct: true },
    ];
    expect(bestPreSurveyPlayer(rows, 3)).toBe(1);
    expect(bestPreSurveyPlayer([], 3, () => 0.99)).toBe(2);
    expect(bestPreSurveyPlayer([], 3, () => 0)).toBe(0);
  });
});
