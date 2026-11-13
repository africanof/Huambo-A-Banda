import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { isWalkable, randomSpawn, sanitizeTarget, step, PLAYER_RADIUS, type Mover } from "../src/game/movement.js";

const d = getDistrict("cidade_baixa")!;

describe("movement", () => {
  it("moves toward target at the configured speed", () => {
    const m: Mover = { x: 1200, y: 800, tx: 1300, ty: 800 };
    step(d, m, 0.1, 100);
    expect(m.x).toBeCloseTo(1210);
    expect(m.y).toBeCloseTo(800);
  });

  it("snaps to the target and stops when close", () => {
    const m: Mover = { x: 1200, y: 800, tx: 1205, ty: 800 };
    step(d, m, 0.1, 100);
    expect(m).toEqual({ x: 1205, y: 800, tx: null, ty: null });
  });

  it("rejects targets inside obstacles and clamps to bounds", () => {
    expect(sanitizeTarget(d, 400, 300)).toBeNull(); // dentro da casa [300,250,320,220]
    expect(sanitizeTarget(d, -50, 99999)).toEqual({ x: PLAYER_RADIUS, y: d.height - PLAYER_RADIUS });
  });

  it("never walks into an obstacle (slides or stops)", () => {
    const m: Mover = { x: 460, y: 600, tx: 460, ty: 100 }; // atravessaria a casa
    for (let i = 0; i < 200; i++) step(d, m, 0.05);
    expect(isWalkable(d, m.x, m.y)).toBe(true);
    expect(m.tx).toBeNull();
  });

  it("spawns on walkable ground", () => {
    for (let i = 0; i < 50; i++) {
      const p = randomSpawn(d);
      expect(isWalkable(d, p.x, p.y)).toBe(true);
    }
  });
});
