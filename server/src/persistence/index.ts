import { MemoryKixikilaRepository, SupabaseKixikilaRepository, type KixikilaRepository } from "./KixikilaRepository.js";
import { MemorySanctionRepository, SupabaseSanctionRepository, type SanctionRepository } from "./SanctionRepository.js";
import { MemoryVenueRepository, SupabaseVenueRepository, type VenueRepository } from "./VenueRepository.js";
import { MemoryShopRepository, SupabaseShopRepository, type ShopRepository } from "./ShopRepository.js";
import { MemoryAssociationRepository, SupabaseAssociationRepository, type AssociationRepository } from "./AssociationRepository.js";
import { MemoryMarketRepository, SupabaseMarketRepository, type MarketRepository } from "./MarketRepository.js";
import { MemoryInboxRepository, RoutingInboxRepository, SupabaseInboxRepository, type InboxRepository } from "./InboxRepository.js";
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

  deleteAccount(identity: Identity): Promise<string | null> {
    return (identity.kind === "guest" ? this.guests : this.users).deleteAccount(identity);
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
  inbox: InboxRepository;
  sanctions: SanctionRepository;
  market: MarketRepository;
  assoc: AssociationRepository;
  shops: ShopRepository;
  venues: VenueRepository;
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
      inbox: new RoutingInboxRepository(new SupabaseInboxRepository(supa.db)),
      sanctions: new SupabaseSanctionRepository(supa.db),
      market: new SupabaseMarketRepository(supa.db),
      assoc: new SupabaseAssociationRepository(supa.db),
      shops: new SupabaseShopRepository(supa.db),
      venues: new SupabaseVenueRepository(supa.db),
    };
  }
  return { characters: guests, wallets: guestWallets, properties: new MemoryPropertyRepository(guestWallets), bank: guestBank, groups: new MemoryGroupRepository(), posts: new MemoryPostRepository(), kixikila: new MemoryKixikilaRepository(), listings: new MemoryListingRepository(), reports: new MemoryReportRepository(), inbox: new MemoryInboxRepository(), sanctions: new MemorySanctionRepository(), market: new MemoryMarketRepository(), assoc: new MemoryAssociationRepository(), shops: new MemoryShopRepository(), venues: new MemoryVenueRepository() };
}

export type { CharacterRepository, CharacterRecord, CharacterUpdate, PositionUpdate } from "./CharacterRepository.js";
export { InsufficientFunds, type WalletRepository } from "./WalletRepository.js";
export { PropertyTaken, GuestNotAllowed, MemoryPropertyRepository, type PropertyRepository, type Holding } from "./PropertyRepository.js";
export { MemoryBankRepository, type BankRepository } from "./BankRepository.js";
export { MemoryPostRepository, type Post, type PostRepository } from "./PostRepository.js";
export { MemoryGroupRepository, GroupNameTaken, type Group, type GroupRepository } from "./GroupRepository.js";
