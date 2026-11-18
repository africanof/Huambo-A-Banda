import type { SupabaseClient } from "@supabase/supabase-js";
import { InsufficientFunds, type WalletRepository } from "./WalletRepository.js";

/** Quem tem uma fração (casa ou apartamento) e até quando. */
export interface Holding {
  district: string;
  unit: string;
  characterId: string;
  tenure: "buy" | "rent";
  /** ms; null = comprada (para sempre) */
  paidUntil: number | null;
}

export class PropertyTaken extends Error {
  constructor(readonly already = false) {
    super(already ? "already owner" : "property taken");
  }
}

/**
 * Casas e apartamentos. claim() cobra e atribui de forma atómica:
 * nunca há duas pessoas com a mesma fração nem cobrança sem casa.
 */
export interface PropertyRepository {
  /** Fração com dono ativo (comprada ou renda em dia), ou null se estiver livre. */
  get(district: string, unit: string, now: number): Promise<Holding | null>;
  /** Comprar (days = null) ou arrendar por `days` dias. Lança PropertyTaken / InsufficientFunds. */
  claim(district: string, unit: string, characterId: string, days: number | null, price: number, key: string, now: number): Promise<Holding>;
}

const active = (h: Holding | undefined, now: number): h is Holding => !!h && (h.tenure === "buy" || (h.paidUntil ?? 0) > now);

/** Convidados, desenvolvimento e testes. */
export class MemoryPropertyRepository implements PropertyRepository {
  private readonly rows = new Map<string, Holding>();

  constructor(private readonly wallets: WalletRepository) {}

  async get(district: string, unit: string, now: number): Promise<Holding | null> {
    const h = this.rows.get(`${district}:${unit}`);
    return active(h, now) ? h : null;
  }

  async claim(district: string, unit: string, characterId: string, days: number | null, price: number, key: string, now: number): Promise<Holding> {
    const k = `${district}:${unit}`;
    const h = this.rows.get(k);
    const isActive = active(h, now);
    if (isActive && h.characterId !== characterId) throw new PropertyTaken();
    if (isActive && h.tenure === "buy") throw new PropertyTaken(true);
    await this.wallets.apply(characterId, -price, days === null ? "house.buy" : "house.rent", key);
    const next: Holding = {
      district,
      unit,
      characterId,
      tenure: days === null ? "buy" : "rent",
      paidUntil: days === null ? null : (isActive ? h.paidUntil! : now) + days * 86_400_000,
    };
    this.rows.set(k, next);
    return next;
  }
}

interface HouseRow {
  district: string;
  plot_key: string;
  owner_character_id: string | null;
  tenure: "buy" | "rent" | null;
  paid_until: string | null;
}

const fromRow = (r: HouseRow): Holding | null =>
  r.owner_character_id && r.tenure
    ? { district: r.district, unit: r.plot_key, characterId: r.owner_character_id, tenure: r.tenure, paidUntil: r.paid_until ? Date.parse(r.paid_until) : null }
    : null;

/** Supabase: tabela houses + função game_property_claim (só service_role). */
export class SupabasePropertyRepository implements PropertyRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(district: string, unit: string, now: number): Promise<Holding | null> {
    const { data, error } = await this.db
      .from("houses")
      .select("district, plot_key, owner_character_id, tenure, paid_until")
      .eq("district", district)
      .eq("plot_key", unit)
      .maybeSingle<HouseRow>();
    if (error) throw new Error(`houses.select: ${error.message}`);
    const h = data ? fromRow(data) : null;
    return h && active(h, now) ? h : null;
  }

  async claim(district: string, unit: string, characterId: string, days: number | null, price: number, key: string): Promise<Holding> {
    const { data, error } = await this.db.rpc("game_property_claim", {
      p_district: district,
      p_plot_key: unit,
      p_character_id: characterId,
      p_days: days,
      p_price: Math.round(price),
      p_idempotency_key: key,
    });
    if (error) {
      if (/insufficient funds/i.test(error.message)) throw new InsufficientFunds();
      if (/already owner/i.test(error.message)) throw new PropertyTaken(true);
      if (/property taken/i.test(error.message)) throw new PropertyTaken();
      throw new Error(`game_property_claim: ${error.message}`);
    }
    const h = fromRow(data as HouseRow);
    if (!h) throw new Error("game_property_claim: resposta vazia");
    return h;
  }
}

/** Contas reais → Supabase; convidados não podem ter casa quando há base de dados. */
export class RoutingPropertyRepository implements PropertyRepository {
  constructor(private readonly users: PropertyRepository) {}

  get(district: string, unit: string, now: number): Promise<Holding | null> {
    return this.users.get(district, unit, now);
  }

  async claim(district: string, unit: string, characterId: string, days: number | null, price: number, key: string, now: number): Promise<Holding> {
    if (characterId.startsWith("mem-")) throw new GuestNotAllowed();
    return this.users.claim(district, unit, characterId, days, price, key, now);
  }
}

export class GuestNotAllowed extends Error {
  constructor() {
    super("guest");
  }
}
