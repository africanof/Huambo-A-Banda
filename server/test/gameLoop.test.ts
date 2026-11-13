import { describe, expect, it } from "vitest";
import { GameLoop } from "../src/game/GameLoop.js";

describe("GameLoop", () => {
  it("runs fixed steps and snapshots at the configured ratio", () => {
    const dts: number[] = [];
    let snaps = 0;
    const loop = new GameLoop(20, 10, (dt) => dts.push(dt), () => snaps++);
    loop.advance(1000);
    // 1000 ms a 20 Hz = 20 passos, mas a recuperação está limitada a 5 por frame.
    expect(dts.length).toBe(5);
    for (let i = 0; i < 20; i++) loop.advance(50);
    expect(dts.length).toBe(25);
    expect(dts.every((d) => Math.abs(d - 0.05) < 1e-9)).toBe(true);
    expect(snaps).toBe(12);
  });

  it("accumulates partial frames", () => {
    let steps = 0;
    const loop = new GameLoop(20, 10, () => steps++, () => {});
    loop.advance(30);
    expect(steps).toBe(0);
    loop.advance(30);
    expect(steps).toBe(1);
  });
});
