import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { createGameServer, ROOM_DISTRICT } from "../src/app.js";
import { C2S, PROTOCOL_VERSION, S2C, type SnapshotMessage, type SpawnEntry, type WelcomeMessage } from "../src/net/protocol.js";
import { testEnv } from "./helpers.js";

const PORT = 31000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
let server: Server;

async function guestToken(name: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** Liga um cliente e regista todas as mensagens recebidas para inspeção. */
async function connect(token: string | undefined, options: Record<string, unknown> = { v: PROTOCOL_VERSION, district: "cidade_baixa" }) {
  const client = new Client(BASE);
  if (token) client.http.authToken = token;
  const inbox: Array<{ type: number; msg: unknown }> = [];
  const room: Room = await client.joinOrCreate(ROOM_DISTRICT, options);
  room.onMessage("*", (type, msg) => inbox.push({ type: type as number, msg }));
  return { room, inbox };
}

function waitFor<T>(fn: () => T | undefined, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const iv = setInterval(() => {
      const v = fn();
      if (v !== undefined && v !== false) {
        clearInterval(iv);
        resolve(v);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(iv);
        reject(new Error("timeout"));
      }
    }, 10);
  });
}

const first = <T>(inbox: Array<{ type: number; msg: unknown }>, type: number) =>
  inbox.find((m) => m.type === type)?.msg as T | undefined;

beforeAll(async () => {
  ({ server } = createGameServer(testEnv()));
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("HTTP", () => {
  it("exposes health and districts", async () => {
    const health = (await (await fetch(`${BASE}/health`)).json()) as { ok: boolean; protocol: number };
    expect(health).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION });
    const districts = (await (await fetch(`${BASE}/districts`)).json()) as Array<{ id: string }>;
    expect(districts.map((d) => d.id)).toContain("cidade_baixa");
  });
});

describe("DistrictRoom", () => {
  it("rejects joins without a valid token", async () => {
    await expect(connect(undefined)).rejects.toThrow();
    await expect(connect("not-a-jwt")).rejects.toThrow();
  });

  it("rejects wrong protocol version and unknown districts", async () => {
    const token = await guestToken("Teste");
    await expect(connect(token, { v: 999, district: "cidade_baixa" })).rejects.toThrow(/protocol/);
    await expect(connect(token, { v: PROTOCOL_VERSION, district: "atlantida" })).rejects.toThrow();
  });

  it("syncs two players: welcome, spawn, movement snapshots, despawn", async () => {
    const a = await connect(await guestToken("Ana"));
    const welcomeA = await waitFor(() => first<WelcomeMessage>(a.inbox, S2C.WELCOME));
    expect(welcomeA.district.id).toBe("cidade_baixa");
    expect(welcomeA.district.obstacles.length).toBeGreaterThan(0);

    const b = await connect(await guestToken("Bento"));
    const welcomeB = await waitFor(() => first<WelcomeMessage>(b.inbox, S2C.WELCOME));
    expect(a.room.roomId).toBe(b.room.roomId); // mesma instância do bairro

    // A vê o B a aparecer (e vice-versa) graças ao AOI.
    const spawnOfB = await waitFor(() =>
      a.inbox
        .filter((m) => m.type === S2C.SPAWN)
        .flatMap((m) => m.msg as SpawnEntry[])
        .find((e) => e[0] === welcomeB.selfId),
    );
    expect(spawnOfB[1]).toBe("Bento");

    // A anda; B recebe snapshots com a nova posição de A.
    a.room.send(C2S.MOVE_TO, { x: 1250, y: 760 });
    const moved = await waitFor(() =>
      b.inbox
        .filter((m) => m.type === S2C.SNAPSHOT)
        .map((m) => (m.msg as SnapshotMessage).e)
        .find((e) => e.includes(welcomeA.selfId)),
    );
    expect(moved.length % 3).toBe(0);

    // Payload inválido é ignorado sem derrubar a sala.
    a.room.send(C2S.MOVE_TO, { x: "drop table", y: 1 });
    a.room.send(C2S.MOVE_TO, { x: 1, y: 2, extra: true });

    // B sai; A recebe DESPAWN.
    await b.room.leave();
    const despawn = await waitFor(() =>
      a.inbox.find((m) => m.type === S2C.DESPAWN && (m.msg as number[]).includes(welcomeB.selfId)),
    );
    expect(despawn).toBeDefined();
    expect(a.room.connection.isOpen).toBe(true);
    await a.room.leave();
  });

  it("restores the last position when the same account comes back", async () => {
    const token = await guestToken("Carla");
    const c1 = await connect(token);
    c1.room.send(C2S.MOVE_TO, { x: 1150, y: 900 });
    const w1 = await waitFor(() => first<WelcomeMessage>(c1.inbox, S2C.WELCOME));
    await waitFor(() =>
      c1.inbox.some((m) => {
        if (m.type !== S2C.SNAPSHOT) return false;
        const e = (m.msg as SnapshotMessage).e;
        for (let i = 0; i < e.length; i += 3) if (e[i] === w1.selfId && e[i + 1] === 1150 && e[i + 2] === 900) return true;
        return false;
      }) || undefined,
    );
    await c1.room.leave();

    const c2 = await connect(token);
    const welcome = await waitFor(() => first<WelcomeMessage>(c2.inbox, S2C.WELCOME));
    const self = await waitFor(() =>
      c2.inbox
        .filter((m) => m.type === S2C.SPAWN)
        .flatMap((m) => m.msg as SpawnEntry[])
        .find((e) => e[0] === welcome.selfId),
    );
    expect([self[2], self[3]]).toEqual([1150, 900]);
    await c2.room.leave();
  });

  it("kicks the older session when the same account joins twice", async () => {
    const token = await guestToken("Dário");
    const s1 = await connect(token);
    await waitFor(() => first<WelcomeMessage>(s1.inbox, S2C.WELCOME));
    let leftCode: number | undefined;
    s1.room.onLeave((code) => (leftCode = code));

    const s2 = await connect(token);
    await waitFor(() => first<WelcomeMessage>(s2.inbox, S2C.WELCOME));
    await waitFor(() => leftCode);
    expect(s2.room.connection.isOpen).toBe(true);
    await s2.room.leave();
  });
});
