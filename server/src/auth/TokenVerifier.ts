import { randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Env } from "../config/env.js";

/**
 * Identidade autenticada de quem entra numa sala.
 *
 * Decisão: a autenticação acontece no matchmaking HTTP (static onAuth) — um
 * token inválido nunca chega a reservar lugar numa sala.
 */
export interface Identity {
  userId: string;
  kind: "user" | "guest";
  displayName?: string;
}

const GUEST_ISSUER = "huambo-guest";
const GUEST_AUDIENCE = "huambo-game";
const NAME_RE = /^[\p{L}\p{N} _.-]{2,20}$/u;

export function sanitizeDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  return NAME_RE.test(name) ? name : undefined;
}

export class TokenVerifier {
  private readonly supabaseKeys?: JWTVerifyGetKey;
  private readonly supabaseSecret?: Uint8Array;
  private readonly guestSecret?: Uint8Array;
  private readonly supabaseIssuer?: string;

  constructor(private readonly env: Env) {
    if (env.SUPABASE_URL) {
      const base = env.SUPABASE_URL.replace(/\/+$/, "");
      this.supabaseIssuer = `${base}/auth/v1`;
      // Projetos Supabase recentes assinam com chaves assimétricas publicadas em JWKS.
      this.supabaseKeys = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      });
    }
    if (env.SUPABASE_JWT_SECRET) this.supabaseSecret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    if (env.ALLOW_GUESTS && env.GUEST_TOKEN_SECRET) this.guestSecret = new TextEncoder().encode(env.GUEST_TOKEN_SECRET);
  }

  get guestsEnabled(): boolean {
    return this.guestSecret !== undefined;
  }

  async issueGuestToken(requestedName?: unknown): Promise<{ token: string; identity: Identity; expiresIn: number }> {
    if (!this.guestSecret) throw new Error("guests disabled");
    const displayName = sanitizeDisplayName(requestedName) ?? `Visitante${Math.floor(1000 + Math.random() * 9000)}`;
    const userId = `guest:${randomUUID()}`;
    const expiresIn = 6 * 3600;
    const token = await new SignJWT({ name: displayName })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(GUEST_ISSUER)
      .setAudience(GUEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.guestSecret);
    return { token, identity: { userId, kind: "guest", displayName }, expiresIn };
  }

  /** Devolve a identidade ou null (nunca lança para tokens inválidos). */
  async verify(token: string | undefined): Promise<Identity | null> {
    if (!token || token.length > 4096) return null;

    const iss = peekIssuer(token);
    try {
      if (iss === GUEST_ISSUER) {
        if (!this.guestSecret) return null;
        const { payload } = await jwtVerify(token, this.guestSecret, {
          issuer: GUEST_ISSUER,
          audience: GUEST_AUDIENCE,
          algorithms: ["HS256"],
        });
        return toIdentity(payload, "guest");
      }

      if (this.supabaseIssuer && iss === this.supabaseIssuer) {
        const opts = { issuer: this.supabaseIssuer, audience: "authenticated" };
        const { payload } = this.supabaseSecret
          ? await jwtVerify(token, this.supabaseSecret, { ...opts, algorithms: ["HS256"] }).catch(() =>
              jwtVerify(token, this.supabaseKeys!, { ...opts, algorithms: ["ES256", "RS256"] }),
            )
          : await jwtVerify(token, this.supabaseKeys!, { ...opts, algorithms: ["ES256", "RS256"] });
        if (payload.role !== "authenticated") return null;
        const meta = (payload as { user_metadata?: { display_name?: unknown } }).user_metadata;
        return { ...toIdentity(payload, "user")!, displayName: sanitizeDisplayName(meta?.display_name) };
      }
    } catch {
      return null;
    }
    return null;
  }
}

function toIdentity(payload: JWTPayload, kind: Identity["kind"]): Identity | null {
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  return { userId: payload.sub, kind, displayName: sanitizeDisplayName((payload as { name?: unknown }).name) };
}

/** Lê o "iss" sem verificar, apenas para escolher a chave certa. A verificação vem a seguir. */
function peekIssuer(token: string): string | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { iss?: unknown };
    return typeof json.iss === "string" ? json.iss : undefined;
  } catch {
    return undefined;
  }
}
