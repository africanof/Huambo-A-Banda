/**
 * Conversa e gestos entre jogadores (como o «Falar» e os «Gestos» do Vida na Banda).
 * Tudo validado aqui: texto limpo e curto, limite de mensagens, só ouve quem está perto.
 */

export const CHAT_MAX = 120;
/** Quem está a até 15 m ouve (na mesma rua ou dentro do mesmo edifício). */
export const HEAR_RADIUS_CM = 1500;

export const EMOTES = {
  acenar: "acenou",
  dancar: "está a dançar",
  aplaudir: "aplaudiu",
  rir: "está a rir",
  celebrar: "está a celebrar",
  resmungar: "resmungou",
} as const;
export type EmoteId = keyof typeof EMOTES;

/** Palavrões e insultos comuns (pt/Angola) trocados por asteriscos; a lista é curta de propósito. */
const BAD = ["merda", "porra", "caralho", "foda", "fodase", "puta", "cona", "filhadaputa", "filho da puta", "burro", "estupido", "estúpido", "otario", "otário", "matumbo", "mbumbu", "kandengue de merda"];

// controlo, espaços invisíveis e marcas de direção do texto
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e]", "g");

export function sanitizeChat(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // sem caracteres de controlo nem espaços repetidos
  let t = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = [...t].slice(0, CHAT_MAX).join("");
  for (const w of BAD) {
    const re = new RegExp(`(^|[^\\p{L}])(${w.replace(/ /g, "\\s+")})(?=$|[^\\p{L}])`, "giu");
    t = t.replace(re, (_m, pre: string, word: string) => pre + "*".repeat(word.length));
  }
  return t;
}

/** Limite por pessoa: no máximo `max` em cada `windowMs`. */
export class BurstLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}
  take(key: string): boolean {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(key, arr);
    return true;
  }
  forget(key: string): void {
    this.hits.delete(key);
  }
}
