import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { DENUNCIAS_POR_DIA } from "../src/game/life.js";
import { MemoryReportRepository } from "../src/persistence/ReportRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup() {
  const wallets = new MemoryWalletRepository();
  const reports = new MemoryReportRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(
    d,
    wallets,
    { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]), recentChat: (cid) => (cid === "bb" ? ["és um burro"] : []) },
    () => Date.UTC(2026, 6, 8, 10),
    () => 0.5,
    { reports },
  );
  return { life, selves, toasts, d, wallets, reports };
}
const last = (t: Array<[LifeActor, string]>, a: LifeActor) => [...t].reverse().find(([w]) => w === a)![1];

describe("bloquear e denunciar", () => {
  it("bloquear corta pedidos, presentes e dinheiro dessa pessoa; desbloquear volta ao normal", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "aa", eid: 1, x: sp.x, y: sp.y, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "bb", eid: 2, x: sp.x, y: sp.y, userId: "u-b", name: "Beto" };
    await life.join(a, { friends: [{ id: "bb", name: "Beto" }] });
    await life.join(b, { friends: [{ id: "aa", name: "Ana" }] });
    await wallets.apply("bb", 50_000, "teste", "t-bb");
    await life.handle(b, { a: "self" });
    await life.handle(a, { a: "bloquear", i: "2" });
    expect(selves.get(a)!.bloqueados).toEqual([{ name: "Beto" }]);
    expect(selves.get(a)!.friends).toEqual([]);
    expect(life.blocks(a, "bb")).toBe(true);
    expect(life.blocks(b, "aa")).toBe(false);
    await life.handle(b, { a: "amigo_pedir", i: "1" });
    expect(last(toasts, b)).toMatch(/Não podes/);
    await life.handle(b, { a: "namoro_pedir", i: "1" });
    expect(last(toasts, b)).toMatch(/Não podes/);
    expect(selves.get(b)!.friends).toEqual([]); // a amizade acaba dos dois lados
    await life.handle(b, { a: "presente", n: 1, i: "flores" });
    expect(last(toasts, b)).toMatch(/Escolhe a quem|não aceita/);
    const m = await wallets.balance("bb");
    await life.handle(b, { a: "transfer", i: "1", n: 1000 });
    expect(await wallets.balance("bb")).toBe(m);
    await life.handle(a, { a: "desbloquear", n: 1 });
    expect(life.blocks(a, "bb")).toBe(false);
    await life.handle(b, { a: "amigo_pedir", i: "1" });
    expect(last(toasts, b)).toMatch(/Pedido de amizade enviado/);
  });

  it("denúncia guarda motivo e falas recentes; convidados não denunciam; limite por dia", async () => {
    const { life, toasts, d, reports } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "aa", eid: 1, x: sp.x, y: sp.y, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "bb", eid: 2, x: sp.x, y: sp.y, userId: "u-b", name: "Beto" };
    const g: LifeActor = { characterId: "gg", eid: 3, x: sp.x, y: sp.y, userId: "guest:1", name: "Conv" };
    for (const x of [a, b, g]) await life.join(x, null);
    await life.handle(a, { a: "denunciar", n: 2, i: "batata" });
    expect(last(toasts, a)).toMatch(/motivo/);
    await life.handle(a, { a: "denunciar", n: 2, i: "insultos", s: "chamou-me nomes" });
    expect(reports.rows[0]).toMatchObject({ reporter: "aa", reported: "bb", reason: "insultos: chamou-me nomes", context: ["és um burro"], bairro: "cidade_alta" });
    await life.handle(g, { a: "denunciar", n: 2, i: "insultos" });
    expect(last(toasts, g)).toMatch(/conta/);
    for (let k = 1; k < DENUNCIAS_POR_DIA; k++) await life.handle(a, { a: "denunciar", n: 2, i: "outro" });
    await life.handle(a, { a: "denunciar", n: 2, i: "outro" });
    expect(last(toasts, a)).toMatch(/muitas denúncias/);
    expect(reports.rows).toHaveLength(DENUNCIAS_POR_DIA);
  });
});

describe("extrato", () => {
  it("mostra os últimos movimentos da carteira, o mais recente primeiro", async () => {
    const { life, selves, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "ex", x: sp.x, y: sp.y };
    await life.join(a, null);
    await wallets.apply("ex", 10_000, "teste.entrada", "t-ex");
    await life.handle(a, { a: "self" });
    await life.handle(a, { a: "seguro_comprar" });
    await life.handle(a, { a: "extrato" });
    const ex = selves.get(a)!.extrato!;
    expect(ex[0]).toMatchObject({ amount: -4000, reason: "seguro.saude" });
    expect(ex[1]).toMatchObject({ amount: 10_000, reason: "teste.entrada" });
    expect(ex[0]!.balance).toBe(ex[1]!.balance - 4000);
  });
});
