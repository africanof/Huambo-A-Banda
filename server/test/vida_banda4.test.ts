import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { MAX_EDUCATION, UNI_LESSONS, UNI_PRICE } from "../src/game/life.js";
import { MemoryPostRepository } from "../src/persistence/PostRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup(district: string, startMs: number, rand = 0.5) {
  let now = startMs;
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: string[] = [];
  const d = getDistrict(district)!;
  const posts = new MemoryPostRepository();
  let r = rand;
  const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => now, () => r, { posts });
  return { life, selves, toasts, d, wallets, posts, advance: (ms: number) => (now += ms), setRand: (x: number) => (r = x) };
}

describe("universidade (Instituto Superior Politécnico do Huambo)", () => {
  it("o instituto é universidade; só com estudos completos; curso de 5 aulas pagas → licenciatura → vaga de médico", async () => {
    const { life, selves, toasts, d, wallets, advance } = setup("bairro_academico", Date.UTC(2026, 6, 10, 12));
    const door = d.places!.find((p) => p.kind === "door" && p.venue === "universidade")!;
    expect(door.name).toMatch(/Instituto Superior/);
    const a: LifeActor = { characterId: "u1", x: door.x, y: door.y };
    const stored = { education: MAX_EDUCATION, docs: { bi: true, registo: true, residencia: false } };
    await life.join(a, stored);
    await wallets.apply("u1", 100_000, "teste", "t-u1");
    await life.handle(a, { a: "uni_curso", i: "medicina" });
    expect(selves.get(a)!.uni.curso).toBe("medicina");
    await life.handle(a, { a: "enter" });
    const study = d.places!.find((p) => p.interior === interiorAt(d, a.x, a.y)!.id && p.kind === "study")!;
    Object.assign(a, { x: study.x, y: study.y });
    await life.handle(a, { a: "self" });
    const m0 = selves.get(a)!.money;
    for (let k = 0; k < UNI_LESSONS; k++) {
      await life.handle(a, { a: "study" });
      advance(21_000);
      await life.tick();
    }
    expect(selves.get(a)!.money).toBe(m0 - UNI_LESSONS * UNI_PRICE);
    expect(selves.get(a)!.uni.licenciaturas).toEqual(["medicina"]);
    await life.handle(a, { a: "take_job", i: "medico" });
    expect(selves.get(a)!.job).toBe("medico");
    await life.handle(a, { a: "take_job", i: "advogado" });
    expect(toasts.at(-1)).toMatch(/Direito/);
  });

  it("sem estudos completos não entra na universidade", async () => {
    const { life, toasts, d } = setup("bairro_academico", Date.UTC(2026, 6, 10, 12));
    const a: LifeActor = { characterId: "u2", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    await life.handle(a, { a: "uni_curso", i: "direito" });
    expect(toasts.at(-1)).toMatch(/acabar os estudos/);
  });
});

describe("doenças", () => {
  it("à noite na época das chuvas, na rua, pode apanhar paludismo; não deixa trabalhar; a consulta cura", async () => {
    // dezembro, 23h em Angola: época das chuvas e noite
    const { life, selves, toasts, d, advance, setRand } = setup("cidade_alta", Date.UTC(2026, 11, 5, 22));
    const a: LifeActor = { characterId: "d1", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(a, null);
    setRand(0.0001); // azar: adoece logo
    await life.tick();
    advance(11_000);
    await life.tick();
    expect(selves.get(a)!.doenca).not.toBeNull();
    setRand(0.99);
    await life.handle(a, { a: "biscato", i: "zungar" });
    if (selves.get(a)!.doenca!.id === "paludismo") expect(toasts.at(-1)).toMatch(/paludismo/);
    const hosp = d.places!.find((p) => p.kind === "door" && p.venue === "saude")!;
    Object.assign(a, { x: hosp.x, y: hosp.y });
    await life.handle(a, { a: "enter" });
    const bal = d.places!.find((p) => p.interior === interiorAt(d, a.x, a.y)!.id && p.kind === "service")!;
    Object.assign(a, { x: bal.x, y: bal.y });
    await life.handle(a, { a: "service", i: "consulta" });
    expect(selves.get(a)!.doenca).toBeNull();
  });
});

describe("assaltos e polícia", () => {
  it("à noite na rua com muito dinheiro pode ser assaltado; a ocorrência na esquadra recupera metade", async () => {
    const { life, selves, d, wallets, advance, setRand } = setup("sao_pedro", Date.UTC(2026, 6, 10, 22)); // cacimbo, 23h
    const a: LifeActor = { characterId: "r1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Kalei" };
    await life.join(a, null);
    await wallets.apply("r1", 100_000, "teste", "t-r1");
    await life.handle(a, { a: "self" });
    const m0 = selves.get(a)!.money;
    setRand(0.0001);
    await life.tick();
    advance(11_000);
    await life.tick();
    await new Promise((r) => setTimeout(r, 20));
    const lost = m0 - selves.get(a)!.money;
    expect(lost).toBeGreaterThan(0);
    expect(selves.get(a)!.roubo?.recuperavel).toBe(true);
    setRand(0.99);
    const esq = d.places!.find((p) => p.kind === "door" && p.venue === "esquadra")!;
    Object.assign(a, { x: esq.x, y: esq.y });
    await life.handle(a, { a: "enter" });
    const bal = d.places!.find((p) => p.interior === interiorAt(d, a.x, a.y)!.id && p.kind === "service")!;
    Object.assign(a, { x: bal.x, y: bal.y });
    const m1 = selves.get(a)!.money;
    await life.handle(a, { a: "service", i: "ocorrencia" });
    expect(selves.get(a)!.money).toBe(m1 + Math.round(lost / 2));
    expect(selves.get(a)!.roubo).toBeNull();
  });
});

describe("Muxima", () => {
  it("publicar (texto limpo, máximo 5 por hora) e gostar uma só vez", async () => {
    const { life, toasts, d, posts } = setup("chiva", Date.UTC(2026, 6, 10, 12));
    const a: LifeActor = { characterId: "m1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Nzinga" };
    const b: LifeActor = { characterId: "m2", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Beto" };
    await life.join(a, null);
    await life.join(b, null);
    await life.handle(a, { a: "muxima_publicar", s: "Que dia bonito na Chiva!" });
    const [p] = await posts.latest(5);
    expect(p).toMatchObject({ name: "Nzinga", bairro: "Chiva", text: "Que dia bonito na Chiva!", likes: 0 });
    await life.handle(b, { a: "muxima_gosto", s: p!.id });
    await life.handle(b, { a: "muxima_gosto", s: p!.id });
    expect((await posts.latest(5))[0]!.likes).toBe(1);
    for (let k = 0; k < 5; k++) await life.handle(a, { a: "muxima_publicar", s: `post ${k}` });
    expect(toasts.at(-1)).toMatch(/Já publicaste muito/);
  });
});
