import type { SupabaseClient } from "@supabase/supabase-js";
import { MARKET_ITEMS, afterTrade, recovered } from "../game/economia.js";

/** Mercado vivo: um preço partilhado por produto (o mesmo para todas as salas). */
export interface MarketRepository {
  /** preços atuais (já com a recuperação do tempo) */
  prices(nowMs: number): Promise<Record<string, number>>;
  /** regista uma troca (qty > 0 vendido ao mercado, < 0 comprado) e devolve o preço novo */
  trade(item: string, qty: number, nowMs: number): Promise<number>;
}

export class MemoryMarketRepository implements MarketRepository {
  private readonly rows = new Map<string, { price: number; at: number }>();
  private current(item: string, now: number): number {
    const base = MARKET_ITEMS[item]!.base;
    const r = this.rows.get(item);
    return r ? recovered(r.price, base, (now - r.at) / 3600_000) : base;
  }
  async prices(now: number): Promise<Record<string, number>> {
    return Object.fromEntries(Object.keys(MARKET_ITEMS).map((k) => [k, this.current(k, now)]));
  }
  async trade(item: string, qty: number, now: number): Promise<number> {
    const m = MARKET_ITEMS[item];
    if (!m) throw new Error(`produto desconhecido: ${item}`);
    const p = afterTrade(this.current(item, now), m.base, m.step, qty);
    this.rows.set(item, { price: p, at: now });
    return p;
  }
}

/** Supabase: tabela game_market e função atómica game_market_trade (só o servidor). */
export class SupabaseMarketRepository implements MarketRepository {
  constructor(private readonly db: SupabaseClient) {}
  async prices(now: number): Promise<Record<string, number>> {
    const { data, error } = await this.db.from("game_market").select("item, price, updated_at");
    if (error) throw new Error(`game_market.select: ${error.message}`);
    const rows = new Map(((data ?? []) as Array<{ item: string; price: number; updated_at: string }>).map((r) => [r.item, r]));
    return Object.fromEntries(
      Object.entries(MARKET_ITEMS).map(([k, m]) => {
        const r = rows.get(k);
        return [k, r ? recovered(Number(r.price), m.base, (now - Date.parse(r.updated_at)) / 3600_000) : m.base];
      }),
    );
  }
  async trade(item: string, qty: number): Promise<number> {
    const m = MARKET_ITEMS[item];
    if (!m) throw new Error(`produto desconhecido: ${item}`);
    const { data, error } = await this.db.rpc("game_market_trade", { p_item: item, p_base: m.base, p_step: m.step, p_qty: qty, p_recovery_h: 24 });
    if (error) throw new Error(`game_market_trade: ${error.message}`);
    return Number(data);
  }
}
