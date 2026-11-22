import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { DURATION, MENUS, PRIMEIROS_PASSOS, PRIMEIROS_PASSOS_BONUS } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("primeiros passos", () => {
  it("cada passo marca-se ao fazê-lo de verdade, paga uma vez, e no fim há bónus; depois a lista desaparece", async () => {
    let now = Date.UTC(2026, 10, 18, 9);
    const d = getDistrict("cidade_baixa")!;
    const wallets = new MemoryWalletRepository();
    const selves: SelfState[] = [];
    const toasts: string[] = [];
    const life = new LifeController(d, wallets, { self: (_a, s) => selves.push(s), toast: (_a, t) => toasts.push(t) }, () => now, () => 0.1);
    const place = (pred: (p: NonNullable<typeof d.places>[number]) => boolean) => d.places!.find(pred)!;
    const a: LifeActor = { characterId: "novo", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    expect(selves.at(-1)!.inicio!.passos.every((p) => !p.feito)).toBe(true);
    await life.handle(a, { a: "inicio_recolher", i: "comer" });
    expect(toasts.at(-1)).toMatch(/Ainda não fizeste/);
    // comer
    const c = place((p) => p.shop === "cantina");
    Object.assign(a, { x: c.x, y: c.y });
    await life.handle(a, { a: "eat", i: MENUS.cantina![3]!.id });
    expect(toasts.some((t) => /Primeiro passo feito: Come/.test(t))).toBe(true);
    // emprego + turno
    await life.handle(a, { a: "take_job", i: "zunga" });
    const z = place((p) => p.job === "zunga");
    Object.assign(a, { x: z.x, y: z.y });
    await life.handle(a, { a: "work" });
    now += DURATION.work * 1000 + 10;
    await life.tick();
    const s = selves.at(-1)!.inicio!;
    expect(s.passos.filter((p) => p.feito).map((p) => p.id).sort()).toEqual(["comer", "emprego", "turno"]);
    const m0 = await wallets.balance("novo");
    for (const id of ["comer", "emprego", "turno"]) await life.handle(a, { a: "inicio_recolher", i: id });
    await life.handle(a, { a: "inicio_recolher", i: "turno" });
    expect(toasts.at(-1)).toMatch(/Já recolheste/);
    const sum = PRIMEIROS_PASSOS.filter((p) => ["comer", "emprego", "turno"].includes(p.id)).reduce((x, p) => x + p.reward, 0);
    expect(await wallets.balance("novo")).toBe(m0 + sum);
    await life.handle(a, { a: "inicio_recolher", i: "tudo" });
    expect(toasts.at(-1)).toMatch(/Recolhe primeiro/);
    // os restantes passos (atalho do teste) e o bónus final
    const L = life.lifeOf(a)!;
    L.inicio.push("entrar", "social");
    for (const id of ["entrar", "social"]) await life.handle(a, { a: "inicio_recolher", i: id });
    const m1 = await wallets.balance("novo");
    await life.handle(a, { a: "inicio_recolher", i: "tudo" });
    expect(await wallets.balance("novo")).toBe(m1 + PRIMEIROS_PASSOS_BONUS);
    expect(selves.at(-1)!.inicio).toBeNull();
  });
});
