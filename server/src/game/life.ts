import { ILEGAIS } from "./economia.js";
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
  /** curso superior em curso e licenciaturas feitas */
  uni: { curso: string | null; aulas: number; licenciaturas: string[] };
  /** doença atual */
  doenca: { id: string; since: number } | null;
  /** último assalto (para recuperar parte na esquadra) */
  roubo: { amount: number; at: number; recovered: boolean } | null;
  /** roupa comprada (matiz da peça de cima, −1 = a original) */
  roupas: number[];
  /** bairros por onde já passou (conquista «Viajante») */
  visitados: string[];
  /** conquistas já ganhas e as que já pagaram o prémio */
  conquistas: string[];
  conquistasPagas: string[];
  /** negócio próprio (Empresas) */
  negocio: { tipo: string; nivel: number; lastCollect: number; investido: number } | null;
  /** capoeira e curral no quintal: animais, até quando estão alimentados e ovos por recolher */
  criacao: { animais: Array<{ tipo: string; desde: number }>; fedUntil: number; ovosAt: number; ovos: number; vendidos: number };
  /** forma física (0..100) e treinos de hoje */
  forma: number;
  treinosDay: string | null;
  treinos: number;
  /** depósito a prazo no banco (o dinheiro sai da carteira e volta com juros no fim do prazo) */
  prazo: { amount: number; start: number; maturesAt: number; rate: number; termo: string } | null;
  /** depósitos a prazo levantados com juros */
  prazosFeitos: number;
  /** Saber Huambo: dia, quantas respondeu hoje e quantas acertou (hoje e desde sempre) */
  quizDay: string | null;
  quizFeitas: number;
  quizCertasHoje: number;
  quizCertas: number;
  /** seguro de saúde pago até (ms) */
  seguroAte: number;
  /** presentes enviados (conquista) */
  presentes: number;
  /** jogadores bloqueados (não falam contigo, nem pedem, nem mandam SMS ou presentes) */
  bloqueados: Array<{ id: string; name: string }>;
  /** denúncias feitas hoje (limite por dia) */
  denunciasDay: string | null;
  denuncias: number;
  /** último dia em que recolheu a prenda de um feriado/data especial */
  prendaDia: string | null;
  /** carreira: turnos feitos em cada emprego (a experiência fica mesmo depois de sair) */
  carreira: Record<string, number>;
  /** filhos (cada pai/mãe tem a sua cópia; o id é o mesmo nos dois) */
  filhos: Filho[];
  /** geração da família (1 = a primeira personagem; sobe ao continuar a vida como filho/a) */
  geracao: number;
  /** associação de bairro (id do bairro) e semana em que aderiu */
  associacao: string | null;
  assocSemana: string | null;
  /** prémios da associação já recolhidos ("objetivo:2026-W47", "top:2026-W46") */
  assocPremios: string[];
  /** negócio ilegal (crime organizado) e quando foi a última recolha */
  ilegal: { tipo: string; desde: number; lastCollect: number; investido: number } | null;
  /** rusgas sofridas (para o jornal e o cadastro) */
  rusgas: number;
  /** emprego numa loja de outro jogador (a loja confirma; isto é só para mostrar e encontrar) */
  lojaEmprego: { shopId: string; nome: string; bairro: string } | null;
}

export interface Filho {
  id: string;
  nome: string;
  sexo: "m" | "f";
  nasceu: number;
  /** último dia (Angola) em que foi cuidado/a, e quantas vezes ao todo */
  cuidadoDia: string | null;
  cuidados: number;
  /** estudos (0..4): sobem com os cuidados em idade escolar */
  estudos: number;
  /** último dia em que (já adulto/a) ajudou com dinheiro */
  ajudaDia: string | null;
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
  /** licenciatura exigida (curso superior) */
  degree?: string;
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
  // com curso superior (Instituto Superior Politécnico do Huambo, Bairro Académico)
  { id: "professor_universitario", name: "Professor(a) universitário(a)", where: "Instituto Superior Politécnico do Huambo", place: "professor_universitario", pay: 15000, education: 4, docs: ["bi"], degree: "*" },
  { id: "medico", name: "Médico(a)", where: "Centro de Saúde ou Hospital (enfermaria)", place: "enfermeiro", pay: 18000, education: 4, docs: ["bi", "registo"], degree: "medicina" },
  { id: "advogado", name: "Advogado(a)", where: "Tribunal da Comarca", place: "oficial_justica", pay: 16000, education: 4, docs: ["bi", "registo"], degree: "direito" },
  { id: "engenheiro_agronomo", name: "Engenheiro(a) agrónomo(a)", where: "Administração do bairro (secretaria)", place: "funcionario_publico", pay: 14000, education: 4, docs: ["bi"], degree: "agronomia" },
  { id: "tecnico_informatica", name: "Técnico(a) de informática", where: "Loja de telecomunicações", place: "vendedor_loja", pay: 13000, education: 4, docs: ["bi"], degree: "informatica" },
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
export const DURATION = { work: 20, study: 20, sleep: 15, sleep_rua: 15, sleep_casa: 15, biscato: 12, loja: 20, preso: 120 } as const;

/** Pagamento por turno do dia: os 2 primeiros por inteiro, depois decresce. */
export const SHIFT_CURVE = [1, 1, 0.85, 0.65, 0.45];
export const SHIFT_FLOOR = 0.2;

// ---------------------------------------------------------------- família: filhos e gerações

export const MAX_FILHOS = 6;
/** Parto no centro de saúde (pago por quem pede). */
export const PARTO_PRICE = 10_000;
/** Os filhos crescem: anos de idade por cada dia real (adultos aos 18, ≈ 12 dias). */
export const ANOS_POR_DIA = 1.5;
export const IDADE_ADULTA = 18;
/** Cuidar (uma vez por dia por filho): custo por fase da vida. */
export const CUIDADO: Array<{ ate: number; fase: string; price: number; texto: string }> = [
  { ate: 3, fase: "bebé", price: 800, texto: "Fraldas, leite e colo" },
  { ate: 12, fase: "criança", price: 1200, texto: "Comida, uniforme e escola" },
  { ate: 18, fase: "adolescente", price: 1500, texto: "Propinas, roupa e explicações" },
];
/** Cada tantos cuidados em idade escolar (6–17) o filho sobe um nível de estudos. */
export const CUIDADOS_POR_NIVEL = 3;
/** Filho adulto ajuda os pais uma vez por dia: base + por nível de estudos. */
export const AJUDA_BASE = 1500;
export const AJUDA_POR_ESTUDO = 1000;
export const NOMES_M = ["Kalei", "Ndala", "Tchissola", "Kanda", "Sakaita", "Chilombo", "Kapinga", "Ngunga", "Muteka", "Lunda"];
export const NOMES_F = ["Ngueve", "Ndapandula", "Tchiyeva", "Kassova", "Ombela", "Nalumbu", "Wiyeta", "Esperança", "Feliciana", "Lussati"];

export function idadeAnos(f: Filho, nowMs: number): number {
  return Math.floor(((nowMs - f.nasceu) / 86_400_000) * ANOS_POR_DIA);
}

export function faseDe(anos: number): { fase: string; price: number; texto: string } | null {
  return CUIDADO.find((c) => anos < c.ate) ?? null; // null = adulto/a
}

// ---------------------------------------------------------------- carreira

/** Níveis da carreira em cada emprego: turnos acumulados, título e multiplicador do salário. */
export const CARREIRA: Array<{ turnos: number; titulo: string; mult: number }> = [
  { turnos: 0, titulo: "Estagiário(a)", mult: 0.8 },
  { turnos: 5, titulo: "Efetivo(a)", mult: 1.0 },
  { turnos: 15, titulo: "Experiente", mult: 1.2 },
  { turnos: 35, titulo: "Sénior", mult: 1.45 },
  { turnos: 70, titulo: "Chefe de equipa", mult: 1.8 },
];
/** Para chefe é preciso um nível de estudos acima do que o emprego pede (máx. 4). */
export function chefeEducation(job: Job): number {
  return Math.min(4, job.education + 1);
}

/** Nível da carreira (0..4) para um emprego, dado os turnos e os estudos. */
export function careerLevel(job: Job, turnos: number, education: number): number {
  let lv = 0;
  for (let i = 0; i < CARREIRA.length; i++) if (turnos >= CARREIRA[i]!.turnos) lv = i;
  if (lv === CARREIRA.length - 1 && education < chefeEducation(job)) lv -= 1; // falta estudar para chefiar
  return lv;
}

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
    uni: { curso: null, aulas: 0, licenciaturas: [] },
    roupas: [-1],
    visitados: [],
    conquistas: [],
    conquistasPagas: [],
    doenca: null,
    roubo: null,
    criacao: { animais: [], fedUntil: 0, ovosAt: nowMs, ovos: 0, vendidos: 0 },
    forma: 30,
    treinosDay: null,
    treinos: 0,
    prazo: null,
    prazosFeitos: 0,
    quizDay: null,
    quizFeitas: 0,
    quizCertasHoje: 0,
    quizCertas: 0,
    seguroAte: 0,
    presentes: 0,
    bloqueados: [],
    denunciasDay: null,
    denuncias: 0,
    prendaDia: null,
    carreira: {},
    filhos: [],
    geracao: 1,
    associacao: null,
    assocSemana: null,
    assocPremios: [],
    lojaEmprego: null,
    ilegal: null,
    rusgas: 0,
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
    filhos: Array.isArray(r.filhos)
      ? r.filhos
          .filter((f): f is Filho => !!f && typeof f.id === "string" && typeof f.nome === "string" && typeof f.nasceu === "number" && Number.isFinite(f.nasceu))
          .slice(0, MAX_FILHOS)
          .map((f) => ({
            id: f.id.slice(0, 40),
            nome: f.nome.slice(0, 20),
            sexo: f.sexo === "f" ? "f" : "m",
            nasceu: f.nasceu,
            cuidadoDia: typeof f.cuidadoDia === "string" ? f.cuidadoDia : null,
            cuidados: Math.round(num(f.cuidados, 0, 0, 100_000)),
            estudos: Math.round(num(f.estudos, 0, 0, 4)),
            ajudaDia: typeof f.ajudaDia === "string" ? f.ajudaDia : null,
          }))
      : [],
    geracao: Math.round(num(r.geracao, 1, 1, 1000)),
    associacao: typeof r.associacao === "string" && /^[a-z0-9_]{2,40}$/.test(r.associacao) ? r.associacao : null,
    assocSemana: typeof r.assocSemana === "string" ? r.assocSemana : null,
    assocPremios: Array.isArray(r.assocPremios) ? r.assocPremios.filter((x): x is string => typeof x === "string").slice(-20) : [],
    ilegal:
      r.ilegal && typeof r.ilegal.tipo === "string" && r.ilegal.tipo in ILEGAIS && typeof r.ilegal.lastCollect === "number"
        ? { tipo: r.ilegal.tipo, desde: num(r.ilegal.desde, r.ilegal.lastCollect, 0, 1e15), lastCollect: r.ilegal.lastCollect, investido: Math.round(num(r.ilegal.investido, 0, 0, 1e9)) }
        : null,
    rusgas: Math.round(num(r.rusgas, 0, 0, 1e6)),
    lojaEmprego:
      r.lojaEmprego && typeof r.lojaEmprego.shopId === "string" && typeof r.lojaEmprego.nome === "string" && typeof r.lojaEmprego.bairro === "string"
        ? { shopId: r.lojaEmprego.shopId.slice(0, 64), nome: r.lojaEmprego.nome.slice(0, 40), bairro: r.lojaEmprego.bairro.slice(0, 40) }
        : null,
    colhidoTotal: Math.round(num(r.colhidoTotal, 0, 0, 1e9)),
    ambicao: typeof r.ambicao === "string" && r.ambicao in AMBICOES ? r.ambicao : null,
    ambicoesFeitas: Array.isArray(r.ambicoesFeitas) ? r.ambicoesFeitas.filter((x): x is string => typeof x === "string" && x in AMBICOES) : [],
    uni: {
      curso: typeof r.uni?.curso === "string" && r.uni.curso in CURSOS ? r.uni.curso : null,
      aulas: Math.round(num(r.uni?.aulas, 0, 0, UNI_LESSONS)),
      licenciaturas: Array.isArray(r.uni?.licenciaturas) ? r.uni.licenciaturas.filter((x): x is string => typeof x === "string" && x in CURSOS) : [],
    },
    roupas: Array.isArray(r.roupas) ? [...new Set([-1, ...r.roupas.filter((h): h is number => typeof h === "number" && Number.isInteger(h) && h >= -1 && h <= 359)])].slice(0, 40) : [-1],
    visitados: Array.isArray(r.visitados) ? r.visitados.filter((x): x is string => typeof x === "string").slice(0, 60) : [],
    conquistas: Array.isArray(r.conquistas) ? r.conquistas.filter((x): x is string => typeof x === "string" && x in CONQUISTAS) : [],
    conquistasPagas: Array.isArray(r.conquistasPagas) ? r.conquistasPagas.filter((x): x is string => typeof x === "string" && x in CONQUISTAS) : [],
    doenca: r.doenca && typeof r.doenca.id === "string" && r.doenca.id in DOENCAS && typeof r.doenca.since === "number" ? { id: r.doenca.id, since: r.doenca.since } : null,
    roubo:
      r.roubo && typeof r.roubo.amount === "number" && typeof r.roubo.at === "number"
        ? { amount: Math.round(num(r.roubo.amount, 0, 0, 1e9)), at: r.roubo.at, recovered: r.roubo.recovered === true }
        : null,
    criacao: {
      animais: Array.isArray(r.criacao?.animais)
        ? r.criacao.animais
            .filter((a): a is { tipo: string; desde: number } => !!a && typeof a.tipo === "string" && a.tipo in ANIMAIS && typeof a.desde === "number" && Number.isFinite(a.desde))
            .slice(0, MAX_ANIMAIS)
            .map((a) => ({ tipo: a.tipo, desde: a.desde }))
        : [],
      fedUntil: num(r.criacao?.fedUntil, 0, 0, 1e15),
      ovosAt: num(r.criacao?.ovosAt, base.criacao.ovosAt, 0, 1e15),
      ovos: Math.round(num(r.criacao?.ovos, 0, 0, 10_000)),
      vendidos: Math.round(num(r.criacao?.vendidos, 0, 0, 1e9)),
    },
    forma: num(r.forma, base.forma),
    treinosDay: typeof r.treinosDay === "string" ? r.treinosDay : null,
    treinos: Math.round(num(r.treinos, 0, 0, TREINOS_POR_DIA)),
    prazo:
      r.prazo && typeof r.prazo.amount === "number" && r.prazo.amount > 0 && typeof r.prazo.termo === "string" && r.prazo.termo in PRAZOS && typeof r.prazo.start === "number" && typeof r.prazo.maturesAt === "number"
        ? { amount: Math.round(num(r.prazo.amount, 0, 0, PRAZO_MAX)), start: r.prazo.start, maturesAt: r.prazo.maturesAt, rate: PRAZOS[r.prazo.termo]!.rate, termo: r.prazo.termo }
        : null,
    prazosFeitos: Math.round(num(r.prazosFeitos, 0, 0, 1e9)),
    quizDay: typeof r.quizDay === "string" ? r.quizDay : null,
    quizFeitas: Math.round(num(r.quizFeitas, 0, 0, QUIZ_POR_DIA)),
    quizCertasHoje: Math.round(num(r.quizCertasHoje, 0, 0, QUIZ_POR_DIA)),
    quizCertas: Math.round(num(r.quizCertas, 0, 0, 1e9)),
    seguroAte: num(r.seguroAte, 0, 0, 1e15),
    presentes: Math.round(num(r.presentes, 0, 0, 1e9)),
    bloqueados: Array.isArray(r.bloqueados)
      ? r.bloqueados
          .filter((b): b is { id: string; name: string } => !!b && typeof b.id === "string" && typeof b.name === "string")
          .slice(0, MAX_BLOQUEADOS)
          .map((b) => ({ id: b.id.slice(0, 64), name: b.name.slice(0, 40) }))
      : [],
    denunciasDay: typeof r.denunciasDay === "string" ? r.denunciasDay : null,
    denuncias: Math.round(num(r.denuncias, 0, 0, DENUNCIAS_POR_DIA)),
    prendaDia: typeof r.prendaDia === "string" ? r.prendaDia : null,
    carreira: Object.fromEntries(
      Object.entries(r.carreira && typeof r.carreira === "object" ? r.carreira : {})
        .filter(([k, v]) => !!jobById(k) && typeof v === "number" && Number.isFinite(v) && v > 0)
        .map(([k, v]) => [k, Math.min(100_000, Math.round(v as number))]),
    ),
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
  salao: { name: "Salão de cabeleireiro e tranças", cost: 80_000, perHour: 3_200 },
  cantina: { name: "Cantina de bairro", cost: 150_000, perHour: 6_000 },
  kupapatas: { name: "Frota de kupapatas (5 motas)", cost: 250_000, perHour: 9_500 },
  oficina: { name: "Oficina mecânica", cost: 300_000, perHour: 11_000 },
  candongueiro: { name: "Candongueiro (táxi azul e branco)", cost: 400_000, perHour: 15_000 },
  fazenda: { name: "Fazenda de milho e feijão", cost: 600_000, perHour: 21_000 },
  escola_conducao: { name: "Escola de condução", cost: 800_000, perHour: 27_000 },
  radio: { name: "Rádio comunitária", cost: 1_200_000, perHour: 38_000 },
  transportadora: { name: "Transportadora (camiões Huambo–Luanda)", cost: 2_000_000, perHour: 60_000 },
  construtora: { name: "Construtora", cost: 4_000_000, perHour: 115_000 },
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

// ---------------------------------------------------------------- universidade

export const CURSOS: Record<string, { name: string }> = {
  agronomia: { name: "Agronomia" },
  medicina: { name: "Medicina" },
  direito: { name: "Direito" },
  informatica: { name: "Engenharia Informática" },
};
export const UNI_LESSONS = 5;
export const UNI_PRICE = 3000;

// ---------------------------------------------------------------- doenças

/** Doenças comuns no Huambo: gripe (chuva/cacimbo) e paludismo (malária, época das chuvas). */
export const DOENCAS: Record<string, { name: string; texto: string; energy: number; mood: number; health: number; blocks: boolean; curaFarmacia: boolean; selfHealMin: number | null }> = {
  gripe: { name: "Gripe", texto: "Estás com gripe: cansas-te mais depressa.", energy: 0.3, mood: 0.2, health: 0, blocks: false, curaFarmacia: true, selfHealMin: 90 },
  paludismo: { name: "Paludismo (malária)", texto: "Estás com paludismo: vai já a uma consulta no centro de saúde ou hospital!", energy: 0.4, mood: 0.4, health: 0.6, blocks: true, curaFarmacia: false, selfHealMin: null },
};

// ---------------------------------------------------------------- assaltos

/** À noite, na rua, com muito dinheiro na carteira, há quem seja assaltado (melhor guardar no banco). */
export const ROUBO_MIN_WALLET = 20_000;
export const ROUBO_MAX = 10_000;
export const ROUBO_RECOVER_MS = 30 * 60_000;

// ---------------------------------------------------------------- roupa (fardo do mercado)

/** Roupa de fardo vendida nas bancas do mercado: muda a cor da peça de cima (matiz em graus). */
export const ROUPAS: Array<{ hue: number; name: string; price: number }> = [
  { hue: 0, name: "Camisa vermelha", price: 1500 },
  { hue: 29, name: "Camisa laranja", price: 1500 },
  { hue: 54, name: "Camisa amarela", price: 1500 },
  { hue: 119, name: "Camisa verde", price: 1500 },
  { hue: 180, name: "Camisa azul-turquesa", price: 1500 },
  { hue: 223, name: "Camisa azul", price: 1500 },
  { hue: 270, name: "Camisa roxa", price: 1500 },
  { hue: 317, name: "Camisa cor-de-rosa", price: 1500 },
];

// ---------------------------------------------------------------- SMS

export const SMS_PRICE = 20; // saldo do telemóvel por mensagem

// ---------------------------------------------------------------- conquistas

export const CONQUISTAS: Record<string, { name: string; text: string; reward: number }> = {
  primeiro_emprego: { name: "Primeiro emprego", text: "Arranjaste o primeiro emprego", reward: 1000 },
  casa_propria: { name: "Casa própria", text: "Compraste a tua casa", reward: 3000 },
  licenciado: { name: "Licenciado/a", text: "Acabaste um curso superior", reward: 3000 },
  casado: { name: "Casado/a", text: "Casaste na igreja", reward: 2000 },
  empresario: { name: "Empresário/a", text: "Abriste o teu negócio", reward: 2000 },
  agricultor: { name: "Agricultor/a", text: "Colheste 100 kg na lavra", reward: 1500 },
  viajante: { name: "Viajante", text: "Passaste por 10 bairros do Huambo", reward: 2000 },
  milionario: { name: "Milionário/a", text: "Juntaste 1.000.000 Kz", reward: 5000 },
  popular: { name: "Popular", text: "Tens 5 amigos", reward: 1500 },
  elegante: { name: "Elegante", text: "Tens 4 roupas no guarda-roupa", reward: 1000 },
  criador: { name: "Criador/a", text: "Vendeste 10 animais ou produtos da criação", reward: 1500 },
  atleta: { name: "Atleta", text: "Chegaste a 80 de forma física", reward: 1500 },
  poupado: { name: "Poupado/a", text: "Levantaste um depósito a prazo com juros", reward: 1000 },
  sabichao: { name: "Sabichão/Sabichona", text: "Acertaste 20 perguntas do Saber Huambo", reward: 1500 },
  generoso: { name: "Generoso/a", text: "Ofereceste 5 presentes", reward: 1000 },
  promovido: { name: "Promovido/a", text: "Tiveste a primeira promoção", reward: 1000 },
  chefe: { name: "Chefe", text: "Chegaste a chefe de equipa", reward: 5000 },
  pai_mae: { name: "Pai / Mãe", text: "Tiveste o primeiro filho", reward: 2000 },
  geracao: { name: "Nova geração", text: "Continuaste a vida como filho/a", reward: 3000 },
};

// ---------------------------------------------------------------- Saber Huambo (perguntas do dia)

/** Perguntas sobre o Huambo e Angola: [pergunta, opções, índice da certa]. */
export const QUIZ: Array<{ q: string; o: string[]; c: number }> = [
  { q: "Em que ano foi fundada a cidade do Huambo?", o: ["1912", "1885", "1950", "1975"], c: 0 },
  { q: "Que nome teve o Huambo no tempo colonial?", o: ["Silva Porto", "Nova Lisboa", "Sá da Bandeira", "Vila Luso"], c: 1 },
  { q: "Que língua nacional se fala mais no Huambo?", o: ["Kimbundu", "Kikongo", "Umbundu", "Cokwe"], c: 2 },
  { q: "Quando foi a independência de Angola?", o: ["4 de fevereiro de 1961", "11 de novembro de 1975", "25 de abril de 1974", "4 de abril de 2002"], c: 1 },
  { q: "Que caminho de ferro passa pelo Huambo?", o: ["Caminho de Ferro de Luanda", "Caminho de Ferro de Moçâmedes", "Caminho de Ferro de Benguela", "Caminho de Ferro do Congo"], c: 2 },
  { q: "Como se chama o estádio do Huambo?", o: ["Estádio dos Kurikutelas", "Estádio 11 de Novembro", "Estádio da Cidadela", "Estádio do Tafe"], c: 0 },
  { q: "O que é uma kupapata?", o: ["Um prato de milho", "Um mototáxi", "Uma dança", "Um mercado"], c: 1 },
  { q: "O que é a kixikila?", o: ["Uma poupança em grupo, à vez", "Um imposto", "Um tipo de pão", "Um instrumento"], c: 0 },
  { q: "Como se chama a época seca e fria em Angola?", o: ["Monção", "Harmatão", "Cacimbo", "Estiagem"], c: 2 },
  { q: "Qual é a moeda de Angola?", o: ["Metical", "Kwanza", "Rand", "Escudo"], c: 1 },
  { q: "Qual é a cultura mais semeada no planalto do Huambo?", o: ["Café", "Cana-de-açúcar", "Milho", "Algodão"], c: 2 },
  { q: "De onde vem o nome «Huambo»?", o: ["Do reino (e soba) Wambu", "De um rio", "De uma montanha", "De um comboio"], c: 0 },
  { q: "Qual é a capital de Angola?", o: ["Benguela", "Lubango", "Huambo", "Luanda"], c: 3 },
  { q: "Que cores tem a bandeira de Angola?", o: ["Verde, branco e vermelho", "Vermelho, preto e amarelo", "Azul, amarelo e verde", "Preto, branco e azul"], c: 1 },
  { q: "Qual destes é um município da província do Huambo?", o: ["Caála", "Catumbela", "Cacuaco", "Caxito"], c: 0 },
  { q: "O funge do planalto faz-se sobretudo com farinha de…", o: ["Trigo", "Milho", "Arroz", "Soja"], c: 1 },
  { q: "O Huambo fica num planalto a cerca de…", o: ["200 m de altitude", "700 m de altitude", "1.700 m de altitude", "3.000 m de altitude"], c: 2 },
  { q: "Que universidade pública tem sede no Huambo?", o: ["Universidade Agostinho Neto", "Universidade José Eduardo dos Santos", "Universidade Katyavala Bwila", "Universidade Mandume ya Ndemufayo"], c: 1 },
];
export const QUIZ_POR_DIA = 3;
export const QUIZ_PREMIO = 500;

/** As perguntas de hoje (as mesmas para toda a gente nesse dia). */
export function quizDoDia(day: string): number[] {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out: number[] = [];
  for (let k = 0; out.length < QUIZ_POR_DIA; k++) {
    const i = (h + k * 7) % QUIZ.length;
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------- presentes e seguro de saúde

export const PRESENTES: Record<string, { name: string; price: number; mood: number }> = {
  flores: { name: "Flores", price: 1_500, mood: 10 },
  chocolate: { name: "Chocolates", price: 800, mood: 6 },
  capulana: { name: "Pano (capulana)", price: 4_000, mood: 15 },
  perfume: { name: "Perfume", price: 7_000, mood: 20 },
};
/** Seguro de saúde: um dia (24 h reais) de consultas, vacinas e medicamentos sem pagar. */
export const SEGURO_PRICE = 4_000;
export const SEGURO_MS = 24 * 3600_000;

// ---------------------------------------------------------------- segurança: bloquear e denunciar

export const MAX_BLOQUEADOS = 100;
export const DENUNCIAS_POR_DIA = 5;
/** Motivos de denúncia (o jogador escolhe um; texto livre opcional). */
export const MOTIVOS_DENUNCIA: Record<string, string> = {
  insultos: "Insultos ou linguagem ofensiva",
  assedio: "Assédio ou ameaças",
  burla: "Burla (enganou-me com dinheiro)",
  nome: "Nome impróprio",
  outro: "Outro motivo",
};

// ---------------------------------------------------------------- criação de animais (quintal)

/** Animais do quintal: preço no mercado, preço de venda quando crescido, minutos reais até crescer. */
export const ANIMAIS: Record<string, { name: string; price: number; sell: number; growMin: number; ovos: boolean }> = {
  galinha: { name: "Galinha", price: 2_500, sell: 3_000, growMin: 0, ovos: true },
  cabrito: { name: "Cabrito", price: 15_000, sell: 24_000, growMin: 60, ovos: false },
  porco: { name: "Porco", price: 25_000, sell: 42_000, growMin: 120, ovos: false },
};
export const MAX_ANIMAIS = 12;
/** Ração para um animal (Kz) — fica alimentado durante FEED_MIN minutos reais. */
export const RACAO_PRICE = 150;
export const FEED_MIN = 120;
/** Uma galinha alimentada põe um ovo a cada OVO_MIN minutos; no máximo OVOS_MAX ovos à espera por galinha. */
export const OVO_MIN = 15;
export const OVOS_MAX = 8;
export const OVO_PRICE = 60;
/** Um animal com fome vende-se a este fator do preço. */
export const FOME_FACTOR = 0.6;

// ---------------------------------------------------------------- desporto

/** Treinos: o que custa (energia, fome) e quanto dá de forma e humor. Correr e futebol são na rua; os exercícios, em casa. */
export const TREINOS: Record<string, { name: string; energy: number; hunger: number; forma: number; mood: number; rua: boolean; price: number }> = {
  correr: { name: "Correr pelo bairro", energy: 12, hunger: 8, forma: 6, mood: 5, rua: true, price: 0 },
  futebol: { name: "Futebol no campo do bairro", energy: 16, hunger: 10, forma: 8, mood: 10, rua: true, price: 0 },
  casa: { name: "Exercícios em casa", energy: 10, hunger: 6, forma: 4, mood: 3, rua: false, price: 0 },
};
export const TREINOS_POR_DIA = 4;
/** A forma cai devagar sem treino (pontos por minuto real). */
export const FORMA_DECAY = 0.02;

// ---------------------------------------------------------------- depósito a prazo

export const PRAZOS: Record<string, { name: string; minutes: number; rate: number }> = {
  curto: { name: "30 minutos", minutes: 30, rate: 0.02 },
  medio: { name: "3 horas", minutes: 180, rate: 0.06 },
  longo: { name: "24 horas", minutes: 1440, rate: 0.15 },
};
export const PRAZO_MIN = 5_000;
export const PRAZO_MAX = 500_000;
