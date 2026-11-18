import type { Env } from "../config/env.js";
import type { Identity } from "../auth/TokenVerifier.js";
import type { CharacterRecord, CharacterRepository, CharacterUpdate, PositionUpdate } from "./CharacterRepository.js";
import { MemoryCharacterRepository } from "./MemoryCharacterRepository.js";
import { SupabaseCharacterRepository } from "./SupabaseCharacterRepository.js";
import { MemoryWalletRepository, RoutingWalletRepository, SupabaseWalletRepository, type WalletRepository } from "./WalletRepository.js";

/** Encaminha convidados para memória e contas reais para o Supabase (quando configurado). */
class RoutingCharacterRepository implements CharacterRepository {
  constructor(
    private readonly users: CharacterRepository,
    private readonly guests: CharacterRepository,
  ) {}

  loadOrCreate(identity: Identity): Promise<CharacterRecord> {
    return (identity.kind === "guest" ? this.guests : this.users).loadOrCreate(identity);
  }

  update(identity: Identity, changes: CharacterUpdate): Promise<CharacterRecord> {
    return (identity.kind === "guest" ? this.guests : this.users).update(identity, changes);
  }

  async savePositions(updates: PositionUpdate[]): Promise<void> {
    const mem = updates.filter((u) => u.id.startsWith("mem-"));
    const db = updates.filter((u) => !u.id.startsWith("mem-"));
    await Promise.all([this.guests.savePositions(mem), db.length ? this.users.savePositions(db) : undefined]);
  }
}

export function createCharacterRepository(env: Env): CharacterRepository {
  return createRepositories(env).characters;
}

/** Personagens + carteiras: convidados em memória, contas no Supabase (quando configurado). */
export function createRepositories(env: Env): { characters: CharacterRepository; wallets: WalletRepository } {
  const guests = new MemoryCharacterRepository();
  const guestWallets = new MemoryWalletRepository();
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const supa = new SupabaseCharacterRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return {
      characters: new RoutingCharacterRepository(supa, guests),
      wallets: new RoutingWalletRepository(new SupabaseWalletRepository(supa.db), guestWallets),
    };
  }
  return { characters: guests, wallets: guestWallets };
}

export type { CharacterRepository, CharacterRecord, CharacterUpdate, PositionUpdate } from "./CharacterRepository.js";
export { InsufficientFunds, type WalletRepository } from "./WalletRepository.js";
