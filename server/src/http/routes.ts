import { playedToday } from "../game/stats.js";
import express, { type Application, type Request, type Response, type NextFunction } from "express";
import { matchMaker } from "@colyseus/core";
import type { Services } from "../services.js";
import { listDistricts } from "../game/districts.js";
import { KeyedRateLimiter } from "../utils/RateLimiter.js";
import { AppearanceSchema, PROTOCOL_VERSION } from "../net/protocol.js";
import { sanitizeDisplayName, type Identity } from "../auth/TokenVerifier.js";

export function clientIp(req: Request, trustedHeader: string): string {
  if (trustedHeader) {
    const v = req.headers[trustedHeader.toLowerCase()];
    const first = (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function cors(origins: string[]) {
  const any = origins.includes("*");
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (any || origins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", any ? "*" : origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Rotas HTTP do servidor de jogo (fora do matchmaking do Colyseus). */
export function registerRoutes(app: Application, svc: Services): void {
  const startedAt = Date.now();
  const rate = svc.env.GUEST_RATE_PER_MIN;
  const guestLimiter = new KeyedRateLimiter(rate, rate / 60); // por IP

  app.disable("x-powered-by");
  app.use(cors(svc.env.CORS_ORIGINS));
  app.use(express.json({ limit: "4kb" }));

  app.get("/health", (_req, res) => {
    // "gravacao": onde ficam as personagens com conta ("supabase") ou só em memória (perde-se ao reiniciar)
    const gravacao = svc.env.SUPABASE_URL && svc.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "memoria";
    // versão publicada (o Render diz qual é o commit); serve para confirmar que o telemóvel tem a mais recente
    const versao = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "local").slice(0, 7);
    res.json({ ok: true, uptimeS: Math.round((Date.now() - startedAt) / 1000), protocol: PROTOCOL_VERSION, gravacao, versao });
  });

  app.get("/districts", (_req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json(
      listDistricts().map((d) => ({
        id: d.id,
        name: d.name,
        map: d.map,
        geo: d.geo,
        links: (d.places ?? []).filter((p) => p.kind === "portal").map((p) => p.to),
        bairros: d.spawns.filter((s) => !s.id.startsWith("from_")).map((s) => ({ id: s.id, name: s.name })),
      })),
    );
  });

  // Ecrã inicial do telemóvel: quantas pessoas estão ligadas agora e quantas jogaram hoje.
  app.get("/stats", async (_req, res) => {
    try {
      const rooms = await matchMaker.query({ name: "district" });
      const online = rooms.reduce((n, r) => n + (r.clients ?? 0), 0);
      res.set("Cache-Control", "no-store");
      res.json({ online, hoje: Math.max(playedToday(), online) });
    } catch {
      res.status(503).json({ error: "unavailable" });
    }
  });

  // Salas de um bairro (como no Vida na Banda: "📍 bairro · Sala N"), por ordem de criação.
  app.get("/districts/:id/rooms", async (req, res) => {
    try {
      const rooms = await matchMaker.query({ name: "district" });
      const mine = rooms
        .filter((r) => (r.metadata as { district?: string } | undefined)?.district === req.params.id)
        .sort((a, b) => +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0))
        .map((r, i) => ({ sala: i + 1, roomId: r.roomId, clients: r.clients, maxClients: r.maxClients }));
      res.set("Cache-Control", "no-store");
      res.json(mine);
    } catch {
      res.status(503).json({ error: "unavailable" });
    }
  });

  const meLimiter = new KeyedRateLimiter(20, 20 / 60);

  /** Autentica o pedido pelo cabeçalho Authorization (mesmo token do matchmaking). */
  async function identify(req: Request, res: Response): Promise<Identity | null> {
    const h = req.headers.authorization;
    const id = await svc.verifier.verify(h?.startsWith("Bearer ") ? h.slice(7) : undefined);
    if (!id) {
      res.status(401).json({ error: "invalid_token" });
      return null;
    }
    if (!meLimiter.take(id.userId)) {
      res.status(429).json({ error: "rate_limited" });
      return null;
    }
    return id;
  }

  const characterView = (c: { name: string; appearance: unknown; district: string | null }) => ({
    name: c.name,
    appearance: c.appearance,
    lastDistrict: c.district,
  });

  app.get("/me/character", async (req, res) => {
    const id = await identify(req, res);
    if (!id) return;
    try {
      res.json(characterView(await svc.characters.loadOrCreate(id)));
    } catch {
      res.status(503).json({ error: "storage_unavailable" });
    }
  });

  // O cliente só pode mudar o nome e a aparência — nunca dinheiro, itens ou posição.
  app.post("/me/character", async (req, res) => {
    const id = await identify(req, res);
    if (!id) return;
    const body = (req.body ?? {}) as { name?: unknown; appearance?: unknown };
    const appearance = body.appearance === undefined ? undefined : AppearanceSchema.safeParse(body.appearance);
    const name = body.name === undefined ? undefined : sanitizeDisplayName(body.name);
    if ((appearance && !appearance.success) || (body.name !== undefined && !name)) {
      res.status(400).json({ error: "invalid_character" });
      return;
    }
    try {
      const rec = await svc.characters.update(id, { name, appearance: appearance?.success ? appearance.data : undefined });
      res.json(characterView(rec));
    } catch {
      res.status(503).json({ error: "storage_unavailable" });
    }
  });

  app.post("/auth/guest", async (req, res) => {
    if (!svc.verifier.guestsEnabled) {
      res.status(403).json({ error: "guests_disabled" });
      return;
    }
    if (!guestLimiter.take(clientIp(req, svc.env.TRUSTED_IP_HEADER))) {
      res.status(429).json({ error: "rate_limited" });
      return;
    }
    const { token, identity, expiresIn } = await svc.verifier.issueGuestToken((req.body as { name?: unknown } | undefined)?.name);
    res.json({ token, userId: identity.userId, name: identity.displayName, expiresIn });
  });

  // Jogo Web no mesmo endereço (Render / máquina única): só ficheiros que existem;
  // tudo o resto (matchmaking, WebSocket) continua a passar.
  if (svc.env.STATIC_DIR) {
    app.use(
      express.static(svc.env.STATIC_DIR, {
        index: "index.html",
        setHeaders: (res, file) => {
          // O jogo (html, js, wasm, pck) muda a cada publicação: o browser confirma sempre com o servidor
          // (ETag → 304 se for igual), senão o telemóvel ficava até 1 h com a versão antiga.
          // Os pacotes dos bairros têm ?v=<versão> no endereço e podem ficar guardados.
          const packs = /[\\/]packs[\\/]/.test(file);
          res.setHeader("Cache-Control", packs ? "public, max-age=86400" : "no-cache");
        },
      }),
    );
  }
}
