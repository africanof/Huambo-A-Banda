import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Identity } from "../auth/TokenVerifier.js";
import { defaultAppearance, type CharacterRecord, type CharacterRepository, type CharacterUpdate, type PositionUpdate } from "./CharacterRepository.js";

interface CharacterRow {
  id: string;
  owner_id: string;
  name: string;
  appearance: { body?: number; shirt?: number; hair?: number; pants?: number } | null;
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
      global: { fetch: newKeyFetch(serviceKey) },
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

  async update(identity: Identity, changes: CharacterUpdate): Promise<CharacterRecord> {
    const current = await this.loadOrCreate(identity);
    const patch: Record<string, unknown> = {};
    if (changes.name) patch.name = changes.name;
    if (changes.appearance) patch.appearance = changes.appearance;
    if (Object.keys(patch).length === 0) return current;
    const { data, error } = await this.db.from("characters").update(patch).eq("id", current.id).select(COLUMNS).single<CharacterRow>();
    if (error) throw new Error(`characters.update: ${error.message}`);
    return toRecord(data);
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

/**
 * Chaves novas do Supabase (sb_secret_… / sb_publishable_…) vão só no cabeçalho
 * `apikey`; não são JWT, por isso não as enviamos em `Authorization`.
 * Chaves legadas (JWT service_role) continuam a usar os dois cabeçalhos.
 */
export function newKeyFetch(key: string): typeof fetch {
  if (!key.startsWith("sb_")) return fetch;
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    return fetch(input, { ...init, headers });
  };
}

function toRecord(r: CharacterRow): CharacterRecord {
  const fallback = defaultAppearance(r.owner_id);
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    appearance: {
      body: r.appearance?.body ?? fallback.body,
      shirt: r.appearance?.shirt ?? fallback.shirt,
      hair: r.appearance?.hair ?? fallback.hair,
      pants: r.appearance?.pants ?? fallback.pants,
    },
    district: r.last_district,
    x: r.pos_x,
    y: r.pos_y,
  };
}
