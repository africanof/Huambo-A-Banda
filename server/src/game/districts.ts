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

/** Lugar interativo do bairro (comer, trabalhar, casa, dormir…), em unidades do mapa. */
export interface Place {
  id: string;
  name: string;
  kind: "food" | "work" | "home" | "sleep";
  x: number;
  y: number;
  radius: number;
  job?: string;
  shop?: string;
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
  /** raio do corpo para colisões (unidades do mapa); omisso = PLAYER_RADIUS */
  radius?: number;
  /** célula da grelha de área de interesse (unidades do mapa); omisso = 400 */
  aoiCell?: number;
  places?: Place[];
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

export const DEFAULT_DISTRICT = "cidade_baixa";

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

interface BairroFile {
  id: string;
  name: string;
  version: string;
  size: [number, number];
  obstacles: Array<[number, number, number, number]>;
  spawns: Array<{ id: string; name: string; at: [number, number] }>;
  places: Array<{ id: string; name: string; kind: Place["kind"]; at: [number, number]; radius: number; job?: string; shop?: string }>;
}

/** Unidades dos bairros HD: centímetros (o ficheiro está em metros). */
export const BAIRRO_UNIT = 100;

/** Carrega um bairro HD isométrico (tools/bairros → server/data/bairros). */
export function loadBairroDistrict(path: string | URL): District {
  const raw = JSON.parse(readFileSync(path, "utf8")) as BairroFile;
  const u = BAIRRO_UNIT;
  return {
    id: raw.id,
    name: raw.name,
    width: raw.size[0] * u,
    height: raw.size[1] * u,
    speed: 1.5 * u,
    radius: 0.35 * u,
    aoiCell: 12 * u,
    spawns: raw.spawns.map((s) => ({ id: s.id, name: s.name, x: s.at[0] * u, y: s.at[1] * u })),
    spawnRadius: 1.5 * u,
    obstacles: raw.obstacles.map((r) => [r[0] * u, r[1] * u, r[2] * u, r[3] * u] as Rect),
    places: raw.places.map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.at[0] * u, y: p.at[1] * u, radius: p.radius * u, job: p.job, shop: p.shop })),
    map: { id: "bairro:" + raw.id, version: raw.version },
  };
}

function ensureDefaults(): void {
  if (defaultsLoaded) return;
  defaultsLoaded = true;
  registerDistrict(loadMapDistrict(new URL("../../data/maps/huambo_centro.json", import.meta.url)));
  registerDistrict(loadBairroDistrict(new URL("../../data/bairros/cidade_baixa.json", import.meta.url)));
}

export function getDistrict(id: string): District | undefined {
  ensureDefaults();
  return registry.get(id);
}

export function listDistricts(): District[] {
  ensureDefaults();
  return [...registry.values()];
}
