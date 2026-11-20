/**
 * Regras de vida do Huambo É A Banda — funções puras, sem rede nem base de dados.
 *
 * Mecânicas inspiradas nos simuladores de vida social (família de origem sorteada,
 * necessidades, comer/dormir, empregos por turnos com pagamento decrescente, pedir
 * dinheiro aos pais), adaptadas à realidade do Huambo: empregos e comida locais, Kz.
 */

export type FamilyClass = "humilde" | "media" | "rica" | "muito_rica";

export interface Needs {
  hunger: number; // 100 = saciado
  energy: number;
  mood: number;
  health: number;
}

export interface LifeState {
  needs: Needs;
  family: FamilyClass;
  education: number; // 0..4
  study: number; // aulas feitas para o próximo nível
  jobId: string | null;
  shiftsDay: string; // dia (Angola) do contador de turnos
  shiftsCount: number;
  parentsDay: string | null; // último dia em que pediu dinheiro aos pais
  /** documentos tratados no Governo Provincial / Tribunal */
  docs: { bi: boolean; registo: boolean; residencia: boolean };
  /** saldo de telemóvel (Kz) carregado na loja de telecomunicações */
  phoneCredit: number;
  /** carro que a personagem tem (id de CARS) ou null */
  car: string | null;
  /** a lotaria da vida: onde e de quem nasceu (sorteado uma vez, ao criar a personagem) */
  birth: Birth | null;
}

export interface Birth {
  bairro: string;
  pais: string;
  provincia: string;
}

/** Onde se cresce, conforme a família (como no Vida na Banda: musseque, centralidade ou elite). */
export const BIRTH_BAIRROS: Record<FamilyClass, string[]> = {
  humilde: ["bomba_alta", "cacoio", "cahumba", "cambiote", "chiva", "lossambo", "salucombo", "samutaca", "vila_graca", "xipuli", "kapango"],
  media: ["bairro_fatima", "sao_pedro", "aviacao", "bairro_militar", "benfica", "cacilhas", "canata", "sao_jose", "sao_joao", "bairro_academico", "cidade_baixa"],
  rica: ["cidade_alta", "bairro_academico", "cidade_baixa"],
  muito_rica: ["cidade_alta"],
};
const PAIS_PAI = ["Sr. Chipenda", "Sr. Kalei", "Sr. Sapalo", "Sr. Tchissola", "Sr. Cassoma", "Sr. Ngueve", "Sr. Chilembo", "Sr. Jamba", "Sr. Epalanga", "Sr. Kandjimbo"];
const PAIS_MAE = ["D. Esperança", "D. Rosa", "D. Florinda", "D. Nhanga", "D. Chilombo", "D. Teresa", "D. Ngueza", "D. Mariana", "D. Lussati", "D. Celeste"];
const PROVINCIAS = ["Huambo", "Huambo", "Huambo", "Huambo", "Bié", "Benguela", "Cuanza Sul", "Luanda", "Huíla", "Moxico"];

/** Sorteio do nascimento: determinístico pela identidade (o mesmo jogador nasce sempre igual),
 *  só bairros que existem neste servidor. */
export function rollBirth(family: FamilyClass, seed: string, exists: (bairro: string) => boolean): Birth {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = <T>(a: readonly T[], k: number) => a[(h >>> k) % a.length]!;
  const options = BIRTH_BAIRROS[family].filter(exists);
  return {
    bairro: options.length ? pick(options, 0) : "cidade_baixa",
    pais: `${pick(PAIS_PAI, 3)} e ${pick(PAIS_MAE, 7)}`,
    provincia: pick(PROVINCIAS, 11),
  };
}

export interface Job {
  id: string;
  name: string;
  where: string; // texto para o jogador
  place: string; // "job" do lugar no mapa onde se trabalha
  pay: number; // Kz por turno completo
  education: number;
  /** documentos exigidos pelo empregador */
  docs?: DocId[];
}

/** Empregos do Huambo (cada lugar com nome tem o seu posto de trabalho). */
export const JOBS: Job[] = [
  { id: "zunga", name: "Zungueiro(a)", where: "Banca da zungueira", place: "zunga", pay: 2000, education: 0 },
  { id: "vendedor_mercado", name: "Vendedor(a) do mercado", where: "Banca do mercado", place: "vendedor_mercado", pay: 3000, education: 0 },
  { id: "kupapata", name: "Kupapata (moto-táxi)", where: "Praça das kupapatas", place: "kupapata", pay: 3500, education: 0 },
  { id: "padeiro", name: "Padeiro(a)", where: "Padaria Planalto (forno)", place: "padeiro", pay: 3500, education: 0 },
  { id: "cozinheiro", name: "Cozinheiro(a)", where: "Cantina Ekuikui (cozinha)", place: "cozinheiro", pay: 4000, education: 0 },
  { id: "carteiro", name: "Carteiro(a)", where: "Correios (triagem)", place: "carteiro", pay: 5000, education: 1 },
  { id: "rececionista", name: "Rececionista de hotel", where: "Hotel iU (receção)", place: "rececionista", pay: 5500, education: 1 },
  { id: "vendedor_loja", name: "Vendedor(a) de telemóveis", where: "Loja Kanda Móvel", place: "vendedor_loja", pay: 6000, education: 1 },
  { id: "caixa_banco", name: "Caixa de banco", where: "Banco Planalto (caixa)", place: "caixa_banco", pay: 8500, education: 2, docs: ["bi", "registo"] },
  { id: "funcionario_publico", name: "Funcionário(a) público(a)", where: "Governo Provincial (secretaria)", place: "funcionario_publico", pay: 9000, education: 2, docs: ["bi"] },
  { id: "oficial_justica", name: "Oficial de justiça", where: "Tribunal da Comarca", place: "oficial_justica", pay: 9500, education: 3, docs: ["bi", "registo"] },
  { id: "professor", name: "Professor(a)", where: "Escola Primária ou Liceu (sala de aula)", place: "professor", pay: 10000, education: 3, docs: ["bi"] },
  // Bairro de Fátima
  { id: "catequista", name: "Catequista", where: "Igreja Nossa Senhora de Fátima", place: "catequista", pay: 2500, education: 1 },
  { id: "grelhador", name: "Grelhador(a)", where: "Churrasqueira Fátima (grelha)", place: "grelhador", pay: 3500, education: 0 },
  { id: "barman", name: "Barman / Barmaid", where: "Discoteca Kizomba Fátima (bar)", place: "barman", pay: 4500, education: 0 },
  { id: "enfermeiro", name: "Enfermeiro(a)", where: "Centro de Saúde do Bairro de Fátima", place: "enfermeiro", pay: 8000, education: 2, docs: ["bi"] },
  { id: "policia", name: "Agente da Polícia", where: "Esquadra Policial de Fátima", place: "policia", pay: 9000, education: 2, docs: ["bi", "registo"] },
  { id: "farmaceutico", name: "Farmacêutico(a)", where: "Farmácia Fátima", place: "farmaceutico", pay: 9500, education: 3, docs: ["bi"] },
];

/** Serviços dos balcões (o que cada estabelecimento faz na vida real). */
export interface Service {
  id: string;
  venue: string;
  name: string;
  price: number;
  /** efeito: documento, saldo de telemóvel ou humor */
  doc?: DocId;
  needsDoc?: DocId;
  credit?: number;
  mood?: number;
  health?: number;
  energy?: number;
}

export type DocId = "bi" | "registo" | "residencia";

export const SERVICES: Service[] = [
  { id: "bi", venue: "governo", name: "Tratar do Bilhete de Identidade", price: 2500, doc: "bi" },
  { id: "registo", venue: "tribunal", name: "Pedir registo criminal", price: 1500, doc: "registo", needsDoc: "bi" },
  { id: "encomenda", venue: "correios", name: "Mandar encomenda à família", price: 1000, mood: 12 },
  { id: "carta", venue: "correios", name: "Mandar carta", price: 200, mood: 4 },
  { id: "saldo_500", venue: "loja_telecom", name: "Carregar 500 Kz de saldo", price: 500, credit: 500 },
  { id: "saldo_2000", venue: "loja_telecom", name: "Carregar 2.000 Kz de saldo", price: 2000, credit: 2000 },
  // Bairro de Fátima
  { id: "consulta", venue: "saude", name: "Consulta médica", price: 3000, health: 40 },
  { id: "vacina", venue: "saude", name: "Vacina e curativo", price: 1000, health: 12 },
  { id: "missa", venue: "igreja", name: "Assistir à missa", price: 0, mood: 15 },
  { id: "ofertorio", venue: "igreja", name: "Dar o ofertório", price: 500, mood: 6 },
  { id: "ocorrencia", venue: "esquadra", name: "Registar uma ocorrência", price: 0, mood: 2 },
  { id: "medicamentos", venue: "farmacia", name: "Comprar medicamentos", price: 1500, health: 25 },
  { id: "vitaminas", venue: "farmacia", name: "Comprar vitaminas", price: 800, health: 5, energy: 10 },
  { id: "dancar", venue: "discoteca", name: "Entrar e dançar kizomba", price: 2000, mood: 25, energy: -10 },
  { id: "bebida", venue: "discoteca", name: "Bebida no bar", price: 600, mood: 8 },
  { id: "residencia", venue: "administracao", name: "Pedir atestado de residência", price: 1000, doc: "residencia", needsDoc: "bi" },
  { id: "bi_admin", venue: "administracao", name: "Tratar do Bilhete de Identidade", price: 2500, doc: "bi" },
];

export const DOC_LABEL: Record<DocId, string> = { bi: "Bilhete de Identidade", registo: "registo criminal", residencia: "atestado de residência" };

/** Habitação: preços em Kz (compra) e renda por dia. */
export const HOUSING: Record<string, { buy: number; rentPerDay: number }> = {
  casa: { buy: 3_500_000, rentPerDay: 15_000 },
  apartamentos: { buy: 1_200_000, rentPerDay: 6_000 },
};
export const RENT_OPTIONS = [1, 7] as const;
/** Renda de vários dias: 7 dias pagam 6. */
export function rentPrice(perDay: number, days: number): number {
  return perDay * (days >= 7 ? days - 1 : days);
}

/** Bilhete de candongueiro entre bairros (Kz). */
export const TRAVEL_PRICE = 200;

/** Meios de transporte entre bairros (viagem vista de dentro, como no Vida na Banda). */
export const TRANSPORTS = [
  { id: "autocarro", name: "Autocarro", price: 100, seconds: 16 },
  { id: "candongueiro", name: "Candongueiro", price: 200, seconds: 9 },
  { id: "kupapata", name: "Kupapata", price: 500, seconds: 13 },
  { id: "taxi", name: "Táxi", price: 1500, seconds: 9 },
  { id: "carro", name: "O teu carro", price: 300, seconds: 9 }, // combustível; só para quem tem carro
] as const;

/** Carros à venda (telemóvel → Loja → Carros). Ficam estacionados à porta de casa. */
export const CARS = [
  { id: "corolla_usado", name: "Toyota Corolla usado", price: 2_500_000 },
  { id: "hilux", name: "Toyota Hilux", price: 9_000_000 },
  { id: "jipe", name: "Jipe Land Cruiser", price: 25_000_000 },
] as const;
export type TransportId = (typeof TRANSPORTS)[number]["id"];

/** Comer em casa (o que há no frigorífico): barato e sem sair. */
export const HOME_MEAL = { id: "comida_casa", name: "Refeição em casa", price: 500, hunger: 35 } as const;

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  hunger: number;
  energy?: number;
  mood?: number;
}

/** Comida real do planalto, preços em Kz. */
export const MENUS: Record<string, MenuItem[]> = {
  cantina: [
    { id: "funge_peixe", name: "Funge com peixe seco", price: 1500, hunger: 45, mood: 5 },
    { id: "arroz_feijao", name: "Arroz com feijão", price: 1000, hunger: 35 },
    { id: "pirao_galinha", name: "Pirão com galinha", price: 2500, hunger: 60, mood: 10 },
    { id: "refrigerante", name: "Refrigerante", price: 300, hunger: 5, mood: 5 },
  ],
  padaria: [
    { id: "pao_chourico", name: "Pão com chouriço", price: 400, hunger: 15 },
    { id: "bolo", name: "Bolo", price: 600, hunger: 10, mood: 10 },
    { id: "cafe_leite", name: "Café com leite", price: 300, hunger: 5, energy: 8 },
  ],
  mercado: [
    { id: "banana", name: "Banana pão assada", price: 200, hunger: 10 },
    { id: "batata_doce", name: "Batata-doce assada", price: 300, hunger: 15 },
    { id: "fruta", name: "Fruta da época (abacate, manga)", price: 300, hunger: 8, mood: 5 },
    { id: "peixe_funge", name: "Peixe seco com funge", price: 1200, hunger: 40 },
  ],
  churrasqueira: [
    { id: "frango", name: "Frango grelhado com batata frita", price: 3000, hunger: 60, mood: 10 },
    { id: "espetada", name: "Espetada mista", price: 2000, hunger: 40, mood: 6 },
    { id: "cerveja", name: "Cerveja Cuca", price: 500, hunger: 2, mood: 8 },
    { id: "sumo", name: "Sumo natural", price: 400, hunger: 4, mood: 4 },
  ],
};

export const HOTEL_PRICE = 2500;
export const STUDY_PRICE = 2000;
export const LESSONS_PER_LEVEL = 3;
export const MAX_EDUCATION = 4;

/** Duração (s) das ações com tempo. */
export const DURATION = { work: 20, study: 20, sleep: 15, sleep_rua: 15, sleep_casa: 15 } as const;

/** Pagamento por turno do dia: os 2 primeiros por inteiro, depois decresce. */
export const SHIFT_CURVE = [1, 1, 0.85, 0.65, 0.45];
export const SHIFT_FLOOR = 0.2;

export function shiftFactor(shiftIndex: number): number {
  return SHIFT_CURVE[shiftIndex] ?? SHIFT_FLOOR;
}

/** Família de origem sorteada (rand ∈ [0,1)). */
export function rollFamily(rand: number): FamilyClass {
  if (rand < 0.55) return "humilde";
  if (rand < 0.85) return "media";
  if (rand < 0.97) return "rica";
  return "muito_rica";
}

export const FAMILY_LABEL: Record<FamilyClass, string> = {
  humilde: "Família humilde do bairro",
  media: "Família de classe média",
  rica: "Família rica",
  muito_rica: "Família muito rica",
};

export const STARTING_MONEY: Record<FamilyClass, number> = {
  humilde: 3000,
  media: 20000,
  rica: 15_000_000,
  muito_rica: 250_000_000,
};

const PARENTS: Record<FamilyClass, [number, number]> = {
  humilde: [1000, 3000],
  media: [5000, 15000],
  rica: [50000, 150000],
  muito_rica: [1_000_000, 3_000_000],
};

/** Quanto os pais mandam hoje (0 = disseram que não). */
export function parentsGift(family: FamilyClass, rand1: number, rand2: number): number {
  if (rand1 < 0.2) return 0;
  const [lo, hi] = PARENTS[family];
  return Math.round((lo + (hi - lo) * rand2) / 100) * 100;
}

/** Dia civil em Angola (UTC+1), formato AAAA-MM-DD. */
export function angolaDay(nowMs: number): string {
  return new Date(nowMs + 3600_000).toISOString().slice(0, 10);
}

export function newLife(rand: () => number = Math.random, nowMs = Date.now()): LifeState {
  return {
    needs: { hunger: 80, energy: 90, mood: 75, health: 100 },
    family: rollFamily(rand()),
    education: 0,
    study: 0,
    jobId: null,
    shiftsDay: angolaDay(nowMs),
    shiftsCount: 0,
    parentsDay: null,
    docs: { bi: false, registo: false, residencia: false },
    phoneCredit: 0,
    car: null,
    birth: null,
  };
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Desgaste enquanto o jogador está ligado (por minuto real): fome e energia descem;
 * a saúde cai se a fome ou a energia chegarem a zero e recupera devagar quando não;
 * o humor aproxima-se da média das outras necessidades.
 */
export function decay(n: Needs, minutes: number): Needs {
  const hunger = clamp(n.hunger - 0.35 * minutes);
  const energy = clamp(n.energy - 0.25 * minutes);
  const starving = hunger <= 0 || energy <= 0;
  const health = clamp(n.health + (starving ? -0.6 : 0.1) * minutes);
  const target = (hunger + energy + health) / 3;
  const mood = clamp(n.mood + (target - n.mood) * Math.min(1, 0.05 * minutes));
  return { hunger, energy, mood, health };
}

export function applyFood(n: Needs, item: MenuItem): Needs {
  return {
    hunger: clamp(n.hunger + item.hunger),
    energy: clamp(n.energy + (item.energy ?? 0)),
    mood: clamp(n.mood + (item.mood ?? 0)),
    health: n.health,
  };
}

/** Novo dia em Angola → o contador de turnos recomeça. */
export function rollDay(life: LifeState, nowMs: number): void {
  const d = angolaDay(nowMs);
  if (life.shiftsDay !== d) {
    life.shiftsDay = d;
    life.shiftsCount = 0;
  }
}

export function jobById(id: string | null | undefined): Job | undefined {
  return JOBS.find((j) => j.id === id);
}

/** Valida e normaliza um estado guardado (dados antigos ou corrompidos não rebentam o jogo). */
export function sanitizeLife(raw: unknown, rand: () => number = Math.random): LifeState {
  const base = newLife(rand);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<LifeState>;
  const num = (v: unknown, d: number, lo = 0, hi = 100) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const needs = (r.needs ?? {}) as Partial<Needs>;
  return {
    needs: {
      hunger: num(needs.hunger, base.needs.hunger),
      energy: num(needs.energy, base.needs.energy),
      mood: num(needs.mood, base.needs.mood),
      health: num(needs.health, base.needs.health),
    },
    family: (["humilde", "media", "rica", "muito_rica"] as const).includes(r.family as FamilyClass) ? (r.family as FamilyClass) : base.family,
    education: Math.round(num(r.education, 0, 0, MAX_EDUCATION)),
    study: Math.round(num(r.study, 0, 0, LESSONS_PER_LEVEL)),
    jobId: jobById(r.jobId) ? (r.jobId as string) : null,
    shiftsDay: typeof r.shiftsDay === "string" ? r.shiftsDay : base.shiftsDay,
    shiftsCount: Math.round(num(r.shiftsCount, 0, 0, 1000)),
    parentsDay: typeof r.parentsDay === "string" ? r.parentsDay : null,
    docs: { bi: r.docs?.bi === true, registo: r.docs?.registo === true, residencia: r.docs?.residencia === true },
    phoneCredit: Math.round(num(r.phoneCredit, 0, 0, 1e9)),
    car: CARS.some((c) => c.id === r.car) ? (r.car as string) : null,
    birth:
      r.birth && typeof r.birth === "object" && typeof r.birth.bairro === "string" && typeof r.birth.pais === "string"
        ? { bairro: r.birth.bairro, pais: r.birth.pais, provincia: String(r.birth.provincia ?? "Huambo") }
        : null,
  };
}
