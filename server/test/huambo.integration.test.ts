import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { createGameServer, ROOM_DISTRICT } from "../src/app.js";
import { getDistrict } from "../src/game/districts.js";
import { isWalkable } from "../src/game/movement.js";
import { C2S, PROTOCOL_VERSION, S2C, type SnapshotMessage, type SpawnEntry, type WelcomeMessage } from "../src/net/protocol.js";
import { testEnv } from "./helpers.js";

const PORT = 36000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const huambo = getDistrict("huambo_centro")!;
let server: Server;

async function guestToken(name: string): Promise<string> {
  const r = await fetch(`${BASE}/auth/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  return ((await r.json()) as { token: string }).token;
}

async function join(token: string, extra: Record<string, unknown> = {}) {
  const client = new Client(BASE);
  client.http.authToken = token;
  const inbox: Array<{ type: number; msg: unknown }> = [];
  const room: Room = await client.joinOrCreate(ROOM_DISTRICT, { v: PROTOCOL_VERSION, district: "huambo_centro", ...extra });
  room.onMessage("*", (type, msg) => inbox.push({ type: type as number, msg }));
  return { client, room, inbox };
}

const until = async <T>(fn: () => T | undefined | false, ms = 4000): Promise<T> => {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 15));
  }
};

const welcomeOf = (inbox: Array<{ type: number; msg: unknown }>) =>
  inbox.filter((m) => m.type === S2C.WELCOME).at(-1)?.msg as WelcomeMessage | undefined;

const selfPos = (inbox: Array<{ type: number; msg: unknown }>, eid: number): [number, number] | undefined => {
  let pos: [number, number] | undefined;
  for (const m of inbox) {
    if (m.type === S2C.SPAWN) for (const e of m.msg as SpawnEntry[]) if (e[0] === eid) pos = [e[2], e[3]];
    if (m.type === S2C.SNAPSHOT) {
      const e = (m.msg as SnapshotMessage).e;
      for (let i = 0; i < e.length; i += 3) if (e[i] === eid) pos = [e[i + 1]!, e[i + 2]!];
    }
  }
  return pos;
};

beforeAll(async () => {
  ({ server } = createGameServer(testEnv()));
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("Huambo map rooms", () => {
  it("welcomes with the map id/version and the real bairros", async () => {
    const a = await join(await guestToken("Kiala"), { spawn: "cidade_baixa" });
    const w = await until(() => welcomeOf(a.inbox));
    expect(w.district.map).toEqual(huambo.map);
    expect(w.district.bairros.map((b) => b.name)).toContain("Cidade Baixa");
    // apareceu perto da Estação do CFB (spawn da Cidade Baixa)
    const pos = await until(() => selfPos(a.inbox, w.selfId));
    const cb = huambo.spawns.find((s) => s.id === "cidade_baixa")!;
    expect(Math.hypot(pos[0] - cb.x, pos[1] - cb.y)).toBeLessThan(huambo.spawnRadius + 1);
    await a.room.leave();
  });

  it("moves with MOVE_DIR and stops with STOP, always on walkable ground", async () => {
    const a = await join(await guestToken("Nzinga"), { spawn: "cidade_alta" });
    const w = await until(() => welcomeOf(a.inbox));
    const start = await until(() => selfPos(a.inbox, w.selfId));
    a.room.send(C2S.MOVE_DIR, { x: 0, y: 100 });
    await until(() => {
      const p = selfPos(a.inbox, w.selfId)!;
      return p[1] !== start[1] || p[0] !== start[0];
    });
    a.room.send(C2S.STOP);
    await new Promise((r) => setTimeout(r, 300));
    const p1 = selfPos(a.inbox, w.selfId)!;
    await new Promise((r) => setTimeout(r, 300));
    expect(selfPos(a.inbox, w.selfId)).toEqual(p1); // parou
    expect(isWalkable(huambo, p1[0], p1[1])).toBe(true);
    // direção inválida é ignorada
    a.room.send(C2S.MOVE_DIR, { x: 5000, y: 0 });
    await a.room.leave();
  });

  it("follows a client path and rejects paths through buildings", async () => {
    const a = await join(await guestToken("Bela"), { spawn: "fatima" });
    const w = await until(() => welcomeOf(a.inbox));
    const [sx, sy] = await until(() => selfPos(a.inbox, w.selfId));
    // destino do outro lado do mapa em linha reta: atravessa edifícios → recusado
    a.room.send(C2S.MOVE_PATH, { p: [huambo.width - 300, 300] });
    await new Promise((r) => setTimeout(r, 400));
    expect(selfPos(a.inbox, w.selfId)).toEqual([sx, sy]);
    // um caminho curto válido é seguido até ao fim
    a.room.send(C2S.MOVE_PATH, { p: [sx + 16, sy, sx + 16, sy + 16] });
    await until(() => {
      const p = selfPos(a.inbox, w.selfId)!;
      return p[0] === sx + 16 && p[1] === sy + 16;
    });
    await a.room.leave();
  });

  it("GET/POST /me/character: guests can customise name and appearance; bad input rejected", async () => {
    const token = await guestToken("Teresa");
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const me = (await (await fetch(`${BASE}/me/character`, { headers: auth })).json()) as { name: string };
    expect(me.name).toBe("Teresa");
    const upd = await fetch(`${BASE}/me/character`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "Teresa Huambo", appearance: { body: 2, shirt: 4, hair: 1, pants: 3 } }),
    });
    expect(await upd.json()).toMatchObject({ name: "Teresa Huambo", appearance: { body: 2, shirt: 4, hair: 1, pants: 3 } });
    const bad = await fetch(`${BASE}/me/character`, { method: "POST", headers: auth, body: JSON.stringify({ appearance: { body: 99 } }) });
    expect(bad.status).toBe(400);
    expect((await fetch(`${BASE}/me/character`)).status).toBe(401);

    // a aparência escolhida aparece no SPAWN que os outros recebem
    const a = await join(token);
    const w = await until(() => welcomeOf(a.inbox));
    const self = await until(() =>
      a.inbox.filter((m) => m.type === S2C.SPAWN).flatMap((m) => m.msg as SpawnEntry[]).find((e) => e[0] === w.selfId),
    );
    expect(self[1]).toBe("Teresa Huambo");
    expect(self[4]).toMatchObject({ body: 2, shirt: 4 });
    await a.room.leave();
  });

  it("keeps the seat for a dropped connection and resumes with the reconnection token", async () => {
    const a = await join(await guestToken("Religa"), { spawn: "academico" });
    const w = await until(() => welcomeOf(a.inbox));
    const token = a.room.reconnectionToken;
    a.room.removeAllListeners();
    // queda de rede (não consentida): fecho sem LEAVE_ROOM
    (a.room.connection as unknown as { close(code?: number): void }).close(3000);
    await new Promise((r) => setTimeout(r, 300));

    const c = new Client(BASE);
    const back = await c.reconnect(token);
    const inbox: Array<{ type: number; msg: unknown }> = [];
    back.onMessage("*", (type, msg) => inbox.push({ type: type as number, msg }));
    const w2 = await until(() => welcomeOf(inbox));
    expect(w2.selfId).toBe(w.selfId); // a mesma entidade, não uma nova
    await back.leave();
  });
});
