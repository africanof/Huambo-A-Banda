import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { CARREIRA, DURATION, JOBS, careerLevel, sanitizeLife } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const job = (id: string) => JOBS.find((j) => j.id === id)!;

describe("carreira (regras)", () => {
  it("o nível sobe com os turnos; para chefe é preciso estudar mais do que o emprego pede", () => {
    const z = job("zunga"); // estudos 0 → chefe precisa de 1
    expect(careerLevel(z, 0, 0)).toBe(0);
    expect(careerLevel(z, 5, 0)).toBe(1);
    expect(careerLevel(z, 15, 0)).toBe(2);
    expect(careerLevel(z, 35, 0)).toBe(3);
    expect(careerLevel(z, 70, 0)).toBe(3);
    expect(careerLevel(z, 70, 1)).toBe(4);
    expect(CARREIRA[4]!.titulo).toBe("Chefe de equipa");
  });

  it("a experiência guardada é validada", () => {
    expect(sanitizeLife({ carreira: { zunga: 12.4, astronauta: 50, padeiro: -3 } }).carreira).toEqual({ zunga: 12 });
  });
});

describe("carreira no jogo", () => {
  it("ao 5.º turno há promoção e o salário sobe; a experiência fica ao mudar de emprego", async () => {
    const d = getDistrict("cidade_baixa")!;
    let now = Date.UTC(2026, 10, 18, 9, 0, 0); // dia normal, sem feriado
    const wallets = new MemoryWalletRepository();
    const selves: SelfState[] = [];
    const toasts: string[] = [];
    const life = new LifeController(d, wallets, { self: (_a, s) => selves.push(s), toast: (_a, t) => toasts.push(t) }, () => now, () => 0.1);
    const z = d.places!.find((p) => p.job === "zunga")!;
    const a: LifeActor = { characterId: "cz", x: z.x, y: z.y };
    await life.join(a, null);
    await life.handle(a, { a: "take_job", i: "zunga" });
    expect(selves.at(-1)!.carreira).toMatchObject({ titulo: "Estagiário(a)", nivel: 0, turnos: 0, proximo: { titulo: "Efetivo(a)", faltam: 5 } });
    const pays: number[] = [];
    for (let i = 0; i < 6; i++) {
      // um turno por dia (sem o desconto dos turnos seguidos)
      now += 24 * 3600_000;
      const m0 = selves.at(-1)!.money;
      await life.handle(a, { a: "work" });
      now += DURATION.work * 1000 + 10;
      await life.tick();
      pays.push(selves.at(-1)!.money - m0);
      const L = life.lifeOf(a)!;
      L.needs.energy = 100;
      L.needs.hunger = 100;
    }
    const base = job("zunga").pay;
    expect(pays.slice(0, 5)).toEqual([0.8, 0.8, 0.8, 0.8, 0.8].map((k) => base * k));
    expect(pays[5]).toBe(base); // já efetivo(a)
    expect(toasts.some((t) => /Promoção! Agora és Efetivo\(a\)/.test(t))).toBe(true);
    expect(selves.at(-1)!.carreira).toMatchObject({ titulo: "Efetivo(a)", nivel: 1, turnos: 6 });
    await life.handle(a, { a: "take_job", i: "vendedor_mercado" });
    expect(selves.at(-1)!.carreira).toMatchObject({ nivel: 0, turnos: 0 });
    expect(selves.at(-1)!.curriculo).toEqual([{ job: "zunga", name: job("zunga").name, titulo: "Efetivo(a)", turnos: 6 }]);
    expect(selves.at(-1)!.conquistas.find((c) => c.id === "promovido")!.feita).toBe(true);
  });
});
