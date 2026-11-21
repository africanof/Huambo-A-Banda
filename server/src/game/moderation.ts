/**
 * Castigos em vigor (silenciar / banir), em memória para as verificações rápidas da conversa.
 * A fonte é a tabela game_sanctions; cada sala carrega o castigo de quem entra e recebe as mudanças
 * feitas no painel pelo canal de presença.
 */
const cache = new Map<string, { muteUntil: number; banUntil: number }>();

export function noteSanction(characterId: string, muteUntil: number, banUntil: number): void {
  if (muteUntil <= 0 && banUntil <= 0) cache.delete(characterId);
  else cache.set(characterId, { muteUntil, banUntil });
}

export function mutedUntil(characterId: string, nowMs: number): number {
  const s = cache.get(characterId);
  return s && s.muteUntil > nowMs ? s.muteUntil : 0;
}

export function bannedUntil(characterId: string, nowMs: number): number {
  const s = cache.get(characterId);
  return s && s.banUntil > nowMs ? s.banUntil : 0;
}

/** «até 21/11 às 18:30» (hora de Angola); proibições muito longas dizem «para sempre». */
export function untilText(ms: number): string {
  if (ms - Date.now() > 5 * 365 * 86_400_000) return "para sempre";
  const d = new Date(ms + 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `até ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function resetModeration(): void {
  cache.clear();
}
