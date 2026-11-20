import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { rollSorte, TRANSFER_MAX } from "../src/game/life.js";
import { BurstLimiter, CHAT_MAX, sanitizeChat } from "../src/game/social.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("conversa (Falar)", () => {
  it("limpa o texto: espaços, controlo, tamanho e palavrões", () => {
    expect(sanitizeChat("  olá   mano \u0007 ")).toBe("olá mano");
    expect(sanitizeChat("")).toBeNull();
    expect(sanitizeChat(42)).toBeNull();
    expect([...sanitizeChat("a".repeat(500))!].length).toBe(CHAT_MAX);
    expect(sanitizeChat("isso é uma merda")).toBe("isso é uma *****");
    expect(sanitizeChat("merdaville não")).toBe("merdaville não"); // só palavras inteiras
  });

  it("limite: no máximo 5 mensagens em 10 s por pessoa", () => {
    let t = 0;
    const l = new BurstLimiter(5, 10_000, () => t);
    for (let i = 0; i < 5; i++) expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
    expect(l.take("b")).toBe(true);
    t = 10_001;
    expect(l.take("a")).toBe(true);
  });
});

function setup(rand = 0.5) {
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict("cidade_baixa")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => Date.UTC(2026, 10, 20, 12), () => rand);
  const sp = d.spawns[0]!;
  return { life, selves, toasts, sp };
}

describe("sorte do dia", () => {
  it("tabela: de nada a 10 000 Kz", () => {
    expect(rollSorte(0)).toBe(0);
    expect(rollSorte(0.5)).toBe(200);
    expect(rollSorte(0.999)).toBe(10000);
  });

  it("uma vez por dia, prémio pago pelo servidor", async () => {
    const { life, selves, toasts, sp } = setup(0.8); // 0.8 → 500 Kz
    const a: LifeActor = { characterId: "s1", x: sp.x, y: sp.y };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "sorte" });
    expect(selves.get(a)!.money).toBe(m0 + 500);
    expect(selves.get(a)!.sorteHoje).toBe(true);
    await life.handle(a, { a: "sorte" });
    expect(selves.get(a)!.money).toBe(m0 + 500);
    expect(toasts.at(-1)![1]).toMatch(/Já rodaste/);
  });
});

describe("transferir dinheiro", () => {
  it("dá dinheiro a quem está perto; recusa convidados, longe, quantias fora dos limites e sem saldo", async () => {
    const { life, selves, toasts, sp } = setup();
    const a: LifeActor = { characterId: "ta", x: sp.x, y: sp.y, eid: 1, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "tb", x: sp.x + 300, y: sp.y, eid: 2, userId: "u-b", name: "Beto" };
    const g: LifeActor = { characterId: "tg", x: sp.x, y: sp.y + 100, eid: 3, userId: "guest:x", name: "Visitante" };
    for (const x of [a, b, g]) await life.join(x, null);
    const ma = selves.get(a)!.money, mb = selves.get(b)!.money;
    await life.handle(a, { a: "transfer", i: "2", n: 1000 });
    expect(selves.get(a)!.money).toBe(ma - 1000);
    expect(selves.get(b)!.money).toBe(mb + 1000);
    expect(toasts.some(([who, t]) => who === b && /Ana deu-te 1/.test(t))).toBe(true);
    // convidado não envia nem recebe
    await life.handle(g, { a: "transfer", i: "1", n: 500 });
    expect(toasts.at(-1)![1]).toMatch(/precisas de uma conta/);
    await life.handle(a, { a: "transfer", i: "3", n: 500 });
    expect(toasts.at(-1)![1]).toMatch(/convidado/);
    // limites
    await life.handle(a, { a: "transfer", i: "2", n: 50 });
    await life.handle(a, { a: "transfer", i: "2", n: TRANSFER_MAX + 1 });
    expect(selves.get(a)!.money).toBe(ma - 1000);
    // longe
    Object.assign(b, { x: sp.x + 5000 });
    await life.handle(a, { a: "transfer", i: "2", n: 500 });
    expect(toasts.at(-1)![1]).toMatch(/Aproxima-te/);
    // sem saldo
    Object.assign(b, { x: sp.x + 100 });
    await life.handle(a, { a: "transfer", i: "2", n: TRANSFER_MAX });
    if (ma - 1000 < TRANSFER_MAX) expect(toasts.at(-1)![1]).toMatch(/dinheiro suficiente/);
    expect(selves.get(a)!.money).toBeGreaterThanOrEqual(0);
  });

  it("falar com alguém perto conta para a missão «Falar com outro jogador»", async () => {
    const { life, selves, sp } = setup();
    const { missionsFor } = await import("../src/game/life.js");
    let cid = "";
    for (let k = 0; k < 500 && !cid; k++) if (missionsFor("2026-11-20", "c" + k).includes("conversar")) cid = "c" + k;
    const a: LifeActor = { characterId: cid, x: sp.x, y: sp.y };
    await life.join(a, null);
    life.social(a, "conversar");
    expect(selves.get(a)!.missions.items.find((m) => m.id === "conversar")!.done).toBe(true);
  });
});
