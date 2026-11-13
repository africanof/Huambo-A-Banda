/**
 * Gera fixtures para os testes do cliente Godot a partir do código REAL do servidor:
 *  - movement.json: trajetórias calculadas por src/game/movement.ts
 *  - wire.json: bytes produzidos pelo msgpackr e pelo encode.number do Colyseus
 *
 * Uso: npm run fixtures   (escreve em ../client/tests/fixtures)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Packr } from "msgpackr";
import { encode } from "@colyseus/schema";
import { TEST_A } from "../test/districts.js";
import { step, type Mover } from "../src/game/movement.js";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/tests/fixtures");
mkdirSync(out, { recursive: true });

// ---- movimento
const d = TEST_A;
const cases: Array<{ start: [number, number]; target: [number, number]; dt: number; steps: number }> = [
  { start: [1200, 800], target: [1500, 700], dt: 0.05, steps: 60 },
  { start: [460, 600], target: [460, 100], dt: 0.05, steps: 80 }, // contra a casa
  { start: [700, 300], target: [900, 600], dt: 1 / 60, steps: 200 },
  { start: [30, 30], target: [-500, -500], dt: 0.05, steps: 10 },
];
const movement = cases.map((c) => {
  const m: Mover = { x: c.start[0], y: c.start[1], tx: c.target[0], ty: c.target[1] };
  const path: Array<[number, number, boolean]> = [];
  for (let i = 0; i < c.steps; i++) {
    step(d, m, c.dt);
    path.push([m.x, m.y, m.tx !== null]);
  }
  return { ...c, path };
});
writeFileSync(
  resolve(out, "movement.json"),
  JSON.stringify({ district: { width: d.width, height: d.height, obstacles: d.obstacles }, cases: movement }),
);

// ---- bytes no fio
const packr = new Packr({ useRecords: false });
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const values: unknown[] = [
  0, 1, 127, 128, 255, 256, 65535, 65536, 4294967295, -1, -32, -33, -128, -129, -40000, 3.25, -0.5,
  "", "olá", "x".repeat(40), [1, [2, 3]], { a: 1, b: [true, false, null] },
  { selfId: 7, district: { id: "cidade_baixa", obstacles: [[1, 2, 3, 4]] } },
];
const msgpack = values.map((v) => ({ json: v, hex: hex(packr.pack(v)) }));
const numbers = [0, 5, 127, 128, 200, 4001, 70000, -5, -200, 3.5].map((n) => {
  const buf = Buffer.alloc(16);
  const it = { offset: 0 };
  encode.number(buf, n, it);
  return { n, hex: hex(buf.subarray(0, it.offset)) };
});
const strings = ["", "abc", "x".repeat(40)].map((s) => {
  const buf = Buffer.alloc(64);
  const it = { offset: 0 };
  encode.string(buf, s, it);
  return { s, hex: hex(buf.subarray(0, it.offset)) };
});
writeFileSync(resolve(out, "wire.json"), JSON.stringify({ msgpack, numbers, strings }, null, 1));
console.log(`fixtures escritas em ${out}`);
