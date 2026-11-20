import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export interface Group {
  id: string;
  name: string;
  members: number;
}

export class GroupNameTaken extends Error {}

/** Grupos (associações, clubes, igrejas, kambas…): o registo é partilhado; quem pertence fica na vida de cada um. */
export interface GroupRepository {
  list(): Promise<Group[]>;
  get(id: string): Promise<Group | null>;
  create(name: string, ownerCharacterId: string): Promise<Group>;
  /** +1 quando alguém entra, −1 quando sai. */
  adjust(id: string, delta: number): Promise<void>;
}

export class MemoryGroupRepository implements GroupRepository {
  private readonly groups = new Map<string, Group>();
  async list(): Promise<Group[]> {
    return [...this.groups.values()].sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
  }
  async get(id: string): Promise<Group | null> {
    return this.groups.get(id) ?? null;
  }
  async create(name: string, _owner: string): Promise<Group> {
    for (const g of this.groups.values()) if (g.name.toLowerCase() === name.toLowerCase()) throw new GroupNameTaken();
    const g = { id: randomUUID(), name, members: 1 };
    this.groups.set(g.id, g);
    return g;
  }
  async adjust(id: string, delta: number): Promise<void> {
    const g = this.groups.get(id);
    if (g) g.members = Math.max(0, g.members + delta);
  }
}

export class SupabaseGroupRepository implements GroupRepository {
  constructor(private readonly db: SupabaseClient) {}
  async list(): Promise<Group[]> {
    const { data, error } = await this.db.from("game_groups").select("id,name,members").order("members", { ascending: false }).limit(100);
    if (error) throw new Error(`game_groups.select: ${error.message}`);
    return (data ?? []).map((g) => ({ id: String(g.id), name: String(g.name), members: Number(g.members) }));
  }
  async get(id: string): Promise<Group | null> {
    const { data, error } = await this.db.from("game_groups").select("id,name,members").eq("id", id).maybeSingle();
    if (error) throw new Error(`game_groups.get: ${error.message}`);
    return data ? { id: String(data.id), name: String(data.name), members: Number(data.members) } : null;
  }
  async create(name: string, owner: string): Promise<Group> {
    const { data, error } = await this.db.from("game_groups").insert({ name, owner_character_id: owner }).select("id,name,members").single();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new GroupNameTaken();
      throw new Error(`game_groups.insert: ${error.message}`);
    }
    return { id: String(data.id), name: String(data.name), members: Number(data.members) };
  }
  async adjust(id: string, delta: number): Promise<void> {
    const { error } = await this.db.rpc("game_group_adjust", { p_group_id: id, p_delta: delta });
    if (error) throw new Error(`game_group_adjust: ${error.message}`);
  }
}
