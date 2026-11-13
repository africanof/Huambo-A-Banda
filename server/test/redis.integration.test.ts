import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION, S2C, type SpawnEntry, type WelcomeMessage } from "../src/net/protocol.js";

/**
 * Escala horizontal: dois processos independentes partilham matchmaking e presença
 * via Redis. Um jogador que entra pelo processo B tem de cair na mesma sala que
 * um jogador do processo A, e a regra "uma sessão por conta" vale entre processos.
 *
 * Corre apenas com TEST_REDIS_URL definido (o CI fornece um serviço Redis).
 */
const REDIS = process.env.TEST_REDIS_URL;
const base = 34000 + Math.floor(Math.random() * 1000);
const PORTS = [base, base + 1];
const procs: ChildProcess[] = [];

function startNode(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        PUBLIC_ADDRESS: `127.0.0.1:${port}`,
        REDIS_URL: REDIS,
        ALLOW_GUESTS: "true",
        GUEST_TOKEN_SECRET: "test-guest-secret-0123456789abcdef0123",
        LOG_LEVEL: "info",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => reject(new Error(`node ${port} did not start`)), 15_000);
    child.stdout!.on("data", (b: Buffer) => {
      if (b.toString().includes("servidor pronto")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.stderr!.on("data", (b: Buffer) => process.stderr.write(b));
  });
}

async function guest(port: number, name: string): Promise<string> {
  const r = await fetch(`http://127.0.0.1:${port}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return ((await r.json()) as { token: string }).token;
}

async function join(port: number, token: string) {
  const client = new Client(`http://127.0.0.1:${port}`);
  client.http.authToken = token;
  const inbox: Array<{ type: number; msg: unknown }> = [];
  const room: Room = await client.joinOrCreate("district", { v: PROTOCOL_VERSION, district: "sao_joao" });
  room.onMessage("*", (type, msg) => inbox.push({ type: type as number, msg }));
  return { room, inbox };
}

const until = async <T>(fn: () => T | undefined, ms = 5000): Promise<T> => {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe.skipIf(!REDIS)("multi-process via Redis", () => {
  beforeAll(async () => {
    for (const p of PORTS) procs.push(await startNode(p));
  }, 30_000);

  afterAll(() => {
    for (const p of procs) p.kill("SIGTERM");
  });

  it("players entering through different processes share the same district room", async () => {
    const a = await join(PORTS[0]!, await guest(PORTS[0]!, "Proc A"));
    const b = await join(PORTS[1]!, await guest(PORTS[1]!, "Proc B"));
    expect(b.room.roomId).toBe(a.room.roomId);

    const wb = await until(() => b.inbox.find((m) => m.type === S2C.WELCOME)?.msg as WelcomeMessage | undefined);
    const seen = await until(() =>
      a.inbox
        .filter((m) => m.type === S2C.SPAWN)
        .flatMap((m) => m.msg as SpawnEntry[])
        .find((e) => e[0] === wb.selfId),
    );
    expect(seen[1]).toBe("Proc B");
    await a.room.leave();
    await b.room.leave();
  });

  it("enforces one session per account across processes", async () => {
    const token = await guest(PORTS[0]!, "Dupla");
    const first = await join(PORTS[0]!, token);
    let kicked = false;
    first.room.onLeave(() => (kicked = true));
    const second = await join(PORTS[1]!, token);
    await until(() => kicked || undefined);
    await second.room.leave();
  });
});
