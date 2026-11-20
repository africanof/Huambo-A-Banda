import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { AMBICOES, CROPS } from "../src/game/life.js";
import { noteWealth, resetRanking, richest } from "../src/game/ranking.js";
import { weatherAt } from "../src/game/weather.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("tempo do Huambo", () => {
  it("cacimbo (julho) sem chuva e frio de madrugada; época das chuvas com chuva à tarde em alguns dias", () => {
    for (let h = 0; h < 24 * 30; h++) {
      const w = weatherAt(Date.UTC(2026, 6, 1) + h * 3600_000);
      expect(w.epoca).toBe("cacimbo");
      expect(["sol", "nublado"]).toContain(w.ceu);
    }
    const dawn = weatherAt(Date.UTC(2026, 6, 10, 4));
    expect(dawn.temp).toBeLessThan(13);
    let rain = 0;
    for (let h = 0; h < 24 * 30; h++) if (["chuva", "trovoada"].includes(weatherAt(Date.UTC(2026, 11, 1) + h * 3600_000).ceu)) rain++;
    expect(rain).toBeGreaterThan(20);
    expect(weatherAt(Date.UTC(2026, 11, 3, 14))).toEqual(weatherAt(Date.UTC(2026, 11, 3, 14, 30)));
  });
});

describe("ricos", () => {
  it("ordena pelo total e mostra os primeiros", () => {
    resetRanking();
    noteWealth("a", "Ana", 5000);
    noteWealth("b", "Beto", 90000);
    noteWealth("a", "Ana", 120000);
    expect(richest(5)).toEqual([{ name: "Ana", total: 120000 }, { name: "Beto", total: 90000 }]);
  });
});

function setup(rand = 0.5) {
  let now = Date.UTC(2026, 6, 10, 12); // cacimbo: não chove (a rega conta)
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: string[] = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => now, () => rand);
  return { life, selves, toasts, d, wallets, advance: (ms: number) => (now += ms) };
}

describe("lavras", () => {
  it("semear paga a semente; só colhe quando está pronto; sem rega rende metade; vende-se no mercado", async () => {
    const { life, selves, toasts, d, advance } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "l1", x: sp.x, y: sp.y };
    await life.join(a, null);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "lavra_semear", i: "milho" });
    expect(selves.get(a)!.money).toBe(m0 - CROPS.milho!.seed);
    await life.handle(a, { a: "lavra_colher" });
    expect(toasts.at(-1)).toMatch(/ainda não está pronto/);
    advance(CROPS.milho!.minutes * 60_000 + 1000);
    await life.handle(a, { a: "lavra_colher" });
    expect(selves.get(a)!.colheita.milho).toBe(Math.round(CROPS.milho!.kg * 0.5)); // não regou
    // com rega rende tudo
    await life.handle(a, { a: "lavra_semear", i: "feijao" });
    await life.handle(a, { a: "lavra_regar" });
    advance(CROPS.feijao!.minutes * 60_000 + 1000);
    await life.handle(a, { a: "lavra_colher" });
    expect(selves.get(a)!.colheita.feijao).toBe(CROPS.feijao!.kg);
    // vender longe do mercado: não
    await life.handle(a, { a: "lavra_vender" });
    expect(toasts.at(-1)).toMatch(/mercado/);
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    Object.assign(a, { x: merc.x, y: merc.y });
    const m1 = selves.get(a)!.money;
    await life.handle(a, { a: "lavra_vender" });
    expect(selves.get(a)!.money).toBe(m1 + 10 * CROPS.milho!.price + CROPS.feijao!.kg * CROPS.feijao!.price);
    expect(selves.get(a)!.colheita).toEqual({});
  });
});

describe("ambição de vida", () => {
  it("escolher, medir o progresso real e recolher o prémio uma só vez", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "am1", x: sp.x, y: sp.y };
    await life.join(a, null);
    await life.handle(a, { a: "ambicao_escolher", i: "rico" });
    expect(selves.get(a)!.ambicao?.progress).toBeLessThan(1);
    await life.handle(a, { a: "ambicao_recolher" });
    expect(toasts.at(-1)).toMatch(/Ainda não/);
    await wallets.apply("am1", 1_000_000, "teste", "t-am1");
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.ambicao?.progress).toBe(1);
    const m = selves.get(a)!.money;
    await life.handle(a, { a: "ambicao_recolher" });
    expect(selves.get(a)!.money).toBe(m + AMBICOES.rico!.reward);
    expect(selves.get(a)!.ambicao).toBeNull();
    expect(selves.get(a)!.ambicoesFeitas).toEqual(["rico"]);
    await life.handle(a, { a: "ambicao_escolher", i: "rico" });
    expect(toasts.at(-1)).toMatch(/Já cumpriste/);
  });
});
