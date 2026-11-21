import type { SupabaseClient } from "@supabase/supabase-js";

export class InsufficientFunds extends Error {
  constructor() {
    super("insufficient funds");
  }
}

/**
 * Carteira de jogo (Kz). TODA a alteração de dinheiro passa por apply(), que é
 * atómica e idempotente: repetir a mesma chave não duplica o movimento.
 */
export interface WalletRepository {
  balance(characterId: string): Promise<number>;
  /** Aplica um movimento (positivo ou negativo). Lança InsufficientFunds se o saldo ficasse negativo. */
  apply(characterId: string, amount: number, reason: string, key: string): Promise<number>;
  /** Últimos movimentos (mais recente primeiro), para o extrato. */
  history(characterId: string, limit: number): Promise<WalletMove[]>;
}

export interface WalletMove {
  amount: number;
  balance: number;
  reason: string;
  at: number;
}

/** Convidados, desenvolvimento e testes. */
export class MemoryWalletRepository implements WalletRepository {
  private readonly balances = new Map<string, number>();
  private readonly applied = new Map<string, number>();
  private readonly moves = new Map<string, WalletMove[]>();

  async history(characterId: string, limit: number): Promise<WalletMove[]> {
    return (this.moves.get(characterId) ?? []).slice(-limit).reverse();
  }

  async balance(characterId: string): Promise<number> {
    return this.balances.get(characterId) ?? 0;
  }

  async apply(characterId: string, amount: number, _reason: string, key: string): Promise<number> {
    const done = this.applied.get(key);
    if (done !== undefined) return done;
    const next = (this.balances.get(characterId) ?? 0) + Math.round(amount);
    if (next < 0) throw new InsufficientFunds();
    this.balances.set(characterId, next);
    this.applied.set(key, next);
    if (Math.round(amount) !== 0) {
      const m = this.moves.get(characterId) ?? [];
      m.push({ amount: Math.round(amount), balance: next, reason: _reason, at: Date.now() });
      this.moves.set(characterId, m.slice(-50));
    }
    if (this.applied.size > 200_000) this.applied.clear();
    return next;
  }
}

/** Supabase: livro-razão imutável + função game_wallet_apply (só service_role). */
export class SupabaseWalletRepository implements WalletRepository {
  constructor(private readonly db: SupabaseClient) {}

  async balance(characterId: string): Promise<number> {
    const { data, error } = await this.db.from("wallets").select("balance").eq("character_id", characterId).maybeSingle<{ balance: number }>();
    if (error) throw new Error(`wallets.select: ${error.message}`);
    return Number(data?.balance ?? 0);
  }

  async history(characterId: string, limit: number): Promise<WalletMove[]> {
    const { data, error } = await this.db
      .from("wallet_transactions")
      .select("amount, balance_after, reason, created_at")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`wallet_transactions.select: ${error.message}`);
    return (data ?? []).map((r: { amount: number; balance_after: number; reason: string; created_at: string }) => ({
      amount: Number(r.amount),
      balance: Number(r.balance_after),
      reason: r.reason,
      at: Date.parse(r.created_at),
    }));
  }

  async apply(characterId: string, amount: number, reason: string, key: string): Promise<number> {
    const { data, error } = await this.db.rpc("game_wallet_apply", {
      p_character_id: characterId,
      p_amount: Math.round(amount),
      p_reason: reason,
      p_idempotency_key: key,
    });
    if (error) {
      if (/insufficient funds/i.test(error.message)) throw new InsufficientFunds();
      throw new Error(`game_wallet_apply: ${error.message}`);
    }
    return Number(data);
  }
}

/** Encaminha convidados (personagens "mem-…") para memória e contas para o Supabase. */
export class RoutingWalletRepository implements WalletRepository {
  constructor(
    private readonly users: WalletRepository,
    private readonly guests: WalletRepository,
  ) {}

  private pick(id: string): WalletRepository {
    return id.startsWith("mem-") ? this.guests : this.users;
  }

  balance(characterId: string): Promise<number> {
    return this.pick(characterId).balance(characterId);
  }

  apply(characterId: string, amount: number, reason: string, key: string): Promise<number> {
    return this.pick(characterId).apply(characterId, amount, reason, key);
  }

  history(characterId: string, limit: number): Promise<WalletMove[]> {
    return this.pick(characterId).history(characterId, limit);
  }
}
