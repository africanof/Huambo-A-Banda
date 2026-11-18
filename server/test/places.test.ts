import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt } from "../src/game/districts.js";
import { isWalkable, sanitizeTarget } from "../src/game/movement.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { HOUSING, JOBS, SERVICES, STARTING_MONEY, rentPrice } from "../src/game/life.js";
import { MemoryBankRepository, MemoryPropertyRepository } from "../src/persistence/index.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const d = getDistrict("cidade_baixa")!;
const door = (venue: string, nth = 0) => d.places!.filter((p) => p.kind === "door" && p.venue === venue)[nth]!;
const spot = (interior: string, kind: string) => d.places!.find((p) => p.interior === interior && p.kind === kind)!;

function setup(startRich = true) {
  let now = Date.UTC(2026, 10, 18, 9, 0, 0);
  const wallets = new MemoryWalletRepository();
  const properties = new MemoryPropertyRepository(wallets);
  const bank = new MemoryBankRepository(wallets);
  const selves = new Map<LifeActor, SelfState>();
  const toasts: string[] = [];
  const life = new LifeController(
    d,
    wallets,
    { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) },
    () => now,
    () => (startRich ? 0.9 : 0.1), // 0.9 → família rica
    { properties, bank },
  );
  const mk = async (id: string): Promise<LifeActor> => {
    const a: LifeActor = { characterId: id, x: 2400, y: 2400 };
    await life.join(a, null);
    return a;
  };
  const at = (a: LifeActor, p: { x: number; y: number }) => Object.assign(a, { x: p.x, y: p.y });
  return { life, mk, at, toasts, selves, me: (a: LifeActor) => selves.get(a)!, advance: (ms: number) => (now += ms) };
}

describe("todos os edifícios com nome têm interior e funções", () => {
  it("cada edifício do bairro tem porta e interior caminhável", () => {
    const doors = d.places!.filter((p) => p.kind === "door");
    expect(doors.length).toBe(12);
    for (const p of doors) {
      expect(p.interiors!.length).toBeGreaterThan(0);
      for (const id of p.interiors!) {
        const i = d.interiors!.find((x) => x.id === id)!;
        expect(isWalkable(d, i.entry.x, i.entry.y)).toBe(true);
        expect(interiorAt(d, i.entry.x, i.entry.y)?.id).toBe(id);
        // há sempre uma saída dentro
        expect(d.places!.some((q) => q.interior === id && q.kind === "exit")).toBe(true);
      }
      expect(isWalkable(d, p.x, p.y)).toBe(true);
    }
  });

  it("cada posto de trabalho dos interiores corresponde a um emprego", () => {
    for (const p of d.places!.filter((q) => q.kind === "work")) {
      expect(JOBS.some((j) => j.place === p.job)).toBe(true);
    }
    for (const j of JOBS) expect(d.places!.some((p) => p.kind === "work" && p.job === j.place)).toBe(true);
  });

  it("dentro de uma sala não se atravessa a parede nem os móveis", () => {
    const i = d.interiors![0]!;
    const [rx, ry, rw, rh] = i.rect;
    expect(isWalkable(d, rx - 50, ry + rh / 2)).toBe(false);
    expect(isWalkable(d, rx + rw / 2, ry + rh + 50)).toBe(false);
    expect(sanitizeTarget(d, rx + rw + 20, ry + rh / 2)?.x).toBeLessThan(rx + rw);
  });
});

describe("entrar e sair", () => {
  it("à porta da cantina entra-se, come-se ao balcão e sai-se para a rua", async () => {
    const t = setup();
    const a = await t.mk("mem-1");
    await t.life.handle(a, { a: "enter" });
    expect(t.toasts.at(-1)).toMatch(/porta/);
    t.at(a, door("cantina"));
    await t.life.handle(a, { a: "enter" });
    expect(t.me(a).inside?.venue).toBe("cantina");
    // comer longe do balcão falha, ao balcão funciona
    await t.life.handle(a, { a: "eat", i: "funge_peixe" });
    expect(t.toasts.at(-1)).toMatch(/balcão/);
    t.at(a, spot("cantina", "food"));
    const m0 = t.me(a).money;
    await t.life.handle(a, { a: "eat", i: "funge_peixe" });
    expect(t.me(a).money).toBe(m0 - 1500);
    await t.life.handle(a, { a: "exit" });
    expect(t.me(a).inside).toBeNull();
    expect(Math.hypot(a.x - door("cantina").x, a.y - door("cantina").y)).toBeLessThan(5);
  });

  it("hotel: dorme-se no quarto (pago)", async () => {
    const t = setup();
    const a = await t.mk("mem-1");
    t.at(a, door("hotel"));
    await t.life.handle(a, { a: "enter" });
    t.at(a, spot("predio_rosa", "sleep"));
    await t.life.handle(a, { a: "sleep" });
    expect(t.me(a).busy?.kind).toBe("sleep");
  });
});

describe("casas e apartamentos", () => {
  it("casa de outra pessoa não abre; arrendar dá a chave; só um dono de cada vez", async () => {
    const t = setup();
    const a = await t.mk("mem-a");
    const b = await t.mk("mem-b");
    const casa = door("casa");
    t.at(a, casa);
    await t.life.handle(a, { a: "enter" });
    expect(t.me(a).inside).toBeNull();
    expect(t.me(a).offer?.units[0]?.free).toBe(true);
    const unit = casa.interiors![0]!;
    const m0 = t.me(a).money;
    await t.life.handle(a, { a: "rent_house", i: unit, n: 7 });
    expect(t.me(a).money).toBe(m0 - rentPrice(HOUSING.casa!.rentPerDay, 7));
    expect(t.me(a).inside?.id).toBe(unit);
    expect(t.me(a).homes[0]?.tenure).toBe("rent");
    // B não consegue entrar nem ficar com ela
    t.at(b, casa);
    await t.life.handle(b, { a: "enter" });
    expect(t.me(b).inside).toBeNull();
    expect(t.me(b).offer?.units[0]?.free).toBe(false);
    await t.life.handle(b, { a: "buy_house", i: unit });
    expect(t.toasts.at(-1)).toMatch(/primeiro/);
  });

  it("em casa dorme-se de graça e cozinha-se; a renda acaba e a pessoa sai", async () => {
    const t = setup();
    const a = await t.mk("mem-a");
    const pr = door("apartamentos", 0);
    t.at(a, pr);
    await t.life.handle(a, { a: "enter" });
    expect(t.me(a).offer?.units.length).toBe(4);
    const unit = pr.interiors![2]!;
    await t.life.handle(a, { a: "rent_house", i: unit, n: 1 });
    expect(t.me(a).inside?.id).toBe(unit);
    t.at(a, spot(unit, "home_sleep"));
    const m0 = t.me(a).money;
    await t.life.handle(a, { a: "sleep" });
    expect(t.me(a).busy?.kind).toBe("sleep_casa");
    expect(t.me(a).money).toBe(m0);
    await t.life.handle(a, { a: "cancel" });
    t.at(a, spot(unit, "home_eat"));
    await t.life.handle(a, { a: "home_eat" });
    expect(t.me(a).money).toBe(m0 - 500);
    // passam 2 dias: a renda acabou → despejo no próximo ciclo
    t.advance(2 * 86_400_000);
    await t.life.tick();
    t.advance(11_000);
    await t.life.tick();
    expect(t.me(a).inside).toBeNull();
  });

  it("comprar a casa colonial (família rica)", async () => {
    const t = setup();
    const a = await t.mk("mem-a");
    expect(t.me(a).money).toBe(STARTING_MONEY.rica);
    t.at(a, door("casa"));
    await t.life.handle(a, { a: "buy_house", i: door("casa").interiors![0]! });
    expect(t.me(a).homes[0]?.tenure).toBe("buy");
    expect(t.me(a).money).toBe(STARTING_MONEY.rica - HOUSING.casa!.buy);
  });
});

describe("banco, documentos e balcões", () => {
  it("depositar e levantar só ao balcão do banco", async () => {
    const t = setup();
    const a = await t.mk("mem-a");
    await t.life.handle(a, { a: "bank_in", n: 1000 });
    expect(t.toasts.at(-1)).toMatch(/Banco/);
    t.at(a, spot("banco", "bank"));
    const m0 = t.me(a).money;
    await t.life.handle(a, { a: "bank_in", n: 100_000 });
    expect(t.me(a).bank).toBe(100_000);
    expect(t.me(a).money).toBe(m0 - 100_000);
    await t.life.handle(a, { a: "bank_out", n: 30_000 });
    expect(t.me(a).bank).toBe(70_000);
    await t.life.handle(a, { a: "bank_out", n: 999_999 });
    expect(t.toasts.at(-1)).toMatch(/dinheiro/);
    expect(t.me(a).bank).toBe(70_000);
  });

  it("caixa de banco exige BI (Governo) e registo criminal (Tribunal)", async () => {
    const t = setup();
    const a = await t.mk("mem-a");
    const l = t.life.lifeOf(a)!;
    l.education = 4;
    await t.life.handle(a, { a: "take_job", i: "caixa_banco" });
    expect(t.toasts.at(-1)).toMatch(/Bilhete/);
    t.at(a, spot("tribunal", "service"));
    await t.life.handle(a, { a: "service", i: "registo" });
    expect(t.toasts.at(-1)).toMatch(/Primeiro/);
    t.at(a, spot("governo", "service"));
    await t.life.handle(a, { a: "service", i: "bi" });
    expect(t.me(a).docs.bi).toBe(true);
    // serviço errado no balcão errado
    await t.life.handle(a, { a: "service", i: "saldo_500" });
    expect(t.toasts.at(-1)).toMatch(/não é feito/);
    t.at(a, spot("tribunal", "service"));
    await t.life.handle(a, { a: "service", i: "registo" });
    await t.life.handle(a, { a: "take_job", i: "caixa_banco" });
    expect(t.me(a).job).toBe("caixa_banco");
  });

  it("todos os serviços têm um balcão no bairro", () => {
    for (const sv of SERVICES) {
      expect(d.places!.some((p) => p.kind === "service" && d.interiors!.find((i) => i.id === p.interior)?.venue === sv.venue)).toBe(true);
    }
  });
});
