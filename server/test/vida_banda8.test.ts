import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { PRESENTES, QUIZ, QUIZ_POR_DIA, QUIZ_PREMIO, SEGURO_PRICE, angolaDay, quizDoDia } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup() {
  let now = Date.UTC(2026, 6, 8, 10);
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => now, () => 0.5);
  return { life, selves, toasts, d, wallets, advance: (ms: number) => (now += ms), now: () => now };
}
const last = (t: Array<[LifeActor, string]>, a: LifeActor) => [...t].reverse().find(([w]) => w === a)![1];

describe("Saber Huambo", () => {
  it("3 perguntas por dia, iguais para todos; certa paga, errada não; não se repete; amanhã há novas", async () => {
    const { life, selves, toasts, d, wallets, advance, now } = setup();
    expect(new Set(quizDoDia("2026-07-08")).size).toBe(QUIZ_POR_DIA);
    for (const q of QUIZ) expect(q.c).toBeLessThan(q.o.length);
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "qz", x: sp.x, y: sp.y };
    await life.join(a, null);
    const ids = quizDoDia(angolaDay(now()));
    expect(selves.get(a)!.quiz.pergunta).toBe(QUIZ[ids[0]!]!.q);
    const m0 = await wallets.balance("qz");
    await life.handle(a, { a: "quiz_responder", n: QUIZ[ids[0]!]!.c + 1 });
    expect(await wallets.balance("qz")).toBe(m0 + QUIZ_PREMIO);
    await life.handle(a, { a: "quiz_responder", n: ((QUIZ[ids[1]!]!.c + 1) % 4) + 1 });
    expect(last(toasts, a)).toMatch(/Errado/);
    await life.handle(a, { a: "quiz_responder", n: QUIZ[ids[2]!]!.c + 1 });
    await life.handle(a, { a: "quiz_responder", n: 1 });
    expect(last(toasts, a)).toMatch(/Já respondeste/);
    expect(await wallets.balance("qz")).toBe(m0 + 2 * QUIZ_PREMIO);
    expect(selves.get(a)!.quiz).toMatchObject({ n: 3, certasHoje: 2, pergunta: null });
    advance(24 * 3600_000);
    await life.handle(a, { a: "self" });
    expect(selves.get(a)!.quiz).toMatchObject({ n: 0, certasHoje: 0, certas: 2 });
  });
});

describe("presentes", () => {
  it("paga e o amigo na sala fica mais contente; para quem está fora fica à espera e chega ao entrar", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const sp = d.spawns[0]!;
    const a: LifeActor = { characterId: "pa", x: sp.x, y: sp.y, name: "Ana" };
    const b: LifeActor = { characterId: "pb", x: sp.x, y: sp.y, name: "Beto" };
    await life.join(a, { friends: [{ id: "pb", name: "Beto" }, { id: "pc", name: "Cuca" }] });
    await life.join(b, { needs: { hunger: 80, energy: 80, mood: 40, health: 100 } });
    await wallets.apply("pa", 50_000, "teste", "t-pa");
    await life.handle(a, { a: "self" });
    const m0 = await wallets.balance("pa");
    await life.handle(a, { a: "presente", n: 1, i: "flores" });
    expect(await wallets.balance("pa")).toBe(m0 - PRESENTES.flores!.price);
    expect(selves.get(b)!.needs.mood).toBe(40 + PRESENTES.flores!.mood);
    expect(last(toasts, b)).toMatch(/Ana ofereceu-te flores/);
    await life.handle(a, { a: "presente", n: 2, i: "perfume" });
    await life.handle(a, { a: "presente", n: 1000, i: "perfume" });
    expect(last(toasts, a)).toMatch(/Escolhe a quem/);
    const c: LifeActor = { characterId: "pc", x: sp.x, y: sp.y, name: "Cuca" };
    await life.join(c, { needs: { hunger: 80, energy: 80, mood: 30, health: 100 } });
    expect(selves.get(c)!.needs.mood).toBe(30 + PRESENTES.perfume!.mood);
  });
});

describe("seguro de saúde", () => {
  it("com seguro a consulta não se paga; sem seguro paga-se", async () => {
    const { life, toasts, d, wallets, advance } = setup();
    const ci = d.interiors!.find((i) => i.venue === "saude")!;
    const bal = d.places!.find((p) => p.interior === ci.id && p.kind === "service")!;
    const a: LifeActor = { characterId: "sg", x: bal.x, y: bal.y };
    expect(interiorAt(d, a.x, a.y)?.venue).toBe("saude");
    await life.join(a, null);
    await wallets.apply("sg", 50_000, "teste", "t-sg");
    await life.handle(a, { a: "self" });
    const m0 = await wallets.balance("sg");
    await life.handle(a, { a: "seguro_comprar" });
    expect(await wallets.balance("sg")).toBe(m0 - SEGURO_PRICE);
    await life.handle(a, { a: "seguro_comprar" });
    expect(last(toasts, a)).toMatch(/Já tens/);
    await life.handle(a, { a: "service", i: "consulta" });
    expect(last(toasts, a)).toMatch(/pago pelo seguro/);
    expect(await wallets.balance("sg")).toBe(m0 - SEGURO_PRICE);
    advance(25 * 3600_000);
    await life.handle(a, { a: "service", i: "consulta" });
    expect(await wallets.balance("sg")).toBe(m0 - SEGURO_PRICE - 3000);
  });
});
