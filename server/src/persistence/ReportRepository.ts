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

export interface ReportRepository {
  add(r: PlayerReport): Promise<void>;
}

export class MemoryReportRepository implements ReportRepository {
  readonly rows: Array<PlayerReport & { at: number }> = [];
  async add(r: PlayerReport): Promise<void> {
    this.rows.push({ ...r, at: Date.now() });
    if (this.rows.length > 1000) this.rows.shift();
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
}
