import { registerDistrict, type District } from "../src/game/districts.js";
import { WALK_SPEED } from "../src/game/movement.js";

/** Mapas de retângulos só para testes (o jogo real usa mapas do OSM). */
export const TEST_A: District = {
  id: "teste_a",
  name: "Teste A",
  width: 2400,
  height: 1600,
  speed: WALK_SPEED,
  spawns: [{ id: "centro", name: "Centro", x: 1200, y: 800 }],
  spawnRadius: 120,
  obstacles: [
    [300, 250, 320, 220],
    [800, 200, 260, 260],
    [1600, 300, 380, 240],
    [400, 1100, 300, 260],
    [1700, 1050, 340, 300],
  ],
};

export const TEST_B: District = {
  id: "teste_b",
  name: "Teste B",
  width: 2000,
  height: 2000,
  speed: WALK_SPEED,
  spawns: [{ id: "centro", name: "Centro", x: 1000, y: 1000 }],
  spawnRadius: 150,
  obstacles: [
    [200, 200, 300, 300],
    [1400, 300, 300, 260],
    [500, 1400, 360, 240],
  ],
};

export function registerTestDistricts(): void {
  registerDistrict(TEST_A);
  registerDistrict(TEST_B);
}
