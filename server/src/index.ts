import { loadEnv } from "./config/env.js";
import { configureLogger, log } from "./utils/logger.js";
import { createGameServer } from "./app.js";

async function main(): Promise<void> {
  const env = loadEnv();
  configureLogger(env.LOG_LEVEL);
  if (env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) {
    log().warn("SUPABASE_SERVICE_ROLE_KEY em falta: as contas autenticam, mas personagens e dinheiro ficam só em memória");
  }
  const { server } = createGameServer(env);
  await server.listen(env.PORT);
  log().info(
    { port: env.PORT, redis: Boolean(env.REDIS_URL), supabase: Boolean(env.SUPABASE_URL), guests: env.ALLOW_GUESTS },
    "Huambo É A Banda — servidor pronto",
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
