import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { MENUS } from "../src/game/life.js";
import { ILEGAIS, MULTA_FRACAO, VENUES_FOR_SALE, VENUE_CUT, raidChance, venuePerHour } from "../src/game/economia.js";
import { MemoryVenueRepository } from "../src/persistence/VenueRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup(bairro: string, rand: () => number) {
  let now = Date.UTC(2026, 10, 18, 10);
  const venues = new MemoryVenueRepository();
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict(bairro)!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => now, rand, { venues });
  const said = (a: LifeActor) => toasts.filter(([w]) => w === a).slice(-3).map(([, t]) => t).join(" | ");
  return { life, venues, wallets, selves, d, said, advance: (ms: number) => (now += ms) };
}

describe("comprar estabelecimentos da cidade", () => {
  it("compra-se lá dentro (com BI); um dono por sítio; o dono recebe parte do que os clientes pagam e o rendimento por hora", async () => {
    const { life, venues, wallets, selves, d, said, advance } = setup("cidade_alta", () => 0.5);
    const cantina = d.interiors!.find((i) => i.venue === "cantina")!;
    const balcao = d.places!.find((p) => p.interior === cantina.id && p.kind === "food")!;
    const dono: LifeActor = { characterId: "dono", x: balcao.x, y: balcao.y, userId: "u-dono", name: "Ana" };
    const outro: LifeActor = { characterId: "outro", x: balcao.x, y: balcao.y, userId: "u-outro", name: "Beto" };
    const cli: LifeActor = { characterId: "cli", x: balcao.x, y: balcao.y, userId: "u-cli", name: "Cliente" };
    expect(interiorAt(d, dono.x, dono.y)?.id).toBe(cantina.id);
    for (const a of [dono, outro, cli]) {
      await life.join(a, { docs: { bi: true, registo: true, residencia: false } });
      await wallets.apply(a.characterId, 1_000_000, "teste", "t-" + a.characterId);
      await life.handle(a, { a: "self" });
    }
    const price = VENUES_FOR_SALE.cantina!.price;
    const m0 = await wallets.balance("dono");
    await life.handle(dono, { a: "estab_comprar" });
    expect(await wallets.balance("dono")).toBe(m0 - price);
    await life.handle(outro, { a: "estab_comprar" });
    expect(said(outro)).toMatch(/já tem dono: Ana/);
    // um cliente come aqui: 25% vai para a caixa do dono
    const item = MENUS.cantina![0]!;
    await life.handle(cli, { a: "eat", i: item.id });
    await new Promise((r) => setTimeout(r, 5));
    expect((await venues.get(cantina.id))!.caixa).toBe(Math.floor(item.price * VENUE_CUT));
    // 2 horas de clientes do bairro
    advance(2 * 3600_000);
    await life.handle(dono, { a: "estab_ver" });
    expect(selves.get(dono)!.estabelecimentos.meus[0]).toMatchObject({ nome: cantina.name, nivel: 1, caixa: Math.floor(item.price * VENUE_CUT) + 2 * venuePerHour("cantina", 1) });
    const m1 = await wallets.balance("dono");
    await life.handle(dono, { a: "estab_recolher" });
    expect(await wallets.balance("dono")).toBe(m1 + Math.floor(item.price * VENUE_CUT) + 2 * venuePerHour("cantina", 1));
    // melhorar e vender
    await life.handle(dono, { a: "estab_melhorar", s: cantina.id });
    expect((await venues.get(cantina.id))!.nivel).toBe(2);
    const m2 = await wallets.balance("dono");
    const inv = (await venues.get(cantina.id))!.investido;
    await life.handle(dono, { a: "estab_vender", s: cantina.id });
    expect(await wallets.balance("dono")).toBe(m2 + Math.round(inv * 0.6));
    expect(await venues.get(cantina.id)).toBeNull();
    // serviços públicos não se vendem
    const escola = d.interiors!.find((i) => i.venue === "escola")!;
    Object.assign(outro, { x: escola.entry.x, y: escola.entry.y });
    await life.handle(outro, { a: "estab_comprar" });
    expect(said(outro)).toMatch(/Entra no estabelecimento/);
  });
});

describe("crime organizado", () => {
  it("rende por hora; o risco sobe com o tempo; rusga: perde tudo, multa, preso e cadastro", async () => {
    let roll = 0.99; // sem rusga
    const { life, wallets, selves, d, said, advance } = setup("cidade_alta", () => roll);
    const a: LifeActor = { characterId: "mafia", x: d.spawns[0]!.x, y: d.spawns[0]!.y, userId: "u-m", name: "Zeca" };
    await life.join(a, { docs: { bi: true, registo: true, residencia: false } });
    await wallets.apply("mafia", 1_000_000, "teste", "t-m");
    await life.handle(a, { a: "self" });
    expect(raidChance("contrabando", 10)).toBeGreaterThan(raidChance("contrabando", 1));
    await life.handle(a, { a: "ilegal_abrir", i: "contrabando" });
    advance(2 * 3600_000);
    const m0 = await wallets.balance("mafia");
    await life.handle(a, { a: "ilegal_recolher" });
    expect(await wallets.balance("mafia")).toBe(m0 + 2 * ILEGAIS.contrabando!.perHour);
    // azar: rusga
    roll = 0.0;
    advance(3 * 3600_000);
    const m1 = await wallets.balance("mafia");
    await life.handle(a, { a: "ilegal_recolher" });
    expect(said(a)).toMatch(/RUSGA/);
    expect(await wallets.balance("mafia")).toBe(m1 - Math.round(ILEGAIS.contrabando!.cost * MULTA_FRACAO));
    const s = selves.get(a)!;
    expect(s.ilegal).toBeNull();
    expect(s.docs.registo).toBe(false);
    expect(s.preso).toBeGreaterThan(0);
    // detido/a: não pode fazer nada
    await life.handle(a, { a: "ilegal_abrir", i: "jogo" });
    expect(said(a)).toMatch(/detido/);
  });

  it("agente da polícia em patrulha na esquadra apanha o esquema de quem está no bairro e recebe prémio", async () => {
    const { life, wallets, selves, d, said } = setup("bairro_fatima", () => 0.1);
    const esq = d.interiors!.find((i) => i.venue === "esquadra")!;
    const pol: LifeActor = { characterId: "pol", x: esq.entry.x, y: esq.entry.y, userId: "u-p", name: "Agente Kanda" };
    const sus: LifeActor = { characterId: "sus", x: d.spawns[0]!.x, y: d.spawns[0]!.y, userId: "u-s", name: "Suspeito" };
    await life.join(pol, { jobId: "policia" });
    await life.join(sus, null);
    await wallets.apply("sus", 1_000_000, "teste", "t-s");
    await life.handle(sus, { a: "self" });
    await life.handle(pol, { a: "ilegal_abrir", i: "jogo" });
    expect(said(pol)).toMatch(/És agente/);
    await life.handle(sus, { a: "ilegal_abrir", i: "jogo" });
    const p0 = await wallets.balance("pol");
    await life.handle(pol, { a: "policia_patrulha" });
    expect(said(pol)).toMatch(/Rusga bem-sucedida/);
    expect(await wallets.balance("pol")).toBe(p0 + Math.round(Math.round(ILEGAIS.jogo!.cost * MULTA_FRACAO) * 0.5));
    expect(selves.get(sus)!.ilegal).toBeNull();
  });
});
