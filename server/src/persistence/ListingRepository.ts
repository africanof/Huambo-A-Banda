import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/** Classificados: um jogador põe à venda colheita ou dólares (ficam guardados no anúncio) e outro compra. */
export interface Listing {
  id: string;
  seller: string;
  sellerName: string;
  bairro: string;
  item: string; // "milho" | "feijao" | "batata_doce" | "usd"
  qty: number;
  price: number;
  status: "open" | "sold" | "cancelled";
  at: number;
}

export interface ListingRepository {
  open(limit: number): Promise<Listing[]>;
  create(l: Omit<Listing, "id" | "status" | "at">): Promise<Listing>;
  /** passa de aberto → vendido (só um comprador ganha); devolve o anúncio ou null */
  take(id: string, buyer: string): Promise<Listing | null>;
  /** o vendedor retira o anúncio (só se ainda estiver aberto) */
  cancel(id: string, seller: string): Promise<Listing | null>;
  countOpen(seller: string): Promise<number>;
}

export class MemoryListingRepository implements ListingRepository {
  private readonly rows: Listing[] = [];
  async open(limit: number): Promise<Listing[]> {
    return this.rows.filter((l) => l.status === "open").slice(-limit).reverse();
  }
  async create(l: Omit<Listing, "id" | "status" | "at">): Promise<Listing> {
    const row: Listing = { ...l, id: randomUUID(), status: "open", at: Date.now() };
    this.rows.push(row);
    return { ...row };
  }
  async take(id: string, _buyer: string): Promise<Listing | null> {
    const l = this.rows.find((x) => x.id === id && x.status === "open");
    if (!l) return null;
    l.status = "sold";
    return { ...l };
  }
  async cancel(id: string, seller: string): Promise<Listing | null> {
    const l = this.rows.find((x) => x.id === id && x.status === "open" && x.seller === seller);
    if (!l) return null;
    l.status = "cancelled";
    return { ...l };
  }
  async countOpen(seller: string): Promise<number> {
    return this.rows.filter((l) => l.seller === seller && l.status === "open").length;
  }
}

const fromRow = (r: Record<string, unknown>): Listing => ({
  id: String(r.id),
  seller: String(r.seller),
  sellerName: String(r.seller_name),
  bairro: String(r.bairro),
  item: String(r.item),
  qty: Number(r.qty),
  price: Number(r.price),
  status: r.status as Listing["status"],
  at: Date.parse(String(r.created_at)),
});

export class SupabaseListingRepository implements ListingRepository {
  constructor(private readonly db: SupabaseClient) {}
  async open(limit: number): Promise<Listing[]> {
    const { data, error } = await this.db.from("game_listings").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`game_listings.select: ${error.message}`);
    return (data ?? []).map(fromRow);
  }
  async create(l: Omit<Listing, "id" | "status" | "at">): Promise<Listing> {
    const { data, error } = await this.db
      .from("game_listings")
      .insert({ seller: l.seller, seller_name: l.sellerName, bairro: l.bairro, item: l.item, qty: l.qty, price: l.price })
      .select("*")
      .single();
    if (error) throw new Error(`game_listings.insert: ${error.message}`);
    return fromRow(data);
  }
  private async flip(id: string, to: "sold" | "cancelled", extra: Record<string, unknown>, sellerOnly?: string): Promise<Listing | null> {
    let q = this.db.from("game_listings").update({ status: to, ...extra }).eq("id", id).eq("status", "open");
    if (sellerOnly) q = q.eq("seller", sellerOnly);
    const { data, error } = await q.select("*");
    if (error) throw new Error(`game_listings.update: ${error.message}`);
    return data && data.length ? fromRow(data[0]!) : null;
  }
  take(id: string, buyer: string) {
    return this.flip(id, "sold", { buyer });
  }
  cancel(id: string, seller: string) {
    return this.flip(id, "cancelled", {}, seller);
  }
  async countOpen(seller: string): Promise<number> {
    const { count, error } = await this.db.from("game_listings").select("id", { count: "exact", head: true }).eq("seller", seller).eq("status", "open");
    if (error) throw new Error(`game_listings.count: ${error.message}`);
    return count ?? 0;
  }
}
