import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { C2S, ErrorCodes, PROTOCOL_VERSION, S2C } from "../src/net/protocol.js";

/** Garante que client/src/net/protocol.gd é um espelho fiel de src/net/protocol.ts. */
describe("protocol sync (TS ↔ GDScript)", () => {
  const gd = readFileSync(resolve(import.meta.dirname, "../../client/src/net/protocol.gd"), "utf8");
  const consts = Object.fromEntries([...gd.matchAll(/^const (\w+) := (\d+)/gm)].map((m) => [m[1], Number(m[2])]));

  const expected: Record<string, number> = { PROTOCOL_VERSION };
  for (const [k, v] of Object.entries(C2S)) expected[`C2S_${k}`] = v;
  for (const [k, v] of Object.entries(S2C)) expected[`S2C_${k}`] = v;
  for (const [k, v] of Object.entries(ErrorCodes)) expected[`ERR_${k}`] = v;

  it("has exactly the same constants and values", () => {
    expect(consts).toEqual(expected);
  });

  it("keeps message types as 1-byte fixints (0..127)", () => {
    for (const v of [...Object.values(C2S), ...Object.values(S2C)]) expect(v).toBeLessThan(128);
  });
});
