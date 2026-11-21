import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { carnaval, dayPrize, easter, eventsAt, hasEvent, isHoliday, upcoming } from "../src/game/events.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { PRESENTES } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

// meio-dia em Angola nesse dia
const at = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 1);

describe("calendário real", () => {
  it("Páscoa e Carnaval nas datas certas", () => {
    expect(easter(2025)).toEqual({ month: 4, day: 20 });
    expect(easter(2026)).toEqual({ month: 4, day: 5 });
    expect(easter(2027)).toEqual({ month: 3, day: 28 });
    expect(carnaval(2026)).toEqual({ month: 2, day: 17 }); // terça-feira de Carnaval
    expect(carnaval(2027)).toEqual({ month: 2, day: 9 });
    expect(hasEvent(at(2026, 2, 17), "carnaval")).toBe(true);
  });

  it("feriados nacionais e datas do Huambo", () => {
    expect(hasEvent(at(2026, 11, 11), "independencia")).toBe(true);
    expect(isHoliday(at(2026, 11, 11))).toBe(true);
    expect(hasEvent(at(2026, 4, 4), "paz")).toBe(true);
    expect(hasEvent(at(2026, 8, 8), "aniversario")).toBe(true);
    expect(isHoliday(at(2026, 8, 8))).toBe(false); // aniversário da cidade não é feriado nacional
    expect(isHoliday(at(2026, 11, 12))).toBe(false);
    expect(hasEvent(at(2026, 5, 10), "colheita")).toBe(true);
    expect(hasEvent(at(2026, 7, 10), "colheita")).toBe(false);
    expect(hasEvent(at(2026, 12, 22), "quadra_natal")).toBe(true);
    expect(dayPrize(at(2026, 11, 11))).toMatchObject({ id: "independencia", premio: 3000 });
    expect(eventsAt(at(2026, 11, 11, 0) + 30 * 60_000).some((e) => e.id === "independencia")).toBe(true); // 00:30 em Angola
  });

  it("agenda: próximas datas por ordem e em quantos dias", () => {
    const a = upcoming(at(2026, 11, 21), 3);
    expect(a.map((x) => x.id)).toEqual(["natal", "passagem", "ano_novo"]);
    expect(a[0]).toMatchObject({ date: "25/12", inDays: 34, feriado: true });
  });
});

function setup(now: number) {
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: string[] = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => now, () => 0.5);
  return { life, selves, toasts, d, wallets };
}

describe("efeitos dos eventos no jogo", () => {
  it("prenda do dia: uma vez por pessoa; dias sem evento não têm", async () => {
    const { life, selves, toasts, d, wallets } = setup(at(2026, 11, 11));
    const a: LifeActor = { characterId: "ev", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    expect(selves.get(a)!.prendaHoje).toMatchObject({ premio: 3000, recolhida: false });
    const m0 = await wallets.balance("ev");
    await life.handle(a, { a: "evento_recolher" });
    await life.handle(a, { a: "evento_recolher" });
    expect(toasts.at(-1)).toMatch(/Já recolheste/);
    expect(await wallets.balance("ev")).toBe(m0 + 3000);
    expect(selves.get(a)!.prendaHoje!.recolhida).toBe(true);
    const b = setup(at(2026, 11, 12));
    const x: LifeActor = { characterId: "ev2", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await b.life.join(x, null);
    await b.life.handle(x, { a: "evento_recolher" });
    expect(b.toasts.at(-1)).toMatch(/não há prenda/);
  });

  it("quadra do Natal: presentes a metade", async () => {
    const { life, d, wallets } = setup(at(2026, 12, 22));
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "na", x: sp.x, y: sp.y, name: "Ana" };
    await life.join(a, { friends: [{ id: "nb", name: "Beto" }] });
    await wallets.apply("na", 10_000, "teste", "t-na");
    await life.handle(a, { a: "self" });
    const m0 = await wallets.balance("na");
    await life.handle(a, { a: "presente", n: 1, i: "perfume" });
    expect(await wallets.balance("na")).toBe(m0 - PRESENTES.perfume!.price / 2);
  });
});
