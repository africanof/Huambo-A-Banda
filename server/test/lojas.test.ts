import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { DURATION } from "../src/game/life.js";
import { SHOP_ITEMS, SHOP_OPEN_PRICE, SHOP_WAGES, demandAt, simulateSales } from "../src/game/economia.js";
import { MemoryShopRepository } from "../src/persistence/ShopRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("lojas (regras)", () => {
  it("mais barato vende mais; mais empregados atendem mais clientes; nunca vende o que não tem", () => {
    expect(demandAt(100, 100)).toBeGreaterThan(demandAt(200, 100));
    expect(demandAt(400, 100)).toBeGreaterThan(0);
    const st = { cafe: { qty: 1000, price: 240 } };
    let k = 0;
    const rnd = () => ((k = (k * 9301 + 49297) % 233280) / 233280);
    const a = simulateSales(st, 10, 0, rnd);
    const b = simulateSales(st, 10, 3, rnd);
    expect(b.units).toBeGreaterThan(a.units);
    expect(simulateSales({ cafe: { qty: 3, price: 120 } }, 48, 3, rnd).units).toBe(3);
    expect(st.cafe.qty).toBe(1000); // não mexe no original
  });
});

describe("lojas no jogo", () => {
  it("abrir, stock, preço, cliente jogador, clientes do bairro, empregado pago pela caixa, fechar", async () => {
    let now = Date.UTC(2026, 10, 18, 10);
    const shops = new MemoryShopRepository();
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: Array<[LifeActor, string]> = [];
    const d = getDistrict("cidade_alta")!;
    const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => now, () => 0.3, { shops });
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    const dono: LifeActor = { characterId: "dono", eid: 1, x: merc.x, y: merc.y, userId: "u-dono", name: "Dona Rosa" };
    const cli: LifeActor = { characterId: "cli", eid: 2, x: merc.x, y: merc.y, userId: "u-cli", name: "Cliente" };
    const emp: LifeActor = { characterId: "emp", eid: 3, x: merc.x, y: merc.y, userId: "u-emp", name: "Kalei" };
    for (const a of [dono, cli, emp]) {
      await life.join(a, { needs: { hunger: 40, energy: 100, mood: 50, health: 100 } });
      await wallets.apply(a.characterId, 100_000, "teste", "t-" + a.characterId);
      await life.handle(a, { a: "self" });
    }
    const said = (a: LifeActor) => toasts.filter(([w]) => w === a).slice(-3).map(([, t]) => t).join(" | ");

    // abrir no mercado
    const m0 = await wallets.balance("dono");
    await life.handle(dono, { a: "loja_abrir", s: "Banca da Rosa" });
    expect(await wallets.balance("dono")).toBe(m0 - SHOP_OPEN_PRICE);
    await life.handle(dono, { a: "loja_abrir", s: "Outra" });
    expect(said(dono)).toMatch(/Já tens uma loja/);
    // stock e preço
    await life.handle(dono, { a: "loja_stock", i: "funge_peixe", n: 10 });
    expect(await wallets.balance("dono")).toBe(m0 - SHOP_OPEN_PRICE - 10 * SHOP_ITEMS.funge_peixe!.cost);
    await life.handle(dono, { a: "loja_preco", i: "funge_peixe", n: 99_999 });
    expect(said(dono)).toMatch(/vai de/);
    await life.handle(dono, { a: "loja_preco", i: "funge_peixe", n: 1200 });
    expect(selves.get(dono)!.loja.minha).toMatchObject({ nome: "Banca da Rosa", itens: [{ item: "funge_peixe", qty: 10, price: 1200 }] });

    // um jogador compra e come
    await life.handle(cli, { a: "loja_ver" });
    const shopId = selves.get(cli)!.loja.aqui[0]!.id;
    const c0 = await wallets.balance("cli");
    await life.handle(cli, { a: "loja_comprar", s: shopId, i: "funge_peixe" });
    expect(await wallets.balance("cli")).toBe(c0 - 1200);
    expect(selves.get(cli)!.needs.hunger).toBe(40 + SHOP_ITEMS.funge_peixe!.hunger!);
    await life.handle(dono, { a: "loja_ver" });
    expect(selves.get(dono)!.loja.minha).toMatchObject({ caixa: 1200, itens: [{ qty: 9 }] });
    // longe do mercado não se compra
    Object.assign(cli, { x: d.spawns[0]!.x, y: d.spawns[0]!.y });
    await life.handle(cli, { a: "loja_comprar", s: shopId, i: "funge_peixe" });
    expect(said(cli)).toMatch(/Vai ao mercado/);

    // contratar um empregado e fazer um turno pago pela caixa
    await life.handle(dono, { a: "loja_contratar", i: "3", n: 1 });
    expect(selves.get(emp)!.loja.oferta).toMatchObject({ nome: "Banca da Rosa", salario: SHOP_WAGES[0] });
    await life.handle(emp, { a: "loja_aceitar" });
    expect(selves.get(emp)!.loja.emprego).toMatchObject({ nome: "Banca da Rosa" });
    const e0 = await wallets.balance("emp");
    await life.handle(emp, { a: "loja_turno" });
    now += DURATION.loja * 1000 + 10;
    await life.tick();
    expect(await wallets.balance("emp")).toBe(e0 + SHOP_WAGES[0]!);
    await life.handle(dono, { a: "loja_ver" });
    const depois = selves.get(dono)!.loja.minha!;
    expect(depois.itens[0]!.qty).toBeLessThan(9); // o turno vendeu
    expect(depois.empregados).toEqual([{ name: "Kalei", salario: SHOP_WAGES[0] }]);

    // passam horas: os clientes do bairro compram sozinhos
    now += 6 * 3600_000;
    await life.handle(dono, { a: "loja_ver" });
    const caixa = selves.get(dono)!.loja.minha!.caixa;
    expect(caixa).toBeGreaterThan(0);
    const d0 = await wallets.balance("dono");
    await life.handle(dono, { a: "loja_recolher" });
    expect(await wallets.balance("dono")).toBe(d0 + caixa);
    // fechar
    await life.handle(dono, { a: "loja_fechar" });
    expect(selves.get(dono)!.loja.minha).toBeNull();
    expect(await shops.byOwner("dono")).toBeNull();
  });

  it("dois compradores ao mesmo tempo pelo último produto: só um leva, o outro recebe o dinheiro de volta", async () => {
    const now = Date.UTC(2026, 10, 18, 10);
    const shops = new MemoryShopRepository();
    const wallets = new MemoryWalletRepository();
    const d = getDistrict("cidade_alta")!;
    const life = new LifeController(d, wallets, { self: () => {}, toast: () => {} }, () => now, () => 0.99, { shops });
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    const s = await shops.create({ owner: "x", ownerName: "X", bairro: "cidade_alta", nome: "Banca X", caixa: 0, stock: { cafe: { qty: 1, price: 200 } }, empregados: [], vendas: 0, lastTick: now });
    const ppl = ["p1", "p2"].map((id) => ({ characterId: id, x: merc.x, y: merc.y }) as LifeActor);
    for (const p of ppl) {
      await life.join(p, null);
      await wallets.apply(p.characterId, 10_000, "teste", "t-" + p.characterId);
      await life.handle(p, { a: "self" });
    }
    const before = await Promise.all(ppl.map((p) => wallets.balance(p.characterId)));
    await Promise.all(ppl.map((p) => life.handle(p, { a: "loja_comprar", s: s!.id, i: "cafe" })));
    const after = await Promise.all(ppl.map((p) => wallets.balance(p.characterId)));
    const spent = before.map((b, i) => b - after[i]!);
    expect(spent.sort()).toEqual([0, 200]);
    expect((await shops.get(s!.id))!.stock.cafe!.qty).toBe(0);
    expect((await shops.get(s!.id))!.caixa).toBe(200);
  });
});
