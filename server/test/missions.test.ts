import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { angolaDay, emptyMissions, MISSIONS, missionsFor, progressMission, rollMissions } from "../src/game/life.js";
import { markPlayedToday, playedToday, resetStats } from "../src/game/stats.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

const NOW = Date.UTC(2026, 10, 20, 10);

describe("missões do dia (Hoje 0/3)", () => {
  it("3 missões diferentes por dia, sempre as mesmas para a mesma pessoa no mesmo dia", () => {
    const a = missionsFor("2026-11-20", "p1");
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(missionsFor("2026-11-20", "p1")).toEqual(a);
    a.forEach((id) => expect(MISSIONS[id]).toBeDefined());
  });

  it("sequência: sobe com dias completos seguidos e quebra quando se falha um dia", () => {
    const m = emptyMissions();
    rollMissions(m, NOW, "p1");
    for (const id of [...m.ids]) progressMission(m, id, id === "visitar" ? "x" : "");
    if (m.ids.includes("visitar")) ["y", "z"].forEach((d) => progressMission(m, "visitar", d));
    expect(m.done.every(Boolean)).toBe(true);
    expect(m.streak).toBe(1);
    rollMissions(m, NOW + 86_400_000, "p1"); // dia seguinte: mantém-se
    expect(m.streak).toBe(1);
    expect(m.done.some(Boolean)).toBe(false);
    rollMissions(m, NOW + 3 * 86_400_000, "p1"); // falhou um dia
    expect(m.streak).toBe(0);
  });

  it("«entrar em 3 sítios» só conta sítios diferentes", () => {
    const m = emptyMissions();
    m.day = angolaDay(NOW);
    m.ids = ["visitar", "comer", "banco"];
    m.done = [false, false, false];
    m.claimed = [false, false, false];
    progressMission(m, "visitar", "a");
    progressMission(m, "visitar", "a");
    progressMission(m, "visitar", "b");
    expect(m.done[0]).toBe(false);
    progressMission(m, "visitar", "c");
    expect(m.done[0]).toBe(true);
  });

  it("uma ação real completa a missão; o prémio paga-se uma vez e só depois de feita", async () => {
    // personagem cujas missões de hoje incluem ir a outro bairro
    let cid = "";
    for (let k = 0; k < 500 && !cid; k++) if (missionsFor(angolaDay(NOW), "m" + k).includes("viajar")) cid = "m" + k;
    expect(cid).not.toBe("");
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: string[] = [];
    const ca = getDistrict("cidade_alta")!;
    const life = new LifeController(ca, wallets, { self: (a, s) => selves.set(a, s), toast: (_a, t) => toasts.push(t) }, () => NOW, () => 0.9);
    const st = ca.places!.find((p) => p.kind === "stop")!;
    const a: LifeActor = { characterId: cid, x: st.x, y: st.y };
    await life.join(a, null);
    const idx = selves.get(a)!.missions.items.findIndex((m) => m.id === "viajar");
    await life.handle(a, { a: "mission_claim", n: idx + 1 });
    expect(toasts.at(-1)).toMatch(/Ainda não/);
    await life.handle(a, { a: "travel", i: "xipuli", t: "autocarro" });
    expect(selves.get(a)!.missions.items[idx]!.done).toBe(true);
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "mission_claim", n: idx + 1 });
    expect(selves.get(a)!.money).toBe(m0 + MISSIONS.viajar!.reward);
    await life.handle(a, { a: "mission_claim", n: idx + 1 });
    expect(selves.get(a)!.money).toBe(m0 + MISSIONS.viajar!.reward);
    expect(toasts.at(-1)).toMatch(/Já recolheste/);
  });
});

describe("pessoas a jogar hoje", () => {
  it("conta pessoas diferentes no dia de Angola e recomeça no dia seguinte", () => {
    resetStats();
    markPlayedToday("a", NOW);
    markPlayedToday("b", NOW);
    markPlayedToday("a", NOW);
    expect(playedToday(NOW)).toBe(2);
    expect(playedToday(NOW + 86_400_000)).toBe(0);
  });
});
