import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { TokenVerifier, sanitizeDisplayName } from "../src/auth/TokenVerifier.js";
import { testEnv } from "./helpers.js";

describe("TokenVerifier", () => {
  const supaSecret = "super-secret-jwt-token-with-at-least-32-characters-long";
  const env = testEnv({ SUPABASE_URL: "https://proj.supabase.co", SUPABASE_JWT_SECRET: supaSecret });
  const v = new TokenVerifier(env);

  it("issues and verifies guest tokens", async () => {
    const { token, identity } = await v.issueGuestToken("Kiala");
    expect(identity.displayName).toBe("Kiala");
    const id = await v.verify(token);
    expect(id).toMatchObject({ kind: "guest", userId: identity.userId, displayName: "Kiala" });
  });

  it("verifies Supabase (HS256) access tokens", async () => {
    const token = await new SignJWT({ role: "authenticated", user_metadata: { display_name: "Nzinga" } })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("6f1d2c1e-0000-4000-8000-000000000001")
      .setIssuer("https://proj.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(supaSecret));
    expect(await v.verify(token)).toEqual({ kind: "user", userId: "6f1d2c1e-0000-4000-8000-000000000001", displayName: "Nzinga" });
  });

  it("rejects forged, expired and anon tokens", async () => {
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("x")
      .setIssuer("https://proj.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("another-secret-that-is-long-enough-000000"));
    expect(await v.verify(forged)).toBeNull();

    const expired = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("x")
      .setIssuer("https://proj.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(supaSecret));
    expect(await v.verify(expired)).toBeNull();

    const anon = await new SignJWT({ role: "anon" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("x")
      .setIssuer("https://proj.supabase.co/auth/v1")
      .setAudience("authenticated")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(supaSecret));
    expect(await v.verify(anon)).toBeNull();

    expect(await v.verify("garbage")).toBeNull();
    expect(await v.verify(undefined)).toBeNull();
  });

  it("sanitizes display names", () => {
    expect(sanitizeDisplayName("  João   Baptista ")).toBe("João Baptista");
    expect(sanitizeDisplayName("<script>")).toBeUndefined();
    expect(sanitizeDisplayName("a")).toBeUndefined();
  });
});
