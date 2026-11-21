import type { SupabaseClient } from "@supabase/supabase-js";

/** Castigo de moderação de uma personagem: silenciada (não fala) e/ou banida (não entra) até uma data. */
export interface Sanction {
  characterId: string;
  name: string;
  muteUntil: number; // ms; 0 = não
  banUntil: number; // ms; 0 = não
  reason: string;
  at: number;
}

export interface SanctionRepository {
  get(characterId: string): Promise<Sanction | null>;
  set(s: Omit<Sanction, "at">): Promise<void>;
  /** castigos em vigor (para o painel) */
  active(nowMs: number, limit: number): Promise<Sanction[]>;
}

export class MemorySanctionRepository implements SanctionRepository {
  private readonly rows = new Map<string, Sanction>();
  async get(id: string): Promise<Sanction | null> {
    return this.rows.get(id) ?? null;
  }
  async set(s: Omit<Sanction, "at">): Promise<void> {
    this.rows.set(s.characterId, { ...s, at: Date.now() });
  }
  async active(now: number, limit: number): Promise<Sanction[]> {
    return [...this.rows.values()].filter((s) => s.muteUntil > now || s.banUntil > now).slice(-limit).reverse();
  }
}

interface Row {
  character_id: string;
  name: string;
  muted_until: string | null;
  banned_until: string | null;
  reason: string;
  updated_at: string;
}
const ms = (v: string | null) => (v ? Date.parse(v) : 0);
const iso = (v: number) => (v > 0 ? new Date(v).toISOString() : null);
const fromRow = (r: Row): Sanction => ({ characterId: r.character_id, name: r.name, muteUntil: ms(r.muted_until), banUntil: ms(r.banned_until), reason: r.reason, at: Date.parse(r.updated_at) });

/** Supabase: tabela game_sanctions (uma linha por personagem; só o servidor lê e escreve). */
export class SupabaseSanctionRepository implements SanctionRepository {
  constructor(private readonly db: SupabaseClient) {}
  async get(id: string): Promise<Sanction | null> {
    const { data, error } = await this.db.from("game_sanctions").select("*").eq("character_id", id).maybeSingle<Row>();
    if (error) throw new Error(`game_sanctions.select: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  async set(s: Omit<Sanction, "at">): Promise<void> {
    const { error } = await this.db.from("game_sanctions").upsert({
      character_id: s.characterId,
      name: s.name.slice(0, 40),
      muted_until: iso(s.muteUntil),
      banned_until: iso(s.banUntil),
      reason: s.reason.slice(0, 200),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`game_sanctions.upsert: ${error.message}`);
  }
  async active(now: number, limit: number): Promise<Sanction[]> {
    const t = new Date(now).toISOString();
    const { data, error } = await this.db.from("game_sanctions").select("*").or(`muted_until.gt.${t},banned_until.gt.${t}`).order("updated_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`game_sanctions.select: ${error.message}`);
    return ((data ?? []) as Row[]).map(fromRow);
  }
}
