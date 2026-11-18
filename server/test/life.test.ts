import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { decay, parentsGift, rollFamily, sanitizeLife, shiftFactor, STARTING_MONEY, JOBS, MENUS, DURATION } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("regras de vida (puras)", () => {
  it("pagamento por turno decresce a partir do 3.º turno do dia", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(shiftFactor)).toEqual([1, 1, 0.85, 0.65, 0.45, 0.2, 0.2]);
  });

  it("família sorteada segue as probabilidades e os pais podem dizer não", () => {
    expect(rollFamily(0.1)).toBe("humilde");
    expect(rollFamily(0.6)).toBe("media");
    expect(rollFamily(0.9)).toBe("rica");
    expect(rollFamily(0.99)).toBe("muito_rica");
    expect(parentsGift("humilde", 0.1, 0.5)).toBe(0);
    const g = parentsGift("media", 0.5, 0.5);
    expect(g).toBeGreaterThanOrEqual(5000);
    expect(g).toBeLessThanOrEqual(15000);
  });

  it("fome e energia descem com o tempo; a saúde cai se passar fome", () => {
    const n = decay({ hunger: 50, energy: 50, mood: 50, health: 100 }, 60);
    expect(n.hunger).toBeLessThan(50);
    expect(n.energy).toBeLessThan(50);
    const starving = decay({ hunger: 0, energy: 50, mood: 50, health: 100 }, 10);
    expect(starving.health).toBeLessThan(100);
  });

  it("estado guardado corrompido é normalizado", () => {
    const l = sanitizeLife({ needs: { hunger: 999, energy: "x" }, family: "bilionario", jobId: "astronauta", education: 77 }, () => 0.1);
    expect(l.needs.hunger).toBe(100);
    expect(l.family).toBe("humilde");
    expect(l.jobId).toBeNull();
    expect(l.education).toBe(4);
  });
});

describe("LifeController (bairro Cidade Baixa)", () => {
  const d = getDistrict("cidade_baixa")!;
  const placeOf = (pred: (p: NonNullable<typeof d.places>[number]) => boolean) => d.places!.find(pred)!;

  function setup(rand = () => 0.1) {
    let now = Date.UTC(2026, 10, 18, 9, 0, 0);
    const wallets = new MemoryWalletRepository();
    const selves: SelfState[] = [];
    const toasts: string[] = [];
    const life = new LifeController(
      d,
      wallets,
      { self: (_a, s) => selves.push(s), toast: (_a, t) => toasts.push(t) },
      () => now,
      rand,
    );
    const actor: LifeActor = { characterId: "mem-1", x: 0, y: 0 };
    return { life, actor, selves, toasts, wallets, advance: (ms: number) => (now += ms), last: () => selves.at(-1)! };
  }

  it("personagem nova recebe família e dinheiro inicial (uma vez só)", async () => {
    const t = setup();
    await t.life.join(t.actor, null);
    expect(t.last().family).toBe("humilde");
    expect(t.last().money).toBe(STARTING_MONEY.humilde);
    // voltar a entrar com o mesmo estado não volta a dar dinheiro
    await t.life.join(t.actor, t.life.lifeOf(t.actor));
    expect(t.last().money).toBe(STARTING_MONEY.humilde);
  });

  it("comer só funciona junto de uma cantina e cobra o preço", async () => {
    const t = setup();
    await t.life.join(t.actor, null);
    const item = MENUS.cantina![0]!;
    await t.life.handle(t.actor, { a: "eat", i: item.id });
    expect(t.toasts.at(-1)).toMatch(/cantina/);
    const c = placeOf((p) => p.shop === "cantina");
    Object.assign(t.actor, { x: c.x, y: c.y });
    const before = t.last().money;
    await t.life.handle(t.actor, { a: "eat", i: item.id });
    expect(t.last().money).toBe(before - item.price);
  });

  it("emprego: requisitos de estudos, turnos no local, pagamento decrescente", async () => {
    const t = setup();
    await t.life.join(t.actor, null);
    await t.life.handle(t.actor, { a: "take_job", i: "professor" });
    expect(t.toasts.at(-1)).toMatch(/estudos/);
    await t.life.handle(t.actor, { a: "take_job", i: "zunga" });
    expect(t.last().job).toBe("zunga");
    await t.life.handle(t.actor, { a: "work" });
    expect(t.toasts.at(-1)).toMatch(/Banca da zungueira/);

    const z = placeOf((p) => p.job === "zunga");
    Object.assign(t.actor, { x: z.x, y: z.y });
    const pay = JOBS.find((j) => j.id === "zunga")!.pay;
    const start = t.last().money;
    const earned: number[] = [];
    for (let i = 0; i < 4; i++) {
      await t.life.handle(t.actor, { a: "work" });
      t.advance(DURATION.work * 1000 + 10);
      await t.life.tick();
      earned.push(t.last().money - (earned.length ? start + earned.reduce((a, b) => a + b, 0) : start));
      // recupera forças para continuar
      const c = t.life.lifeOf(t.actor)!;
      c.needs.energy = 100;
      c.needs.hunger = 100;
    }
    expect(earned).toEqual([pay, pay, Math.round(pay * 0.85), Math.round(pay * 0.65)]);
    expect(t.last().shifts).toBe(4);
  });

  it("afastar-se interrompe o turno sem pagar", async () => {
    const t = setup();
    await t.life.join(t.actor, null);
    await t.life.handle(t.actor, { a: "take_job", i: "zunga" });
    const z = placeOf((p) => p.job === "zunga");
    Object.assign(t.actor, { x: z.x, y: z.y });
    const before = t.last().money;
    await t.life.handle(t.actor, { a: "work" });
    t.actor.x += 500;
    t.advance(DURATION.work * 1000 + 10);
    await t.life.tick();
    expect(t.last().money).toBe(before);
    expect(t.last().busy).toBeNull();
  });

  it("pedir aos pais: uma vez por dia", async () => {
    const seq = [0.1, 0.9, 0.5]; // família humilde; pais dizem sim; valor a meio
    const t = setup(() => seq.shift() ?? 0.5);
    await t.life.join(t.actor, null);
    const m0 = t.last().money;
    await t.life.handle(t.actor, { a: "parents" });
    expect(t.last().money).toBe(m0 + 2000);
    await t.life.handle(t.actor, { a: "parents" });
    expect(t.toasts.at(-1)).toMatch(/amanhã/);
    expect(t.last().money).toBe(m0 + 2000);
  });

  it("estudar no hotel não funciona; dormir no hotel repõe a energia", async () => {
    const t = setup();
    await t.life.join(t.actor, null);
    const h = placeOf((p) => p.kind === "sleep");
    Object.assign(t.actor, { x: h.x, y: h.y });
    await t.life.handle(t.actor, { a: "study" });
    expect(t.toasts.at(-1)).toMatch(/Escola/);
    t.life.lifeOf(t.actor)!.needs.energy = 10;
    await t.life.handle(t.actor, { a: "sleep" });
    t.advance(DURATION.sleep * 1000 + 10);
    await t.life.tick();
    expect(t.last().needs.energy).toBe(100);
  });
});
