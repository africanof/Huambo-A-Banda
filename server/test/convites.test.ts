import { describe, expect, it } from "vitest";
import { getDistrict } from "../src/game/districts.js";
import { LifeController, type LifeActor, type SelfState } from "../src/game/LifeController.js";
import { cleanCode, MemoryInviteRepository } from "../src/persistence/InviteRepository.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

describe("convites", () => {
  it("código por jogador; quem entra com ele e faz 3 turnos ganha, e quem convidou também (mesmo desligado)", async () => {
    const invites = new MemoryInviteRepository();
    const wallets = new MemoryWalletRepository();
    const selves = new Map<LifeActor, SelfState>();
    const toasts: Array<[LifeActor, string]> = [];
    const d = getDistrict("cidade_alta")!;
    const life = new LifeController(d, wallets, { self: (a, s) => selves.set(a, s), toast: (a, t) => toasts.push([a, t]) }, () => Date.UTC(2026, 10, 18, 10), () => 0.5, { invites });
    const said = (a: LifeActor) => toasts.filter(([w]) => w === a).slice(-2).map(([, t]) => t).join(" | ");
    const sp = d.spawns[0]!;
    const dona: LifeActor = { characterId: "dona", x: sp.x, y: sp.y, userId: "u-dona", name: "Rosa" };
    const novo: LifeActor = { characterId: "novo", x: sp.x, y: sp.y, userId: "u-novo", name: "Kalei" };
    const conv: LifeActor = { characterId: "conv", x: sp.x, y: sp.y, userId: "guest:1", name: "Visita" };
    for (const a of [dona, novo, conv]) await life.join(a, null);
    await life.handle(dona, { a: "convite_ver" });
    const code = selves.get(dona)!.convite!.code!;
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(cleanCode(` ${code.toLowerCase()} `)).toBe(code);
    // regras
    await life.handle(dona, { a: "convite_usar", s: code });
    expect(said(dona)).toMatch(/é teu/);
    await life.handle(conv, { a: "convite_usar", s: code });
    expect(said(conv)).toMatch(/conta/);
    await life.handle(novo, { a: "convite_usar", s: "ZZZZZZ" });
    expect(said(novo)).toMatch(/não existe/);
    await life.handle(novo, { a: "convite_usar", s: code });
    expect(selves.get(novo)!.convite).toMatchObject({ usei: true, premioPronto: false });
    await life.handle(novo, { a: "convite_usar", s: code });
    expect(said(novo)).toMatch(/Já entraste/);
    await life.handle(novo, { a: "convite_premio" });
    expect(said(novo)).toMatch(/turnos/);
    // a dona sai do jogo; o novo faz 3 turnos
    await life.leave(dona);
    life.lifeOf(novo)!.carreira = { zunga: 3 };
    const n0 = await wallets.balance("novo");
    const d0 = await wallets.balance("dona");
    await life.handle(novo, { a: "convite_premio" });
    await life.handle(novo, { a: "convite_premio" });
    expect(await wallets.balance("novo")).toBe(n0 + 5000);
    expect(await wallets.balance("dona")).toBe(d0 + 5000);
    expect(await invites.stats("dona")).toEqual({ convidados: 1, premiados: 1 });
  });
});
