import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { MemoryGroupRepository } from "../src/persistence/GroupRepository.js";
import { MemoryKixikilaRepository } from "../src/persistence/KixikilaRepository.js";
import { MemoryListingRepository } from "../src/persistence/ListingRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup() {
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const listings = new MemoryListingRepository();
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => Date.UTC(2026, 6, 8, 10), () => 0.5, {
    groups: new MemoryGroupRepository(),
    kixikila: new MemoryKixikilaRepository(),
    listings,
  });
  return { life, selves, toasts, d, wallets, listings };
}
const last = (t: Array<[LifeActor, string]>, a: LifeActor) => [...t].reverse().find(([w]) => w === a)![1];

describe("kixikila", () => {
  it("o grupo cria, adere, começa; todos pagam a quota; quem está na vez recebe tudo; volta seguinte", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const ppl = ["ka", "kb", "kc"].map((id, i) => ({ characterId: id, x: sp.x, y: sp.y, userId: "u-" + id, name: ["Ana", "Beto", "Cuca"][i] }) as LifeActor);
    for (const p of ppl) {
      await life.join(p, null);
      await wallets.apply(p.characterId, 100_000, "teste", "t-" + p.characterId);
    }
    await life.handle(ppl[0]!, { a: "grupo_criar", s: "Kambas da Cidade Alta" });
    const gid = selves.get(ppl[0]!)!.group!.id;
    for (const p of ppl.slice(1)) await life.handle(p, { a: "grupo_entrar", s: gid });
    await life.handle(ppl[0]!, { a: "kixi_criar", n: 2 }); // 5.000 Kz
    await life.handle(ppl[1]!, { a: "kixi_aderir" });
    await life.handle(ppl[1]!, { a: "kixi_comecar" });
    expect(last(toasts, ppl[1]!)).toMatch(/Só quem criou/);
    await life.handle(ppl[2]!, { a: "kixi_aderir" });
    await life.handle(ppl[0]!, { a: "kixi_comecar" });
    expect(selves.get(ppl[0]!)!.kixikila).toMatchObject({ status: "a_correr", vez: "Ana", quota: 5000 });
    await life.handle(ppl[0]!, { a: "kixi_receber" });
    expect(last(toasts, ppl[0]!)).toMatch(/Faltam pagar 3/);
    for (const p of ppl) await life.handle(p, { a: "kixi_pagar" });
    await life.handle(ppl[0]!, { a: "kixi_pagar" });
    expect(last(toasts, ppl[0]!)).toMatch(/Já pagaste/);
    await life.handle(ppl[1]!, { a: "kixi_receber" });
    expect(last(toasts, ppl[1]!)).toMatch(/volta é de Ana/);
    const before = await wallets.balance("ka");
    await life.handle(ppl[0]!, { a: "kixi_receber" });
    expect(await wallets.balance("ka")).toBe(before + 15000);
    expect(selves.get(ppl[0]!)!.kixikila).toMatchObject({ round: 1, vez: "Beto", paid: 0 });
    await life.handle(ppl[0]!, { a: "kixi_receber" });
    expect(last(toasts, ppl[0]!)).toMatch(/volta é de Beto/);
  });
});

describe("classificados", () => {
  it("a colheita fica no anúncio; o comprador paga, o vendedor recebe, só um compra; retirar devolve", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const s: LifeActor = { characterId: "vs", x: sp.x, y: sp.y, userId: "u-vs", name: "Vendedora" };
    const b: LifeActor = { characterId: "vb", x: sp.x, y: sp.y, userId: "u-vb", name: "Comprador" };
    const c: LifeActor = { characterId: "vc", x: sp.x, y: sp.y, userId: "u-vc", name: "Atrasado" };
    await life.join(s, { colheita: { milho: 40 }, usd: 10 });
    for (const x of [b, c]) {
      await life.join(x, null);
      await wallets.apply(x.characterId, 50_000, "teste", "t-" + x.characterId);
      await life.handle(x, { a: "self" });
    }
    await life.handle(s, { a: "classif_vender", i: "milho", n: 50, s: "3000" });
    expect(last(toasts, s)).toMatch(/Não tens/);
    await life.handle(s, { a: "classif_vender", i: "milho", n: 30, s: "2400" });
    expect(selves.get(s)!.colheita.milho).toBe(10);
    const ad = (await (life as unknown as { listings: MemoryListingRepository }).listings.open(5))[0]!;
    const ms = await wallets.balance("vs");
    await life.handle(b, { a: "classif_comprar", s: ad.id });
    expect(selves.get(b)!.colheita.milho).toBe(30);
    expect(await wallets.balance("vs")).toBe(ms + 2400);
    const mc = await wallets.balance("vc");
    await life.handle(c, { a: "classif_comprar", s: ad.id });
    expect(last(toasts, c)).toMatch(/já não está/);
    expect(await wallets.balance("vc")).toBe(mc);
    // retirar devolve
    await life.handle(s, { a: "classif_vender", i: "usd", n: 5, s: "5000" });
    expect(selves.get(s)!.cambio.usd).toBe(5);
    const ad2 = (await (life as unknown as { listings: MemoryListingRepository }).listings.open(5))[0]!;
    await life.handle(s, { a: "classif_cancelar", s: ad2.id });
    expect(selves.get(s)!.cambio.usd).toBe(10);
  });
});
