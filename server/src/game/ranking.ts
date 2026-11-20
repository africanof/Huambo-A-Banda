/** «Ricos»: quem tem mais dinheiro (carteira + banco). Memória do processo, atualizada quando o estado muda. */
const seen = new Map<string, { name: string; total: number; at: number }>();

export function noteWealth(characterId: string, name: string, total: number, now = Date.now()): void {
  seen.set(characterId, { name, total, at: now });
  if (seen.size > 5000) {
    // fica com os 2000 mais ricos
    const keep = [...seen.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 2000);
    seen.clear();
    for (const [k, v] of keep) seen.set(k, v);
  }
}

export function richest(n = 20): Array<{ name: string; total: number }> {
  return [...seen.values()].sort((a, b) => b.total - a.total).slice(0, n).map(({ name, total }) => ({ name, total }));
}

export function resetRanking(): void {
  seen.clear();
}
