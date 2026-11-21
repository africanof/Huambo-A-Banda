import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { createGameServer, ROOM_DISTRICT } from "../src/app.js";
import { C2S, PROTOCOL_VERSION, S2C } from "../src/net/protocol.js";
import type { Services } from "../src/services.js";
import { resetModeration } from "../src/game/moderation.js";
import { testEnv } from "./helpers.js";

const PORT = 33500 + Math.floor(Math.random() * 1500);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "chave-de-teste-do-painel-0123456789";
let server: Server;
let svc: Services;

async function guest(name: string) {
  const res = await fetch(`${BASE}/auth/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const token = ((await res.json()) as { token: string }).token;
  const id = await svc.verifier.verify(token);
  const ch = await svc.characters.loadOrCreate(id!);
  return { token, characterId: ch.id, name: ch.name };
}

async function join(token: string) {
  const client = new Client(BASE);
  client.http.authToken = token;
  const room: Room = await client.joinOrCreate(ROOM_DISTRICT, { v: PROTOCOL_VERSION, district: "teste_a" });
  const inbox: Array<{ type: number; msg: unknown }> = [];
  room.onMessage("*", (type, msg) => inbox.push({ type: type as number, msg }));
  return { room, inbox };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await wait(20);
  }
}
const mod = (path: string, body?: unknown, key = KEY) =>
  fetch(`${BASE}/mod/api${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeAll(async () => {
  resetModeration();
  ({ server, services: svc } = createGameServer(testEnv({ ADMIN_TOKEN: KEY })));
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("painel de moderação", () => {
  it("a página existe; a API pede a chave certa", async () => {
    const page = await fetch(`${BASE}/moderacao`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Moderação");
    expect((await mod("/castigos", undefined, "errada")).status).toBe(401);
    expect((await fetch(`${BASE}/mod/api/castigos`)).status).toBe(401);
    expect((await mod("/castigos")).status).toBe(200);
  });

  it("silenciar corta a conversa na hora; banir põe fora e impede de voltar; levantar devolve tudo", async () => {
    const a = await guest("Ana");
    const b = await guest("Beto");
    const A = await join(a.token);
    const B = await join(b.token);
    await svc.reports.add({ reporter: b.characterId, reporterName: b.name, reported: a.characterId, reportedName: a.name, reason: "insultos", bairro: "teste_a", context: ["xingou"] });
    const list = (await (await mod("/denuncias?status=novo")).json()) as { denuncias: Array<{ id: number; reported: string }> };
    const rep = list.denuncias.find((d) => d.reported === a.characterId)!;
    expect(rep).toBeTruthy();

    // silenciar 1 hora
    expect((await mod("/castigos", { characterId: a.characterId, name: a.name, muteHours: 1, reason: "insultos", reportId: rep.id })).status).toBe(200);
    await until(() => A.inbox.some((m) => m.type === S2C.TOAST && /silenciado/.test((m.msg as { t: string }).t)));
    A.room.send(C2S.CHAT, { t: "olá a todos" });
    await until(() => A.inbox.filter((m) => m.type === S2C.TOAST && /silenciado/.test((m.msg as { t: string }).t)).length >= 2);
    await wait(200);
    expect(B.inbox.some((m) => m.type === S2C.CHAT)).toBe(false);
    expect(((await (await mod("/denuncias?status=resolvido")).json()) as { denuncias: Array<{ id: number }> }).denuncias.some((d) => d.id === rep.id)).toBe(true);

    // banir 1 dia: sai já e não volta a entrar
    let left = false;
    A.room.onLeave(() => (left = true));
    await mod("/castigos", { characterId: a.characterId, name: a.name, banHours: 24, reason: "reincidente" });
    await until(() => left);
    await expect(join(a.token)).rejects.toThrow(/banido/);
    const active = (await (await mod("/castigos")).json()) as { castigos: Array<{ characterId: string }> };
    expect(active.castigos.some((c) => c.characterId === a.characterId)).toBe(true);

    // levantar: volta a entrar e a falar
    await mod("/castigos", { characterId: a.characterId, name: a.name, muteHours: 0, banHours: 0, reason: "levantado" });
    const A2 = await join(a.token);
    await wait(300);
    A2.room.send(C2S.CHAT, { t: "voltei" });
    await until(() => B.inbox.some((m) => m.type === S2C.CHAT && (m.msg as { t: string }).t === "voltei"));
    await A2.room.leave();
    await B.room.leave();
  });
});
