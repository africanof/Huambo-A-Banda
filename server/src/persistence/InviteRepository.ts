import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Convites: cada jogador tem um código; quem entra com ele fica ligado a quem convidou. */
export interface InviteRepository {
  /** código do jogador (cria na primeira vez) */
  codeFor(owner: string, ownerName: string): Promise<string>;
  ownerOf(code: string): Promise<{ owner: string; ownerName: string } | null>;
  /** regista que «invitee» usou o código (só uma vez por pessoa); false se já tinha usado um */
  use(invitee: string, inviteeName: string, code: string, owner: string): Promise<boolean>;
  usedBy(invitee: string): Promise<{ code: string; owner: string; rewarded: boolean } | null>;
  /** marca como premiado (uma só vez); devolve o dono se ainda não estava */
  reward(invitee: string): Promise<string | null>;
  stats(owner: string): Promise<{ convidados: number; premiados: number }>;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newInviteCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6}$/.test(c) ? c : null;
}

export class MemoryInviteRepository implements InviteRepository {
  private readonly codes = new Map<string, { owner: string; ownerName: string }>();
  private readonly byOwner = new Map<string, string>();
  private readonly uses = new Map<string, { code: string; owner: string; rewarded: boolean }>();
  async codeFor(owner: string, ownerName: string): Promise<string> {
    const have = this.byOwner.get(owner);
    if (have) return have;
    let c = newInviteCode();
    while (this.codes.has(c)) c = newInviteCode();
    this.codes.set(c, { owner, ownerName });
    this.byOwner.set(owner, c);
    return c;
  }
  async ownerOf(code: string) {
    return this.codes.get(code) ?? null;
  }
  async use(invitee: string, _name: string, code: string, owner: string): Promise<boolean> {
    if (this.uses.has(invitee)) return false;
    this.uses.set(invitee, { code, owner, rewarded: false });
    return true;
  }
  async usedBy(invitee: string) {
    return this.uses.get(invitee) ?? null;
  }
  async reward(invitee: string): Promise<string | null> {
    const u = this.uses.get(invitee);
    if (!u || u.rewarded) return null;
    u.rewarded = true;
    return u.owner;
  }
  async stats(owner: string) {
    const all = [...this.uses.values()].filter((u) => u.owner === owner);
    return { convidados: all.length, premiados: all.filter((u) => u.rewarded).length };
  }
}

export class SupabaseInviteRepository implements InviteRepository {
  constructor(private readonly db: SupabaseClient) {}
  async codeFor(owner: string, ownerName: string): Promise<string> {
    const { data } = await this.db.from("game_invites").select("code").eq("owner", owner).maybeSingle<{ code: string }>();
    if (data) return data.code;
    for (let k = 0; k < 5; k++) {
      const code = newInviteCode();
      const { error } = await this.db.from("game_invites").insert({ code, owner, owner_name: ownerName.slice(0, 40) });
      if (!error) return code;
      if (!/duplicate|unique/i.test(error.message)) throw new Error(`game_invites.insert: ${error.message}`);
      const again = await this.db.from("game_invites").select("code").eq("owner", owner).maybeSingle<{ code: string }>();
      if (again.data) return again.data.code;
    }
    throw new Error("game_invites: sem código");
  }
  async ownerOf(code: string) {
    const { data, error } = await this.db.from("game_invites").select("owner, owner_name").eq("code", code).maybeSingle<{ owner: string; owner_name: string }>();
    if (error) throw new Error(`game_invites.select: ${error.message}`);
    return data ? { owner: data.owner, ownerName: data.owner_name } : null;
  }
  async use(invitee: string, inviteeName: string, code: string, owner: string): Promise<boolean> {
    const { error } = await this.db.from("game_invite_uses").insert({ invitee, invitee_name: inviteeName.slice(0, 40), code, owner });
    if (!error) return true;
    if (/duplicate|unique/i.test(error.message)) return false;
    throw new Error(`game_invite_uses.insert: ${error.message}`);
  }
  async usedBy(invitee: string) {
    const { data, error } = await this.db.from("game_invite_uses").select("code, owner, rewarded").eq("invitee", invitee).maybeSingle<{ code: string; owner: string; rewarded: boolean }>();
    if (error) throw new Error(`game_invite_uses.select: ${error.message}`);
    return data ?? null;
  }
  async reward(invitee: string): Promise<string | null> {
    const { data, error } = await this.db.from("game_invite_uses").update({ rewarded: true, rewarded_at: new Date().toISOString() }).eq("invitee", invitee).eq("rewarded", false).select("owner");
    if (error) throw new Error(`game_invite_uses.update: ${error.message}`);
    return ((data ?? []) as Array<{ owner: string }>)[0]?.owner ?? null;
  }
  async stats(owner: string) {
    const { data, error } = await this.db.from("game_invite_uses").select("rewarded").eq("owner", owner);
    if (error) throw new Error(`game_invite_uses.select: ${error.message}`);
    const rows = (data ?? []) as Array<{ rewarded: boolean }>;
    return { convidados: rows.length, premiados: rows.filter((r) => r.rewarded).length };
  }
}
