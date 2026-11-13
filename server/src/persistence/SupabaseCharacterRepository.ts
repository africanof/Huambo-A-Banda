import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Identity } from "../auth/TokenVerifier.js";
import { defaultAppearance, type CharacterRecord, type CharacterRepository, type PositionUpdate } from "./CharacterRepository.js";

interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  appearance: { body?: number; shirt?: number } | null;
  last_district: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

const COLUMNS = "id, owner_id, name, appearance, last_district, pos_x, pos_y";

/**
 * Persistência real no Supabase (PostgreSQL), usando a chave de serviço.
 * Esta chave ignora RLS, por isso existe APENAS no servidor de jogo.
 */
export class SupabaseCharacterRepository implements CharacterRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async loadOrCreate(identity: Identity): Promise<CharacterRecord> {
    const { data, error } = await this.db
      .from("characters")
      .select(COLUMNS)
      .eq("owner_id", identity.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<CharacterRow>();
    if (error) throw new Error(`characters.select: ${error.message}`);
    if (data) return toRecord(data);

    const insert = {
      owner_id: identity.userId,
      name: identity.displayName ?? `Morador${Math.floor(1000 + Math.random() * 9000)}`,
      appearance: defaultAppearance(identity.userId),
    };
    const created = await this.db.from("characters").insert(insert).select(COLUMNS).single<CharacterRow>();
    if (created.error) throw new Error(`characters.insert: ${created.error.message}`);
    return toRecord(created.data);
  }

  async savePositions(updates: PositionUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    // Uma única chamada RPC por lote em vez de N updates (ver migração game_save_positions).
    const { error } = await this.db.rpc("game_save_positions", {
      payload: updates.map((u) => ({ id: u.id, district: u.district, x: Math.round(u.x), y: Math.round(u.y) })),
    });
    if (error) throw new Error(`game_save_positions: ${error.message}`);
  }
}

function toRecord(r: CharacterRow): CharacterRecord {
  const fallback = defaultAppearance(r.owner_id);
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    appearance: { body: r.appearance?.body ?? fallback.body, shirt: r.appearance?.shirt ?? fallback.shirt },
    district: r.last_district,
    x: r.pos_x,
    y: r.pos_y,
  };
}
