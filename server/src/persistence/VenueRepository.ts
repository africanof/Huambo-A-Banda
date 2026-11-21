import type { SupabaseClient } from "@supabase/supabase-js";

/** Um estabelecimento real do mapa (interior) comprado por um jogador. */
export interface OwnedVenue {
  interiorId: string;
  owner: string;
  ownerName: string;
  bairro: string;
  venue: string;
  nome: string;
  nivel: number;
  caixa: number;
  investido: number;
  lastTick: number;
  version: number;
}

export interface VenueRepository {
  get(interiorId: string): Promise<OwnedVenue | null>;
  byOwner(owner: string): Promise<OwnedVenue[]>;
  byBairro(bairro: string): Promise<OwnedVenue[]>;
  /** compra: só se ninguém for dono (devolve null se já tiver dono) */
  claim(v: Omit<OwnedVenue, "version">): Promise<OwnedVenue | null>;
  save(v: OwnedVenue): Promise<boolean>;
  release(interiorId: string, version: number): Promise<boolean>;
}

const clone = (v: OwnedVenue): OwnedVenue => ({ ...v });

export class MemoryVenueRepository implements VenueRepository {
  private readonly rows = new Map<string, OwnedVenue>();
  async get(id: string): Promise<OwnedVenue | null> {
    const r = this.rows.get(id);
    return r ? clone(r) : null;
  }
  async byOwner(owner: string): Promise<OwnedVenue[]> {
    return [...this.rows.values()].filter((v) => v.owner === owner).map(clone);
  }
  async byBairro(bairro: string): Promise<OwnedVenue[]> {
    return [...this.rows.values()].filter((v) => v.bairro === bairro).map(clone);
  }
  async claim(v: Omit<OwnedVenue, "version">): Promise<OwnedVenue | null> {
    if (this.rows.has(v.interiorId)) return null;
    const row = { ...v, version: 0 };
    this.rows.set(v.interiorId, row);
    return clone(row);
  }
  async save(v: OwnedVenue): Promise<boolean> {
    const cur = this.rows.get(v.interiorId);
    if (!cur || cur.version !== v.version || cur.owner !== v.owner) return false;
    this.rows.set(v.interiorId, { ...v, version: v.version + 1 });
    return true;
  }
  async release(id: string, version: number): Promise<boolean> {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== version) return false;
    this.rows.delete(id);
    return true;
  }
}

interface Row {
  interior_id: string;
  owner: string;
  owner_name: string;
  bairro: string;
  venue: string;
  nome: string;
  nivel: number;
  caixa: number;
  investido: number;
  last_tick: string;
  version: number;
}
const fromRow = (r: Row): OwnedVenue => ({
  interiorId: r.interior_id,
  owner: r.owner,
  ownerName: r.owner_name,
  bairro: r.bairro,
  venue: r.venue,
  nome: r.nome,
  nivel: Number(r.nivel),
  caixa: Number(r.caixa),
  investido: Number(r.investido),
  lastTick: Date.parse(r.last_tick),
  version: Number(r.version),
});

/** Supabase: game_venues (um dono por interior; gravação por versão). */
export class SupabaseVenueRepository implements VenueRepository {
  constructor(private readonly db: SupabaseClient) {}
  async get(id: string): Promise<OwnedVenue | null> {
    const { data, error } = await this.db.from("game_venues").select("*").eq("interior_id", id).maybeSingle<Row>();
    if (error) throw new Error(`game_venues.select: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  async byOwner(owner: string): Promise<OwnedVenue[]> {
    const { data, error } = await this.db.from("game_venues").select("*").eq("owner", owner);
    if (error) throw new Error(`game_venues.select: ${error.message}`);
    return ((data ?? []) as Row[]).map(fromRow);
  }
  async byBairro(bairro: string): Promise<OwnedVenue[]> {
    const { data, error } = await this.db.from("game_venues").select("*").eq("bairro", bairro);
    if (error) throw new Error(`game_venues.select: ${error.message}`);
    return ((data ?? []) as Row[]).map(fromRow);
  }
  async claim(v: Omit<OwnedVenue, "version">): Promise<OwnedVenue | null> {
    const { data, error } = await this.db
      .from("game_venues")
      .insert({
        interior_id: v.interiorId,
        owner: v.owner,
        owner_name: v.ownerName.slice(0, 40),
        bairro: v.bairro,
        venue: v.venue,
        nome: v.nome.slice(0, 60),
        nivel: v.nivel,
        caixa: v.caixa,
        investido: v.investido,
        last_tick: new Date(v.lastTick).toISOString(),
      })
      .select("*")
      .single<Row>();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return null;
      throw new Error(`game_venues.insert: ${error.message}`);
    }
    return fromRow(data);
  }
  async save(v: OwnedVenue): Promise<boolean> {
    const { data, error } = await this.db
      .from("game_venues")
      .update({ nivel: v.nivel, caixa: v.caixa, investido: v.investido, last_tick: new Date(v.lastTick).toISOString(), version: v.version + 1 })
      .eq("interior_id", v.interiorId)
      .eq("owner", v.owner)
      .eq("version", v.version)
      .select("interior_id");
    if (error) throw new Error(`game_venues.update: ${error.message}`);
    return (data ?? []).length === 1;
  }
  async release(id: string, version: number): Promise<boolean> {
    const { data, error } = await this.db.from("game_venues").delete().eq("interior_id", id).eq("version", version).select("interior_id");
    if (error) throw new Error(`game_venues.delete: ${error.message}`);
    return (data ?? []).length === 1;
  }
}
