import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { ASSOC_GOAL, ASSOC_GOAL_PRIZE, ASSOC_TOP_PRIZE, angolaWeek, previousWeek } from "../src/game/economia.js";
import { MemoryAssociationRepository } from "../src/persistence/AssociationRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("semanas", () => {
  it("semana ISO em hora de Angola", () => {
    expect(angolaWeek(Date.UTC(2026, 10, 21, 12))).toBe("2026-W47");
    expect(angolaWeek(Date.UTC(2026, 10, 22, 22, 59))).toBe("2026-W47"); // domingo 23:59 em Angola
    expect(angolaWeek(Date.UTC(2026, 10, 22, 23, 1))).toBe("2026-W48"); // segunda 00:01 em Angola
    expect(angolaWeek(Date.UTC(2027, 0, 1, 12))).toBe("2026-W53");
    expect(previousWeek(Date.UTC(2026, 10, 21, 12))).toBe("2026-W46");
  });
});

describe("associações de bairro", () => {
  it("adere-se na sede; colher dá pontos ao bairro; objetivo da semana e 1.º lugar dão prémio uma vez", async () => {
    let now = Date.UTC(2026, 10, 18, 10); // quarta, semana 47
    const assoc = new MemoryAssociationRepository();
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: string[] = [];
    const alta = getDistrict("cidade_alta")!;
    const chiva = getDistrict("chiva")!;
    const out = { self: (a: LifeActor, s: SelfState) => selves.set(a, s), toast: (_a: LifeActor, t: string) => toasts.push(t) };
    const lifeAlta = new LifeController(alta, wallets, out, () => now, () => 0.5, { assoc });
    const lifeChiva = new LifeController(chiva, wallets, out, () => now, () => 0.5, { assoc });
    const sedeA = alta.interiors!.find((i) => i.venue === "administracao" || i.venue === "governo")!;
    const sedeC = chiva.interiors!.find((i) => i.venue === "administracao" || i.venue === "governo")!;
    const a: LifeActor = { characterId: "aa", x: alta.spawns[0]!.x, y: alta.spawns[0]!.y };
    const c: LifeActor = { characterId: "cc", x: sedeC.entry.x, y: sedeC.entry.y };
    await lifeAlta.join(a, null);
    await lifeChiva.join(c, null);
    await lifeAlta.handle(a, { a: "assoc_aderir" });
    expect(toasts.at(-1)).toMatch(/Administração/);
    Object.assign(a, { x: sedeA.entry.x, y: sedeA.entry.y });
    await lifeAlta.handle(a, { a: "assoc_aderir" });
    await lifeChiva.handle(c, { a: "assoc_aderir" });
    expect(selves.get(a)!.associacao).toMatchObject({ bairro: "cidade_alta", nome: alta.name });

    // colheitas: Cidade Alta faz mais pontos que a Chiva
    for (const [life, who, kg] of [[lifeAlta, a, 1600], [lifeChiva, c, 300]] as const) {
      life.lifeOf(who)!.lavra = { crop: "milho", plantedAt: now - 3600_000, readyAt: now - 1, watered: true };
      void kg;
    }
    await assoc.add("aa", "cidade_alta", angolaWeek(now), 1580);
    await lifeAlta.handle(a, { a: "lavra_colher" }); // +20 kg
    await lifeChiva.handle(c, { a: "lavra_colher" });
    await new Promise((r) => setTimeout(r, 0));
    await lifeAlta.handle(a, { a: "assoc_ver" });
    const v = selves.get(a)!.associacao;
    expect(v.total).toBe(1600);
    expect(v.ranking.map((r) => r.bairro)).toEqual(["cidade_alta", "chiva"]);
    expect(v.total).toBeGreaterThanOrEqual(ASSOC_GOAL);

    const m0 = await wallets.balance("aa");
    await lifeAlta.handle(a, { a: "assoc_premio", i: "objetivo" });
    await lifeAlta.handle(a, { a: "assoc_premio", i: "objetivo" });
    expect(await wallets.balance("aa")).toBe(m0 + ASSOC_GOAL_PRIZE);
    // a Chiva não chegou ao objetivo
    await lifeChiva.handle(c, { a: "assoc_premio", i: "objetivo" });
    expect(toasts.at(-1)).toMatch(/ainda vai em 20\//);

    // semana seguinte: o 1.º lugar recebe; os outros não
    now += 7 * 86_400_000;
    const m1 = await wallets.balance("aa");
    await lifeAlta.handle(a, { a: "assoc_premio", i: "top" });
    await lifeAlta.handle(a, { a: "assoc_premio", i: "top" });
    expect(await wallets.balance("aa")).toBe(m1 + ASSOC_TOP_PRIZE);
    await lifeChiva.handle(c, { a: "assoc_premio", i: "top" });
    expect(toasts.at(-1)).toMatch(/não ficou em 1\.º/);
  });
});
