import { MemoryKixikilaRepository, SupabaseKixikilaRepository, type KixikilaRepository } from "./KixikilaRepository.js";
import { MemoryReportRepository, SupabaseReportRepository, type ReportRepository } from "./ReportRepository.js";
import { MemoryListingRepository, SupabaseListingRepository, type ListingRepository } from "./ListingRepository.js";
import { MemoryPostRepository, SupabasePostRepository, type PostRepository } from "./PostRepository.js";
import { MemoryGroupRepository, SupabaseGroupRepository, type GroupRepository } from "./GroupRepository.js";
import type { Env } from "../config/env.js";
import type { Identity } from "../auth/TokenVerifier.js";
import type { CharacterRecord, CharacterRepository, CharacterUpdate, PositionUpdate } from "./CharacterRepository.js";
import { MemoryCharacterRepository } from "./MemoryCharacterRepository.js";
import { SupabaseCharacterRepository } from "./SupabaseCharacterRepository.js";
import { MemoryWalletRepository, RoutingWalletRepository, SupabaseWalletRepository, type WalletRepository } from "./WalletRepository.js";
import { MemoryPropertyRepository, RoutingPropertyRepository, SupabasePropertyRepository, type PropertyRepository } from "./PropertyRepository.js";
import { MemoryBankRepository, RoutingBankRepository, SupabaseBankRepository, type BankRepository } from "./BankRepository.js";

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

export interface Repositories {
  characters: CharacterRepository;
  wallets: WalletRepository;
  properties: PropertyRepository;
  bank: BankRepository;
  groups: GroupRepository;
  posts: PostRepository;
  kixikila: KixikilaRepository;
  listings: ListingRepository;
  reports: ReportRepository;
}

/**
 * Convidados em memória, contas no Supabase (quando configurado).
 * Sem base de dados (testes, demonstração) tudo vive em memória — incluindo casas.
 */
export function createRepositories(env: Env): Repositories {
  const guests = new MemoryCharacterRepository();
  const guestWallets = new MemoryWalletRepository();
  const guestBank = new MemoryBankRepository(guestWallets);
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const supa = new SupabaseCharacterRepository(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return {
      characters: new RoutingCharacterRepository(supa, guests),
      wallets: new RoutingWalletRepository(new SupabaseWalletRepository(supa.db), guestWallets),
      properties: new RoutingPropertyRepository(new SupabasePropertyRepository(supa.db)),
      bank: new RoutingBankRepository(new SupabaseBankRepository(supa.db), guestBank),
      groups: new SupabaseGroupRepository(supa.db),
      posts: new SupabasePostRepository(supa.db),
      kixikila: new SupabaseKixikilaRepository(supa.db),
      listings: new SupabaseListingRepository(supa.db),
      reports: new SupabaseReportRepository(supa.db),
    };
  }
  return { characters: guests, wallets: guestWallets, properties: new MemoryPropertyRepository(guestWallets), bank: guestBank, groups: new MemoryGroupRepository(), posts: new MemoryPostRepository(), kixikila: new MemoryKixikilaRepository(), listings: new MemoryListingRepository(), reports: new MemoryReportRepository() };
}

export type { CharacterRepository, CharacterRecord, CharacterUpdate, PositionUpdate } from "./CharacterRepository.js";
export { InsufficientFunds, type WalletRepository } from "./WalletRepository.js";
export { PropertyTaken, GuestNotAllowed, MemoryPropertyRepository, type PropertyRepository, type Holding } from "./PropertyRepository.js";
export { MemoryBankRepository, type BankRepository } from "./BankRepository.js";
export { MemoryPostRepository, type Post, type PostRepository } from "./PostRepository.js";
export { MemoryGroupRepository, GroupNameTaken, type Group, type GroupRepository } from "./GroupRepository.js";
