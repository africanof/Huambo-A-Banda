import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { TEST_A } from "./districts.js";
import { isWalkable, randomSpawn, sanitizeTarget, step, validatePath, segmentWalkable, PLAYER_RADIUS, type Mover } from "../src/game/movement.js";

const d = TEST_A;

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

describe("movement on the real Huambo map (OSM grid)", () => {
  const h = getDistrict("huambo_centro")!;

  it("loads the generated map with its bairros and collision grid", () => {
    expect(h.map?.version).toMatch(/^[0-9a-f]{12}$/);
    expect(h.spawns.map((s) => s.id)).toEqual(["cidade_alta", "cidade_baixa", "academico", "fatima", "sao_pedro"]);
    for (const s of h.spawns) expect(isWalkable(h, s.x, s.y)).toBe(true);
    expect(isWalkable(h, 2, 2)).toBe(false); // margem do mapa
  });

  it("moves with a continuous direction and never enters buildings", () => {
    const s = h.spawns[0]!;
    const m: Mover = { x: s.x, y: s.y, tx: null, ty: null, dx: 100, dy: 0 };
    for (let i = 0; i < 400; i++) {
      step(h, m, 0.05, h.speed);
      expect(isWalkable(h, m.x, m.y)).toBe(true);
    }
    expect(m.x).not.toBe(s.x);
  });

  it("validates client paths segment by segment", () => {
    const s = h.spawns[0]!;
    const ok = validatePath(h, s.x, s.y, [s.x + 20, s.y, s.x + 20, s.y + 20]);
    expect(ok.length).toBeGreaterThanOrEqual(2);
    // um ponto do outro lado do mapa em linha reta atravessa edifícios: é cortado
    const far = validatePath(h, s.x, s.y, [h.width - 100, h.height - 100]);
    expect(far).toEqual(segmentWalkable(h, s.x, s.y, h.width - 100, h.height - 100) ? [h.width - 100, h.height - 100] : []);
  });

  it("follows a validated path to the end", () => {
    const s = h.spawns[0]!;
    const path = validatePath(h, s.x, s.y, [s.x + 30, s.y, s.x + 30, s.y + 30]);
    const m: Mover = { x: s.x, y: s.y, tx: path[0]!, ty: path[1]!, path: path.slice(2) };
    for (let i = 0; i < 100 && m.tx !== null; i++) step(h, m, 0.05, h.speed);
    expect([m.x, m.y]).toEqual([path[path.length - 2], path[path.length - 1]]);
  });
});
