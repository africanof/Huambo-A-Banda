/**
 * Verificação ponta-a-ponta contra um projeto Supabase REAL:
 *   1. cria (ou reutiliza) uma conta de teste confirmada (API admin, chave secreta)
 *   2. faz login com email/palavra-passe → access token (JWT)
 *   3. o servidor verifica o JWT pelas chaves públicas (JWKS) do projeto
 *   4. o repositório Supabase cria, altera e grava a personagem; lê de volta
 *
 * Uso: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_PUBLISHABLE_KEY=… npx tsx scripts/supabase-smoke.ts
 */
import { loadEnv } from "../src/config/env.js";
import { TokenVerifier } from "../src/auth/TokenVerifier.js";
import { SupabaseCharacterRepository, newKeyFetch } from "../src/persistence/SupabaseCharacterRepository.js";

const env = loadEnv({ ...process.env, ALLOW_GUESTS: "false", NODE_ENV: "development" });
const url = env.SUPABASE_URL!;
const secret = env.SUPABASE_SERVICE_ROLE_KEY!;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? secret;
const email = process.env.SMOKE_EMAIL ?? "smoke-test@huambo-a-banda.invalid";
const password = process.env.SMOKE_PASSWORD ?? `Smoke-${Date.now()}-x!`;
const sfetch = newKeyFetch(secret);

function step(msg: string) {
  console.log(`✓ ${msg}`);
}

async function main() {
  // 1. conta de teste confirmada
  const created = await sfetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Teste Huambo" } }),
  });
  if (created.status === 422) {
    // já existe: atualiza a palavra-passe
    const list = (await (await sfetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: { apikey: secret, Authorization: `Bearer ${secret}` } })).json()) as { users: Array<{ id: string; email: string }> };
    const u = list.users.find((x) => x.email === email);
    if (!u) throw new Error("utilizador de teste não encontrado");
    const r = await sfetch(`${url}/auth/v1/admin/users/${u.id}`, {
      method: "PUT",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error(`admin update ${r.status} ${await r.text()}`);
    step("conta de teste reutilizada");
  } else if (!created.ok) {
    throw new Error(`admin create ${created.status} ${await created.text()}`);
  } else step("conta de teste criada (confirmada)");

  // 2. login como um jogador faria
  const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = (await login.json()) as { access_token?: string; user?: { id: string } };
  if (!session.access_token) throw new Error(`login falhou: ${JSON.stringify(session)}`);
  step(`login OK (utilizador ${session.user?.id})`);

  // 3. verificação do JWT como no matchmaking
  const identity = await new TokenVerifier(env).verify(session.access_token);
  if (!identity || identity.kind !== "user" || identity.userId !== session.user?.id) throw new Error(`JWT rejeitado: ${JSON.stringify(identity)}`);
  step(`JWT verificado pelo servidor (${identity.displayName ?? "sem nome"})`);

  // 4. persistência real
  const repo = new SupabaseCharacterRepository(url, secret);
  const c1 = await repo.loadOrCreate(identity);
  step(`personagem: ${c1.name} (${c1.id})`);
  const c2 = await repo.update(identity, { appearance: { body: 3, shirt: 7, hair: 2, pants: 1 } });
  if (c2.appearance.shirt !== 7) throw new Error("aparência não gravada");
  step("aparência gravada");
  const x = 2000 + Math.floor(Math.random() * 500);
  await repo.savePositions([{ id: c1.id, district: "huambo_centro", x, y: 3000 }]);
  const c3 = await repo.loadOrCreate(identity);
  if (c3.x !== x || c3.district !== "huambo_centro") throw new Error(`posição não gravada: ${JSON.stringify(c3)}`);
  step(`posição gravada e lida de volta (${c3.x}, ${c3.y}) em ${c3.district}`);
  console.log("SUPABASE SMOKE OK");
}

main().catch((e) => {
  console.error("SUPABASE SMOKE FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
