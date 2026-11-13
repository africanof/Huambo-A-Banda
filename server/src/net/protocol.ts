import { z } from "zod";

/**
 * Protocolo de aplicação do Huambo É A Banda.
 *
 * Fonte de verdade: este ficheiro. O espelho em GDScript está em
 * client/src/net/protocol.gd e um teste (test/protocol-sync.test.ts) garante que
 * os dois ficam iguais.
 *
 * Decisões:
 *  - Tipos de mensagem numéricos (1 byte em msgpack) em vez de strings: os
 *    snapshots saem 10x/s para cada jogador, cada byte conta em redes móveis.
 *  - Posições em píxeis inteiros e entidades em arrays planos.
 *  - O cliente só envia INTENÇÕES (ex.: "quero andar para X"). O servidor decide.
 */
export const PROTOCOL_VERSION = 1;

/** Cliente -> Servidor */
export const C2S = {
  MOVE_TO: 1,
  STOP: 2,
} as const;

/** Servidor -> Cliente */
export const S2C = {
  WELCOME: 100,
  SPAWN: 101,
  DESPAWN: 102,
  SNAPSHOT: 103,
  NOTICE: 104,
} as const;

/** Códigos de erro de aplicação (enviados em NOTICE ou como motivo de recusa). */
export const ErrorCodes = {
  PROTOCOL_MISMATCH: 4001,
  INVALID_DISTRICT: 4002,
  DUPLICATE_SESSION: 4003,
  RATE_LIMITED: 4004,
  SERVER_SHUTDOWN: 4005,
} as const;

// ---------- Validação de entradas do cliente (nunca confiar no cliente) ----------

const coord = z.number().finite().min(-100_000).max(100_000);

export const MoveToSchema = z.object({ x: coord, y: coord }).strict();
export type MoveTo = z.infer<typeof MoveToSchema>;

export const JoinOptionsSchema = z
  .object({
    v: z.literal(PROTOCOL_VERSION),
    district: z.string().regex(/^[a-z0-9_]{2,32}$/),
  })
  .strip();
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;

// ---------- Formatos de saída (documentação + tipos) ----------

export interface Appearance {
  body: number; // índice de cor do corpo
  shirt: number; // índice de cor da camisola
}

/** [id, nome, x, y, aparência] */
export type SpawnEntry = [number, string, number, number, Appearance];

export interface WelcomeMessage {
  selfId: number;
  district: { id: string; name: string; width: number; height: number; obstacles: Array<[number, number, number, number]> };
  speed: number;
  simHz: number;
  snapshotHz: number;
  serverTime: number;
}

/** Snapshot: { t: ms do servidor, e: [id, x, y, id, x, y, ...] } apenas entidades dentro da área de interesse. */
export interface SnapshotMessage {
  t: number;
  e: number[];
}
