import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Kixikila: poupança em grupo (bem angolana). Os membros pagam a mesma quota em cada volta;
 * quando todos pagaram, quem está na vez recebe tudo e passa-se à volta seguinte.
 * Uma kixikila por grupo de cada vez. As mudanças são atómicas (uma só instrução / função SQL).
 */
export interface Kixikila {
  id: string;
  groupId: string;
  quota: number;
  members: Array<{ id: string; name: string }>;
  round: number;
  paid: string[];
  status: "aberta" | "a_correr" | "acabada";
  creator: string;
}

export interface KixikilaRepository {
  byGroup(groupId: string): Promise<Kixikila | null>;
  create(groupId: string, quota: number, creator: { id: string; name: string }): Promise<Kixikila>;
  join(id: string, member: { id: string; name: string }): Promise<Kixikila | null>;
  start(id: string, creatorId: string): Promise<Kixikila | null>;
  /** marca quem pagou nesta volta (só se a volta for esta e ainda não tiver pago) */
  markPaid(id: string, round: number, characterId: string): Promise<Kixikila | null>;
  /** fecha a volta (todos pagaram) e passa à seguinte; devolve o estado antes de fechar, ou null */
  closeRound(id: string, round: number): Promise<Kixikila | null>;
  remove(id: string): Promise<void>;
}

export class MemoryKixikilaRepository implements KixikilaRepository {
  private readonly rows = new Map<string, Kixikila>();
  private copy(k: Kixikila): Kixikila {
    return { ...k, members: k.members.map((m) => ({ ...m })), paid: [...k.paid] };
  }
  async byGroup(groupId: string): Promise<Kixikila | null> {
    for (const k of this.rows.values()) if (k.groupId === groupId) return this.copy(k);
    return null;
  }
  async create(groupId: string, quota: number, creator: { id: string; name: string }): Promise<Kixikila> {
    if (await this.byGroup(groupId)) throw new Error("kixikila já existe");
    const k: Kixikila = { id: randomUUID(), groupId, quota, members: [creator], round: 0, paid: [], status: "aberta", creator: creator.id };
    this.rows.set(k.id, k);
    return this.copy(k);
  }
  async join(id: string, member: { id: string; name: string }): Promise<Kixikila | null> {
    const k = this.rows.get(id);
    if (!k || k.status !== "aberta" || k.members.some((m) => m.id === member.id)) return null;
    k.members.push(member);
    return this.copy(k);
  }
  async start(id: string, creatorId: string): Promise<Kixikila | null> {
    const k = this.rows.get(id);
    if (!k || k.status !== "aberta" || k.creator !== creatorId || k.members.length < 2) return null;
    k.status = "a_correr";
    return this.copy(k);
  }
  async markPaid(id: string, round: number, characterId: string): Promise<Kixikila | null> {
    const k = this.rows.get(id);
    if (!k || k.status !== "a_correr" || k.round !== round || k.paid.includes(characterId) || !k.members.some((m) => m.id === characterId)) return null;
    k.paid.push(characterId);
    return this.copy(k);
  }
  async closeRound(id: string, round: number): Promise<Kixikila | null> {
    const k = this.rows.get(id);
    if (!k || k.status !== "a_correr" || k.round !== round || k.paid.length < k.members.length) return null;
    const before = this.copy(k);
    k.round += 1;
    k.paid = [];
    if (k.round >= k.members.length) k.status = "acabada";
    return before;
  }
  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

const fromRow = (r: Record<string, unknown>): Kixikila => ({
  id: String(r.id),
  groupId: String(r.group_id),
  quota: Number(r.quota),
  members: (r.members as Array<{ id: string; name: string }>) ?? [],
  round: Number(r.round),
  paid: (r.paid as string[]) ?? [],
  status: r.status as Kixikila["status"],
  creator: String(r.creator),
});

export class SupabaseKixikilaRepository implements KixikilaRepository {
  constructor(private readonly db: SupabaseClient) {}
  async byGroup(groupId: string): Promise<Kixikila | null> {
    const { data, error } = await this.db.from("game_kixikila").select("*").eq("group_id", groupId).maybeSingle();
    if (error) throw new Error(`game_kixikila.select: ${error.message}`);
    return data ? fromRow(data) : null;
  }
  async create(groupId: string, quota: number, creator: { id: string; name: string }): Promise<Kixikila> {
    const { data, error } = await this.db.from("game_kixikila").insert({ group_id: groupId, quota, members: [creator], creator: creator.id }).select("*").single();
    if (error) throw new Error(`game_kixikila.insert: ${error.message}`);
    return fromRow(data);
  }
  private async rpc(fn: string, args: Record<string, unknown>): Promise<Kixikila | null> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return row && row.id ? fromRow(row) : null;
  }
  join(id: string, m: { id: string; name: string }) {
    return this.rpc("game_kixikila_join", { p_id: id, p_member: m });
  }
  start(id: string, creatorId: string) {
    return this.rpc("game_kixikila_start", { p_id: id, p_creator: creatorId });
  }
  markPaid(id: string, round: number, characterId: string) {
    return this.rpc("game_kixikila_paid", { p_id: id, p_round: round, p_character: characterId });
  }
  closeRound(id: string, round: number) {
    return this.rpc("game_kixikila_close", { p_id: id, p_round: round });
  }
  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("game_kixikila").delete().eq("id", id);
    if (error) throw new Error(`game_kixikila.delete: ${error.message}`);
  }
}
