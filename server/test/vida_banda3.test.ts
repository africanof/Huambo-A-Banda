import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { NEGOCIOS, WEDDING_MIN_DATING_MS, WEDDING_PRICE, negocioPerHour } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup(district = "cidade_alta") {
  let now = Date.UTC(2026, 6, 10, 12);
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict(district)!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => now, () => 0.5);
  return { life, selves, toasts, d, wallets, advance: (ms: number) => (now += ms) };
}
const lastFor = (t: Array<[LifeActor, string]>, a: LifeActor) => [...t].reverse().find(([w]) => w === a)![1];

describe("namoro e casamento", () => {
  it("pedir perto, aceitar; casar só na igreja, com os dois lá e depois de namorar um bocado; divórcio no tribunal", async () => {
    const { life, selves, toasts, d, wallets, advance } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "na", x: sp.x, y: sp.y, eid: 1, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "nb", x: sp.x + 200, y: sp.y, eid: 2, userId: "u-b", name: "Beto" };
    await life.join(a, null);
    await life.join(b, null);
    await life.handle(a, { a: "namoro_pedir", i: "2" });
    expect(selves.get(b)!.loveReq).toEqual({ name: "Ana" });
    await life.handle(b, { a: "namoro_aceitar" });
    expect(selves.get(a)!.partner?.name).toBe("Beto");
    expect(selves.get(b)!.partner?.name).toBe("Ana");
    // fora da igreja: não
    await life.handle(a, { a: "casar" });
    expect(lastFor(toasts, a)).toMatch(/igreja/);
    const church = d.places!.find((p) => p.kind === "door" && p.venue === "igreja")!;
    for (const x of [a, b]) {
      Object.assign(x, { x: church.x, y: church.y });
      await life.handle(x, { a: "enter" });
    }
    expect(interiorAt(d, a.x, a.y)?.venue).toBe("igreja");
    await life.handle(a, { a: "casar" });
    expect(lastFor(toasts, a)).toMatch(/cedo/);
    advance(WEDDING_MIN_DATING_MS + 1000);
    await wallets.apply("na", 50_000, "teste", "t-na");
    await life.handle(a, { a: "self" });
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "casar" });
    expect(selves.get(b)!.weddingReq).toEqual({ name: "Ana" });
    await life.handle(b, { a: "casar_aceitar" });
    expect(selves.get(a)!.partner?.married).toBe(true);
    expect(selves.get(b)!.partner?.married).toBe(true);
    expect(selves.get(a)!.money).toBe(m0 - WEDDING_PRICE);
    // divórcio: na igreja não; no tribunal sim
    await life.handle(a, { a: "terminar" });
    expect(lastFor(toasts, a)).toMatch(/Tribunal/);
    const trib = d.places!.find((p) => p.kind === "door" && (p.venue === "tribunal" || p.venue === "administracao"))!;
    for (const x of [a, b]) {
      await life.handle(x, { a: "exit" });
      Object.assign(x, { x: trib.x, y: trib.y });
    }
    await life.handle(a, { a: "enter" });
    await life.handle(a, { a: "terminar" });
    expect(selves.get(a)!.partner).toBeNull();
    expect(selves.get(b)!.partner).toBeNull();
  });
});

describe("negócios", () => {
  it("abrir só na Administração com BI; o lucro junta-se por hora até 12 h; melhorar e vender", async () => {
    const { life, selves, toasts, d, wallets, advance } = setup();
    const adm = d.places!.find((p) => p.kind === "door" && p.venue === "administracao")!;
    const a: LifeActor = { characterId: "ng", x: adm.x, y: adm.y, userId: "u-n", name: "Nzinga" };
    await life.join(a, null);
    await wallets.apply("ng", 500_000, "teste", "t-ng");
    await life.handle(a, { a: "negocio_abrir", i: "quiosque" });
    expect(lastFor(toasts, a)).toMatch(/Administração/);
    await life.handle(a, { a: "enter" });
    await life.handle(a, { a: "negocio_abrir", i: "quiosque" });
    expect(lastFor(toasts, a)).toMatch(/BI/);
    // tira o BI no balcão de atendimento
    const bal = d.places!.find((p) => p.interior === interiorAt(d, a.x, a.y)!.id && p.kind === "service")!;
    Object.assign(a, { x: bal.x, y: bal.y });
    await life.handle(a, { a: "service", i: "bi_admin" });
    expect(selves.get(a)!.docs.bi).toBe(true);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "negocio_abrir", i: "quiosque" });
    expect(selves.get(a)!.money).toBe(m0 - NEGOCIOS.quiosque!.cost);
    advance(3 * 3_600_000);
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.negocio?.pendente).toBe(3 * negocioPerHour("quiosque", 1));
    const m1 = selves.get(a)!.money;
    await life.handle(a, { a: "negocio_recolher" });
    expect(selves.get(a)!.money).toBe(m1 + 3 * negocioPerHour("quiosque", 1));
    advance(30 * 3_600_000); // fica fora muito tempo: só conta 12 h
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.negocio?.pendente).toBe(12 * negocioPerHour("quiosque", 1));
    await life.handle(a, { a: "negocio_melhorar" });
    expect(selves.get(a)!.negocio?.nivel).toBe(2);
    expect(selves.get(a)!.negocio?.perHour).toBe(negocioPerHour("quiosque", 2));
    await life.handle(a, { a: "negocio_vender" });
    expect(selves.get(a)!.negocio).toBeNull();
  });
});

describe("imóveis", () => {
  it("lista as casas e prédios do bairro com frações livres e preços", async () => {
    const { life, selves, d } = setup();
    const a: LifeActor = { characterId: "im", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    await life.handle(a, { a: "imoveis" });
    const l = selves.get(a)!.imoveis!;
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((x) => x.total >= 1 && x.free <= x.total && x.buy > 0)).toBe(true);
  });
});
