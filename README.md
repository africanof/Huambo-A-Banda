# Huambo É A Banda

Simulador de vida 2D multijogador online, inspirado no The Sims, com bairros
partilhados e preparado para 10 000 jogadores simultâneos.

| Camada | Tecnologia | Pasta |
|---|---|---|
| Jogo | Godot 4.6 + GDScript | [`client/`](client) |
| Tempo real | Colyseus 0.18 + Node.js 22 + TypeScript | [`server/`](server) |
| Dados permanentes | Supabase (Auth + PostgreSQL + RLS) | [`supabase/`](supabase) |
| Escala | Redis (presença + matchmaking entre processos) | [`infra/`](infra) |
| Proteção | Cloudflare | [`infra/cloudflare/`](infra/cloudflare) |

Arquitetura e decisões: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
Próximas etapas: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Arrancar em 2 minutos (sem contas externas)

```bash
# 1. Servidor (convidados ativos, dados em memória)
cd server
cp .env.example .env
npm install
npm run dev            # http://127.0.0.1:2567/health

# 2. Cliente
# Abre a pasta client/ no Godot 4.6 e carrega em ▶ (F5).
# Entra como convidado. Abre uma segunda janela (Debug → Run Multiple Instances)
# para ver dois jogadores no mesmo bairro.
```

Clica/toca no chão para andar.

## Testes

```bash
cd server && npm test                                        # unitários + integração
TEST_REDIS_URL=redis://127.0.0.1:6379 npm test               # + multi-processo via Redis
PGURL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  supabase/tests/run_local.sh                                # migrações + RLS + economia
godot --headless --path client -s res://tests/run_tests.gd   # unitários do cliente
godot --headless --path client -- --autotest                 # jogo real ponta-a-ponta (servidor a correr)
cd server && npm run loadtest -- --bots=200                  # carga (GUEST_RATE_PER_MIN alto)
```

## Ligar ao Supabase

1. Cria um projeto (plano gratuito) e aplica as migrações:
   `supabase link --project-ref <ref> && supabase db push`
2. Servidor (`server/.env`): `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (chave **secreta**).
3. Cliente (`client/config/client.cfg`): `url` e `publishable_key` (chave **publicável**).

A chave secreta nunca entra no cliente nem no repositório.

## Vários processos (local)

```bash
docker compose -f infra/docker-compose.yml up --build
```
Dois processos de jogo + Redis; jogadores ligados a portas diferentes caem nas mesmas salas.
