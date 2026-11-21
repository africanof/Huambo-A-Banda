import type { Identity } from "../auth/TokenVerifier.js";
import { defaultAppearance, type CharacterRecord, type CharacterRepository, type CharacterUpdate, type PositionUpdate } from "./CharacterRepository.js";

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
      life: null,
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

  async deleteAccount(identity: Identity): Promise<string | null> {
    const rec = this.byOwner.get(identity.userId);
    if (!rec) return null;
    this.byOwner.delete(identity.userId);
    this.byId.delete(rec.id);
    return rec.id;
  }

  async update(identity: Identity, changes: CharacterUpdate): Promise<CharacterRecord> {
    const rec = await this.loadOrCreate(identity);
    if (changes.name) rec.name = changes.name;
    if (changes.appearance) rec.appearance = { ...changes.appearance };
    return rec;
  }

  async savePositions(updates: PositionUpdate[]): Promise<void> {
    for (const u of updates) {
      const rec = this.byId.get(u.id);
      if (rec) {
        rec.district = u.district;
        rec.x = u.x;
        rec.y = u.y;
        if (u.life !== undefined) rec.life = u.life;
      }
    }
  }
}
