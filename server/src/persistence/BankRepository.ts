import type { SupabaseClient } from "@supabase/supabase-js";
import { InsufficientFunds, type WalletRepository } from "./WalletRepository.js";

/** Conta no banco: o dinheiro lá dentro não se gasta por engano (e no futuro não é roubado). */
export interface BankRepository {
  balance(characterId: string): Promise<number>;
  /** amount > 0 deposita, < 0 levanta. Devolve os saldos novos. */
  move(characterId: string, amount: number, key: string): Promise<{ wallet: number; bank: number }>;
}

export class MemoryBankRepository implements BankRepository {
  private readonly accounts = new Map<string, number>();
  private readonly done = new Map<string, { wallet: number; bank: number }>();

  constructor(private readonly wallets: WalletRepository) {}

  async balance(characterId: string): Promise<number> {
    return this.accounts.get(characterId) ?? 0;
  }

  async move(characterId: string, amount: number, key: string): Promise<{ wallet: number; bank: number }> {
    const prev = this.done.get(key);
    if (prev) return prev;
    const bank = (this.accounts.get(characterId) ?? 0) + Math.round(amount);
    if (bank < 0) throw new InsufficientFunds();
    const wallet = await this.wallets.apply(characterId, -Math.round(amount), amount > 0 ? "bank.deposit" : "bank.withdraw", key);
    this.accounts.set(characterId, bank);
    const r = { wallet, bank };
    this.done.set(key, r);
    return r;
  }
}

export class SupabaseBankRepository implements BankRepository {
  constructor(private readonly db: SupabaseClient) {}

  async balance(characterId: string): Promise<number> {
    const { data, error } = await this.db.from("bank_accounts").select("balance").eq("character_id", characterId).maybeSingle<{ balance: number }>();
    if (error) throw new Error(`bank_accounts.select: ${error.message}`);
    return Number(data?.balance ?? 0);
  }

  async move(characterId: string, amount: number, key: string): Promise<{ wallet: number; bank: number }> {
    const { data, error } = await this.db.rpc("game_bank_move", { p_character_id: characterId, p_amount: Math.round(amount), p_idempotency_key: key });
    if (error) {
      if (/insufficient funds/i.test(error.message)) throw new InsufficientFunds();
      throw new Error(`game_bank_move: ${error.message}`);
    }
    const [wallet, bank] = data as number[];
    return { wallet: Number(wallet), bank: Number(bank) };
  }
}

export class RoutingBankRepository implements BankRepository {
  constructor(
    private readonly users: BankRepository,
    private readonly guests: BankRepository,
  ) {}

  private pick(id: string): BankRepository {
    return id.startsWith("mem-") ? this.guests : this.users;
  }

  balance(characterId: string): Promise<number> {
    return this.pick(characterId).balance(characterId);
  }

  move(characterId: string, amount: number, key: string): Promise<{ wallet: number; bank: number }> {
    return this.pick(characterId).move(characterId, amount, key);
  }
}
