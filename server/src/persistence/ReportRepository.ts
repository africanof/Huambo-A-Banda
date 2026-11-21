import type { SupabaseClient } from "@supabase/supabase-js";

/** Denúncia de um jogador (insultos, assédio, burla…), para a moderação rever. */
export interface PlayerReport {
  reporter: string;
  reporterName: string;
  reported: string;
  reportedName: string;
  reason: string;
  bairro: string;
  /** últimas falas do denunciado ouvidas na sala (contexto para a moderação) */
  context: string[];
}

export type ReportStatus = "novo" | "visto" | "resolvido";
export interface StoredReport extends PlayerReport {
  id: number;
  status: ReportStatus;
  at: number;
}

export interface ReportRepository {
  add(r: PlayerReport): Promise<void>;
  /** para o painel de moderação: as mais recentes de um estado */
  list(status: ReportStatus, limit: number): Promise<StoredReport[]>;
  setStatus(id: number, status: ReportStatus): Promise<void>;
}

export class MemoryReportRepository implements ReportRepository {
  readonly rows: StoredReport[] = [];
  private seq = 0;
  async add(r: PlayerReport): Promise<void> {
    this.rows.push({ ...r, id: ++this.seq, status: "novo", at: Date.now() });
    if (this.rows.length > 1000) this.rows.shift();
  }
  async list(status: ReportStatus, limit: number): Promise<StoredReport[]> {
    return this.rows.filter((r) => r.status === status).slice(-limit).reverse();
  }
  async setStatus(id: number, status: ReportStatus): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.status = status;
  }
}

/** Supabase: tabela game_reports (só o servidor escreve; ninguém lê pela API pública). */
export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly db: SupabaseClient) {}
  async add(r: PlayerReport): Promise<void> {
    const { error } = await this.db.from("game_reports").insert({
      reporter: r.reporter,
      reporter_name: r.reporterName.slice(0, 40),
      reported: r.reported,
      reported_name: r.reportedName.slice(0, 40),
      reason: r.reason,
      bairro: r.bairro,
      context: r.context.slice(-8),
    });
    if (error) throw new Error(`game_reports.insert: ${error.message}`);
  }
  async list(status: ReportStatus, limit: number): Promise<StoredReport[]> {
    const { data, error } = await this.db.from("game_reports").select("*").eq("status", status).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`game_reports.select: ${error.message}`);
    return (
      (data ?? []) as Array<{ id: number; reporter: string; reporter_name: string; reported: string; reported_name: string; reason: string; bairro: string; context: unknown; status: ReportStatus; created_at: string }>
    ).map((r) => ({
      id: Number(r.id),
      reporter: r.reporter,
      reporterName: r.reporter_name,
      reported: r.reported,
      reportedName: r.reported_name,
      reason: r.reason,
      bairro: r.bairro,
      context: Array.isArray(r.context) ? r.context.map(String) : [],
      status: r.status,
      at: Date.parse(r.created_at),
    }));
  }
  async setStatus(id: number, status: ReportStatus): Promise<void> {
    const { error } = await this.db.from("game_reports").update({ status }).eq("id", id);
    if (error) throw new Error(`game_reports.update: ${error.message}`);
  }
}
