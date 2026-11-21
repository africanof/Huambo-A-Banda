import type { SupabaseClient } from "@supabase/supabase-js";

export interface AssocRow {
  bairro: string;
  pontos: number;
  membros: number;
}

/** Associações de bairro: pontos da semana por bairro e por membro. */
export interface AssociationRepository {
  /** soma pontos ao membro e à associação do bairro; devolve o total do bairro nessa semana */
  add(characterId: string, bairro: string, semana: string, pontos: number): Promise<number>;
  ranking(semana: string, limit: number): Promise<AssocRow[]>;
  member(characterId: string, semana: string): Promise<{ bairro: string; pontos: number } | null>;
}

export class MemoryAssociationRepository implements AssociationRepository {
  private readonly bairros = new Map<string, AssocRow>(); // chave: semana|bairro
  private readonly membros = new Map<string, { bairro: string; pontos: number }>(); // chave: semana|id
  async add(id: string, bairro: string, semana: string, pontos: number): Promise<number> {
    const mk = `${semana}|${id}`;
    const m = this.membros.get(mk);
    this.membros.set(mk, { bairro, pontos: (m?.pontos ?? 0) + pontos });
    const bk = `${semana}|${bairro}`;
    const b = this.bairros.get(bk) ?? { bairro, pontos: 0, membros: 0 };
    b.pontos += pontos;
    if (!m) b.membros += 1;
    this.bairros.set(bk, b);
    return b.pontos;
  }
  async ranking(semana: string, limit: number): Promise<AssocRow[]> {
    return [...this.bairros.entries()]
      .filter(([k]) => k.startsWith(`${semana}|`))
      .map(([, v]) => ({ ...v }))
      .sort((a, b) => b.pontos - a.pontos || a.bairro.localeCompare(b.bairro))
      .slice(0, limit);
  }
  async member(id: string, semana: string): Promise<{ bairro: string; pontos: number } | null> {
    return this.membros.get(`${semana}|${id}`) ?? null;
  }
}

export class SupabaseAssociationRepository implements AssociationRepository {
  constructor(private readonly db: SupabaseClient) {}
  async add(id: string, bairro: string, semana: string, pontos: number): Promise<number> {
    const { data, error } = await this.db.rpc("game_assoc_add", { p_character: id, p_bairro: bairro, p_semana: semana, p_pontos: Math.round(pontos) });
    if (error) throw new Error(`game_assoc_add: ${error.message}`);
    return Number(data);
  }
  async ranking(semana: string, limit: number): Promise<AssocRow[]> {
    const { data, error } = await this.db.from("game_assoc").select("bairro, pontos, membros").eq("semana", semana).order("pontos", { ascending: false }).order("bairro").limit(limit);
    if (error) throw new Error(`game_assoc.select: ${error.message}`);
    return ((data ?? []) as AssocRow[]).map((r) => ({ bairro: r.bairro, pontos: Number(r.pontos), membros: Number(r.membros) }));
  }
  async member(id: string, semana: string): Promise<{ bairro: string; pontos: number } | null> {
    const { data, error } = await this.db.from("game_assoc_members").select("bairro, pontos").eq("character_id", id).eq("semana", semana).maybeSingle<{ bairro: string; pontos: number }>();
    if (error) throw new Error(`game_assoc_members.select: ${error.message}`);
    return data ? { bairro: data.bairro, pontos: Number(data.pontos) } : null;
  }
}
