import type { Appearance } from "../net/protocol.js";
import type { Identity } from "../auth/TokenVerifier.js";

export interface CharacterRecord {
  id: string;
  ownerId: string;
  name: string;
  appearance: Appearance;
  district: string | null;
  x: number | null;
  y: number | null;
}

export interface PositionUpdate {
  id: string;
  district: string;
  x: number;
  y: number;
}

/**
 * Porta de persistência das personagens. As salas dependem apenas desta interface;
 * trocar Supabase por outra base de dados (ou por uma cache Redis à frente) não
 * mexe na lógica de jogo.
 */
export interface CharacterRepository {
  loadOrCreate(identity: Identity): Promise<CharacterRecord>;
  savePositions(updates: PositionUpdate[]): Promise<void>;
}

export function defaultAppearance(seed: string): Appearance {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h >>>= 0;
  return { body: h % 6, shirt: (h >>> 8) % 10 };
}
