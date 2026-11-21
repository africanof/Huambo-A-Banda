/**
 * Eventos da cidade: o calendário real do Huambo e de Angola (hora de Angola, UTC+1).
 *
 * Semanais:
 *  - sábado: dia de feira (a colheita e o quintal vendem-se 30% mais caros no mercado);
 *  - domingo: missa de domingo (as idas à igreja animam o dobro);
 *  - sexta à noite (18h–24h): sexta-feira na banda (biscatos +25%, a discoteca anima o dobro).
 * Do ano (feriados nacionais de Angola e datas do Huambo):
 *  - 1 jan Ano Novo · 4 fev Início da Luta Armada · Carnaval (47 dias antes da Páscoa) · 8 mar Dia da Mulher
 *  - 23 mar Libertação da África Austral · 4 abr Paz e Reconciliação · 1 mai Dia do Trabalhador
 *  - 8 ago Aniversário da cidade do Huambo (fundada em 1912) · 17 set Dia do Herói Nacional
 *  - 2 nov Finados · 11 nov Independência · 25 dez Natal e Família · 31 dez Passagem de ano
 * Épocas: colheita no planalto (abril a junho: a lavra rende +25%); quadra do Natal (20 a 25 dez: presentes a metade).
 *
 * Num feriado: quem trabalha recebe +50% e há uma prenda do dia para recolher (uma vez por pessoa e por dia).
 */
export type EventId =
  | "feira"
  | "missa"
  | "sexta"
  | "aniversario"
  | "ano_novo"
  | "luta_armada"
  | "carnaval"
  | "mulher"
  | "africa_austral"
  | "paz"
  | "trabalhador"
  | "heroi"
  | "finados"
  | "independencia"
  | "natal"
  | "passagem"
  | "colheita"
  | "quadra_natal";

export interface CityEvent {
  id: EventId;
  name: string;
  texto: string;
  /** feriado nacional (trabalho +50%) */
  feriado?: boolean;
  /** prenda do dia que cada pessoa pode recolher uma vez (Kz) */
  premio?: number;
}

interface YearEvent extends CityEvent {
  month: number; // 1..12
  day: number;
}

const YEAR: YearEvent[] = [
  { month: 1, day: 1, id: "ano_novo", name: "Dia do Ano Novo", texto: "Feriado: bom ano, Huambo! Quem trabalha hoje ganha +50%.", feriado: true, premio: 2000 },
  { month: 2, day: 4, id: "luta_armada", name: "Dia do Início da Luta Armada", texto: "Feriado nacional. Quem trabalha hoje ganha +50%.", feriado: true, premio: 1000 },
  { month: 3, day: 8, id: "mulher", name: "Dia Internacional da Mulher", texto: "Feriado: flores e presentes a metade do preço.", feriado: true, premio: 1000 },
  { month: 3, day: 23, id: "africa_austral", name: "Dia da Libertação da África Austral", texto: "Feriado nacional. Quem trabalha hoje ganha +50%.", feriado: true, premio: 1000 },
  { month: 4, day: 4, id: "paz", name: "Dia da Paz e Reconciliação", texto: "Feriado: a paz chegou em 2002. Humor de toda a gente sobe.", feriado: true, premio: 1500 },
  { month: 5, day: 1, id: "trabalhador", name: "Dia do Trabalhador", texto: "Feriado: quem trabalha hoje ganha +50%.", feriado: true, premio: 1000 },
  { month: 8, day: 8, id: "aniversario", name: "Aniversário da cidade do Huambo", texto: "A cidade faz anos (fundada em 1912): a sorte do dia paga a dobrar!", premio: 3000 },
  { month: 9, day: 17, id: "heroi", name: "Dia do Fundador da Nação e do Herói Nacional", texto: "Feriado nacional. Quem trabalha hoje ganha +50%.", feriado: true, premio: 1000 },
  { month: 11, day: 2, id: "finados", name: "Dia dos Finados", texto: "Feriado: dia de lembrar quem partiu. A missa anima o dobro.", feriado: true },
  { month: 11, day: 11, id: "independencia", name: "Dia da Independência", texto: "Feriado: Angola independente desde 1975! Prenda do dia e trabalho +50%.", feriado: true, premio: 3000 },
  { month: 12, day: 25, id: "natal", name: "Dia de Natal e da Família", texto: "Feriado: feliz Natal! Prenda do dia e presentes a metade.", feriado: true, premio: 3000 },
  { month: 12, day: 31, id: "passagem", name: "Passagem de ano", texto: "Festa na banda: a discoteca anima o dobro.", premio: 1000 },
];

/** Domingo de Páscoa (calendário gregoriano, algoritmo de Meeus/Jones/Butcher). */
export function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Terça-feira de Carnaval: 47 dias antes da Páscoa (feriado em Angola). */
export function carnaval(year: number): { month: number; day: number } {
  const e = easter(year);
  const t = Date.UTC(year, e.month - 1, e.day) - 47 * 86_400_000;
  const d = new Date(t);
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const CARNAVAL: CityEvent = { id: "carnaval", name: "Carnaval", texto: "Feriado: desfiles na banda! A discoteca e as danças animam o dobro.", feriado: true, premio: 1500 };

function yearEventsOn(year: number, month: number, day: number): CityEvent[] {
  const out: CityEvent[] = YEAR.filter((e) => e.month === month && e.day === day).map(({ month: _m, day: _d, ...ev }) => ev);
  const c = carnaval(year);
  if (c.month === month && c.day === day) out.push(CARNAVAL);
  return out;
}

export function eventsAt(nowMs: number): CityEvent[] {
  const d = new Date(nowMs + 3600_000);
  const wd = d.getUTCDay();
  const hour = d.getUTCHours();
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const out: CityEvent[] = yearEventsOn(y, mo, day);
  if (wd === 6) out.push({ id: "feira", name: "Dia de feira", texto: "Hoje a colheita e os animais vendem-se 30% mais caros no mercado." });
  if (wd === 0) out.push({ id: "missa", name: "Missa de domingo", texto: "As idas à igreja animam o dobro." });
  if (wd === 5 && hour >= 18) out.push({ id: "sexta", name: "Sexta-feira na banda", texto: "Biscatos pagam +25% e a discoteca anima o dobro." });
  if (mo >= 4 && mo <= 6) out.push({ id: "colheita", name: "Época das colheitas", texto: "Abril a junho no planalto: a lavra rende +25%." });
  if (mo === 12 && day >= 20 && day <= 25) out.push({ id: "quadra_natal", name: "Quadra do Natal", texto: "Presentes a metade do preço até dia 25." });
  return out;
}

export function hasEvent(nowMs: number, id: EventId): boolean {
  return eventsAt(nowMs).some((e) => e.id === id);
}

export function isHoliday(nowMs: number): boolean {
  return eventsAt(nowMs).some((e) => e.feriado);
}

/** A prenda do dia (o maior prémio dos eventos de hoje), ou null. */
export function dayPrize(nowMs: number): { id: EventId; name: string; premio: number } | null {
  let best: { id: EventId; name: string; premio: number } | null = null;
  for (const e of eventsAt(nowMs)) if (e.premio && (!best || e.premio > best.premio)) best = { id: e.id, name: e.name, premio: e.premio };
  return best;
}

/** Próximas datas do ano (para a Agenda do telemóvel): nome, data e em quantos dias. */
export function upcoming(nowMs: number, n = 6): Array<{ id: EventId; name: string; texto: string; date: string; inDays: number; feriado: boolean }> {
  const today = new Date(nowMs + 3600_000);
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const out: Array<{ id: EventId; name: string; texto: string; date: string; inDays: number; feriado: boolean }> = [];
  for (let k = 0; k <= 400 && out.length < n; k++) {
    const d = new Date(t0 + k * 86_400_000);
    for (const e of yearEventsOn(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()))
      out.push({ id: e.id, name: e.name, texto: e.texto, date: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, inDays: k, feriado: !!e.feriado });
  }
  return out.slice(0, n);
}
