import { describe, expect, it } from "vitest";
import { SpatialGrid } from "../src/game/SpatialGrid.js";

describe("SpatialGrid", () => {
  it("returns only nearby entities", () => {
    const g = new SpatialGrid(100);
    g.upsert(1, 50, 50);
    g.upsert(2, 150, 50);
    g.upsert(3, 950, 950);
    const out = g.query(60, 60, 1, new Set());
    expect([...out].sort()).toEqual([1, 2]);
  });

  it("tracks moves and removals", () => {
    const g = new SpatialGrid(100);
    g.upsert(1, 50, 50);
    g.upsert(1, 950, 950);
    expect(g.query(50, 50, 1, new Set()).has(1)).toBe(false);
    expect(g.query(950, 950, 0, new Set()).has(1)).toBe(true);
    g.remove(1);
    expect(g.size).toBe(0);
    expect(g.query(950, 950, 0, new Set()).size).toBe(0);
  });
});
