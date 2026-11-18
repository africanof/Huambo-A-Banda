import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt, listDistricts } from "../src/game/districts.js";
import { isWalkable } from "../src/game/movement.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { TRAVEL_PRICE } from "../src/game/life.js";
import { MemoryBankRepository, MemoryPropertyRepository } from "../src/persistence/index.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const f = getDistrict("bairro_fatima")!;

describe("Bairro de Fátima (kit gerado por IA)", () => {
  it("existe, tem escolas, centro de saúde, igreja, mercado, discoteca e casas", () => {
    expect(f.name).toBe("Bairro de Fátima");
    const venues = new Set(f.places!.filter((p) => p.kind === "door").map((p) => p.venue));
    for (const v of ["escola", "saude", "igreja", "mercado", "esquadra", "farmacia", "discoteca", "hotel", "cantina", "churrasqueira", "administracao", "casa", "apartamentos"]) {
      expect(venues.has(v), v).toBe(true);
    }
  });

  it("em todos os bairros: portas na rua caminháveis, cada interior tem entrada, saída e pontos alcançáveis", () => {
    for (const d of listDistricts().filter((x) => x.interiors?.length)) {
      for (const p of d.places!) {
        expect(isWalkable(d, p.x, p.y), `${d.id} ${p.id}`).toBe(true);
      }
      for (const i of d.interiors!) {
        expect(isWalkable(d, i.entry.x, i.entry.y), `${d.id} entrada ${i.id}`).toBe(true);
        expect(interiorAt(d, i.entry.x, i.entry.y)?.id).toBe(i.id);
      }
    }
  });
});

describe("lugares novos funcionam", () => {
  function setup() {
    let now = Date.UTC(2026, 10, 18, 9, 0, 0);
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: string[] = [];
    const life = new LifeController(f, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => now, () => 0.6, {
      properties: new MemoryPropertyRepository(wallets),
      bank: new MemoryBankRepository(wallets),
    });
    return { life, toasts, me: (a: LifeActor) => selves.get(a)!, advance: (ms: number) => (now += ms) };
  }
  const door = (venue: string) => f.places!.find((p) => p.kind === "door" && p.venue === venue)!;
  const spot = (venue: string, kind: string) => {
    const i = f.interiors!.find((x) => x.venue === venue)!;
    return f.places!.find((p) => p.interior === i.id && p.kind === kind)!;
  };

  it("centro de saúde: consulta repõe a saúde; igreja: missa grátis melhora o humor", async () => {
    const t = setup();
    const a: LifeActor = { characterId: "mem-a", x: 0, y: 0 };
    await t.life.join(a, null);
    Object.assign(a, door("saude"));
    await t.life.handle(a, { a: "enter" });
    expect(t.me(a).inside?.venue).toBe("saude");
    t.life.lifeOf(a)!.needs.health = 40;
    Object.assign(a, spot("saude", "service"));
    await t.life.handle(a, { a: "service", i: "consulta" });
    expect(t.me(a).needs.health).toBe(80);
    await t.life.handle(a, { a: "exit" });
    Object.assign(a, door("igreja"));
    await t.life.handle(a, { a: "enter" });
    Object.assign(a, spot("igreja", "service"));
    const m0 = t.me(a).money;
    t.life.lifeOf(a)!.needs.mood = 50;
    await t.life.handle(a, { a: "service", i: "missa" });
    expect(t.me(a).money).toBe(m0);
    expect(t.me(a).needs.mood).toBe(65);
  });

  it("discoteca: dançar custa energia; mercado e churrasqueira servem comida", async () => {
    const t = setup();
    const a: LifeActor = { characterId: "mem-a", x: 0, y: 0 };
    await t.life.join(a, null);
    Object.assign(a, spot("discoteca", "service"));
    const e0 = t.me(a).needs.energy;
    await t.life.handle(a, { a: "service", i: "dancar" });
    expect(t.me(a).needs.energy).toBe(e0 - 10);
    Object.assign(a, spot("mercado", "food"));
    await t.life.handle(a, { a: "eat", i: "batata_doce" });
    expect(t.toasts.at(-1)).toMatch(/Batata-doce/);
    Object.assign(a, spot("churrasqueira", "food"));
    await t.life.handle(a, { a: "eat", i: "frango" });
    expect(t.toasts.at(-1)).toMatch(/Frango/);
  });

  it("viajar de candongueiro: paga e marca a viagem; não se viaja de dentro de um edifício", async () => {
    const t = setup();
    const a: LifeActor = { characterId: "mem-a", x: f.spawns[0]!.x, y: f.spawns[0]!.y };
    await t.life.join(a, null);
    const m0 = t.me(a).money;
    await t.life.handle(a, { a: "travel", i: "cidade_baixa" });
    expect(t.me(a).travel?.district).toBe("cidade_baixa");
    expect(t.me(a).money).toBe(m0 - TRAVEL_PRICE);
    await t.life.handle(a, { a: "travel", i: "bairro_inexistente" });
    expect(t.toasts.at(-1)).toMatch(/não existe/);
    Object.assign(a, door("farmacia"));
    await t.life.handle(a, { a: "enter" });
    await t.life.handle(a, { a: "travel", i: "cidade_baixa" });
    expect(t.toasts.at(-1)).toMatch(/Sai primeiro/);
  });
});

describe("cidade ligada a pé (ruas reais)", () => {
  const all = listDistricts().filter((d) => d.places?.some((p) => p.kind === "portal"));
  const links = new Map(all.map((d) => [d.id, d.places!.filter((p) => p.kind === "portal").map((p) => p.to!)]));

  it("todas as ligações têm volta e chega-se a pé a todos os bairros", () => {
    for (const [a, tos] of links) for (const b of tos) expect(links.get(b) ?? [], `${b} → ${a}`).toContain(a);
    const seen = new Set(["cidade_baixa"]);
    const stack = ["cidade_baixa"];
    while (stack.length) for (const n of links.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
    expect(seen.size).toBe(listDistricts().filter((d) => d.map?.id.startsWith("bairro:")).length);
  });

  it("chegar a pé aparece num sítio caminhável, perto da saída de volta", () => {
    for (const d of all) {
      for (const s of d.spawns.filter((x) => x.id.startsWith("from_"))) {
        expect(isWalkable(d, s.x, s.y), `${d.id} ${s.id}`).toBe(true);
      }
    }
  });

  it("ir a pé é grátis; de candongueiro paga", async () => {
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const ca = getDistrict("cidade_alta")!;
    const life = new LifeController(ca, wallets, { self: (a, s) => selves.set(a, s), toast: () => {} }, () => Date.UTC(2026, 10, 18), () => 0.6);
    const portal = ca.places!.find((p) => p.kind === "portal")!;
    const a: LifeActor = { characterId: "mem-p", x: portal.x, y: portal.y };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "travel", i: portal.to! });
    expect(selves.get(a)!.money).toBe(m0);
    expect(selves.get(a)!.travel).toMatchObject({ district: portal.to, onFoot: true, from: "cidade_alta" });
  });
});

describe("meios de transporte", () => {
  it("kupapata e táxi custam mais do que o candongueiro e dizem quanto tempo dura a viagem", async () => {
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const ca = getDistrict("cidade_alta")!;
    const life = new LifeController(ca, wallets, { self: (a, s) => selves.set(a, s), toast: () => {} }, () => Date.UTC(2026, 10, 18), () => 0.6);
    const a: LifeActor = { characterId: "mem-t", x: ca.spawns[0]!.x, y: ca.spawns[0]!.y };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "travel", i: "xipuli", t: "taxi" });
    expect(selves.get(a)!.money).toBe(m0 - 1500);
    expect(selves.get(a)!.travel).toMatchObject({ district: "xipuli", by: "taxi", seconds: 9 });
    await life.handle(a, { a: "travel", i: "lossambo", t: "kupapata" });
    expect(selves.get(a)!.money).toBe(m0 - 2000);
  });
});

describe("autocarro e carro", () => {
  it("autocarro é o mais barato; carro só para quem tem, e comprar carro pede casa", async () => {
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: string[] = [];
    const ca = getDistrict("cidade_alta")!;
    const life = new LifeController(ca, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => Date.UTC(2026, 10, 18), () => 0.9);
    const a: LifeActor = { characterId: "mem-c", x: ca.spawns[0]!.x, y: ca.spawns[0]!.y };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "travel", i: "xipuli", t: "autocarro" });
    expect(selves.get(a)!.money).toBe(m0 - 100);
    await life.handle(a, { a: "travel", i: "xipuli", t: "carro" });
    expect(toasts.at(-1)).toMatch(/não tens carro/);
    await life.handle(a, { a: "buy_car", i: "hilux" });
    expect(toasts.at(-1)).toMatch(/casa/);
    const door = ca.places!.find((p) => p.kind === "door" && p.venue === "casa")!;
    Object.assign(a, { x: door.x, y: door.y });
    await life.handle(a, { a: "buy_house", i: door.interiors![0]! });
    await life.handle(a, { a: "exit" });
    await life.handle(a, { a: "buy_car", i: "hilux" });
    expect(selves.get(a)!.car).toBe("hilux");
    const m1 = selves.get(a)!.money;
    await life.handle(a, { a: "travel", i: "xipuli", t: "carro" });
    expect(selves.get(a)!.money).toBe(m1 - 300);
    expect(selves.get(a)!.travel).toMatchObject({ by: "carro" });
  });
});
