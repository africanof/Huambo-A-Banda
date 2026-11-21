import type { SupabaseClient } from "@supabase/supabase-js";

/** Algo à espera de quem está desligado: um SMS ou um presente. Entregue (e apagado) quando a pessoa entrar. */
export interface InboxItem {
  kind: "sms" | "gift";
  from: string;
  fromId?: string;
  text?: string;
  name?: string;
  mood?: number;
  at: number;
}

export interface InboxRepository {
  push(toCharacterId: string, item: InboxItem): Promise<void>;
  /** devolve e apaga tudo o que estava à espera (o mais antigo primeiro) */
  take(toCharacterId: string): Promise<InboxItem[]>;
}

const MAX_PER_PERSON = 30;

export class MemoryInboxRepository implements InboxRepository {
  private readonly boxes = new Map<string, InboxItem[]>();
  async push(to: string, item: InboxItem): Promise<void> {
    const box = this.boxes.get(to) ?? [];
    box.push(item);
    this.boxes.set(to, box.slice(-MAX_PER_PERSON));
  }
  async take(to: string): Promise<InboxItem[]> {
    const box = this.boxes.get(to) ?? [];
    this.boxes.delete(to);
    return box;
  }
}

interface Row {
  kind: "sms" | "gift";
  from_name: string;
  from_id: string | null;
  text: string | null;
  name: string | null;
  mood: number | null;
  created_at: string;
}

/** Supabase: tabela game_inbox (só o servidor lê e escreve). O DELETE … RETURNING garante uma só entrega. */
export class SupabaseInboxRepository implements InboxRepository {
  constructor(private readonly db: SupabaseClient) {}
  async push(to: string, i: InboxItem): Promise<void> {
    const { error } = await this.db.from("game_inbox").insert({
      to_character: to,
      kind: i.kind,
      from_name: i.from.slice(0, 40),
      from_id: i.fromId ?? null,
      text: i.text?.slice(0, 200) ?? null,
      name: i.name?.slice(0, 40) ?? null,
      mood: i.mood ?? null,
    });
    if (error) throw new Error(`game_inbox.insert: ${error.message}`);
  }
  async take(to: string): Promise<InboxItem[]> {
    const { data, error } = await this.db.from("game_inbox").delete().eq("to_character", to).select("kind, from_name, from_id, text, name, mood, created_at");
    if (error) throw new Error(`game_inbox.delete: ${error.message}`);
    return ((data ?? []) as Row[])
      .map((r) => ({
        kind: r.kind,
        from: r.from_name,
        fromId: r.from_id ?? undefined,
        text: r.text ?? undefined,
        name: r.name ?? undefined,
        mood: r.mood ?? undefined,
        at: Date.parse(r.created_at),
      }))
      .sort((a, b) => a.at - b.at)
      .slice(-MAX_PER_PERSON);
  }
}

/** Convidados ("mem-…") ficam em memória; contas no Supabase. */
export class RoutingInboxRepository implements InboxRepository {
  constructor(
    private readonly users: InboxRepository,
    private readonly guests: InboxRepository = new MemoryInboxRepository(),
  ) {}
  private pick(id: string): InboxRepository {
    return id.startsWith("mem-") ? this.guests : this.users;
  }
  push(to: string, item: InboxItem): Promise<void> {
    return this.pick(to).push(to, item);
  }
  take(to: string): Promise<InboxItem[]> {
    return this.pick(to).take(to);
  }
}
