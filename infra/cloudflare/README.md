# Cloudflare — proteção e entrega

Plano gratuito do Cloudflare cobre tudo o que precisamos nesta fase.

## Topologia

```
Jogador ──HTTPS/WSS──► Cloudflare (proxy laranja) ──► servidores de jogo (Colyseus)
                         │  • TLS terminado na borda
                         │  • DDoS L3/L4/L7 automático
                         │  • WAF + rate limiting
                         └► Cloudflare Pages: build Web do Godot (estático)
```

| Registo DNS | Destino | Proxy |
|---|---|---|
| `play.huambo…`   | Cloudflare Pages (export Web) | ✅ |
| `api.huambo…`    | balanceador / processo matchmaker | ✅ |
| `g1.huambo…`, `g2.huambo…` | cada processo de jogo (`PUBLIC_ADDRESS`) | ✅ |

WebSockets passam pelo proxy do Cloudflare sem configuração extra.

## Configuração do servidor atrás do Cloudflare

```
TRUSTED_IP_HEADER=cf-connecting-ip   # IP real do jogador para rate limiting
CORS_ORIGINS=https://play.huambo…
PUBLIC_ADDRESS=g1.huambo…           # por processo
```

Fecha a firewall do servidor para aceitar **apenas** os IPs do Cloudflare
(<https://www.cloudflare.com/ips/>), ou usa **Cloudflare Tunnel** (`cloudflared`),
que não expõe portas nenhumas. Sem isto, o cabeçalho `cf-connecting-ip` pode ser
falsificado por quem ligar diretamente ao servidor.

## Regras recomendadas (painel → Security)

1. **Rate limiting** `POST /auth/guest` — 10 pedidos / minuto / IP → Block.
2. **Rate limiting** `POST /matchmake/*` — 30 pedidos / minuto / IP → Managed Challenge.
3. **WAF custom rule**: bloquear métodos diferentes de `GET, POST, OPTIONS` em `api.*`.
4. **Bot Fight Mode**: ligado (não afeta WebSockets já estabelecidos).
5. **SSL/TLS**: modo *Full (strict)*; *Always Use HTTPS*; TLS mínimo 1.2.

## Build Web (Cloudflare Pages)

O export Web do Godot 4 com threads precisa de *cross-origin isolation*.
O ficheiro [`_headers`](./_headers) é copiado para a raiz do build Web.
