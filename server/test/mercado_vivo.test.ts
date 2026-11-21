import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { MARKET_ITEMS, afterTrade, recovered } from "../src/game/economia.js";
import { MemoryMarketRepository } from "../src/persistence/MarketRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("mercado vivo (regras)", () => {
  it("vender baixa, comprar sobe, nunca abaixo de metade nem acima do dobro; o tempo repõe", () => {
    expect(afterTrade(100, 100, 0.01, 10)).toBeCloseTo(90.44, 2);
    expect(afterTrade(100, 100, 0.01, -10)).toBeCloseTo(110.46, 2);
    expect(afterTrade(100, 100, 0.01, 10_000)).toBe(50);
    expect(afterTrade(100, 100, 0.01, -10_000)).toBe(200);
    expect(recovered(50, 100, 0)).toBe(50);
    expect(recovered(50, 100, 24)).toBeCloseTo(100 - 50 / Math.E, 5);
    expect(recovered(50, 100, 1000)).toBeCloseTo(100, 3);
  });
});

describe("mercado vivo no jogo", () => {
  it("dois agricultores vendem milho: o segundo recebe menos; dias depois o preço recupera", async () => {
    let now = Date.UTC(2026, 6, 8, 10); // quarta-feira, sem feira
    const market = new MemoryMarketRepository();
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const d = getDistrict("cidade_alta")!;
    const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: () => {} }, () => now, () => 0.5, { market });
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    const a: LifeActor = { characterId: "ma", x: merc.x, y: merc.y };
    const b: LifeActor = { characterId: "mb", x: merc.x, y: merc.y };
    await life.join(a, { colheita: { milho: 200 } });
    await life.join(b, { colheita: { milho: 200 } });
    const a0 = await wallets.balance("ma");
    await life.handle(a, { a: "lavra_vender" });
    const ga = (await wallets.balance("ma")) - a0;
    expect(ga).toBe(200 * MARKET_ITEMS.milho!.base);
    await new Promise((r) => setTimeout(r, 0)); // a troca regista-se em segundo plano
    const b0 = await wallets.balance("mb");
    await life.handle(b, { a: "lavra_vender" });
    const gb = (await wallets.balance("mb")) - b0;
    expect(gb).toBeLessThan(ga);
    expect(gb).toBe(Math.round(200 * MARKET_ITEMS.milho!.base * Math.pow(1 - MARKET_ITEMS.milho!.step, 200)));
    now += 5 * 86_400_000;
    const p = await market.prices(now);
    expect(p.milho!).toBeGreaterThan(MARKET_ITEMS.milho!.base * 0.97);
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.mercado.find((m) => m.item === "milho")).toMatchObject({ name: "Milho", base: 60 });
  });
});
