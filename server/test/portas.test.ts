import { describe, expect, it } from "vitest";
import { getDistrict, interiorAt, listDistricts, type District } from "../src/game/districts.js";
import { isWalkable } from "../src/game/movement.js";
import { LifeController, type LifeActor } from "../src/game/LifeController.js";
import { MemoryWalletRepository } from "../src/persistence/WalletRepository.js";

/** Pontos caminháveis a partir de (sx, sy), em passos de 50 cm (rua e interiores). */
function reach(d: District, sx: number, sy: number) {
  const S = 50;
  const k = (x: number, y: number) => `${Math.round(x / S)},${Math.round(y / S)}`;
  const seen = new Set<string>();
  const x0 = Math.round(sx / S) * S, y0 = Math.round(sy / S) * S;
  const q: Array<[number, number]> = [[x0, y0]];
  seen.add(k(x0, y0));
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[S, 0], [-S, 0], [0, S], [0, -S]] as const) {
      const nx = x + dx, ny = y + dy, kk = k(nx, ny);
      if (seen.has(kk) || !isWalkable(d, nx, ny)) continue;
      seen.add(kk);
      q.push([nx, ny]);
    }
  }
  return (x: number, y: number, r: number) => {
    for (let dx = -r; dx <= r; dx += S) for (let dy = -r; dy <= r; dy += S) if (Math.hypot(dx, dy) <= r && seen.has(k(x + dx, y + dy))) return true;
    return false;
  };
}

describe("entrar em todos os lugares", () => {
  const bairros = listDistricts().map((m) => getDistrict(m.id)!).filter((d) => d.places?.some((p) => p.kind === "door"));

  it.each(bairros.map((d) => [d.id, d] as const))("%s: cada porta alcança-se a pé, entra-se, cada balcão lá dentro alcança-se e sai-se", async (_id, d) => {
    const sp = d.spawns.find((s) => !s.id.startsWith("from_")) ?? d.spawns[0]!;
    const street = reach(d, sp.x, sp.y);
    const toasts: string[] = [];
    const life = new LifeController(d, new MemoryWalletRepository(), { self: () => {}, toast: (_a, t) => toasts.push(t) }, () => Date.UTC(2026, 10, 20, 12), () => 0.5);
    const problems: string[] = [];
    for (const door of d.places!.filter((p) => p.kind === "door")) {
      if (!street(door.x, door.y, Math.max(0, door.radius - 20))) problems.push(`${door.name}: porta inalcançável`);
      // chega à beira da porta (dentro da folga), como no telemóvel com atraso de rede
      const a: LifeActor = { characterId: `p-${door.id}`, x: door.x + door.radius + 50, y: door.y };
      await life.join(a, null);
      await life.handle(a, { a: "enter" });
      const i = interiorAt(d, a.x, a.y);
      const home = ["casa", "apartamentos"].includes(door.venue ?? "");
      if (!home && !i) problems.push(`${door.name}: não entrou (${toasts.at(-1)})`);
      if (i) {
        const inside = reach(d, a.x, a.y);
        for (const q of d.places!.filter((q) => q.interior === i.id)) if (!inside(q.x, q.y, Math.max(0, q.radius - 20))) problems.push(`${door.name}: «${q.name}» inalcançável`);
        const ex = d.places!.find((q) => q.interior === i.id && q.kind === "exit");
        if (!ex) problems.push(`${door.name}: sem saída`);
        else {
          Object.assign(a, { x: ex.x, y: ex.y });
          await life.handle(a, { a: "exit" });
          if (interiorAt(d, a.x, a.y) || !isWalkable(d, a.x, a.y)) problems.push(`${door.name}: saída falhou`);
        }
      }
      life.leave(a);
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
