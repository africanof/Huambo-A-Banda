import { angolaDay } from "./life.js";

/**
 * Jornal do Huambo: notícias do dia feitas a partir do que os jogadores fazem
 * (sorte grande, casas e carros comprados, nascimentos, dedicatórias da rádio, grupos novos…).
 * Guarda as últimas 200 em memória (recomeça se o servidor reiniciar).
 */
export type NewsKind = "sorte" | "casa" | "carro" | "nascimento" | "radio" | "grupo" | "missoes" | "amizade" | "emprego" | "familia";
export interface NewsItem {
  t: number;
  day: string;
  kind: NewsKind;
  bairro: string;
  text: string;
}

const items: NewsItem[] = [];
const MAX = 200;

export function recordNews(kind: NewsKind, bairro: string, text: string, now = Date.now()): void {
  items.push({ t: now, day: angolaDay(now), kind, bairro, text: text.slice(0, 200) });
  if (items.length > MAX) items.splice(0, items.length - MAX);
}

/** Notícias de hoje (as mais recentes primeiro). */
export function todaysNews(now = Date.now(), limit = 40): NewsItem[] {
  const d = angolaDay(now);
  return items.filter((i) => i.day === d).slice(-limit).reverse();
}

export function resetNews(): void {
  items.length = 0;
}
