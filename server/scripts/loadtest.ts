/**
 * Teste de carga: N bots entram (como convidados) e andam aleatoriamente.
 *
 *   npm run loadtest -- --url=http://127.0.0.1:2567 --bots=200 --seconds=30
 *
 * Mede: tempo de entrada, mensagens e bytes recebidos por bot/segundo.
 * Use contra um servidor com ALLOW_GUESTS=true e um limite de /auth/guest alto
 * (ou vários IPs) — o limite por IP existe precisamente para impedir isto em produção.
 */
import { Client, type Room } from "@colyseus/sdk";
import { C2S, PROTOCOL_VERSION } from "../src/net/protocol.js";

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const URL = arg("url", "http://127.0.0.1:2567");
const BOTS = Number(arg("bots", "100"));
const SECONDS = Number(arg("seconds", "20"));
const DISTRICT = arg("district", "cidade_baixa");
const TOKEN = arg("token", ""); // opcional: reutilizar um token pré-emitido

let messages = 0;
let bytes = 0;
const joinTimes: number[] = [];
const rooms: Room[] = [];

async function bot(i: number): Promise<void> {
  let token = TOKEN;
  if (!token) {
    const r = await fetch(`${URL}/auth/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `Bot${i}` }) });
    if (!r.ok) throw new Error(`guest ${r.status}`);
    token = ((await r.json()) as { token: string }).token;
  }
  const client = new Client(URL);
  client.http.authToken = token;
  const t0 = performance.now();
  const room = await client.joinOrCreate("district", { v: PROTOCOL_VERSION, district: DISTRICT });
  joinTimes.push(performance.now() - t0);
  room.onMessage("*", (_t, m) => {
    messages++;
    bytes += JSON.stringify(m ?? null).length; // aproximação (o fio é msgpack, mais pequeno)
  });
  rooms.push(room);
  const walk = () => room.send(C2S.MOVE_TO, { x: 100 + Math.random() * 2200, y: 100 + Math.random() * 1400 });
  walk();
  setInterval(walk, 3000 + Math.random() * 4000);
}

async function main(): Promise<void> {
  console.log(`a ligar ${BOTS} bots a ${URL} (${DISTRICT})…`);
  const results = await Promise.allSettled(Array.from({ length: BOTS }, (_, i) => bot(i)));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) console.warn(`${failed.length} bots falharam:`, (failed[0] as PromiseRejectedResult).reason?.message);
  const sorted = [...joinTimes].sort((a, b) => a - b);
  console.log(`ligados: ${rooms.length} em ${new Set(rooms.map((r) => r.roomId)).size} salas · entrada p50=${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)}ms p95=${sorted[Math.floor(sorted.length * 0.95)]?.toFixed(0)}ms`);
  messages = 0;
  bytes = 0;
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const n = Math.max(1, rooms.length);
  console.log(`por bot: ${(messages / n / SECONDS).toFixed(1)} msg/s · ~${(bytes / n / SECONDS / 1024).toFixed(2)} KiB/s (JSON aprox.)`);
  await Promise.allSettled(rooms.map((r) => r.leave()));
  process.exit(0);
}

void main();
