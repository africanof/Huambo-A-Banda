import { configureLogger } from "../src/utils/logger.js";
import { loadEnv, type Env } from "../src/config/env.js";
import { registerTestDistricts } from "./districts.js";

registerTestDistricts();

configureLogger(process.env.TEST_LOG_LEVEL ?? "silent");

export function testEnv(over: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    ALLOW_GUESTS: "true",
    GUEST_TOKEN_SECRET: "test-guest-secret-0123456789abcdef0123",
    CORS_ORIGINS: "*",
    SNAPSHOT_HZ: "20",
    ...over,
  });
}
