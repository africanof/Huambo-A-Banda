import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { AJUDA_BASE, AJUDA_POR_ESTUDO, CUIDADO, PARTO_PRICE, idadeAnos, sanitizeLife } from "../src/game/life.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const DAY = 86_400_000;

function setup() {
  let now = Date.UTC(2026, 10, 18, 10);
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const renames: string[] = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]), rename: (_a, n) => renames.push(n) }, () => now, () => 0.3);
  return { life, selves, toasts, d, wallets, renames, advance: (ms: number) => (now += ms), now: () => now };
}
/** as últimas mensagens dessa pessoa (avisos de conquistas podem vir logo a seguir) */
const last = (t: Array<[LifeActor, string]>, a: LifeActor) => t.filter(([w]) => w === a).slice(-3).map(([, m]) => m).join(" | ");

describe("família: filhos e gerações", () => {
  it("casados, com casa e no centro de saúde: o par aceita, paga-se o parto e o filho fica nos dois", async () => {
    const { life, selves, toasts, d, wallets, advance, now, renames } = setup();
    const saude = d.interiors!.find((i) => i.venue === "saude")!;
    const a: LifeActor = { characterId: "pa", x: saude.entry.x, y: saude.entry.y, userId: "u-a", name: "Ana" };
    const b: LifeActor = { characterId: "pb", x: saude.entry.x, y: saude.entry.y, userId: "u-b", name: "Beto" };
    const t0 = now();
    await life.join(a, { partner: { id: "pb", name: "Beto", since: t0 - 10 * DAY, married: false } });
    await life.join(b, { partner: { id: "pa", name: "Ana", since: t0 - 10 * DAY, married: true } });
    await wallets.apply("pa", 200_000, "teste", "t-pa");
    await life.handle(a, { a: "self" });
    await life.handle(a, { a: "filho_pedir", s: "Kalei", i: "m" });
    expect(last(toasts, a)).toMatch(/casem-se/);
    life.lifeOf(a)!.partner!.married = true;
    await life.handle(a, { a: "filho_pedir", s: "Kalei", i: "m" });
    expect(last(toasts, a)).toMatch(/casa/); // sem casa
    // uma casa arrendada (atalho do teste)
    (life as unknown as { entries: Map<LifeActor, { homes: unknown[] }> }).entries.get(a)!.homes = [{ unit: "x", name: "Casa", tenure: "rent", paidUntil: null }];
    await life.handle(a, { a: "filho_pedir", s: "Kalei", i: "m" });
    expect(selves.get(b)!.babyReq).toMatchObject({ name: "Ana", nome: "Kalei" });
    const m0 = await wallets.balance("pa");
    await life.handle(b, { a: "filho_aceitar" });
    expect(await wallets.balance("pa")).toBe(m0 - PARTO_PRICE);
    expect(selves.get(a)!.filhos).toMatchObject([{ nome: "Kalei", sexo: "m", idade: 0, fase: "bebé", cuidadoHoje: true }]);
    expect(selves.get(b)!.filhos.map((f) => f.nome)).toEqual(["Kalei"]);
    expect(selves.get(a)!.conquistas.find((c) => c.id === "pai_mae")!.feita).toBe(true);

    // cuidar: uma vez por dia, custo da fase; em idade escolar os estudos sobem
    await life.handle(a, { a: "filho_cuidar", n: 1 });
    expect(last(toasts, a)).toMatch(/Hoje já cuidaste/);
    advance(DAY);
    const m1 = await wallets.balance("pa");
    await life.handle(a, { a: "filho_cuidar", n: 1 });
    expect(await wallets.balance("pa")).toBe(m1 - CUIDADO[0]!.price);
    advance(4 * DAY); // 7,5 anos
    for (let k = 0; k < 3; k++) {
      await life.handle(a, { a: "filho_cuidar", n: 1 });
      advance(DAY);
    }
    expect(selves.get(a)!.filhos[0]!.estudos).toBeGreaterThanOrEqual(1);
    // menor ainda não ajuda nem passa o testemunho
    await life.handle(a, { a: "filho_ajuda", n: 1 });
    expect(last(toasts, a)).toMatch(/menor/);
    await life.handle(a, { a: "geracao_continuar", n: 1 });
    expect(last(toasts, a)).toMatch(/ainda não é adulto/);
    // adulto: ajuda uma vez por dia e pode continuar a família
    advance(8 * DAY);
    const kid = life.lifeOf(a)!.filhos[0]!;
    expect(idadeAnos(kid, now())).toBeGreaterThanOrEqual(18);
    const m2 = await wallets.balance("pa");
    await life.handle(a, { a: "filho_ajuda", n: 1 });
    await life.handle(a, { a: "filho_ajuda", n: 1 });
    expect(await wallets.balance("pa")).toBe(m2 + AJUDA_BASE + AJUDA_POR_ESTUDO * kid.estudos);
    const bank = await wallets.balance("pa");
    life.lifeOf(a)!.jobId = "zunga";
    await life.handle(a, { a: "geracao_continuar", n: 1 });
    expect(renames).toEqual(["Kalei"]);
    expect(a.name).toBe("Kalei");
    const s = selves.get(a)!;
    expect(s.geracao).toBe(2);
    expect(s.job).toBeNull();
    expect(s.partner).toBeNull();
    expect(s.filhos).toEqual([]);
    expect(await wallets.balance("pa")).toBe(bank); // herança: o dinheiro fica
  });

  it("estado guardado dos filhos é validado", () => {
    const l = sanitizeLife({ filhos: [{ id: "x", nome: "Ndala", sexo: "z", nasceu: 5, estudos: 9 }, { nome: 3 }], geracao: -2 });
    expect(l.filhos).toEqual([{ id: "x", nome: "Ndala", sexo: "m", nasceu: 5, cuidadoDia: null, cuidados: 0, estudos: 4, ajudaDia: null }]);
    expect(l.geracao).toBe(1);
  });
});
