/**
 * Tempo no Huambo (planalto central, ~1.700 m): época das chuvas de outubro a abril
 * (chove sobretudo à tarde, às vezes com trovoada) e cacimbo de maio a setembro
 * (seco, manhãs e noites frias). Determinístico por hora: todos os jogadores veem o mesmo céu.
 */
export type Sky = "sol" | "nublado" | "chuva" | "trovoada";
export interface Weather {
  ceu: Sky;
  temp: number;
  epoca: "chuvas" | "cacimbo";
  texto: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function weatherAt(nowMs: number): Weather {
  const d = new Date(nowMs + 3600_000); // hora de Angola
  const month = d.getUTCMonth() + 1;
  const hour = d.getUTCHours();
  const day = d.toISOString().slice(0, 10);
  const r = (hash(`${day}:${hour}`) % 1000) / 1000;
  const rd = (hash(day) % 1000) / 1000; // dia mais ou menos chuvoso
  const chuvas = month >= 10 || month <= 4;
  // temperatura: mínima de madrugada, máxima a meio da tarde
  const [tmin, tmax] = chuvas ? [15, 26] : [7, 24];
  const curve = (Math.cos(((hour - 15) / 24) * 2 * Math.PI) + 1) / 2;
  let temp = tmin + (tmax - tmin) * curve + (rd - 0.5) * 3;
  let ceu: Sky = "sol";
  if (chuvas) {
    const tarde = hour >= 13 && hour <= 20;
    const p = (tarde ? 0.45 : 0.12) + rd * 0.3;
    if (r < p * 0.35) ceu = "trovoada";
    else if (r < p) ceu = "chuva";
    else if (r < p + 0.25) ceu = "nublado";
  } else if (r < 0.15) {
    ceu = "nublado";
  }
  if (ceu === "chuva" || ceu === "trovoada") temp -= 3;
  temp = Math.round(temp);
  const textos: Record<Sky, string> = {
    sol: chuvas ? "Sol entre as nuvens" : hour < 9 || hour > 19 ? "Cacimbo: frio e céu limpo" : "Céu limpo e seco",
    nublado: "Céu nublado",
    chuva: "Está a chover",
    trovoada: "Trovoada — cuidado na rua!",
  };
  return { ceu, temp, epoca: chuvas ? "chuvas" : "cacimbo", texto: textos[ceu] };
}

/** Previsão para as próximas horas (uma por cada 3 h). */
export function forecast(nowMs: number, n = 6): Array<Weather & { hora: number }> {
  const out: Array<Weather & { hora: number }> = [];
  for (let i = 1; i <= n; i++) {
    const t = nowMs + i * 3 * 3600_000;
    out.push({ ...weatherAt(t), hora: new Date(t + 3600_000).getUTCHours() });
  }
  return out;
}
