import { readFileSync } from "node:fs";

/**
 * Catálogo de mapas ("districts"). Cada mapa é um tipo de sala; quando uma
 * instância enche, o matchmaking abre outra instância do MESMO mapa.
 *
 * Dois tipos de mapa:
 *  - mapas de grelha gerados a partir do OpenStreetMap (tools/mapgen) — o jogo real;
 *  - mapas de retângulos, usados apenas nos testes.
 */
export type Rect = [x: number, y: number, w: number, h: number];

export interface Grid {
  cell: number;
  cols: number;
  rows: number;
  /** bitset: bit i = célula (i % cols, i / cols) bloqueada */
  bits: Uint8Array;
}

export interface Spawn {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface District {
  id: string;
  name: string;
  width: number;
  height: number;
  /** velocidade a pé (px/s) */
  speed: number;
  spawns: Spawn[];
  spawnRadius: number;
  obstacles: Rect[];
  grid?: Grid;
  /** identificação do ficheiro de mapa que o cliente tem de ter (mapas de grelha) */
  map?: { id: string; version: string };
}

interface MapFile {
  id: string;
  name: string;
  version: string;
  width: number;
  height: number;
  grid: { cell: number; cols: number; rows: number; bits: string };
  bairros: Spawn[];
}

const registry = new Map<string, District>();
let defaultsLoaded = false;

export const DEFAULT_DISTRICT = "huambo_centro";

export function registerDistrict(d: District): void {
  registry.set(d.id, d);
}

/** Carrega um mapa gerado por tools/mapgen (ficheiro em server/data/maps). */
export function loadMapDistrict(path: string | URL, speed = 150): District {
  const raw = JSON.parse(readFileSync(path, "utf8")) as MapFile;
  const bits = new Uint8Array(Buffer.from(raw.grid.bits, "base64"));
  if (bits.length * 8 < raw.grid.cols * raw.grid.rows) throw new Error(`mapa ${raw.id}: grelha truncada`);
  return {
    id: raw.id,
    name: raw.name,
    width: raw.width,
    height: raw.height,
    speed,
    spawns: raw.bairros,
    spawnRadius: 48,
    obstacles: [],
    grid: { cell: raw.grid.cell, cols: raw.grid.cols, rows: raw.grid.rows, bits },
    map: { id: raw.id, version: raw.version },
  };
}

function ensureDefaults(): void {
  if (defaultsLoaded) return;
  defaultsLoaded = true;
  registerDistrict(loadMapDistrict(new URL("../../data/maps/huambo_centro.json", import.meta.url)));
}

export function getDistrict(id: string): District | undefined {
  ensureDefaults();
  return registry.get(id);
}

export function listDistricts(): District[] {
  ensureDefaults();
  return [...registry.values()];
}
