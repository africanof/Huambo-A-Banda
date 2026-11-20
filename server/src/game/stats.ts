import { angolaDay } from "./life.js";

/**
 * Quantas pessoas diferentes jogaram hoje (dia de Angola), como o «N pessoas a jogar hoje» do Vida na Banda.
 * Guarda só identificadores de personagem, em memória do processo (recomeça à meia-noite).
 */
const seen = new Set<string>();
let day = "";

export function markPlayedToday(characterId: string, nowMs = Date.now()): void {
  const d = angolaDay(nowMs);
  if (d !== day) {
    day = d;
    seen.clear();
  }
  seen.add(characterId);
}

export function playedToday(nowMs = Date.now()): number {
  return angolaDay(nowMs) === day ? seen.size : 0;
}

/** Só para testes. */
export function resetStats(): void {
  seen.clear();
  day = "";
}
