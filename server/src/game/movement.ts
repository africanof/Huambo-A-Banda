import type { District, Rect } from "./districts.js";

/**
 * Movimento autoritativo "clicar para andar".
 *
 * Funções puras e determinísticas: o cliente Godot implementa exatamente o mesmo
 * algoritmo (client/src/world/movement.gd) para previsão local, e o servidor
 * corrige quando há divergência.
 */
export const PLAYER_RADIUS = 14;
export const WALK_SPEED = 160; // px/s

export interface Mover {
  x: number;
  y: number;
  tx: number | null;
  ty: number | null;
}

export function pointInRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad;
}

export function isWalkable(d: District, x: number, y: number): boolean {
  if (x < PLAYER_RADIUS || y < PLAYER_RADIUS || x > d.width - PLAYER_RADIUS || y > d.height - PLAYER_RADIUS) {
    return false;
  }
  for (const r of d.obstacles) {
    if (pointInRect(x, y, r, PLAYER_RADIUS)) return false;
  }
  return true;
}

/** Ajusta um destino pedido pelo cliente aos limites do mapa. Devolve null se for inválido. */
export function sanitizeTarget(d: District, x: number, y: number): { x: number; y: number } | null {
  const cx = Math.min(Math.max(x, PLAYER_RADIUS), d.width - PLAYER_RADIUS);
  const cy = Math.min(Math.max(y, PLAYER_RADIUS), d.height - PLAYER_RADIUS);
  if (!isWalkable(d, cx, cy)) return null;
  return { x: cx, y: cy };
}

/**
 * Avança um passo. Desliza ao longo dos obstáculos (tenta X e Y separadamente)
 * para que o jogador não fique preso num canto. Devolve true se se moveu.
 */
export function step(d: District, m: Mover, dt: number, speed = WALK_SPEED): boolean {
  if (m.tx === null || m.ty === null) return false;
  const dx = m.tx - m.x;
  const dy = m.ty - m.y;
  const dist = Math.hypot(dx, dy);
  const maxStep = speed * dt;

  if (dist <= maxStep) {
    if (isWalkable(d, m.tx, m.ty)) {
      m.x = m.tx;
      m.y = m.ty;
    }
    m.tx = m.ty = null;
    return true;
  }

  const nx = m.x + (dx / dist) * maxStep;
  const ny = m.y + (dy / dist) * maxStep;
  if (isWalkable(d, nx, ny)) {
    m.x = nx;
    m.y = ny;
    return true;
  }
  // Deslizar ao longo do obstáculo: avança só num eixo, com progresso real.
  const sx = Math.sign(dx) * Math.min(Math.abs(dx), maxStep);
  const sy = Math.sign(dy) * Math.min(Math.abs(dy), maxStep);
  if (Math.abs(sx) > 0.01 && isWalkable(d, m.x + sx, m.y)) {
    m.x += sx;
    return true;
  }
  if (Math.abs(sy) > 0.01 && isWalkable(d, m.x, m.y + sy)) {
    m.y += sy;
    return true;
  }
  // Bloqueado: pára (o pathfinding chega numa etapa futura).
  m.tx = m.ty = null;
  return false;
}

/** Ponto de spawn aleatório e caminhável perto do centro de spawn do bairro. */
export function randomSpawn(d: District, rand: () => number = Math.random): { x: number; y: number } {
  for (let i = 0; i < 32; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * d.spawn.radius;
    const x = d.spawn.x + Math.cos(a) * r;
    const y = d.spawn.y + Math.sin(a) * r;
    if (isWalkable(d, x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  return { x: d.spawn.x, y: d.spawn.y };
}
