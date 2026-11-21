import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import type { Server } from "@colyseus/core";
import { createGameServer, ROOM_DISTRICT } from "../src/app.js";
import { PROTOCOL_VERSION } from "../src/net/protocol.js";
import { testEnv } from "./helpers.js";

const PORT = 35100 + Math.floor(Math.random() * 1500);
const BASE = `http://127.0.0.1:${PORT}`;
let server: Server;

beforeAll(async () => {
  ({ server } = createGameServer(testEnv()));
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

describe("apagar a conta", () => {
  it("pede confirmação; apaga a personagem e põe a pessoa fora do jogo", async () => {
    const r = await fetch(`${BASE}/auth/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Apagavel" }) });
    const { token } = (await r.json()) as { token: string };
    const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    await fetch(`${BASE}/me/character`, { method: "POST", headers: H, body: JSON.stringify({ name: "Zeca Apagado" }) });
    expect(((await (await fetch(`${BASE}/me/character`, { headers: H })).json()) as { name: string }).name).toBe("Zeca Apagado");
    const client = new Client(BASE);
    client.http.authToken = token;
    const room: Room = await client.joinOrCreate(ROOM_DISTRICT, { v: PROTOCOL_VERSION, district: "teste_a" });
    let left = false;
    room.onLeave(() => (left = true));

    expect((await fetch(`${BASE}/me/delete`, { method: "POST", headers: H, body: JSON.stringify({}) })).status).toBe(400);
    expect((await fetch(`${BASE}/me/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "APAGAR" }) })).status).toBe(401);
    expect((await fetch(`${BASE}/me/delete`, { method: "POST", headers: H, body: JSON.stringify({ confirm: "APAGAR" }) })).status).toBe(200);
    const t0 = Date.now();
    while (!left && Date.now() - t0 < 3000) await new Promise((res) => setTimeout(res, 20));
    expect(left).toBe(true);
    // a personagem antiga já não existe (uma entrada nova começa do zero)
    const again = (await (await fetch(`${BASE}/me/character`, { headers: H })).json()) as { name: string };
    expect(again.name).not.toBe("Zeca Apagado");
  });
});
