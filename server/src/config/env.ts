import { z } from "zod";

/**
 * Configuração validada no arranque. Se algo estiver mal configurado o processo
 * falha imediatamente (fail-fast) em vez de falhar mais tarde com jogadores ligados.
 */
const csv = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const boolish = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((v) => v === true || v === "true" || v === "1");

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(2567),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
    PUBLIC_ADDRESS: z.string().optional(),

    REDIS_URL: z.string().url().optional(),

    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
    SUPABASE_JWT_SECRET: z.string().min(32).optional(),

    ALLOW_GUESTS: boolish,
    GUEST_TOKEN_SECRET: z.string().min(32).optional(),
    /** chave do painel de moderação (/moderacao); sem ela o painel não existe */
    ADMIN_TOKEN: z.string().min(24).optional(),
    /** Tokens de convidado por IP por minuto (anti-abuso). */
    GUEST_RATE_PER_MIN: z.coerce.number().int().min(1).max(100_000).default(5),

    TRUSTED_IP_HEADER: z.string().default(""),
    CORS_ORIGINS: csv,
    /** pasta com o jogo Web exportado, servido no mesmo endereço (opcional) */
    STATIC_DIR: z.string().optional(),

    /** Jogadores por instância de bairro. Acima disto cria-se outra instância do mesmo bairro. */
    ROOM_MAX_CLIENTS: z.coerce.number().int().min(2).max(500).default(80),
    /** Frequência da simulação (Hz). */
    SIM_TICK_HZ: z.coerce.number().int().min(5).max(60).default(20),
    /** Frequência de envio de snapshots (Hz). Menor = menos dados móveis. */
    SNAPSHOT_HZ: z.coerce.number().int().min(2).max(30).default(10),
    /** Intervalo de gravação periódica das personagens (segundos). */
    PERSIST_INTERVAL_S: z.coerce.number().int().min(5).max(600).default(60),
  })
  .superRefine((env, ctx) => {
    if (env.ALLOW_GUESTS && !env.GUEST_TOKEN_SECRET) {
      ctx.addIssue({ code: "custom", path: ["GUEST_TOKEN_SECRET"], message: "obrigatório quando ALLOW_GUESTS=true" });
    }
    if (env.NODE_ENV === "production" && env.CORS_ORIGINS.includes("*")) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGINS"], message: "'*' não é permitido em produção" });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // variáveis vazias (ex.: definidas no painel mas sem valor) contam como ausentes
  const clean = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = EnvSchema.safeParse(clean);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida:\n${details}`);
  }
  return parsed.data;
}
