import type { District, Grid, Rect } from "./districts.js";

/**
 * Movimento autoritativo. Funções puras e determinísticas: o cliente Godot
 * implementa exatamente o mesmo algoritmo (client/src/world/movement.gd) para
 * previsão local — verificado por fixtures geradas a partir deste ficheiro.
 *
 * Três modos:
 *  - destino (tx, ty) + fila de pontos `path` (clique/toque com caminho);
 *  - direção (dx, dy) contínua (joystick / teclado);
 *  - parado.
 */
export const PLAYER_RADIUS = 14; // mapas de retângulos (testes)
export const WALK_SPEED = 160;
/** Pegada dos pés em mapas de grelha: centro, lados e frente/trás. */
export const FOOT: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-6, 0],
  [6, 0],
  [0, -4],
  [0, 3],
];
export const MAX_PATH_POINTS = 24;

export interface Mover {
  x: number;
  y: number;
  tx: number | null;
  ty: number | null;
  /** pontos seguintes [x, y, x, y, …] depois de (tx, ty) */
  path?: number[];
  /** direção contínua (não normalizada); 0,0 = sem direção */
  dx?: number;
  dy?: number;
}

export function pointInRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad;
}

export function cellBlocked(g: Grid, x: number, y: number): boolean {
  const c = Math.floor(x / g.cell);
  const r = Math.floor(y / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return true;
  const i = r * g.cols + c;
  return (g.bits[i >> 3]! & (1 << (i & 7))) !== 0;
}

export function isWalkable(d: District, x: number, y: number): boolean {
  if (d.grid) {
    for (const [ox, oy] of FOOT) if (cellBlocked(d.grid, x + ox, y + oy)) return false;
    return true;
  }
  const rad = d.radius ?? PLAYER_RADIUS;
  if (x < rad || y < rad || x > d.width - rad || y > d.height - rad) {
    return false;
  }
  for (const r of d.obstacles) {
    if (pointInRect(x, y, r, rad)) return false;
  }
  return true;
}

/** Ajusta um destino pedido pelo cliente aos limites do mapa. Devolve null se for inválido. */
export function sanitizeTarget(d: District, x: number, y: number): { x: number; y: number } | null {
  const rad = d.radius ?? PLAYER_RADIUS;
  const cx = Math.min(Math.max(x, rad), d.width - rad);
  const cy = Math.min(Math.max(y, rad), d.height - rad);
  if (!isWalkable(d, cx, cy)) return null;
  return { x: cx, y: cy };
}

/** Segmento reto inteiramente caminhável (amostras a cada 4 px). */
export function segmentWalkable(d: District, x0: number, y0: number, x1: number, y1: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / 4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!isWalkable(d, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/**
 * Valida um caminho pedido pelo cliente a partir da posição atual do servidor.
 * Aceita apenas segmentos retos caminháveis; corta no primeiro inválido.
 * Devolve os pontos aceites [x, y, …] (vazio se nenhum).
 */
export function validatePath(d: District, fromX: number, fromY: number, pts: number[]): number[] {
  const out: number[] = [];
  let px = fromX;
  let py = fromY;
  for (let i = 0; i + 1 < pts.length && out.length < MAX_PATH_POINTS * 2; i += 2) {
    const x = pts[i]!;
    const y = pts[i + 1]!;
    if (!isWalkable(d, x, y) || !segmentWalkable(d, px, py, x, y)) break;
    out.push(x, y);
    px = x;
    py = y;
  }
  return out;
}

/** Tenta mover; desliza ao longo de obstáculos eixo a eixo. */
function tryMove(d: District, m: Mover, nx: number, ny: number, sx: number, sy: number): boolean {
  if (isWalkable(d, nx, ny)) {
    m.x = nx;
    m.y = ny;
    return true;
  }
  if (Math.abs(sx) > 0.01 && isWalkable(d, m.x + sx, m.y)) {
    m.x += sx;
    return true;
  }
  if (Math.abs(sy) > 0.01 && isWalkable(d, m.x, m.y + sy)) {
    m.y += sy;
    return true;
  }
  return false;
}

/** Avança um passo de simulação. Devolve true se se moveu. */
export function step(d: District, m: Mover, dt: number, speed = WALK_SPEED): boolean {
  const maxStep = speed * dt;

  // --- direção contínua
  if (m.dx || m.dy) {
    const len = Math.hypot(m.dx ?? 0, m.dy ?? 0);
    const ux = (m.dx ?? 0) / len;
    const uy = (m.dy ?? 0) / len;
    return tryMove(d, m, m.x + ux * maxStep, m.y + uy * maxStep, ux * maxStep, uy * maxStep);
  }

  // --- destino / caminho
  if (m.tx === null || m.ty === null) return false;
  const dx = m.tx - m.x;
  const dy = m.ty - m.y;
  const dist = Math.hypot(dx, dy);

  if (dist <= maxStep) {
    if (isWalkable(d, m.tx, m.ty)) {
      m.x = m.tx;
      m.y = m.ty;
    }
    if (m.path && m.path.length >= 2) {
      m.tx = m.path.shift()!;
      m.ty = m.path.shift()!;
    } else {
      m.tx = m.ty = null;
      m.path = undefined;
    }
    return true;
  }

  const sx = Math.sign(dx) * Math.min(Math.abs(dx), maxStep);
  const sy = Math.sign(dy) * Math.min(Math.abs(dy), maxStep);
  if (tryMove(d, m, m.x + (dx / dist) * maxStep, m.y + (dy / dist) * maxStep, sx, sy)) return true;
  // Bloqueado: pára.
  m.tx = m.ty = null;
  m.path = undefined;
  return false;
}

/** Ponto de spawn aleatório e caminhável perto de (cx, cy). */
export function randomSpawnNear(
  d: District,
  cx: number,
  cy: number,
  radius: number,
  rand: () => number = Math.random,
): { x: number; y: number } {
  for (let i = 0; i < 48; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * radius;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (isWalkable(d, x, y)) return { x, y };
  }
  return { x: cx, y: cy };
}

/** Spawn num bairro (id) ou no primeiro bairro do mapa. */
export function randomSpawn(d: District, spawnId?: string, rand: () => number = Math.random): { x: number; y: number } {
  const s = d.spawns.find((sp) => sp.id === spawnId) ?? d.spawns[0]!;
  return randomSpawnNear(d, s.x, s.y, d.spawnRadius, rand);
}
