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

  it("uses a flat multiplier for milestones and cores", () => {
    expect(getRentMultiplier([], { type: "milestone" })).toBe(1);
    expect(getRentMultiplier([], { type: "sequencing_core" })).toBe(1);
  });
});
