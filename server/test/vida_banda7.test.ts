import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { ANIMAIS, FEED_MIN, OVO_MIN, OVO_PRICE, PRAZOS, RACAO_PRICE, TREINOS, TREINOS_POR_DIA, sanitizeLife } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup() {
  let now = Date.UTC(2026, 6, 8, 10); // quarta-feira: sem feira
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: string[] = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => now, () => 0.5);
  return { life, selves, toasts, d, wallets, advance: (ms: number) => (now += ms) };
}
const MIN = 60_000;

describe("criação de animais", () => {
  it("compra-se no mercado; galinhas alimentadas põem ovos; com fome não; vende-se crescido e no mercado", async () => {
    const { life, selves, toasts, d, wallets, advance } = setup();
    const sp = d.spawns[0]!;
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    const a: LifeActor = { characterId: "cr", x: sp.x, y: sp.y };
    await life.join(a, null);
    await wallets.apply("cr", 100_000, "teste", "t-cr");
    await life.handle(a, { a: "self" });
    await life.handle(a, { a: "criacao_comprar", i: "galinha" });
    expect(toasts.at(-1)).toMatch(/mercado/);
    a.x = merc.x;
    a.y = merc.y;
    await life.handle(a, { a: "criacao_comprar", i: "dragao" });
    expect(toasts.at(-1)).toMatch(/não se vende/);
    const m0 = await wallets.balance("cr");
    await life.handle(a, { a: "criacao_comprar", i: "galinha" });
    await life.handle(a, { a: "criacao_comprar", i: "galinha" });
    await life.handle(a, { a: "criacao_comprar", i: "cabrito" });
    // mercado vivo: comprar a segunda galinha já sai 2% mais caro (mais procura)
    expect(await wallets.balance("cr")).toBe(m0 - ANIMAIS.galinha!.price - Math.round(ANIMAIS.galinha!.price * 1.02) - ANIMAIS.cabrito!.price);
    expect(selves.get(a)!.criacao.animais).toHaveLength(3);
    // sem ração não há ovos
    advance(60 * MIN);
    await life.handle(a, { a: "criacao_ovos" });
    expect(toasts.at(-1)).toMatch(/Ainda não há ovos/);
    const m1 = await wallets.balance("cr");
    await life.handle(a, { a: "criacao_alimentar" });
    expect(await wallets.balance("cr")).toBe(m1 - 3 * RACAO_PRICE);
    await life.handle(a, { a: "criacao_alimentar" });
    expect(toasts.at(-1)).toMatch(/barriga cheia/);
    advance(3 * OVO_MIN * MIN + 1000);
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.criacao.ovos).toBe(6); // 2 galinhas × 3
    // passa o tempo da ração: não põem mais (no máximo até ao fim da ração)
    advance(FEED_MIN * MIN * 3);
    await life.handle(a, { a: "self" });
    const ovos = selves.get(a)!.criacao.ovos;
    expect(ovos).toBeLessThanOrEqual(16); // OVOS_MAX por galinha
    const m2 = await wallets.balance("cr");
    await life.handle(a, { a: "criacao_vender", i: "ovos" });
    expect(await wallets.balance("cr")).toBe(m2 + ovos * OVO_PRICE);
    // o cabrito já cresceu mas está com fome: vende-se mais barato
    const m3 = await wallets.balance("cr");
    // mercado vivo: o preço do cabrito subiu um pouco quando o compraste (e foi recuperando com o tempo)
    const mk = (life as unknown as { market: { prices(t: number): Promise<Record<string, number>> } }).market;
    const fac = (await mk.prices(Date.UTC(2026, 6, 8, 10) + 60 * MIN + 3 * OVO_MIN * MIN + 1000 + FEED_MIN * MIN * 3))["cabrito"]! / 24000;
    await life.handle(a, { a: "criacao_vender", i: "cabrito" });
    expect(await wallets.balance("cr")).toBe(m3 + Math.round(ANIMAIS.cabrito!.sell * fac * 0.6));
    expect(fac).toBeGreaterThan(1);
    expect(selves.get(a)!.criacao.animais.map((x) => x.tipo)).toEqual(["galinha", "galinha"]);
    // porco acabado de comprar ainda não se vende
    await life.handle(a, { a: "criacao_comprar", i: "porco" });
    await life.handle(a, { a: "criacao_vender", i: "porco" });
    expect(toasts.at(-1)).toMatch(/a crescer/);
  });

  it("o estado guardado é limpo (animais inventados saem)", () => {
    const l = sanitizeLife({ criacao: { animais: [{ tipo: "galinha", desde: 1 }, { tipo: "leao", desde: 1 }], fedUntil: 5, ovosAt: 0, ovos: -3, vendidos: 2 } });
    expect(l.criacao.animais).toEqual([{ tipo: "galinha", desde: 1 }]);
    expect(l.criacao.ovos).toBe(0);
  });
});

describe("desporto", () => {
  it("correr na rua dá forma e humor e gasta energia; em casa só exercícios; limite por dia", async () => {
    const { life, selves, toasts, d } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "dp", x: sp.x, y: sp.y };
    await life.join(a, { needs: { hunger: 100, energy: 100, mood: 50, health: 100 } });
    const f0 = selves.get(a)!.forma.valor;
    await life.handle(a, { a: "treinar", i: "correr" });
    expect(selves.get(a)!.forma.valor).toBe(f0 + TREINOS.correr!.forma);
    expect(selves.get(a)!.needs.energy).toBe(100 - TREINOS.correr!.energy);
    await life.handle(a, { a: "treinar", i: "casa" });
    expect(toasts.at(-1)).toMatch(/em casa/);
    const casa = d.interiors!.find((i) => i.venue === "casa")!;
    a.x = casa.entry.x;
    a.y = casa.entry.y;
    await life.handle(a, { a: "treinar", i: "futebol" });
    expect(toasts.at(-1)).toMatch(/rua/);
    for (let k = 1; k < TREINOS_POR_DIA; k++) await life.handle(a, { a: "treinar", i: "casa" });
    expect(selves.get(a)!.forma.treinosHoje).toBe(TREINOS_POR_DIA);
    await life.handle(a, { a: "treinar", i: "casa" });
    expect(toasts.at(-1)).toMatch(/muito hoje/);
  });
});

describe("depósito a prazo", () => {
  it("sai da carteira; levantar antes do fim devolve só o capital; no fim paga juros uma vez", async () => {
    const { life, selves, toasts, d, wallets, advance } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "pz", x: sp.x, y: sp.y };
    await life.join(a, null);
    await wallets.apply("pz", 200_000, "teste", "t-pz");
    await life.handle(a, { a: "self" });
    const m0 = await wallets.balance("pz");
    await life.handle(a, { a: "prazo_abrir", n: 100, i: "curto" });
    expect(toasts.at(-1)).toMatch(/vai de/);
    await life.handle(a, { a: "prazo_abrir", n: 50_000, i: "curto" });
    expect(await wallets.balance("pz")).toBe(m0 - 50_000);
    await life.handle(a, { a: "prazo_abrir", n: 10_000, i: "medio" });
    expect(toasts.at(-1)).toMatch(/Já tens/);
    await life.handle(a, { a: "prazo_levantar" });
    expect(await wallets.balance("pz")).toBe(m0);
    expect(selves.get(a)!.prazo).toBeNull();
    await life.handle(a, { a: "prazo_abrir", n: 100_000, i: "medio" });
    advance(PRAZOS.medio!.minutes * MIN);
    await life.handle(a, { a: "prazo_levantar" });
    expect(await wallets.balance("pz")).toBe(m0 + 100_000 * PRAZOS.medio!.rate);
    await life.handle(a, { a: "prazo_levantar" });
    expect(toasts.at(-1)).toMatch(/Não tens/);
    expect(selves.get(a)!.conquistas.find((c) => c.id === "poupado")!.feita).toBe(true);
  });
});
