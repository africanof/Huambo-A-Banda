import { timingSafeEqual } from "node:crypto";
import express, { type Application, type Request, type Response, type NextFunction } from "express";
import { matchMaker } from "@colyseus/core";
import { z } from "zod";
import type { Services } from "../services.js";
import { KeyedRateLimiter } from "../utils/RateLimiter.js";
import { noteSanction } from "../game/moderation.js";
import { MODERATION_PAGE } from "./moderationPage.js";

const MOD_CHANNEL = "huambo:moderacao";
const HOUR = 3600_000;
const FOREVER_H = 24 * 365 * 100;

const SanctionSchema = z
  .object({
    characterId: z.string().min(1).max(64),
    name: z.string().max(40).default(""),
    /** horas de silêncio / banimento (0 = levantar; -1 = para sempre) */
    muteHours: z.number().int().min(-1).max(FOREVER_H).default(0),
    banHours: z.number().int().min(-1).max(FOREVER_H).default(0),
    reason: z.string().max(200).default(""),
    reportId: z.number().int().positive().optional(),
  })
  .strict();
const StatusSchema = z.object({ status: z.enum(["novo", "visto", "resolvido"]) }).strict();

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Painel de moderação (/moderacao): ver denúncias, silenciar, banir e levantar castigos.
 * Só existe com ADMIN_TOKEN definido no servidor; a chave vai no cabeçalho Authorization.
 */
export function registerModeration(app: Application, svc: Services, trustedIpHeader: (req: Request) => string): void {
  const token = svc.env.ADMIN_TOKEN;
  if (!token) return;
  const fails = new KeyedRateLimiter(10, 10 / 60); // 10 tentativas por minuto e por IP

  app.get("/moderacao", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    res.type("html").send(MODERATION_PAGE);
  });

  const guard = (req: Request, res: Response, next: NextFunction) => {
    const ip = trustedIpHeader(req);
    const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!given || !sameSecret(given, token)) {
      if (!fails.take(ip)) return res.status(429).json({ error: "demasiadas tentativas" });
      return res.status(401).json({ error: "chave errada" });
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  };
  const api = express.Router();
  api.use(guard);

  api.get("/denuncias", async (req, res) => {
    const st = StatusSchema.shape.status.safeParse(req.query.status ?? "novo");
    if (!st.success) return res.status(400).json({ error: "estado inválido" });
    try {
      res.json({ denuncias: await svc.reports.list(st.data, 100) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  api.post("/denuncias/:id", async (req, res) => {
    const id = Number(req.params.id);
    const body = StatusSchema.safeParse(req.body);
    if (!Number.isInteger(id) || id <= 0 || !body.success) return res.status(400).json({ error: "pedido inválido" });
    try {
      await svc.reports.setStatus(id, body.data.status);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  api.get("/castigos", async (_req, res) => {
    try {
      res.json({ castigos: await svc.sanctions.active(Date.now(), 100) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  api.post("/castigos", async (req, res) => {
    const b = SanctionSchema.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "pedido inválido" });
    const now = Date.now();
    const until = (h: number) => (h === 0 ? 0 : now + (h < 0 ? FOREVER_H : h) * HOUR);
    const s = { characterId: b.data.characterId, name: b.data.name, muteUntil: until(b.data.muteHours), banUntil: until(b.data.banHours), reason: b.data.reason };
    try {
      await svc.sanctions.set(s);
      if (b.data.reportId) await svc.reports.setStatus(b.data.reportId, "resolvido");
      noteSanction(s.characterId, s.muteUntil, s.banUntil);
      await matchMaker.presence.publish(MOD_CHANNEL, { characterId: s.characterId, muteUntil: s.muteUntil, banUntil: s.banUntil });
      res.json({ ok: true, castigo: s });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.use("/mod/api", api);
}
