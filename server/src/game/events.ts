/**
 * Eventos da cidade (calendário do Huambo, hora de Angola):
 *  - sábado: dia de feira (a colheita vende-se 30% mais cara no mercado);
 *  - domingo: missa de domingo (as idas à igreja animam o dobro);
 *  - sexta à noite (18h–24h): sexta-feira na banda (biscatos pagam +25% e a discoteca anima o dobro);
 *  - 8 de agosto: aniversário da cidade do Huambo (fundada em 1912) — sorte do dia a dobrar.
 */
export interface CityEvent {
  id: "feira" | "missa" | "sexta" | "aniversario";
  name: string;
  texto: string;
}

export function eventsAt(nowMs: number): CityEvent[] {
  const d = new Date(nowMs + 3600_000);
  const wd = d.getUTCDay();
  const hour = d.getUTCHours();
  const out: CityEvent[] = [];
  if (wd === 6) out.push({ id: "feira", name: "Dia de feira", texto: "Hoje a colheita vende-se 30% mais cara no mercado." });
  if (wd === 0) out.push({ id: "missa", name: "Missa de domingo", texto: "As idas à igreja animam o dobro." });
  if (wd === 5 && hour >= 18) out.push({ id: "sexta", name: "Sexta-feira na banda", texto: "Biscatos pagam +25% e a discoteca anima o dobro." });
  if (d.getUTCMonth() === 7 && d.getUTCDate() === 8) out.push({ id: "aniversario", name: "Aniversário da cidade do Huambo", texto: "A cidade faz anos (fundada em 1912): a sorte do dia paga a dobrar!" });
  return out;
}

export function hasEvent(nowMs: number, id: CityEvent["id"]): boolean {
  return eventsAt(nowMs).some((e) => e.id === id);
}
