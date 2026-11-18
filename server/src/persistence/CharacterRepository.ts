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
  /** estado de vida (necessidades, família, emprego…); null em personagens novas */
  life: unknown | null;
}

export interface PositionUpdate {
  id: string;
  district: string;
  x: number;
  y: number;
  life?: unknown;
}

/**
 * Porta de persistência das personagens. As salas dependem apenas desta interface;
 * trocar Supabase por outra base de dados (ou por uma cache Redis à frente) não
 * mexe na lógica de jogo.
 */
export interface CharacterUpdate {
  name?: string;
  appearance?: Appearance;
}

export interface CharacterRepository {
  loadOrCreate(identity: Identity): Promise<CharacterRecord>;
  savePositions(updates: PositionUpdate[]): Promise<void>;
  /** Altera nome/aparência da personagem da conta (criando-a se ainda não existir). */
  update(identity: Identity, changes: CharacterUpdate): Promise<CharacterRecord>;
}

export function defaultAppearance(seed: string): Appearance {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  h >>>= 0;
  return { body: h % 6, shirt: (h >>> 8) % 10, hair: (h >>> 16) % 6, pants: (h >>> 20) % 6, model: (h >>> 24) % 2, top: -1 };
}
