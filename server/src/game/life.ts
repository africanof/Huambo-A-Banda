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
  /** missões do dia (como o «Hoje 0/3» do Vida na Banda) e a sequência de dias completos */
  missions: Missions;
  /** último dia (Angola) em que rodou a sorte grátis */
  sorteDay: string | null;
  /** biscatos feitos hoje (contador do dia) */
  biscatosDay: string | null;
  biscatos: number;
  /** dólares guardados (Câmbio) */
  usd: number;
  /** câmbio feito hoje (USD), para o limite diário */
  cambioDay: string | null;
  cambioUsd: number;
  /** amigos (id da personagem + nome) */
  friends: Array<{ id: string; name: string }>;
  /** grupo a que pertence */
  group: { id: string; name: string } | null;
  /** lavra (machamba) na Chipipa: o que está semeado */
  lavra: { crop: string; plantedAt: number; readyAt: number; watered: boolean } | null;
  /** colheita guardada (kg por produto), para vender no mercado */
  colheita: Record<string, number>;
  /** total colhido desde sempre (kg) */
  colhidoTotal: number;
  /** ambição de vida escolhida e quantas já cumpriu */
  ambicao: string | null;
  ambicoesFeitas: string[];
  /** namoro ou casamento */
  partner: { id: string; name: string; since: number; married: boolean } | null;
  /** negócio próprio (Empresas) */
  negocio: { tipo: string; nivel: number; lastCollect: number; investido: number } | null;
}

export interface Missions {
  day: string;
  ids: string[];
  done: boolean[];
  claimed: boolean[];
  /** progresso para missões com contagem (ex.: entrar em 3 sítios diferentes) */
  seen: string[];
  streak: number;
  lastFullDay: string | null;
}

/** Missões possíveis. Cada uma completa-se com uma ação real validada no servidor. */
export const MISSIONS: Record<string, { text: string; reward: number }> = {
  trabalhar: { text: "Fazer um turno no teu trabalho", reward: 800 },
  comer: { text: "Comer numa cantina, padaria ou churrasqueira", reward: 400 },
  estudar: { text: "Ir a uma aula na escola", reward: 600 },
  viajar: { text: "Ir a outro bairro (a pé ou de transporte)", reward: 500 },
  banco: { text: "Depositar dinheiro no banco", reward: 400 },
  servico: { text: "Tratar de um assunto num balcão (saúde, documentos, saldo…)", reward: 500 },
  dormir: { text: "Dormir numa cama (hotel ou casa)", reward: 400 },
  visitar: { text: "Entrar em 3 sítios diferentes", reward: 500 },
  conversar: { text: "Falar com outro jogador", reward: 300 },
  biscato: { text: "Fazer um biscato", reward: 300 },
};
export const MISSIONS_PER_DAY = 3;
export const STREAK_BONUS = 1000;

function hashStr(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Missões de hoje para esta personagem (determinístico: a mesma pessoa vê sempre as mesmas no mesmo dia). */
export function missionsFor(day: string, seed: string): string[] {
  const pool = Object.keys(MISSIONS);
  const out: string[] = [];
  let h = hashStr(day + ":" + seed);
  while (out.length < MISSIONS_PER_DAY) {
    const id = pool[h % pool.length]!;
    if (!out.includes(id)) out.push(id);
    h = Math.imul(h ^ 0x9e3779b9, 16777619) >>> 0;
  }
  return out;
}

/** Novo dia → novas missões (a sequência mantém-se; quebra se ontem não ficou completo). */
export function rollMissions(m: Missions, nowMs: number, seed: string): void {
  const day = angolaDay(nowMs);
  if (m.day === day && m.ids.length === MISSIONS_PER_DAY) return;
  const yesterday = angolaDay(nowMs - 86_400_000);
  if (m.lastFullDay !== yesterday && m.lastFullDay !== day) m.streak = 0;
  m.day = day;
  m.ids = missionsFor(day, seed);
  m.done = m.ids.map(() => false);
  m.claimed = m.ids.map(() => false);
  m.seen = [];
}

/** Marca uma missão como feita. Devolve true se mudou alguma coisa. */
export function progressMission(m: Missions, kind: string, detail = ""): boolean {
  const i = m.ids.indexOf(kind);
  if (i < 0 || m.done[i]) return false;
  if (kind === "visitar") {
    if (!detail || m.seen.includes(detail)) return false;
    m.seen.push(detail);
    if (m.seen.length < 3) return true;
  }
  m.done[i] = true;
  if (m.done.every(Boolean) && m.lastFullDay !== m.day) {
    m.streak += 1;
    m.lastFullDay = m.day;
  }
  return true;
}

export function emptyMissions(): Missions {
  return { day: "", ids: [], done: [], claimed: [], seen: [], streak: 0, lastFullDay: null };
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
export const DURATION = { work: 20, study: 20, sleep: 15, sleep_rua: 15, sleep_casa: 15, biscato: 12 } as const;

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
    missions: emptyMissions(),
    sorteDay: null,
    biscatosDay: null,
    biscatos: 0,
    usd: 0,
    cambioDay: null,
    cambioUsd: 0,
    friends: [],
    group: null,
    lavra: null,
    colheita: {},
    colhidoTotal: 0,
    ambicao: null,
    ambicoesFeitas: [],
    partner: null,
    negocio: null,
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
    missions: sanitizeMissions(r.missions),
    sorteDay: typeof r.sorteDay === "string" ? r.sorteDay : null,
    biscatosDay: typeof r.biscatosDay === "string" ? r.biscatosDay : null,
    biscatos: Math.round(num(r.biscatos, 0, 0, 1000)),
    usd: Math.round(num(r.usd, 0, 0, 1e9)),
    cambioDay: typeof r.cambioDay === "string" ? r.cambioDay : null,
    cambioUsd: Math.round(num(r.cambioUsd, 0, 0, 1e9)),
    friends: Array.isArray(r.friends)
      ? r.friends
          .filter((f): f is { id: string; name: string } => !!f && typeof f.id === "string" && typeof f.name === "string")
          .slice(0, MAX_FRIENDS)
          .map((f) => ({ id: f.id.slice(0, 64), name: f.name.slice(0, 40) }))
      : [],
    group: r.group && typeof r.group.id === "string" && typeof r.group.name === "string" ? { id: r.group.id.slice(0, 64), name: r.group.name.slice(0, 40) } : null,
    lavra:
      r.lavra && typeof r.lavra.crop === "string" && r.lavra.crop in CROPS && typeof r.lavra.plantedAt === "number" && typeof r.lavra.readyAt === "number"
        ? { crop: r.lavra.crop, plantedAt: r.lavra.plantedAt, readyAt: r.lavra.readyAt, watered: r.lavra.watered === true }
        : null,
    colheita: Object.fromEntries(
      Object.entries(r.colheita && typeof r.colheita === "object" ? r.colheita : {})
        .filter(([k, v]) => k in CROPS && typeof v === "number" && Number.isFinite(v) && v > 0)
        .map(([k, v]) => [k, Math.min(100_000, Math.round(v as number))]),
    ),
    colhidoTotal: Math.round(num(r.colhidoTotal, 0, 0, 1e9)),
    ambicao: typeof r.ambicao === "string" && r.ambicao in AMBICOES ? r.ambicao : null,
    ambicoesFeitas: Array.isArray(r.ambicoesFeitas) ? r.ambicoesFeitas.filter((x): x is string => typeof x === "string" && x in AMBICOES) : [],
    partner:
      r.partner && typeof r.partner.id === "string" && typeof r.partner.name === "string" && typeof r.partner.since === "number"
        ? { id: r.partner.id.slice(0, 64), name: r.partner.name.slice(0, 40), since: r.partner.since, married: r.partner.married === true }
        : null,
    negocio:
      r.negocio && typeof r.negocio.tipo === "string" && r.negocio.tipo in NEGOCIOS && typeof r.negocio.lastCollect === "number"
        ? {
            tipo: r.negocio.tipo,
            nivel: Math.round(num(r.negocio.nivel, 1, 1, NEGOCIO_MAX_NIVEL)),
            lastCollect: r.negocio.lastCollect,
            investido: Math.round(num(r.negocio.investido, 0, 0, 1e10)),
          }
        : null,
  };
}

function sanitizeMissions(raw: unknown): Missions {
  const m = emptyMissions();
  if (!raw || typeof raw !== "object") return m;
  const r = raw as Partial<Missions>;
  const ids = Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === "string" && x in MISSIONS).slice(0, MISSIONS_PER_DAY) : [];
  if (typeof r.day === "string" && ids.length === MISSIONS_PER_DAY) {
    m.day = r.day;
    m.ids = ids;
    m.done = ids.map((_, i) => Array.isArray(r.done) && r.done[i] === true);
    m.claimed = ids.map((_, i) => Array.isArray(r.claimed) && r.claimed[i] === true && m.done[i] === true);
    m.seen = Array.isArray(r.seen) ? r.seen.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  }
  m.streak = typeof r.streak === "number" && Number.isFinite(r.streak) ? Math.max(0, Math.min(10000, Math.round(r.streak))) : 0;
  m.lastFullDay = typeof r.lastFullDay === "string" ? r.lastFullDay : null;
  return m;
}

/** Sorte do dia (grátis, 1×/dia): [probabilidade acumulada, prémio]. Média ≈ 400 Kz. */
export const SORTE_TABLE: Array<[number, number]> = [
  [0.35, 0],
  [0.7, 200],
  [0.88, 500],
  [0.97, 1000],
  [0.995, 2500],
  [1, 10000],
];
export function rollSorte(r: number): number {
  for (const [p, prize] of SORTE_TABLE) if (r < p) return prize;
  return 0;
}

/** Transferências entre jogadores: limites contra abusos. */
export const TRANSFER_MIN = 100;
export const TRANSFER_MAX = 100_000;
export const TRANSFER_NEAR_CM = 800;

// ---------------------------------------------------------------- biscatos («Ganhar dinheiro»)

/** Biscatos: trabalhos rápidos sem estudos nem documentos. `where` diz onde se fazem. */
export const BISCATOS: Record<string, { name: string; where: "stop" | "mercado" | "rua"; pay: [number, number]; energy: number }> = {
  engraxar: { name: "Engraxar sapatos", where: "stop", pay: [300, 500], energy: 5 },
  lavar: { name: "Lavar carros", where: "stop", pay: [500, 800], energy: 8 },
  carregar: { name: "Carregar sacos no mercado", where: "mercado", pay: [600, 900], energy: 10 },
  zungar: { name: "Zungar (vender na rua)", where: "rua", pay: [300, 1000], energy: 6 },
};
export const BISCATOS_PER_DAY = 6;

// ---------------------------------------------------------------- câmbio

/** Taxa do dia (Kz por 1 USD): anda à volta de 920, muda todos os dias. */
export function cambioRate(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const n = Date.parse(day + "T00:00:00Z") / 86_400_000;
  const wave = Math.sin(n * 0.37) * 0.03 + Math.sin(n * 0.11) * 0.02;
  const noise = ((h % 1000) / 1000 - 0.5) * 0.02;
  return Math.round(920 * (1 + wave + noise));
}
/** O cambista ganha na diferença: compra-te dólares mais barato do que te vende. */
export const CAMBIO_SPREAD = 0.02;
export const CAMBIO_DAILY_USD = 2000;
export function cambioPrices(day: string): { rate: number; buy: number; sell: number } {
  const rate = cambioRate(day);
  return { rate, buy: Math.round(rate * (1 + CAMBIO_SPREAD)), sell: Math.round(rate * (1 - CAMBIO_SPREAD)) };
}

// ---------------------------------------------------------------- rádio, amigos, grupos

export const RADIO_PRICE = 500;
export const RADIO_MOOD = 8;
export const MAX_FRIENDS = 50;
export const GROUP_PRICE = 5000;

// ---------------------------------------------------------------- lavras (o planalto é terra de milho)

/** Culturas da lavra: semente (Kz), tempo até colher (min reais), colheita (kg) e preço no mercado (Kz/kg). */
export const CROPS: Record<string, { name: string; seed: number; minutes: number; kg: number; price: number }> = {
  milho: { name: "Milho", seed: 300, minutes: 30, kg: 20, price: 60 },
  feijao: { name: "Feijão", seed: 400, minutes: 20, kg: 12, price: 110 },
  batata_doce: { name: "Batata-doce", seed: 250, minutes: 15, kg: 18, price: 45 },
};
/** Sem rega a colheita fica a metade. */
export const DRY_FACTOR = 0.5;

// ---------------------------------------------------------------- ambição de vida

export const AMBICOES: Record<string, { text: string; reward: number }> = {
  rico: { text: "Juntar 1.000.000 Kz (carteira + banco)", reward: 20_000 },
  casa: { text: "Ter casa própria (comprada)", reward: 15_000 },
  doutor: { text: "Chegar ao nível máximo de estudos", reward: 15_000 },
  popular: { text: "Ter 10 amigos", reward: 10_000 },
  carro: { text: "Ter carro próprio", reward: 10_000 },
  agricultor: { text: "Colher 200 kg na lavra", reward: 10_000 },
};

// ---------------------------------------------------------------- namoro e casamento

/** Casar na igreja (a festa e a cerimónia), pago por quem pede. */
export const WEDDING_PRICE = 20_000;
/** Tempo mínimo de namoro antes de casar (ms reais). */
export const WEDDING_MIN_DATING_MS = 10 * 60_000;
export const DIVORCE_PRICE = 5_000;

// ---------------------------------------------------------------- negócios (Empresas)

/** Negócios: custo de abrir (Kz), rendimento por hora (nível 1) — o dinheiro junta-se até 12 h. */
export const NEGOCIOS: Record<string, { name: string; cost: number; perHour: number }> = {
  quiosque: { name: "Quiosque de saldo e recargas", cost: 50_000, perHour: 2_000 },
  cantina: { name: "Cantina", cost: 150_000, perHour: 6_000 },
  candongueiro: { name: "Candongueiro (táxi azul e branco)", cost: 400_000, perHour: 15_000 },
};
export const NEGOCIO_MAX_NIVEL = 3;
export const NEGOCIO_MAX_HOURS = 12;
export function negocioPerHour(tipo: string, nivel: number): number {
  const n = NEGOCIOS[tipo];
  return n ? Math.round(n.perHour * (1 + 0.5 * (nivel - 1))) : 0;
}
export function negocioUpgradeCost(tipo: string, nivel: number): number {
  const n = NEGOCIOS[tipo];
  return n ? n.cost * nivel : 0;
}
