import type { KixikilaRepository } from "./persistence/KixikilaRepository.js";
import type { ListingRepository } from "./persistence/ListingRepository.js";
import type { ReportRepository } from "./persistence/ReportRepository.js";
import type { InboxRepository } from "./persistence/InboxRepository.js";
import type { SanctionRepository } from "./persistence/SanctionRepository.js";
import type { MarketRepository } from "./persistence/MarketRepository.js";
import type { AssociationRepository } from "./persistence/AssociationRepository.js";
import type { ShopRepository } from "./persistence/ShopRepository.js";
import type { VenueRepository } from "./persistence/VenueRepository.js";
import type { PostRepository } from "./persistence/PostRepository.js";
import type { GroupRepository } from "./persistence/GroupRepository.js";
import type { Env } from "./config/env.js";
import type { TokenVerifier } from "./auth/TokenVerifier.js";
import type { BankRepository, CharacterRepository, PropertyRepository, WalletRepository } from "./persistence/index.js";

/**
 * Contentor de dependências partilhadas pelas salas.
 * O Colyseus instancia as salas por si e o onAuth é estático, por isso
 * injetamos as dependências aqui no arranque (e nos testes).
 */
export interface Services {
  env: Env;
  verifier: TokenVerifier;
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

let current: Services | undefined;

export function setServices(s: Services): void {
  current = s;
}

export function services(): Services {
  if (!current) throw new Error("services not initialized");
  return current;
}
