import { beforeEach, describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { BISCATOS_PER_DAY, cambioPrices, cambioRate, CAMBIO_DAILY_USD, GROUP_PRICE, RADIO_PRICE } from "../src/game/life.js";
import { recordNews, resetNews, todaysNews } from "../src/game/news.js";
import { resetPresence, setOnline } from "../src/game/presence.js";
import { MemoryGroupRepository } from "../src/persistence/GroupRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const NOW = Date.UTC(2026, 10, 20, 12);
let now = NOW;

function setup(district = "cidade_alta", rand = 0.5) {
  now = NOW;
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict(district)!;
  const groups = new MemoryGroupRepository();
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => now, () => rand, { groups });
  return { life, selves, toasts, d, wallets };
}
const last = (t: Array<[LifeActor, string]>) => t.at(-1)![1];

beforeEach(() => {
  resetNews();
  resetPresence();
});

describe("biscatos", () => {
  it("engraxar só na paragem; paga no fim; máximo por dia", async () => {
    const { life, selves, toasts, d } = setup();
    const st = d.places!.find((p) => p.kind === "stop")!;
    const a: LifeActor = { characterId: "b1", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    Object.assign(a, { x: st.x + 3000, y: st.y });
    await life.handle(a, { a: "biscato", i: "engraxar" });
    expect(last(toasts)).toMatch(/paragem/);
    Object.assign(a, { x: st.x, y: st.y });
    const m0 = selves.get(a)!.money;
    for (let k = 0; k < BISCATOS_PER_DAY; k++) {
      await life.handle(a, { a: "biscato", i: "engraxar" });
      expect(selves.get(a)!.busy?.kind).toBe("biscato");
      now += 13_000;
      await life.tick();
    }
    const got = selves.get(a)!.money - m0;
    expect(got).toBeGreaterThanOrEqual(300 * BISCATOS_PER_DAY);
    expect(selves.get(a)!.biscatos.feitos).toBe(BISCATOS_PER_DAY);
    await life.handle(a, { a: "biscato", i: "engraxar" });
    expect(last(toasts)).toMatch(/que chegue/);
  });

  it("zungar só na rua, carregar só no mercado", async () => {
    const { life, toasts, d } = setup();
    const door = d.places!.find((p) => p.kind === "door" && p.venue === "cantina")!;
    const a: LifeActor = { characterId: "b2", x: door.x, y: door.y };
    await life.join(a, null);
    await life.handle(a, { a: "biscato", i: "carregar" });
    expect(last(toasts)).toMatch(/mercado/);
    await life.handle(a, { a: "enter" });
    await life.handle(a, { a: "biscato", i: "zungar" });
    expect(last(toasts)).toMatch(/na rua/);
  });
});

describe("câmbio", () => {
  it("taxa muda de dia para dia; comprar caro, vender barato; limite diário", async () => {
    expect(cambioRate("2026-11-20")).not.toBe(cambioRate("2026-11-21"));
    const pr = cambioPrices("2026-11-20");
    expect(pr.buy).toBeGreaterThan(pr.rate);
    expect(pr.sell).toBeLessThan(pr.rate);
    const { life, selves, toasts, d, wallets } = setup();
    const a: LifeActor = { characterId: "c1", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    await wallets.apply("c1", 3_000_000, "teste", "t-c1");
    await life.handle(a, { a: "self" });
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "cambio_compra", n: 100 });
    expect(selves.get(a)!.cambio.usd).toBe(100);
    expect(selves.get(a)!.money).toBe(m0 - 100 * pr.buy);
    await life.handle(a, { a: "cambio_venda", n: 150 });
    expect(last(toasts)).toMatch(/Não tens/);
    await life.handle(a, { a: "cambio_venda", n: 100 });
    expect(selves.get(a)!.money).toBe(m0 - 100 * pr.buy + 100 * pr.sell);
    await life.handle(a, { a: "cambio_compra", n: 1000 });
    await life.handle(a, { a: "cambio_compra", n: 1000 });
    expect(last(toasts)).toMatch(new RegExp(`${CAMBIO_DAILY_USD}`));
  });
});

describe("rádio e jornal", () => {
  it("dedicatória custa dinheiro, vai para o jornal; ouvir sobe o humor uma vez a cada 20 min", async () => {
    const { life, selves, toasts, d } = setup();
    const a: LifeActor = { characterId: "r1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Nzinga" };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    const text = await life.radioDedication(a, "Para a minha mãe, com carinho");
    expect(text).toBe("Para a minha mãe, com carinho");
    expect(selves.get(a)!.money).toBe(m0 - RADIO_PRICE);
    expect(todaysNews(now).some((n) => n.kind === "radio" && n.text.includes("Nzinga"))).toBe(true);
    const mood0 = selves.get(a)!.needs.mood;
    await life.handle(a, { a: "radio_ouvir" });
    expect(selves.get(a)!.needs.mood).toBeGreaterThan(mood0);
    const mood1 = selves.get(a)!.needs.mood;
    await life.handle(a, { a: "radio_ouvir" });
    expect(selves.get(a)!.needs.mood).toBe(mood1);
    expect(last(toasts)).toMatch(/Já estás/);
  });

  it("o jornal só mostra as notícias de hoje", () => {
    recordNews("casa", "Chiva", "ontem", NOW - 86_400_000);
    recordNews("carro", "Chiva", "hoje", NOW);
    expect(todaysNews(NOW).map((n) => n.text)).toEqual(["hoje"]);
  });
});

describe("amigos", () => {
  it("pedir a quem está perto, aceitar → os dois ficam amigos e vê-se onde o outro está", async () => {
    const { life, selves, toasts, d } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "fa", x: sp.x, y: sp.y, eid: 1, name: "Ana" };
    const b: LifeActor = { characterId: "fb", x: sp.x + 200, y: sp.y, eid: 2, name: "Beto" };
    await life.join(a, null);
    await life.join(b, null);
    await life.handle(a, { a: "amigo_pedir", i: "2" });
    expect(selves.get(b)!.friendReq).toEqual({ name: "Ana" });
    await life.handle(b, { a: "amigo_aceitar" });
    expect(selves.get(b)!.friends.map((f) => f.name)).toEqual(["Ana"]);
    setOnline("fb", { name: "Beto", district: "chiva", districtName: "Chiva", roomId: "r9", since: 0 });
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.friends[0]).toMatchObject({ name: "Beto", online: true, bairro: "Chiva", roomId: "r9" });
    await life.handle(a, { a: "amigo_pedir", i: "2" });
    expect(last(toasts)).toMatch(/Já são amigos/);
    await life.handle(a, { a: "amigo_remover", n: 1 });
    expect(selves.get(a)!.friends).toEqual([]);
  });
});

describe("grupos", () => {
  it("criar custa dinheiro e exige conta; nomes únicos; entrar e sair", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "ga", x: sp.x, y: sp.y, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "gb", x: sp.x, y: sp.y, userId: "u-b", name: "Beto" };
    const g: LifeActor = { characterId: "gg", x: sp.x, y: sp.y, userId: "guest:z", name: "Vis" };
    for (const x of [a, b, g]) await life.join(x, null);
    await wallets.apply("ga", 100_000, "teste", "t-ga");
    await wallets.apply("gb", 100_000, "teste", "t-gb");
    await life.handle(g, { a: "grupo_criar", s: "Kambas do Huambo" });
    expect(last(toasts)).toMatch(/conta/);
    await life.handle(a, { a: "self" });
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "grupo_criar", s: "Kambas do Huambo" });
    expect(selves.get(a)!.group?.name).toBe("Kambas do Huambo");
    expect(selves.get(a)!.money).toBe(m0 - GROUP_PRICE);
    await life.handle(b, { a: "grupo_criar", s: "kambas do huambo" });
    expect(last(toasts)).toMatch(/Já existe/);
    await life.handle(b, { a: "grupo_entrar", s: selves.get(a)!.group!.id });
    expect(selves.get(b)!.group?.name).toBe("Kambas do Huambo");
    expect(life.groupOf(b)?.id).toBe(selves.get(a)!.group!.id);
    await life.handle(b, { a: "grupo_sair" });
    expect(selves.get(b)!.group).toBeNull();
    expect(todaysNews(now).some((n) => n.kind === "grupo")).toBe(true);
  });
});
