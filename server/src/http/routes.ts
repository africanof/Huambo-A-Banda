import express, { type Application, type Request, type Response, type NextFunction } from "express";
import type { Services } from "../services.js";
import { listDistricts } from "../game/districts.js";
import { KeyedRateLimiter } from "../utils/RateLimiter.js";
import { PROTOCOL_VERSION } from "../net/protocol.js";

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
    res.json(listDistricts().map((d) => ({ id: d.id, name: d.name })));
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
}
