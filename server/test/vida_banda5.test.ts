import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { eventsAt } from "../src/game/events.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { ROUPAS, SMS_PRICE } from "../src/game/life.js";
import { resetPresence, setOnline } from "../src/game/presence.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

function setup(startMs = Date.UTC(2026, 6, 8, 10)) {
  const wallets = new MemoryWalletRepository();
  const selves = new Map<LifeActor, SelfState>();
  const toasts: Array<[LifeActor, string]> = [];
  const looks: Array<[LifeActor, number]> = [];
  const sent: Array<[string, string, string]> = [];
  const d = getDistrict("cidade_alta")!;
  const life = new LifeController(
    d,
    wallets,
    {
      self: (a, s) => selves.set(a, s),
      toast: (a, t) => toasts.push([a, t]),
      appearance: (a, top) => looks.push([a, top]),
      sms: (to, from, text) => {
        sent.push([to, from, text]);
        return to === "online-friend";
      },
    },
    () => startMs,
    () => 0.5,
  );
  return { life, selves, toasts, looks, sent, d, wallets };
}

describe("eventos da cidade", () => {
  it("sábado é dia de feira, domingo há missa, sexta à noite há festa, 8 de agosto é o aniversário do Huambo", () => {
    expect(eventsAt(Date.UTC(2026, 10, 21, 10)).map((e) => e.id)).toContain("feira"); // sábado
    expect(eventsAt(Date.UTC(2026, 10, 22, 10)).map((e) => e.id)).toContain("missa"); // domingo
    expect(eventsAt(Date.UTC(2026, 10, 20, 20)).map((e) => e.id)).toContain("sexta"); // sexta 21h
    expect(eventsAt(Date.UTC(2026, 10, 20, 10)).map((e) => e.id)).not.toContain("sexta");
    expect(eventsAt(Date.UTC(2026, 7, 8, 10)).map((e) => e.id)).toContain("aniversario");
  });
});

describe("roupa de fardo", () => {
  it("compra-se no mercado, fica no guarda-roupa e veste-se; a cor escolhida ao nascer já é tua", async () => {
    const { life, selves, toasts, looks, d } = setup();
    const merc = d.places!.find((p) => p.kind === "door" && p.venue === "mercado")!;
    const a: LifeActor = { characterId: "r1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, appearance: { top: 54 } };
    await life.join(a, null);
    expect(selves.get(a)!.roupas).toEqual([-1, 54]);
    await life.handle(a, { a: "roupa_comprar", n: 1 });
    expect(toasts.at(-1)![1]).toMatch(/mercado/);
    Object.assign(a, { x: merc.x, y: merc.y });
    const m0 = selves.get(a)!.money;
    await life.handle(a, { a: "roupa_comprar", n: 1 });
    expect(selves.get(a)!.money).toBe(m0 - ROUPAS[0]!.price);
    expect(selves.get(a)!.roupas).toContain(ROUPAS[0]!.hue);
    expect(looks.at(-1)![1]).toBe(ROUPAS[0]!.hue);
    await life.handle(a, { a: "roupa_vestir", n: 54 + 2 });
    expect(looks.at(-1)![1]).toBe(54);
    await life.handle(a, { a: "roupa_vestir", n: 270 + 2 });
    expect(toasts.at(-1)![1]).toMatch(/não é tua/);
  });
});

describe("SMS", () => {
  it("só a amigos, gasta saldo do telemóvel, entrega a quem está ligado e guarda para quem não está", async () => {
    resetPresence();
    const { life, selves, toasts, sent, d } = setup();
    const a: LifeActor = { characterId: "s1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Ana" };
    await life.join(a, { phoneCredit: 100, friends: [{ id: "online-friend", name: "Beto" }, { id: "offline-friend", name: "Cuca" }] });
    await life.handle(a, { a: "sms", n: 1, s: "Onde estás?" });
    expect(sent.at(-1)).toEqual(["online-friend", "Ana", "Onde estás?"]);
    expect(selves.get(a)!.phoneCredit).toBe(100 - SMS_PRICE);
    await life.handle(a, { a: "sms", n: 2, s: "Liga-me" });
    expect(toasts.at(-1)![1]).toMatch(/quando entrar/);
    // o amigo desligado entra mais tarde e recebe
    setOnline("offline-friend", { name: "Cuca", district: "cidade_alta", districtName: "Cidade Alta", roomId: "x", since: 0 });
    const b: LifeActor = { characterId: "offline-friend", x: d.spawns[0]!.x, y: d.spawns[0]!.y };
    await life.join(b, null);
    expect(toasts.some(([w, t]) => w === b && /SMS de Ana: «Liga-me»/.test(t))).toBe(true);
    // sem saldo
    for (let k = 0; k < 5; k++) await life.handle(a, { a: "sms", n: 1, s: "olá" });
    expect(toasts.filter(([w]) => w === a).at(-1)![1]).toMatch(/Sem saldo/);
  });
});

describe("conquistas", () => {
  it("ganham-se pelo estado real; o prémio recolhe-se uma só vez", async () => {
    const { life, selves, toasts, d, wallets } = setup();
    const a: LifeActor = { characterId: "c1", x: d.spawns[0]!.x, y: d.spawns[0]!.y, name: "Nzinga" };
    await life.join(a, null);
    await life.handle(a, { a: "take_job", i: "zunga" });
    const c = selves.get(a)!.conquistas.find((x) => x.id === "primeiro_emprego")!;
    expect(c.feita).toBe(true);
    expect(c.paga).toBe(false);
    const bal = await wallets.balance("c1");
    await life.handle(a, { a: "conquistas_recolher" });
    expect(await wallets.balance("c1")).toBe(bal + c.reward);
    await life.handle(a, { a: "conquistas_recolher" });
    expect(toasts.at(-1)![1]).toMatch(/Não tens/);
    expect(await wallets.balance("c1")).toBe(bal + c.reward);
  });
});
