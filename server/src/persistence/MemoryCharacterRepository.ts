import type { Identity } from "../auth/TokenVerifier.js";
import { defaultAppearance, type CharacterRecord, type CharacterRepository, type PositionUpdate } from "./CharacterRepository.js";

/** Repositório em memória: convidados, desenvolvimento local sem Supabase e testes. */
export class MemoryCharacterRepository implements CharacterRepository {
  private readonly byOwner = new Map<string, CharacterRecord>();
  private readonly byId = new Map<string, CharacterRecord>();
  private seq = 0;

  async loadOrCreate(identity: Identity): Promise<CharacterRecord> {
    const existing = this.byOwner.get(identity.userId);
    if (existing) return existing;
    const id = `mem-${++this.seq}`;
    const rec: CharacterRecord = {
      id,
      ownerId: identity.userId,
      name: identity.displayName ?? `Morador${1000 + this.seq}`,
      appearance: defaultAppearance(identity.userId),
      district: null,
      x: null,
      y: null,
    };
    // Limite defensivo: convidados não devem fazer crescer a memória sem fim.
    if (this.byOwner.size > 20_000) {
      this.byOwner.clear();
      this.byId.clear();
    }
    this.byOwner.set(identity.userId, rec);
    this.byId.set(id, rec);
    return rec;
  }

  async savePositions(updates: PositionUpdate[]): Promise<void> {
    for (const u of updates) {
      const rec = this.byId.get(u.id);
      if (rec) {
        rec.district = u.district;
        rec.x = u.x;
        rec.y = u.y;
      }
    }
  }
}
