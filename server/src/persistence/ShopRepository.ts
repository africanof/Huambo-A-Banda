import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopStock } from "../game/economia.js";

/** Banca de um jogador no mercado de um bairro. */
export interface Shop {
  id: string;
  owner: string;
  ownerName: string;
  bairro: string;
  nome: string;
  caixa: number;
  stock: ShopStock;
  empregados: Array<{ id: string; name: string; salario: number }>;
  vendas: number;
  lastTick: number;
  version: number;
}

export interface ShopRepository {
  create(s: Omit<Shop, "id" | "version">): Promise<Shop | null>;
  get(id: string): Promise<Shop | null>;
  byOwner(owner: string): Promise<Shop | null>;
  byBairro(bairro: string): Promise<Shop[]>;
  /** grava se ninguém mexeu entretanto (versão igual); devolve false se houve conflito */
  save(s: Shop): Promise<boolean>;
  remove(id: string, version: number): Promise<boolean>;
}

const clone = (s: Shop): Shop => JSON.parse(JSON.stringify(s));

export class MemoryShopRepository implements ShopRepository {
  private readonly rows = new Map<string, Shop>();
  async create(s: Omit<Shop, "id" | "version">): Promise<Shop | null> {
    if ([...this.rows.values()].some((x) => x.owner === s.owner)) return null;
    const row: Shop = { ...clone(s as Shop), id: randomUUID(), version: 0 };
    this.rows.set(row.id, row);
    return clone(row);
  }
  async get(id: string): Promise<Shop | null> {
    const r = this.rows.get(id);
    return r ? clone(r) : null;
  }
  async byOwner(owner: string): Promise<Shop | null> {
    const r = [...this.rows.values()].find((x) => x.owner === owner);
    return r ? clone(r) : null;
  }
  async byBairro(bairro: string): Promise<Shop[]> {
    return [...this.rows.values()].filter((x) => x.bairro === bairro).map(clone);
  }
  async save(s: Shop): Promise<boolean> {
    const cur = this.rows.get(s.id);
    if (!cur || cur.version !== s.version) return false;
    this.rows.set(s.id, { ...clone(s), version: s.version + 1 });
    return true;
  }
  async remove(id: string, version: number): Promise<boolean> {
    const cur = this.rows.get(id);
    if (!cur || cur.version !== version) return false;
    this.rows.delete(id);
    return true;
  }
}

interface Row {
  id: string;
  owner: string;
  owner_name: string;
  bairro: string;
  nome: string;
  caixa: number;
  stock: ShopStock;
  empregados: Shop["empregados"];
  vendas: number;
  last_tick: string;
  version: number;
}
const fromRow = (r: Row): Shop => ({
  id: r.id,
  owner: r.owner,
  ownerName: r.owner_name,
  bairro: r.bairro,
  nome: r.nome,
  caixa: Number(r.caixa),
  stock: r.stock ?? {},
  empregados: Array.isArray(r.empregados) ? r.empregados : [],
  vendas: Number(r.vendas),
  lastTick: Date.parse(r.last_tick),
  version: Number(r.version),
});

/** Supabase: game_shops (só o servidor); cada gravação confere a versão (sem perder vendas em paralelo). */
export class SupabaseShopRepository implements ShopRepository {
  constructor(private readonly db: SupabaseClient) {}
  async create(s: Omit<Shop, "id" | "version">): Promise<Shop | null> {
    const { data, error } = await this.db
      .from("game_shops")
      .insert({ owner: s.owner, owner_name: s.ownerName.slice(0, 40), bairro: s.bairro, nome: s.nome, caixa: s.caixa, stock: s.stock, empregados: s.empregados, vendas: s.vendas, last_tick: new Date(s.lastTick).toISOString() })
      .select("*")
      .single<Row>();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return null;
      throw new Error(`game_shops.insert: ${error.message}`);
    }
    return fromRow(data);
  }
  async get(id: string): Promise<Shop | null> {
    const { data, error } = await this.db.from("game_shops").select("*").eq("id", id).maybeSingle<Row>();
    if (error) throw new Error(`game_shops.select: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  async byOwner(owner: string): Promise<Shop | null> {
    const { data, error } = await this.db.from("game_shops").select("*").eq("owner", owner).maybeSingle<Row>();
    if (error) throw new Error(`game_shops.select: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  async byBairro(bairro: string): Promise<Shop[]> {
    const { data, error } = await this.db.from("game_shops").select("*").eq("bairro", bairro).order("vendas", { ascending: false }).limit(30);
    if (error) throw new Error(`game_shops.select: ${error.message}`);
    return ((data ?? []) as Row[]).map(fromRow);
  }
  async save(s: Shop): Promise<boolean> {
    const { data, error } = await this.db
      .from("game_shops")
      .update({ caixa: s.caixa, stock: s.stock, empregados: s.empregados, vendas: s.vendas, last_tick: new Date(s.lastTick).toISOString(), nome: s.nome, version: s.version + 1 })
      .eq("id", s.id)
      .eq("version", s.version)
      .select("id");
    if (error) throw new Error(`game_shops.update: ${error.message}`);
    return (data ?? []).length === 1;
  }
  async remove(id: string, version: number): Promise<boolean> {
    const { data, error } = await this.db.from("game_shops").delete().eq("id", id).eq("version", version).select("id");
    if (error) throw new Error(`game_shops.delete: ${error.message}`);
    return (data ?? []).length === 1;
  }
}
