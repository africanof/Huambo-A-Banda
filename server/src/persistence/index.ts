import type { Env } from "../config/env.js";
import type { Identity } from "../auth/TokenVerifier.js";
import type { CharacterRecord, CharacterRepository, PositionUpdate } from "./CharacterRepository.js";
import { MemoryCharacterRepository } from "./MemoryCharacterRepository.js";
import { SupabaseCharacterRepository } from "./SupabaseCharacterRepository.js";

/** Encaminha convidados para memória e contas reais para o Supabase (quando configurado). */
class RoutingCharacterRepository implements CharacterRepository {
  constructor(
    private readonly users: CharacterRepository,
    private readonly guests: CharacterRepository,
  ) {}

  loadOrCreate(identity: Identity): Promise<CharacterRecord> {
    return (identity.kind === "guest" ? this.guests : this.users).loadOrCreate(identity);
  }

  async savePositions(updates: PositionUpdate[]): Promise<void> {
    const mem = updates.filter((u) => u.id.startsWith("mem-"));
    const db = updates.filter((u) => !u.id.startsWith("mem-"));
    await Promise.all([this.guests.savePositions(mem), db.length ? this.users.savePositions(db) : undefined]);
  }
}

export function createCharacterRepository(env: Env): CharacterRepository {
  const guests = new MemoryCharacterRepository();
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new RoutingCharacterRepository(new SupabaseCharacterRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY), guests);
  }
  return guests;
}

export type { CharacterRepository, CharacterRecord, PositionUpdate } from "./CharacterRepository.js";
