/**
 * Economia entre jogadores: mercado vivo, associações de bairro e lojas dos jogadores.
 * Aqui ficam só as regras puras (sem base de dados), para testar e reutilizar.
 */

// ---------------------------------------------------------------- mercado vivo

/** Produtos com preço vivo: preço normal (Kz por unidade/kg) e quanto cada unidade mexe no preço. */
export const MARKET_ITEMS: Record<string, { name: string; base: number; step: number; unit: string }> = {
  milho: { name: "Milho", base: 60, step: 0.002, unit: "kg" },
  feijao: { name: "Feijão", base: 110, step: 0.003, unit: "kg" },
  batata_doce: { name: "Batata-doce", base: 45, step: 0.002, unit: "kg" },
  ovos: { name: "Ovos", base: 60, step: 0.003, unit: "ovo" },
  galinha: { name: "Galinha", base: 3000, step: 0.02, unit: "cabeça" },
  cabrito: { name: "Cabrito", base: 24000, step: 0.03, unit: "cabeça" },
  porco: { name: "Porco", base: 42000, step: 0.03, unit: "cabeça" },
};
/** Tempo (horas) para a distância ao preço normal cair para 1/e (≈ metade em 17 h). */
export const MARKET_RECOVERY_H = 24;
export const MARKET_MIN = 0.5;
export const MARKET_MAX = 2.0;

/** O preço volta devagar ao normal com o tempo. */
export function recovered(price: number, base: number, hours: number): number {
  return base + (price - base) * Math.exp(-Math.max(0, hours) / MARKET_RECOVERY_H);
}

/**
 * Efeito de uma troca no preço: qty > 0 = jogadores venderam ao mercado (mais oferta → preço desce);
 * qty < 0 = jogadores compraram (mais procura → preço sobe). Sempre entre metade e o dobro do normal.
 */
export function afterTrade(price: number, base: number, step: number, qty: number): number {
  const p = qty >= 0 ? price * Math.pow(1 - step, qty) : price * Math.pow(1 + step, -qty);
  return Math.min(base * MARKET_MAX, Math.max(base * MARKET_MIN, p));
}

// ---------------------------------------------------------------- associações de bairro

/** Semana (segunda a domingo, hora de Angola) no formato 2026-W47. */
export function angolaWeek(nowMs: number): string {
  const d = new Date(nowMs + 3600_000);
  const day = (d.getUTCDay() + 6) % 7; // segunda = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  // a semana pertence ao ano da sua quinta-feira; semana 1 é a que tem a primeira quinta-feira
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function previousWeek(nowMs: number): string {
  return angolaWeek(nowMs - 7 * 86_400_000);
}

/** Pontos da associação por atividade dos membros. */
export const ASSOC_POINTS = {
  /** por kg colhido */
  colheita: 1,
  /** por turno de trabalho (emprego ou loja) */
  turno: 10,
  /** por cada 100 Kz vendidos no mercado ou na loja */
  venda: 1,
  /** por cada dia de cuidados a um filho */
  cuidar: 5,
} as const;
/** Objetivo da semana de cada associação (pontos) e o prémio que cada membro recolhe ao cumpri-lo. */
export const ASSOC_GOAL = 1500;
export const ASSOC_GOAL_PRIZE = 2000;
/** Prémio para cada membro da associação que ficou em 1.º no ranking da semana anterior. */
export const ASSOC_TOP_PRIZE = 5000;
/** Para receber os prémios é preciso ter contribuído pelo menos isto nessa semana. */
export const ASSOC_MIN_POINTS = 20;

// ---------------------------------------------------------------- lojas dos jogadores

/** O que uma banca de jogador pode vender: custo no grossista e efeito em quem come/bebe. */
export const SHOP_ITEMS: Record<string, { name: string; cost: number; hunger?: number; mood?: number; energy?: number }> = {
  funge_peixe: { name: "Funge com peixe seco", cost: 700, hunger: 45, mood: 5 },
  arroz_feijao: { name: "Arroz com feijão", cost: 450, hunger: 35 },
  pao_chourico: { name: "Pão com chouriço", cost: 180, hunger: 15 },
  refrigerante: { name: "Refrigerante", cost: 140, hunger: 5, mood: 5 },
  cafe: { name: "Café", cost: 120, energy: 8, mood: 2 },
  bolinhos: { name: "Bolinhos de jinguba", cost: 90, hunger: 6, mood: 3 },
};
export const SHOP_OPEN_PRICE = 25_000; // licença da banca no mercado
export const SHOP_MAX_STOCK = 200; // por produto
export const SHOP_MAX_EMPLOYEES = 3;
/** O dono pode pôr o preço entre o custo e 4× o custo. */
export const SHOP_PRICE_MAX = 4;
/** Clientes do bairro (não-jogadores) por hora, com e sem empregados, a um preço «justo» (2× o custo). */
export const SHOP_CUSTOMERS_PER_H = 6;
export const SHOP_CUSTOMERS_PER_EMPLOYEE = 4;
/** Salário de um turno na loja: o dono escolhe entre estes valores. */
export const SHOP_WAGES = [1500, 2500, 4000];

/** Procura a um preço: 1 ao dobro do custo; mais barato vende mais, mais caro vende menos. */
export function demandAt(price: number, cost: number): number {
  const k = price / cost;
  return Math.max(0.05, Math.min(1.6, 2.2 - 0.6 * k));
}

export interface ShopStock {
  [item: string]: { qty: number; price: number };
}

/**
 * Vendas a clientes do bairro desde a última conta (até 48 h de cada vez). Escolhe sempre
 * o produto com mais procura que ainda tem stock. Devolve o stock novo, o que entrou e as unidades.
 */
export function simulateSales(stock: ShopStock, hours: number, employees: number, rand: () => number): { stock: ShopStock; revenue: number; units: number } {
  const out: ShopStock = JSON.parse(JSON.stringify(stock));
  const h = Math.min(48, Math.max(0, hours));
  let customers = h * (SHOP_CUSTOMERS_PER_H + SHOP_CUSTOMERS_PER_EMPLOYEE * Math.min(employees, SHOP_MAX_EMPLOYEES));
  let revenue = 0;
  let units = 0;
  const items = Object.keys(out).filter((k) => SHOP_ITEMS[k]);
  while (customers >= 1 && items.some((k) => out[k]!.qty > 0)) {
    customers -= 1;
    // cada cliente escolhe um produto ao calhas e compra conforme o preço
    const k = items[Math.floor(rand() * items.length)]!;
    const s = out[k]!;
    if (s.qty <= 0) continue;
    if (rand() < demandAt(s.price, SHOP_ITEMS[k]!.cost) / 1.6) {
      s.qty -= 1;
      revenue += s.price;
      units += 1;
    }
  }
  return { stock: out, revenue, units };
}

// ---------------------------------------------------------------- estabelecimentos da cidade (comprar sítios reais)

/**
 * Sítios reais do mapa que um jogador pode comprar (um dono por sítio). O dono recebe uma parte de
 * tudo o que os jogadores lá pagam e o rendimento dos clientes do bairro (por hora, conforme o nível).
 * Serviços públicos (escola, saúde, igreja, polícia, administração, tribunal, banco, correios, mercado) não se vendem.
 */
export const VENUES_FOR_SALE: Record<string, { name: string; price: number; perHour: number }> = {
  cantina: { name: "Cantina", price: 300_000, perHour: 7_000 },
  padaria: { name: "Padaria", price: 350_000, perHour: 8_000 },
  churrasqueira: { name: "Churrasqueira", price: 450_000, perHour: 10_000 },
  farmacia: { name: "Farmácia", price: 700_000, perHour: 15_000 },
  loja_telecom: { name: "Loja de telemóveis", price: 900_000, perHour: 19_000 },
  discoteca: { name: "Discoteca", price: 1_500_000, perHour: 32_000 },
  hotel: { name: "Hotel", price: 2_500_000, perHour: 50_000 },
};
/** Parte do que os jogadores pagam no sítio que vai para a caixa do dono. */
export const VENUE_CUT = 0.25;
export const VENUE_MAX_LEVEL = 3;
/** Rendimento passivo acumula no máximo 24 h (é preciso ir recolhendo). */
export const VENUE_MAX_HOURS = 24;
/** Cada pessoa pode ter até 3 estabelecimentos. */
export const VENUE_MAX_OWNED = 3;
/** Vender de volta à cidade: recupera-se esta parte do que se investiu. */
export const VENUE_RESALE = 0.6;

export function venuePerHour(venue: string, nivel: number): number {
  const v = VENUES_FOR_SALE[venue];
  return v ? Math.round(v.perHour * (1 + 0.5 * (nivel - 1))) : 0;
}
export function venueUpgradeCost(venue: string, nivel: number): number {
  const v = VENUES_FOR_SALE[venue];
  return v ? Math.round(v.price * 0.6 * nivel) : 0;
}

// ---------------------------------------------------------------- negócios por baixo da mesa (crime organizado)

/**
 * Negócios ilegais: rendem muito mais, mas cada recolha arrisca uma rusga da polícia.
 * O risco sobe com o «calor» (quanto mais tempo e mais dinheiro, mais se dá nas vistas).
 * Rusga: perde-se o negócio e o lucro, paga-se multa, vai-se preso uns minutos e perde-se o registo criminal limpo.
 */
export const ILEGAIS: Record<string, { name: string; cost: number; perHour: number; risco: number; texto: string }> = {
  contrabando: { name: "Contrabando de combustível", cost: 200_000, perHour: 22_000, risco: 0.1, texto: "Bidões a atravessar a fronteira sem pagar impostos." },
  jogo: { name: "Jogo clandestino", cost: 350_000, perHour: 35_000, risco: 0.13, texto: "Apostas e máquinas escondidas num armazém." },
  desmanche: { name: "Desmanche de carros roubados", cost: 600_000, perHour: 60_000, risco: 0.17, texto: "Peças de carros roubados vendidas a oficinas." },
};
/** Risco de rusga numa recolha: base do negócio + 1,5% por hora acumulada (máx. 60%). */
export function raidChance(tipo: string, hours: number): number {
  const n = ILEGAIS[tipo];
  if (!n) return 0;
  return Math.min(0.6, n.risco + 0.015 * Math.min(24, hours));
}
export const MULTA_FRACAO = 0.3; // da quantia investida
export const PRISAO_S = 120; // tempo preso (segundos reais)
/** Prémio para o/a agente que faz a rusga (parte da multa). */
export const RUSGA_PREMIO = 0.5;
