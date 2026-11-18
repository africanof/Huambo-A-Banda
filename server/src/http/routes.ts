import express, { type Application, type Request, type Response, type NextFunction } from "express";
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
    res.json({ ok: true, uptimeS: Math.round((Date.now() - startedAt) / 1000), protocol: PROTOCOL_VERSION });
  });

  app.get("/districts", (_req, res) => {
    res.set("Cache-Control", "public, max-age=60");
    res.json(listDistricts().map((d) => ({ id: d.id, name: d.name, map: d.map, bairros: d.spawns.map((s) => ({ id: s.id, name: s.name })) })));
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
          res.setHeader("Cache-Control", file.endsWith(".html") ? "no-cache" : "public, max-age=3600");
        },
      }),
    );
  }
}
