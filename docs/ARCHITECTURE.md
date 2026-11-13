# Arquitetura — Huambo É A Banda

```
┌──────────── Cliente Godot 4 (Web · Android · iOS · Windows · Linux) ────────────┐
│ UI (login) → Auth ──┐                                                           │
│ World ◄── Net ◄─────┴─ ColyseusClient (HTTP matchmaking) + ColyseusRoom (WSS)    │
│   └ Character: previsão local / interpolação remota                             │
└───────────────┬──────────────────────────────────┬──────────────────────────────┘
                │ HTTPS (Supabase Auth REST)        │ HTTPS + WSS
                ▼                                   ▼
        ┌──────────────┐                 ┌────────────── Cloudflare ──────────────┐
        │ Supabase     │                 │ TLS · DDoS · WAF · rate limiting        │
        │ Auth (JWT)   │                 └───────────────┬─────────────────────────┘
        │ PostgreSQL   │◄── service_role ──┐             ▼
        │  + RLS       │                   │   ┌── Processo de jogo N (Node/Colyseus) ──┐
        └──────────────┘                   └───┤ DistrictRoom × K  (≤ 80 jogadores)     │
                                               │ GameLoop 20 Hz · AOI · snapshots 10 Hz │
                                               └───────────────┬───────────────────────┘
                                                               ▼
                                                    Redis (presença + matchmaking)
```

## Decisões técnicas

### 1. Servidor autoritativo, cliente só envia intenções
O cliente envia `MOVE_TO {x, y}`; o servidor valida (zod), ajusta aos limites,
recusa destinos dentro de obstáculos e simula. O cliente **nunca** envia posições,
dinheiro ou itens. Isto é a base da proteção contra batota e da economia.

### 2. Replicação por snapshots com AOI (em vez de Schema do Colyseus)
Cada jogador recebe apenas o que está numa grelha de 5×5 células (400 px) à sua
volta, e só as entidades **que se moveram** desde o último snapshot. Uma multidão
parada custa 0 bytes. Mensagens com tipos numéricos de 1 byte, posições inteiras
e arrays planos `[id, x, y, …]`.
*Compromisso:* perdemos a sincronização automática do Schema; ganhamos controlo
total sobre a banda por jogador, essencial em redes móveis e para 10 000 CCU.

### 3. Cliente Colyseus em GDScript puro
O Colyseus tem um SDK nativo (GDExtension) para Godot, mas binários nativos
complicam o export Web (exige templates com *dlink*), a assinatura em iOS e a
manutenção por plataforma. O nosso cliente (`client/src/net/`) implementa o
protocolo 0.18 — handshake `JOIN_ROOM`, `ROOM_DATA`, `ERROR`, `LEAVE_ROOM`,
`PING` — e funciona igual em todas as plataformas.
*Detalhe importante:* os cabeçalhos do Colyseus usam prefixos msgpack com
inteiros **little-endian**; os payloads são msgpack normal (big-endian).
*Garantias:* fixtures geradas pelo código real do servidor (`npm run fixtures`),
teste de sincronização das constantes TS↔GDScript, e teste ponta-a-ponta com dois
clientes Godot reais no CI. A versão do Colyseus está fixada em `0.18.x`.

### 4. Autenticação no matchmaking
`static onAuth` corre no pedido HTTP de matchmaking: um token inválido nunca
reserva lugar. Tokens aceites:
- **Contas**: JWT do Supabase Auth, verificado por JWKS (chaves assimétricas;
  HS256 legado opcional). Exige `aud=authenticated` e `role=authenticated`.
- **Convidados**: JWT HS256 emitido pelo próprio servidor (`POST /auth/guest`),
  limitado por IP, desativável em produção (`ALLOW_GUESTS=false`).

Uma conta = uma sessão no mundo inteiro: ao entrar, o servidor publica no canal de
presença (Redis) e qualquer sala, em qualquer processo, expulsa a sessão antiga.

### 5. Persistência e economia
- As salas dependem da interface `CharacterRepository`; a implementação Supabase
  usa a chave de serviço, que **só existe no servidor**.
- Posições gravadas em lote (`game_save_positions`, 1 RPC por sala) a cada 60 s e
  à saída.
- **RLS em todas as tabelas**; os clientes não têm privilégio de escrita (exceto
  o próprio `display_name`).
- Dinheiro: carteira + **livro-razão imutável**. O saldo só muda via
  `game_wallet_apply()` — atómica, idempotente (`idempotency_key`), nunca negativa,
  executável apenas pelo `service_role`. Testado em `supabase/tests/security_test.sql`.

### 6. Escala para 10 000 jogadores
- Sala = **uma instância de um bairro**, máx. 80 jogadores (`ROOM_MAX_CLIENTS`).
  `filterBy(["district"])` + `sortBy({clients: -1})`: enche as instâncias
  existentes antes de abrir novas (bairros com vida).
- `REDIS_URL` ativa `RedisPresence` + `RedisDriver`: N processos partilham
  matchmaking. Cada processo anuncia o seu `PUBLIC_ADDRESS`, e o cliente liga
  diretamente ao processo dono da sala.
- **Medido** (VM de desenvolvimento, servidor ainda via `tsx`): 400 bots →
  5 salas, ~25 % de um núcleo, ~260 MB. Extrapolação conservadora: 10 000 CCU ≈
  125 salas ≈ 6–8 processos de 1 vCPU. A validar com testes de carga distribuídos.

### 7. Ciclo de jogo próprio de passo fixo
A simulação corre num `GameLoop` com acumulador (20 Hz, `dt` fixo) e os snapshots
saem a cada 2 passos. Não usamos o relógio da sala do Colyseus porque, nos testes,
o delta medido saía errado quando outros temporizadores também o avançavam.
O passo fixo também permite que a previsão no cliente (`movement.gd`) reproduza
exatamente o servidor — verificado contra fixtures (erro < 0,05 px).

### 8. Desempenho em telemóveis
Renderer *Compatibility* (OpenGL ES 3 / WebGL 2), compressão ETC2/ASTC, sem MSAA,
personagens desenhadas por código (sem texturas nesta fase), redesenho apenas
quando algo muda, snapshots a 10 Hz com interpolação de 200 ms.

## Fluxo de entrada

1. `Auth.sign_in_guest()` / `sign_in_email()` → token.
2. `POST /matchmake/joinOrCreate/district` com `Authorization: Bearer …` e
   `{v: PROTOCOL_VERSION, district}` → reserva `{roomId, sessionId, processId, publicAddress?}`.
3. `WSS /{processId}/{roomId}?sessionId=…` → `JOIN_ROOM` → o cliente confirma.
4. Servidor envia `WELCOME` (mapa autoritativo, ritmos) e `SPAWN`s; depois `SNAPSHOT`s.

## Protocolo de aplicação (v1)

| Dir. | Tipo | Payload |
|---|---|---|
| C→S | `1 MOVE_TO` | `{x, y}` |
| C→S | `2 STOP` | — |
| S→C | `100 WELCOME` | `{selfId, district:{id,name,width,height,obstacles}, speed, simHz, snapshotHz, serverTime}` |
| S→C | `101 SPAWN` | `[[id, nome, x, y, {body, shirt}], …]` |
| S→C | `102 DESPAWN` | `[id, …]` |
| S→C | `103 SNAPSHOT` | `{t, e:[id, x, y, …]}` (só quem se moveu) |
| S→C | `104 NOTICE` | `{code, msg}` |

Fonte de verdade: `server/src/net/protocol.ts`. Espelho: `client/src/net/protocol.gd`.

## Segurança — resumo

| Ameaça | Mitigação |
|---|---|
| Batota de movimento / teletransporte | Servidor autoritativo, só intenções |
| Payloads maliciosos | zod `.strict()`, `maxPayload` 16 KiB, msgpack com limites de profundidade/tamanho no cliente |
| Flood de mensagens | `maxMessagesPerSecond = 20` (desliga), cliente limita a ~8/s |
| Abuso de convidados | Rate limit por IP; desligável; Cloudflare à frente |
| Roubo de sessão / multi-login | JWT verificado; 1 sessão por conta (Redis pub/sub) |
| Fraude na economia | Sem escrita do cliente; ledger imutável; função idempotente sem saldo negativo |
| Fuga de segredos | Chave de serviço só no servidor; cliente usa chave publicável |
| CORS | O matchmaking do Colyseus reflete a origem; não há cookies (token em cabeçalho), por isso não há CSRF. Restringir no Cloudflare. |
