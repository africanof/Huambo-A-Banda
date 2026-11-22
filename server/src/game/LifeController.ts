import { getDistrict, interiorAt, type District, type Interior, type Place } from "./districts.js";
import {
  DOC_LABEL,
  DURATION,
  FAMILY_LABEL,
  HOME_MEAL,
  HOTEL_PRICE,
  HOUSING,
  RENT_OPTIONS,
  SERVICES,
  rentPrice,
  rollBirth,
  TRANSPORTS,
  CARS,
  TRAVEL_PRICE,
  JOBS,
  LESSONS_PER_LEVEL,
  MAX_EDUCATION,
  MENUS,
  STARTING_MONEY,
  STUDY_PRICE,
  angolaDay,
  applyFood,
  decay,
  jobById,
  newLife,
  parentsGift,
  rollDay,
  rollMissions,
  progressMission,
  MISSIONS,
  STREAK_BONUS,
  BISCATOS,
  BISCATOS_PER_DAY,
  cambioPrices,
  CAMBIO_DAILY_USD,
  RADIO_PRICE,
  RADIO_MOOD,
  MAX_FRIENDS,
  GROUP_PRICE,
  CROPS,
  DRY_FACTOR,
  AMBICOES,
  WEDDING_PRICE,
  ROUPAS,
  SMS_PRICE,
  CONQUISTAS,
  ANIMAIS,
  MAX_ANIMAIS,
  RACAO_PRICE,
  FEED_MIN,
  OVO_MIN,
  OVOS_MAX,
  OVO_PRICE,
  FOME_FACTOR,
  TREINOS,
  TREINOS_POR_DIA,
  FORMA_DECAY,
  PRAZOS,
  PRAZO_MIN,
  PRAZO_MAX,
  QUIZ,
  QUIZ_POR_DIA,
  QUIZ_PREMIO,
  quizDoDia,
  PRESENTES,
  SEGURO_PRICE,
  SEGURO_MS,
  MAX_BLOQUEADOS,
  CARREIRA,
  PRIMEIROS_PASSOS,
  PRIMEIROS_PASSOS_BONUS,
  MAX_FILHOS,
  PARTO_PRICE,
  IDADE_ADULTA,
  CUIDADOS_POR_NIVEL,
  AJUDA_BASE,
  AJUDA_POR_ESTUDO,
  NOMES_M,
  NOMES_F,
  idadeAnos,
  faseDe,
  type Filho,
  careerLevel,
  chefeEducation,
  DENUNCIAS_POR_DIA,
  MOTIVOS_DENUNCIA,
  CURSOS,
  UNI_LESSONS,
  UNI_PRICE,
  DOENCAS,
  ROUBO_MIN_WALLET,
  ROUBO_MAX,
  ROUBO_RECOVER_MS,
  WEDDING_MIN_DATING_MS,
  DIVORCE_PRICE,
  NEGOCIOS,
  NEGOCIO_MAX_NIVEL,
  NEGOCIO_MAX_HOURS,
  negocioPerHour,
  negocioUpgradeCost,
  rollSorte,
  TRANSFER_MAX,
  TRANSFER_MIN,
  TRANSFER_NEAR_CM,
  sanitizeLife,
  shiftFactor,
  type LifeState,
} from "./life.js";
import {
  GuestNotAllowed,
  InsufficientFunds,
  MemoryBankRepository,
  MemoryPropertyRepository,
  PropertyTaken,
  type BankRepository,
  type Holding,
  type PropertyRepository,
  type WalletRepository,
} from "../persistence/index.js";
import type { ActionMessage } from "../net/protocol.js";
import { GroupNameTaken, MemoryGroupRepository, type GroupRepository } from "../persistence/GroupRepository.js";
import { recordNews } from "./news.js";
import { mutedUntil, untilText } from "./moderation.js";
import { sanitizeDisplayName } from "../auth/TokenVerifier.js";
import { dayPrize, eventsAt, hasEvent, isHoliday, upcoming } from "./events.js";
import { MemoryPostRepository, type PostRepository } from "../persistence/PostRepository.js";
import { MemoryKixikilaRepository, type Kixikila, type KixikilaRepository } from "../persistence/KixikilaRepository.js";
import { MemoryListingRepository, type ListingRepository } from "../persistence/ListingRepository.js";
import { MemoryReportRepository, type ReportRepository } from "../persistence/ReportRepository.js";
import { MemoryInboxRepository, type InboxItem, type InboxRepository } from "../persistence/InboxRepository.js";
import { MemoryMarketRepository, type MarketRepository } from "../persistence/MarketRepository.js";
import {
  SHOP_ITEMS,
  SHOP_OPEN_PRICE,
  SHOP_MAX_STOCK,
  SHOP_MAX_EMPLOYEES,
  SHOP_PRICE_MAX,
  SHOP_WAGES,
  simulateSales,
} from "./economia.js";
import { MemoryShopRepository, type Shop, type ShopRepository } from "../persistence/ShopRepository.js";
import { MemoryVenueRepository, type OwnedVenue, type VenueRepository } from "../persistence/VenueRepository.js";
import { MemoryInviteRepository, cleanCode, type InviteRepository } from "../persistence/InviteRepository.js";
import {
  VENUES_FOR_SALE,
  VENUE_CUT,
  VENUE_MAX_LEVEL,
  VENUE_MAX_HOURS,
  VENUE_MAX_OWNED,
  VENUE_RESALE,
  venuePerHour,
  venueUpgradeCost,
  ILEGAIS,
  raidChance,
  MULTA_FRACAO,
  RUSGA_PREMIO,
} from "./economia.js";
import { MARKET_ITEMS, ASSOC_POINTS, ASSOC_GOAL, ASSOC_GOAL_PRIZE, ASSOC_TOP_PRIZE, ASSOC_MIN_POINTS, angolaWeek, previousWeek } from "./economia.js";
import { MemoryAssociationRepository, type AssociationRepository, type AssocRow } from "../persistence/AssociationRepository.js";
import type { WalletMove } from "../persistence/WalletRepository.js";
import { whereIs } from "./presence.js";
import { sanitizeChat } from "./social.js";
import { forecast, weatherAt } from "./weather.js";
import { noteWealth } from "./ranking.js";

/** O que o controlador precisa de saber de um jogador da sala. */
export interface LifeActor {
  characterId: string;
  x: number;
  y: number;
  /** id da entidade na sala (para escolher a quem transferir) */
  eid?: number;
  /** conta: "guest:…" para convidados */
  userId?: string;
  name?: string;
  appearance?: { top?: number };
}

interface Busy {
  kind: keyof typeof DURATION;
  startedAt: number;
  until: number;
  x: number;
  y: number;
  place?: Place;
  /** biscato em curso */
  item?: string;
}

interface Entry {
  /** convites: o meu código e quem convidei; se entrei com o código de alguém */
  inviteView?: { code: string; convidados: number; premiados: number; usei: { owner: string; rewarded: boolean } | null };
  /** estabelecimentos: os meus e os deste bairro (com dono ou à venda) */
  venueView?: { meus: OwnedVenue[]; bairro: OwnedVenue[] };
  /** lojas: a minha, a loja onde trabalho e as bancas deste bairro (o que a app mostrou) */
  shopView?: { minha: Shop | null; emprego: Shop | null; aqui: Shop[] };
  /** proposta de emprego numa loja */
  shopOffer?: { from: LifeActor; shopId: string; nome: string; salario: number };
  /** associação: o que a app mostrou da última vez (ranking, totais) */
  assocView?: { semana: string; ranking: AssocRow[]; total: number; meus: number; anterior: AssocRow[]; meusAnterior: { bairro: string; pontos: number } | null };
  /** extrato pedido (últimos movimentos da carteira) */
  extrato?: WalletMove[];
  /** kixikila do grupo (lida quando a app pede ou depois de cada ação) */
  kixi?: Kixikila | null;
  /** pedido de namoro recebido / pedido de casamento recebido */
  loveReq?: { from: LifeActor };
  weddingReq?: { from: LifeActor };
  /** pedido para terem um filho (o par responde) */
  babyReq?: { from: LifeActor; nome: string; sexo: "m" | "f" };
  /** lista de imóveis do bairro (pedida pela app Imóveis) */
  imoveis?: Array<{ door: string; name: string; venue: string; free: number; total: number; buy: number; rentPerDay: number; x: number; y: number }>;
  /** pedido de amizade recebido (vale enquanto quem pediu estiver nesta sala) */
  friendReq?: { from: LifeActor; at: number };
  /** última vez que ouviu a rádio (ms) */
  radioAt?: number;
  life: LifeState;
  money: number;
  bank: number;
  busy: Busy | null;
  dirty: boolean;
  /** frações (casas/apartamentos) desta personagem neste bairro */
  homes: Holding[];
  /** oferta de casas mostrada à porta de um edifício de habitação */
  offer: Offer | null;
  /** viagem paga: o cliente muda de bairro quando vê isto */
  travel: { district: string; n: number; from?: string; onFoot?: boolean; by?: string; seconds?: number; birth?: boolean } | null;
  /** acabou de nascer (mostra a lotaria da vida uma vez) */
  newborn: boolean;
}

export interface Offer {
  building: string;
  name: string;
  venue: string;
  buy: number;
  rentPerDay: number;
  rentOptions: number[];
  units: Array<{ id: string; name: string; free: boolean; mine: boolean }>;
}

export interface LifeOutput {
  self(actor: LifeActor, state: SelfState): void;
  toast(actor: LifeActor, text: string, ok: boolean): void;
  /** posição mudou por teletransporte (entrar/sair): a sala atualiza grelha e movimento */
  moved?(actor: LifeActor): void;
  /** mudou de roupa: a sala grava a aparência e avisa quem a vê */
  appearance?(actor: LifeActor, top: number): void;
  /** SMS para uma personagem (em qualquer sala); devolve true se foi entregue a alguém ligado */
  sms?(toCharacterId: string, from: string, text: string, fromId?: string): boolean;
  /** presente para uma personagem ligada noutra sala; devolve true se foi entregue */
  gift?(toCharacterId: string, from: string, name: string, mood: number, fromId?: string): boolean;
  /** mudou de nome (nova geração): a sala grava e mostra o nome novo */
  rename?(actor: LifeActor, name: string): void;
  /** últimas falas de uma personagem nesta sala (contexto de uma denúncia) */
  recentChat?(characterId: string): string[];
}

const RESIDENTIAL = new Set(Object.keys(HOUSING));
/** Convites: prémio para os dois quando o convidado faz os primeiros turnos (no máximo 20 por pessoa). */
const INVITE_PRIZE = 5000;
const INVITE_MIN_SHIFTS = 3;
const INVITE_MAX_REWARDS = 20;

export interface SelfState {
  money: number;
  needs: { hunger: number; energy: number; mood: number; health: number };
  family: string;
  familyLabel: string;
  education: number;
  study: number;
  job: string | null;
  shifts: number;
  parentsToday: boolean;
  busy: { kind: string; msLeft: number; total: number } | null;
  bank: number;
  docs: { bi: boolean; registo: boolean; residencia: boolean };
  phoneCredit: number;
  car: string | null;
  /** interior onde estou (null = na rua) */
  inside: { id: string; venue: string; name: string; unit?: number } | null;
  homes: Array<{ unit: string; name: string; tenure: "buy" | "rent"; paidUntil: number | null }>;
  offer: Offer | null;
  travel: { district: string; n: number; from?: string; onFoot?: boolean; by?: string; seconds?: number; birth?: boolean } | null;
  birth: { classe: string; pais: string; provincia: string; bairro: string; bairroNome: string; kumbu: number; nova: boolean } | null;
  sorteHoje: boolean;
  biscatos: { feitos: number; max: number };
  cambio: { usd: number; rate: number; buy: number; sell: number; usadoHoje: number; limite: number };
  friends: Array<{ name: string; online: boolean; bairro: string | null; district: string | null; roomId: string | null }>;
  friendReq: { name: string } | null;
  group: { id: string; name: string } | null;
  tempo: ReturnType<typeof weatherAt> & { previsao: ReturnType<typeof forecast> };
  lavra: { crop: string; name: string; readyInS: number; watered: boolean } | null;
  colheita: Record<string, number>;
  ambicao: { id: string; text: string; reward: number; progress: number } | null;
  ambicoesFeitas: string[];
  partner: { name: string; married: boolean; online: boolean; desde: number } | null;
  loveReq: { name: string } | null;
  weddingReq: { name: string } | null;
  negocio: { tipo: string; name: string; nivel: number; perHour: number; pendente: number; melhorar: number | null; maxHoras: number } | null;
  imoveis: Entry["imoveis"] | null;
  extrato: Array<{ amount: number; balance: number; reason: string; at: number }> | null;
  bloqueados: Array<{ name: string }>;
  denuncias: { hoje: number; max: number; motivos: Record<string, string> };
  roupas: number[];
  kixikila: { quota: number; status: string; round: number; members: string[]; paid: number; vez: string | null; souMembro: boolean; jaPaguei: boolean; souCriador: boolean } | null;
  conquistas: Array<{ id: string; name: string; text: string; reward: number; feita: boolean; paga: boolean }>;
  eventos: ReturnType<typeof eventsAt>;
  agenda: ReturnType<typeof upcoming>;
  convite: { code: string | null; convidados: number; premiados: number; usei: boolean; premioPronto: boolean; recebido: boolean; turnos: number; precisa: number; premio: number; podeUsar: boolean } | null;
  inicio: { passos: Array<{ id: string; text: string; dica: string; reward: number; feito: boolean; pago: boolean }>; bonus: number; acabado: boolean } | null;
  estabelecimentos: {
    meus: Array<{ id: string; nome: string; venue: string; bairro: string; nivel: number; caixa: number; perHour: number; melhorar: number | null; vender: number }>;
    aqui: { id: string; nome: string; venue: string; dono: string | null; preco: number | null; souDono: boolean } | null;
    bairro: Array<{ nome: string; dono: string; nivel: number }>;
    catalogo: Array<{ venue: string; name: string; price: number; perHour: number }>;
    max: number;
    parte: number;
  };
  ilegal: { tipo: string; name: string; perHour: number; pendente: number; risco: number; texto: string } | null;
  ilegais: Array<{ tipo: string; name: string; cost: number; perHour: number; texto: string }>;
  preso: number;
  loja: {
    minha: { nome: string; caixa: number; vendas: number; bairro: string; itens: Array<{ item: string; name: string; qty: number; price: number; cost: number }>; empregados: Array<{ name: string; salario: number }> } | null;
    emprego: { nome: string; bairro: string; dono: string } | null;
    aqui: Array<{ id: string; nome: string; dono: string; itens: Array<{ item: string; name: string; qty: number; price: number }> }>;
    oferta: { from: string; nome: string; salario: number } | null;
    catalogo: Array<{ item: string; name: string; cost: number }>;
    licenca: number;
    salarios: number[];
  };
  associacao: {
    bairro: string | null;
    nome: string | null;
    semana: string;
    total: number;
    meus: number;
    objetivo: number;
    premioObjetivo: number;
    objetivoRecolhido: boolean;
    ranking: Array<{ bairro: string; nome: string; pontos: number; membros: number }>;
    topAnterior: { nome: string; pontos: number; souMembro: boolean; recolhido: boolean; premio: number } | null;
    aqui: string;
  };
  mercado: Array<{ item: string; name: string; unit: string; preco: number; base: number }>;
  prendaHoje: { name: string; premio: number; recolhida: boolean } | null;
  visitados: number;
  uni: { curso: string | null; cursoNome: string | null; aulas: number; total: number; licenciaturas: string[]; preco: number };
  doenca: { id: string; name: string; texto: string } | null;
  roubo: { amount: number; recuperavel: boolean } | null;
  criacao: { animais: Array<{ tipo: string; name: string; prontoEmS: number }>; alimentadosS: number; ovos: number; max: number; racao: number };
  forma: { valor: number; treinosHoje: number; max: number };
  prazo: { amount: number; termo: string; name: string; rate: number; faltamS: number; total: number } | null;
  filhos: Array<{ nome: string; sexo: string; idade: number; fase: string; adulto: boolean; estudos: number; cuidadoHoje: boolean; custo: number; cuidadoTexto: string; ajudaHoje: boolean; ajuda: number }>;
  babyReq: { name: string; nome: string } | null;
  geracao: number;
  carreira: { titulo: string; nivel: number; turnos: number; proximo: { titulo: string; faltam: number; estudos: number | null } | null; salario: number } | null;
  curriculo: Array<{ job: string; name: string; titulo: string; turnos: number }>;
  quiz: { n: number; total: number; certasHoje: number; certas: number; pergunta: string | null; opcoes: string[]; premio: number };
  seguro: { ativo: boolean; faltamS: number; preco: number };
  missions: { items: Array<{ id: string; text: string; reward: number; done: boolean; claimed: boolean }>; streak: number; streakBonus: number; progress: number };
}

/** Catálogo enviado no WELCOME (o cliente desenha menus e vagas a partir dele). */
export function lifeCatalog() {
  return {
    jobs: JOBS,
    menus: MENUS,
    prices: { hotel: HOTEL_PRICE, study: STUDY_PRICE, homeMeal: HOME_MEAL.price, travel: TRAVEL_PRICE },
    transports: TRANSPORTS,
    cars: CARS,
    durations: DURATION,
    lessonsPerLevel: LESSONS_PER_LEVEL,
    services: SERVICES,
    housing: HOUSING,
    rentOptions: RENT_OPTIONS,
  };
}

/**
 * Sistema de vida de uma sala. Servidor autoritativo: o cliente pede ("comer funge"),
 * o servidor verifica o lugar, o dinheiro e o estado, e só então aplica.
 */
export class LifeController {
  private readonly entries = new Map<LifeActor, Entry>();
  private lastDecay: number | null = null;
  private readonly properties: PropertyRepository;
  private seq = 0;
  /** parte única das chaves de idempotência: dois pedidos no mesmo ms não se anulam */
  private op(): string {
    return `${this.now()}.${++this.seq}`;
  }
  private readonly bank: BankRepository;
  private readonly groups: GroupRepository;
  private readonly posts: PostRepository;
  private readonly kixi: KixikilaRepository;
  private readonly listings: ListingRepository;
  private readonly reports: ReportRepository;
  private readonly inbox: InboxRepository;
  private readonly market: MarketRepository;
  private readonly assoc: AssociationRepository;
  private readonly shops: ShopRepository;
  private readonly venues: VenueRepository;
  private readonly invites: InviteRepository;
  /** últimos preços do mercado vivo (para o telemóvel); atualizados a cada troca e de minuto a minuto */
  private marketCache: Record<string, number> = {};
  private marketAt = 0;
  /** Muxima: quantas publicações por pessoa na última hora */
  private readonly postTimes = new Map<string, number[]>();

  constructor(
    private readonly district: District,
    private readonly wallets: WalletRepository,
    private readonly out: LifeOutput,
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
    deps: { properties?: PropertyRepository; bank?: BankRepository; groups?: GroupRepository; posts?: PostRepository; kixikila?: KixikilaRepository; listings?: ListingRepository; reports?: ReportRepository; inbox?: InboxRepository; market?: MarketRepository; assoc?: AssociationRepository; shops?: ShopRepository; venues?: VenueRepository; invites?: InviteRepository } = {},
  ) {
    this.properties = deps.properties ?? new MemoryPropertyRepository(wallets);
    this.bank = deps.bank ?? new MemoryBankRepository(wallets);
    this.groups = deps.groups ?? new MemoryGroupRepository();
    this.posts = deps.posts ?? new MemoryPostRepository();
    this.kixi = deps.kixikila ?? new MemoryKixikilaRepository();
    this.listings = deps.listings ?? new MemoryListingRepository();
    this.reports = deps.reports ?? new MemoryReportRepository();
    this.inbox = deps.inbox ?? new MemoryInboxRepository();
    this.market = deps.market ?? new MemoryMarketRepository();
    this.assoc = deps.assoc ?? new MemoryAssociationRepository();
    this.shops = deps.shops ?? new MemoryShopRepository();
    this.venues = deps.venues ?? new MemoryVenueRepository();
    this.invites = deps.invites ?? new MemoryInviteRepository();
  }

  /** Entrada na sala: estado guardado (ou personagem nova → família sorteada e dinheiro inicial). */
  async join(actor: LifeActor, stored: unknown | null): Promise<void> {
    let life: LifeState;
    if (stored) {
      life = sanitizeLife(stored, this.rand);
    } else {
      life = newLife(this.rand, this.now());
      life.birth = rollBirth(life.family, actor.characterId, (b) => !!getDistrict(b)?.places?.length);
      if (life.family === "rica" || life.family === "muito_rica")
        recordNews("nascimento", getDistrict(life.birth.bairro)?.name ?? life.birth.bairro, `Nasceu ${actor.name ?? "uma criança"} numa família ${FAMILY_LABEL[life.family].toLowerCase()} — filho/a de ${life.birth.pais}.`, this.now());
      await this.wallets.apply(actor.characterId, STARTING_MONEY[life.family], "family.start", `family:${actor.characterId}`);
    }
    rollDay(life, this.now());
    rollMissions(life.missions, this.now(), actor.characterId);
    if (!life.visitados.includes(this.district.id)) life.visitados.push(this.district.id);
    // a cor escolhida ao criar a personagem também é roupa dela
    const top = actor.appearance?.top;
    if (typeof top === "number" && top >= 0 && !life.roupas.includes(top)) life.roupas.push(top);
    const money = await this.wallets.balance(actor.characterId);
    const bank = await this.bank.balance(actor.characterId);
    const e: Entry = { life, money, bank, busy: null, dirty: !stored, homes: [], offer: null, travel: null, newborn: !stored };
    // personagem nova: a lotaria da vida decide onde cresce; vai para lá de graça depois da revelação
    if (!stored && life.birth && life.birth.bairro !== this.district.id) {
      e.travel = { district: life.birth.bairro, n: 1, from: this.district.id, onFoot: false, birth: true };
    }
    this.entries.set(actor, e);
    await this.refreshHomes(actor, e);
    // voltou a entrar dentro de uma casa que já não é sua (renda acabou): vai para a rua
    this.evictIfNeeded(actor, e);
    // SMS que chegaram enquanto estava desligado
    await this.deliverInbox(actor);
    this.sendSelf(actor);
  }

  leave(actor: LifeActor): void {
    this.entries.delete(actor);
  }

  /** Estado a gravar (posição + vida). */
  lifeOf(actor: LifeActor): LifeState | undefined {
    return this.entries.get(actor)?.life;
  }

  takeDirty(actor: LifeActor): boolean {
    const e = this.entries.get(actor);
    if (!e?.dirty) return false;
    e.dirty = false;
    return true;
  }

  isBusy(actor: LifeActor): boolean {
    return this.entries.get(actor)?.busy != null;
  }

  // ---------------------------------------------------------------- ações

  /** Ações de cada pessoa em fila: a seguinte só começa quando a anterior acabou (ex.: semear e logo regar). */
  private readonly queues = new WeakMap<LifeActor, Promise<void>>();

  handle(actor: LifeActor, msg: ActionMessage): Promise<void> {
    const prev = this.queues.get(actor) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(() => this.handleNow(actor, msg));
    this.queues.set(actor, next);
    return next;
  }

  private async handleNow(actor: LifeActor, msg: ActionMessage): Promise<void> {
    const e = this.entries.get(actor);
    if (!e) return;
    rollDay(e.life, this.now());
    rollMissions(e.life.missions, this.now(), actor.characterId);
    // preso/a depois de uma rusga: só se pode ver o estado
    if (e.busy?.kind === "preso" && msg.a !== "self") {
      const left = Math.ceil((e.busy.until - this.now()) / 1000);
      return this.out.toast(actor, `Estás detido/a na esquadra. Sais daqui a ${left} s.`, false);
    }
    try {
      switch (msg.a) {
        case "self":
          // pedido de estado: relê o saldo (pode ter mudado por fora, ex.: transferência noutra sala)
          e.money = await this.wallets.balance(actor.characterId);
          break;
        case "eat":
          await this.eat(actor, e, msg.i);
          break;
        case "work":
          this.startWork(actor, e);
          break;
        case "study":
          await this.startPaid(actor, e, "study", STUDY_PRICE, (p) => p.kind === "study", "Entra na Escola Primária e vai à sala de aula para estudar.");
          break;
        case "sleep":
          if (this.near(actor, (p) => p.kind === "home_sleep")) {
            if (!this.ownsInterior(e, interiorAt(this.district, actor.x, actor.y))) return this.out.toast(actor, "Esta cama não é tua.", false);
            this.startBusy(actor, e, "sleep_casa");
            break;
          }
          await this.startPaid(actor, e, "sleep", HOTEL_PRICE, (p) => p.kind === "sleep", "Entra no Hotel iU e vai ao quarto para dormir.");
          break;
        case "sleep_rua":
          if (e.life.needs.energy >= 30) return this.out.toast(actor, "Ainda não estás cansado(a) o suficiente para dormir na rua.", false);
          this.startBusy(actor, e, "sleep_rua");
          break;
        case "cancel":
          if (e.busy) {
            e.busy = null;
            this.out.toast(actor, "Paraste.", true);
          }
          break;
        case "take_job":
          this.takeJob(actor, e, msg.i);
          break;
        case "quit_job":
          e.life.jobId = null;
          e.dirty = true;
          this.out.toast(actor, "Despediste-te.", true);
          break;
        case "parents":
          await this.askParents(actor, e);
          break;
        case "enter":
          await this.enter(actor, e, msg.i);
          break;
        case "exit":
          this.exit(actor, e);
          break;
        case "buy_house":
          await this.claimHome(actor, e, msg.i, null);
          break;
        case "rent_house":
          await this.claimHome(actor, e, msg.i, msg.n ?? 1);
          break;
        case "bank_in":
        case "bank_out":
          await this.bankMove(actor, e, msg.a === "bank_in" ? (msg.n ?? 0) : -(msg.n ?? 0));
          break;
        case "service":
          await this.service(actor, e, msg.i);
          break;
        case "home_eat":
          await this.homeEat(actor, e);
          break;
        case "buy_car":
          await this.buyCar(actor, e, msg.i);
          break;
        case "travel":
          await this.travel(actor, e, msg.i, msg.t);
          break;
        case "biscato":
          this.biscato(actor, e, msg.i);
          break;
        case "cambio_compra":
        case "cambio_venda":
          await this.cambio(actor, e, msg.a === "cambio_compra" ? (msg.n ?? 0) : -(msg.n ?? 0));
          break;
        case "radio_ouvir":
          this.listenRadio(actor, e);
          break;
        case "amigo_pedir":
          this.friendRequest(actor, e, msg.i);
          break;
        case "amigo_aceitar":
        case "amigo_recusar":
          this.friendAnswer(actor, e, msg.a === "amigo_aceitar");
          break;
        case "amigo_remover":
          this.friendRemove(actor, e, (msg.n ?? 0) - 1);
          break;
        case "grupo_criar":
          await this.groupCreate(actor, e, msg.s);
          break;
        case "grupo_entrar":
          await this.groupJoin(actor, e, msg.s);
          break;
        case "grupo_sair":
          await this.groupLeave(actor, e);
          break;
        case "roupa_comprar":
          await this.buyClothes(actor, e, (msg.n ?? 0) - 1);
          break;
        case "roupa_vestir":
          this.wear(actor, e, (msg.n ?? 0) - 2);
          break;
        case "kixi_ver":
        case "kixi_criar":
        case "kixi_aderir":
        case "kixi_comecar":
        case "kixi_pagar":
        case "kixi_receber":
          await this.kixikila(actor, e, msg.a, msg.n ?? 0);
          break;
        case "classif_vender":
          await this.listingCreate(actor, e, msg.i, msg.n ?? 0, Number(msg.s ?? 0));
          break;
        case "classif_comprar":
          await this.listingBuy(actor, e, msg.s);
          break;
        case "classif_cancelar":
          await this.listingCancel(actor, e, msg.s);
          break;
        case "conquistas_recolher":
          await this.claimAchievements(actor, e);
          break;
        case "sms":
          this.sendSms(actor, e, (msg.n ?? 0) - 1, msg.s);
          break;
        case "muxima_publicar":
          if (mutedUntil(actor.characterId, this.now())) {
            this.out.toast(actor, `Estás silenciado/a pela moderação ${untilText(mutedUntil(actor.characterId, this.now()))}.`, false);
            break;
          }
          await this.post(actor, msg.s);
          break;
        case "muxima_gosto":
          await this.likePost(actor, msg.s);
          break;
        case "uni_curso":
          this.uniPick(actor, e, msg.i);
          break;
        case "namoro_pedir":
          this.loveAsk(actor, e, msg.i);
          break;
        case "namoro_aceitar":
        case "namoro_recusar":
          this.loveAnswer(actor, e, msg.a === "namoro_aceitar");
          break;
        case "casar":
          this.weddingAsk(actor, e);
          break;
        case "casar_aceitar":
        case "casar_recusar":
          await this.weddingAnswer(actor, e, msg.a === "casar_aceitar");
          break;
        case "terminar":
          await this.breakUp(actor, e);
          break;
        case "negocio_abrir":
          await this.businessOpen(actor, e, msg.i);
          break;
        case "negocio_recolher":
          await this.businessCollect(actor, e);
          break;
        case "negocio_melhorar":
          await this.businessUpgrade(actor, e);
          break;
        case "negocio_vender":
          await this.businessSell(actor, e);
          break;
        case "imoveis":
          await this.listHousing(e);
          break;
        case "criacao_comprar":
          await this.animalBuy(actor, e, msg.i);
          break;
        case "criacao_alimentar":
          await this.animalFeed(actor, e);
          break;
        case "criacao_ovos":
          this.animalEggs(actor, e);
          break;
        case "criacao_vender":
          await this.animalSell(actor, e, msg.i);
          break;
        case "treinar":
          this.train(actor, e, msg.i);
          break;
        case "prazo_abrir":
          await this.termOpen(actor, e, msg.n, msg.i);
          break;
        case "bloquear":
          this.block(actor, e, msg.i);
          break;
        case "desbloquear":
          this.unblock(actor, e, (msg.n ?? 0) - 1);
          break;
        case "denunciar":
          await this.report(actor, e, msg.n ? String(msg.n) : undefined, msg.i, msg.s); // n = quem (eid), i = motivo
          break;
        case "extrato":
          e.extrato = await this.wallets.history(actor.characterId, 30);
          break;
        case "filho_pedir":
          this.babyAsk(actor, e, msg.s, msg.i);
          break;
        case "filho_aceitar":
        case "filho_recusar":
          await this.babyAnswer(actor, e, msg.a === "filho_aceitar");
          break;
        case "filho_cuidar":
          await this.childCare(actor, e, (msg.n ?? 0) - 1);
          break;
        case "filho_ajuda":
          await this.childHelp(actor, e, (msg.n ?? 0) - 1);
          break;
        case "geracao_continuar":
          await this.nextGeneration(actor, e, (msg.n ?? 0) - 1);
          break;
        case "estab_ver":
          await this.venueLoad(actor, e);
          break;
        case "estab_comprar":
          await this.venueBuy(actor, e);
          break;
        case "estab_recolher":
          await this.venueCollect(actor, e, msg.s);
          break;
        case "estab_melhorar":
          await this.venueUpgrade(actor, e, msg.s);
          break;
        case "estab_vender":
          await this.venueSell(actor, e, msg.s);
          break;
        case "ilegal_abrir":
          await this.illegalOpen(actor, e, msg.i);
          break;
        case "ilegal_recolher":
          await this.illegalCollect(actor, e);
          break;
        case "ilegal_fechar":
          this.illegalClose(actor, e);
          break;
        case "policia_patrulha":
          await this.policePatrol(actor, e);
          break;
        case "loja_abrir":
          await this.shopOpen(actor, e, msg.s);
          break;
        case "loja_ver":
          await this.shopLoad(actor, e);
          break;
        case "loja_stock":
          await this.shopRestock(actor, e, msg.i, msg.n ?? 0);
          break;
        case "loja_preco":
          await this.shopPrice(actor, e, msg.i, msg.n ?? 0);
          break;
        case "loja_comprar":
          await this.shopBuy(actor, e, msg.s, msg.i);
          break;
        case "loja_recolher":
          await this.shopCollect(actor, e);
          break;
        case "loja_contratar":
          await this.shopHire(actor, e, msg.i, msg.n ?? 0);
          break;
        case "loja_aceitar":
        case "loja_recusar":
          await this.shopOfferAnswer(actor, e, msg.a === "loja_aceitar");
          break;
        case "loja_despedir":
          await this.shopFire(actor, e, (msg.n ?? 0) - 1);
          break;
        case "loja_sair":
          await this.shopQuit(actor, e);
          break;
        case "loja_turno":
          await this.shopShiftStart(actor, e);
          break;
        case "loja_fechar":
          await this.shopClose(actor, e);
          break;
        case "assoc_aderir":
          await this.assocJoin(actor, e);
          break;
        case "assoc_sair":
          e.life.associacao = null;
          e.dirty = true;
          this.out.toast(actor, "Saíste da associação do bairro.", true);
          break;
        case "assoc_ver":
          await this.assocLoad(actor, e);
          break;
        case "assoc_premio":
          await this.assocPrize(actor, e, msg.i);
          break;
        case "convite_ver":
          await this.inviteLoad(actor, e);
          break;
        case "convite_usar":
          await this.inviteUse(actor, e, msg.s);
          break;
        case "convite_premio":
          await this.inviteReward(actor, e);
          break;
        case "inicio_recolher":
          await this.claimOnboarding(actor, e, msg.i);
          break;
        case "evento_recolher":
          await this.claimDayPrize(actor, e);
          break;
        case "quiz_responder":
          await this.quizAnswer(actor, e, (msg.n ?? 0) - 1);
          break;
        case "presente":
          await this.sendGift(actor, e, (msg.n ?? 0) - 1, msg.i);
          break;
        case "seguro_comprar":
          await this.buyInsurance(actor, e);
          break;
        case "prazo_levantar":
          await this.termClose(actor, e);
          break;
        case "lavra_semear":
          await this.lavraPlant(actor, e, msg.i);
          break;
        case "lavra_regar":
          this.lavraWater(actor, e);
          break;
        case "lavra_colher":
          this.lavraHarvest(actor, e);
          break;
        case "lavra_vender":
          await this.lavraSell(actor, e);
          break;
        case "ambicao_escolher":
          this.ambitionPick(actor, e, msg.i);
          break;
        case "ambicao_recolher":
          await this.ambitionClaim(actor, e);
          break;
        case "sorte":
          await this.sorte(actor, e);
          break;
        case "transfer":
          await this.transfer(actor, e, msg.i, msg.n ?? 0);
          break;
        case "mission_claim":
          await this.claimMission(actor, e, (msg.n ?? 0) - 1);
          break;
      }
    } catch (err) {
      if (err instanceof InsufficientFunds) this.out.toast(actor, "Não tens dinheiro suficiente.", false);
      else if (err instanceof GuestNotAllowed) this.out.toast(actor, "Para teres casa precisas de uma conta (não convidado).", false);
      else if (err instanceof PropertyTaken) this.out.toast(actor, err.already ? "Esta casa já é tua." : "Alguém ficou com esta casa primeiro.", false);
      else throw err;
    }
    this.sendSelf(actor);
  }

  private near(actor: LifeActor, test: (p: Place) => boolean, extraM = 0): Place | undefined {
    let best: Place | undefined;
    let bestD = Infinity;
    for (const p of this.district.places ?? []) {
      if (!test(p)) continue;
      const d = Math.hypot(actor.x - p.x, actor.y - p.y);
      if (d <= p.radius + extraM * 100 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private async eat(actor: LifeActor, e: Entry, itemId: string | undefined): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    const place = this.near(actor, (p) => p.kind === "food");
    if (!place?.shop) return this.out.toast(actor, "Entra numa cantina ou padaria e vai ao balcão para comer.", false);
    const item = (MENUS[place.shop] ?? []).find((m) => m.id === itemId);
    if (!item) return this.out.toast(actor, "Esse prato não existe aqui.", false);
    e.money = await this.wallets.apply(actor.characterId, -item.price, `food.${item.id}`, `food:${actor.characterId}:${this.op()}:${item.id}`);
    this.venueRevenue(actor, item.price);
    e.life.needs = applyFood(e.life.needs, item);
    e.dirty = true;
    this.out.toast(actor, `Comeste: ${item.name} (−${item.price} Kz).`, true);
    this.mission(actor, e, "comer");
  }

  private takeJob(actor: LifeActor, e: Entry, jobId: string | undefined): void {
    const job = jobById(jobId);
    if (!job) return this.out.toast(actor, "Vaga desconhecida.", false);
    if (e.life.education < job.education) return this.out.toast(actor, `Precisas de estudos nível ${job.education}.`, false);
    for (const d of job.docs ?? []) {
      if (!e.life.docs[d]) return this.out.toast(actor, `Precisas de ${DOC_LABEL[d]} (${d === "registo" ? "Tribunal da Comarca" : "Governo Provincial ou Administração do Bairro"}).`, false);
    }
    if (job.degree && !(job.degree === "*" ? e.life.uni.licenciaturas.length > 0 : e.life.uni.licenciaturas.includes(job.degree)))
      return this.out.toast(actor, job.degree === "*" ? "Precisas de uma licenciatura (Universidade)." : `Precisas da licenciatura em ${CURSOS[job.degree]?.name ?? job.degree}.`, false);
    e.life.jobId = job.id;
    e.dirty = true;
    this.out.toast(actor, `Novo emprego: ${job.name}. Vai a ${job.where} para trabalhar.`, true);
    this.onboard(actor, e, "emprego");
  }

  private startWork(actor: LifeActor, e: Entry): void {
    const job = jobById(e.life.jobId);
    if (!job) return this.out.toast(actor, "Ainda não tens emprego. Vê as vagas no telemóvel.", false);
    if (!this.near(actor, (p) => p.job === job.place)) return this.out.toast(actor, `Vai a ${job.where} para trabalhar.`, false);
    if (e.life.needs.energy < 10 || e.life.needs.hunger < 5) return this.out.toast(actor, "Estás sem forças. Come ou dorme primeiro.", false);
    if (this.tooSick(actor, e)) return;
    this.startBusy(actor, e, "work");
  }

  private async startPaid(actor: LifeActor, e: Entry, kind: "study" | "sleep", price: number, where: (p: Place) => boolean, hint: string): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    if (!this.near(actor, where)) return this.out.toast(actor, hint, false);
    if (kind === "study" && this.tooSick(actor, e)) return;
    if (kind === "study" && interiorAt(this.district, actor.x, actor.y)?.venue === "universidade") return this.uniLesson(actor, e);
    if (kind === "study" && e.life.education >= MAX_EDUCATION) return this.out.toast(actor, "Já tens o nível máximo de estudos. Continua na Universidade (Bairro Académico)!", false);
    e.money = await this.wallets.apply(actor.characterId, -price, `${kind}.pay`, `${kind}:${actor.characterId}:${this.op()}`);
    this.venueRevenue(actor, price);
    this.startBusy(actor, e, kind);
  }

  private startBusy(actor: LifeActor, e: Entry, kind: Busy["kind"]): void {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    const t = this.now();
    e.busy = { kind, startedAt: t, until: t + DURATION[kind] * 1000, x: actor.x, y: actor.y };
  }

  private async askParents(actor: LifeActor, e: Entry): Promise<void> {
    const day = angolaDay(this.now());
    if (e.life.parentsDay === day) return this.out.toast(actor, "Já pediste hoje. Tenta amanhã.", false);
    e.life.parentsDay = day;
    e.dirty = true;
    const gift = parentsGift(e.life.family, this.rand(), this.rand());
    if (gift === 0) return this.out.toast(actor, "Os teus pais disseram que hoje não dá.", false);
    e.money = await this.wallets.apply(actor.characterId, gift, "family.parents", `parents:${actor.characterId}:${day}`);
    this.out.toast(actor, `Os teus pais mandaram ${gift.toLocaleString("pt-PT")} Kz.`, true);
  }

  // ---------------------------------------------------------------- edifícios

  private interior(id: string | undefined): Interior | undefined {
    return this.district.interiors?.find((i) => i.id === id);
  }

  private ownsInterior(e: Entry, i: Interior | undefined): boolean {
    return !!i && e.homes.some((h) => h.unit === i.id && (h.tenure === "buy" || (h.paidUntil ?? 0) > this.now()));
  }

  private async refreshHomes(actor: LifeActor, e: Entry): Promise<void> {
    const t = this.now();
    const homes: Holding[] = [];
    for (const i of this.district.interiors ?? []) {
      if (!RESIDENTIAL.has(i.venue)) continue;
      const h = await this.properties.get(this.district.id, i.id, t);
      if (h?.characterId === actor.characterId) homes.push(h);
    }
    e.homes = homes;
  }

  private teleport(actor: LifeActor, e: Entry, x: number, y: number): void {
    actor.x = Math.round(x);
    actor.y = Math.round(y);
    e.busy = null;
    e.offer = null;
    this.out.moved?.(actor);
  }

  private doorOf(i: Interior): Place | undefined {
    return this.district.places?.find((p) => p.id === i.building);
  }

  private evictIfNeeded(actor: LifeActor, e: Entry): void {
    const i = interiorAt(this.district, actor.x, actor.y);
    if (!i || !RESIDENTIAL.has(i.venue) || this.ownsInterior(e, i)) return;
    const door = this.doorOf(i);
    if (door) this.teleport(actor, e, door.x, door.y);
    this.out.toast(actor, "A renda acabou: já não podes ficar nesta casa.", false);
  }

  private async enter(actor: LifeActor, e: Entry, unit: string | undefined): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    if (interiorAt(this.district, actor.x, actor.y)) return this.out.toast(actor, "Já estás lá dentro.", false);
    // folga de 1 m: no telemóvel a posição chega ao servidor com algum atraso (a personagem já está à porta)
    const door = this.near(actor, (p) => p.kind === "door", 1);
    if (!door?.interiors?.length) return this.out.toast(actor, "Aproxima-te da porta de um edifício.", false);
    if (!RESIDENTIAL.has(door.venue ?? "")) {
      const i = this.interior(door.interiors[0]);
      if (!i) return;
      this.teleport(actor, e, i.entry.x, i.entry.y);
      this.mission(actor, e, "visitar", i.id);
      return this.out.toast(actor, `Entraste: ${i.name}.`, true);
    }
    // habitação: só entra quem lá mora
    await this.refreshHomes(actor, e);
    const mine = door.interiors.map((id) => this.interior(id)).filter((i) => this.ownsInterior(e, i));
    const target = mine.find((i) => i!.id === unit) ?? mine[0];
    if (target) {
      this.teleport(actor, e, target.entry.x, target.entry.y);
      this.mission(actor, e, "visitar", target.id);
      return this.out.toast(actor, `Bem-vindo(a) a casa: ${target.name}.`, true);
    }
    e.offer = await this.offerFor(actor, door);
    this.out.toast(actor, door.interiors.length > 1 ? "Não tens apartamento aqui. Escolhe um livre para arrendar ou comprar." : "Esta casa não é tua. Podes comprá-la ou arrendá-la.", false);
  }

  private async offerFor(actor: LifeActor, door: Place): Promise<Offer> {
    const t = this.now();
    const price = HOUSING[door.venue ?? ""] ?? { buy: 0, rentPerDay: 0 };
    const units: Offer["units"] = [];
    for (const id of door.interiors ?? []) {
      const i = this.interior(id);
      if (!i) continue;
      const h = await this.properties.get(this.district.id, id, t);
      units.push({ id, name: i.name, free: !h, mine: h?.characterId === actor.characterId });
    }
    return { building: door.id, name: door.name, venue: door.venue ?? "", buy: price.buy, rentPerDay: price.rentPerDay, rentOptions: [...RENT_OPTIONS], units };
  }

  private exit(actor: LifeActor, e: Entry): void {
    const i = interiorAt(this.district, actor.x, actor.y);
    if (!i) return this.out.toast(actor, "Já estás na rua.", false);
    const door = this.doorOf(i);
    if (!door) return;
    this.teleport(actor, e, door.x, door.y);
    this.out.toast(actor, `Saíste de ${i.name}.`, true);
  }

  private async claimHome(actor: LifeActor, e: Entry, unit: string | undefined, days: number | null): Promise<void> {
    const i = this.interior(unit);
    if (!i || !RESIDENTIAL.has(i.venue)) return this.out.toast(actor, "Essa casa não existe.", false);
    const door = this.doorOf(i);
    if (!door || Math.hypot(actor.x - door.x, actor.y - door.y) > door.radius) return this.out.toast(actor, `Vai à porta de ${door?.name ?? "casa"} para tratar disso.`, false);
    if (days !== null && !(RENT_OPTIONS as readonly number[]).includes(days)) return this.out.toast(actor, "Renda só por 1 ou 7 dias.", false);
    const price = HOUSING[i.venue]!;
    const total = days === null ? price.buy : rentPrice(price.rentPerDay, days);
    const h = await this.properties.claim(this.district.id, i.id, actor.characterId, days, total, `house:${actor.characterId}:${i.id}:${this.op()}`, this.now());
    e.money = await this.wallets.balance(actor.characterId);
    await this.refreshHomes(actor, e);
    e.offer = null;
    this.teleport(actor, e, i.entry.x, i.entry.y);
    if (h.tenure === "buy") recordNews("casa", this.district.name, `${actor.name ?? "Alguém"} comprou casa: ${i.name} (${this.district.name}).`, this.now());
    this.out.toast(
      actor,
      h.tenure === "buy" ? `Parabéns! Compraste ${i.name} por ${total.toLocaleString("pt-PT")} Kz.` : `Arrendaste ${i.name} por ${days} dia(s) (${total.toLocaleString("pt-PT")} Kz).`,
      true,
    );
  }

  private async bankMove(actor: LifeActor, e: Entry, amount: number): Promise<void> {
    if (!this.near(actor, (p) => p.kind === "bank")) return this.out.toast(actor, "Entra no Banco Planalto e vai ao balcão.", false);
    if (!amount) return this.out.toast(actor, "Indica a quantia.", false);
    const r = await this.bank.move(actor.characterId, amount, `bank:${actor.characterId}:${this.op()}`);
    e.money = r.wallet;
    e.bank = r.bank;
    this.out.toast(actor, amount > 0 ? `Depositaste ${amount.toLocaleString("pt-PT")} Kz.` : `Levantaste ${(-amount).toLocaleString("pt-PT")} Kz.`, true);
    if (amount > 0) this.mission(actor, e, "banco");
  }

  private async service(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const sv = SERVICES.find((s) => s.id === id);
    const spot = this.near(actor, (p) => p.kind === "service");
    const venue = this.interior(spot?.interior)?.venue;
    if (!sv || !spot || venue !== sv.venue) return this.out.toast(actor, "Esse serviço não é feito neste balcão.", false);
    if (sv.doc && e.life.docs[sv.doc]) return this.out.toast(actor, `Já tens ${DOC_LABEL[sv.doc]}.`, false);
    if (sv.needsDoc && !e.life.docs[sv.needsDoc]) return this.out.toast(actor, `Primeiro precisas do ${DOC_LABEL[sv.needsDoc]}.`, false);
    if (sv.energy && sv.energy < 0 && e.life.needs.energy < -sv.energy) return this.out.toast(actor, "Estás cansado(a) demais. Vai dormir primeiro.", false);
    const covered = this.insured(e) && (sv.venue === "saude" || sv.id === "medicamentos");
    const price = covered ? 0 : sv.price;
    if (price > 0) e.money = await this.wallets.apply(actor.characterId, -price, `service.${sv.id}`, `service:${actor.characterId}:${this.op()}:${sv.id}`);
    this.venueRevenue(actor, price);
    if (sv.doc) e.life.docs[sv.doc] = true;
    if (sv.credit) e.life.phoneCredit += sv.credit;
    const n = e.life.needs;
    const c = (v: number) => Math.max(0, Math.min(100, v));
    const nowT = this.now();
    const boost =
      (sv.venue === "igreja" && (hasEvent(nowT, "missa") || hasEvent(nowT, "finados") || hasEvent(nowT, "natal"))) ||
      (sv.venue === "discoteca" && (hasEvent(nowT, "sexta") || hasEvent(nowT, "carnaval") || hasEvent(nowT, "passagem")))
        ? 2
        : 1;
    e.life.needs = { hunger: n.hunger, mood: c(n.mood + (sv.mood ?? 0) * boost), health: c(n.health + (sv.health ?? 0)), energy: c(n.energy + (sv.energy ?? 0)) };
    e.dirty = true;
    this.out.toast(actor, price > 0 ? `${sv.name}: feito (−${price.toLocaleString("pt-PT")} Kz).` : covered ? `${sv.name}: feito (pago pelo seguro).` : `${sv.name}: feito.`, true);
    this.mission(actor, e, "servico");
    // consultas e medicamentos curam
    const d = e.life.doenca;
    if (d && (sv.id === "consulta" || (sv.id === "medicamentos" && DOENCAS[d.id]?.curaFarmacia))) {
      e.life.doenca = null;
      this.out.toast(actor, `Estás curado/a da ${DOENCAS[d.id]?.name.toLowerCase() ?? "doença"}.`, true);
    } else if (d && sv.id === "medicamentos") {
      this.out.toast(actor, "Para o paludismo os medicamentos da farmácia não chegam: faz uma consulta.", false);
    }
    // ocorrência na esquadra: a polícia recupera metade do que foi roubado (se foi há pouco)
    const r = e.life.roubo;
    if (sv.id === "ocorrencia" && r && !r.recovered && this.now() - r.at <= ROUBO_RECOVER_MS) {
      const back = Math.round(r.amount / 2);
      e.money = await this.wallets.apply(actor.characterId, back, "policia.recuperado", `roubo-rec:${actor.characterId}:${r.at}`);
      r.recovered = true;
      this.out.toast(actor, `A polícia apanhou o ladrão e devolveu-te ${back.toLocaleString("pt-PT")} Kz.`, true);
    }
  }

  private async travel(actor: LifeActor, e: Entry, to: string | undefined, how: string | undefined): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    if (interiorAt(this.district, actor.x, actor.y)) return this.out.toast(actor, "Sai primeiro para a rua.", false);
    const d = getDistrict(to ?? "");
    if (!d || d.id === this.district.id || !d.places?.length) return this.out.toast(actor, "Esse bairro não existe.", false);
    // a pé, no fim da rua que dá para esse bairro: grátis
    const onFoot = this.near(actor, (p) => p.kind === "portal" && p.to === d.id);
    const tr = TRANSPORTS.find((x) => x.id === how) ?? TRANSPORTS.find((x) => x.id === "candongueiro")!;
    if (tr.id === "carro" && !e.life.car) return this.out.toast(actor, "Ainda não tens carro. Compra um no telemóvel → Loja.", false);
    if (!onFoot) {
      // como no Vida na Banda: transporte público só na 🚏 paragem do bairro; o carro, à porta de casa
      const atStop = this.near(actor, (p) => p.kind === "stop");
      const atHome = tr.id === "carro" && this.near(actor, (p) => p.kind === "door" && (p.interiors ?? []).some((u) => e.homes.some((h) => h.unit === u)), 6);
      if (tr.id === "carro" ? !atHome && !atStop : !atStop)
        return this.out.toast(actor, tr.id === "carro" ? "O teu carro está à porta de casa." : "Vai à 🚏 paragem do bairro para apanhar transporte.", false);
    }
    if (!onFoot) {
      e.money = await this.wallets.apply(actor.characterId, -tr.price, `travel.${tr.id}`, `travel:${actor.characterId}:${this.op()}`);
    }
    e.travel = { district: d.id, n: (e.travel?.n ?? 0) + 1, from: this.district.id, onFoot: !!onFoot, ...(onFoot ? {} : { by: tr.id, seconds: tr.seconds }) };
    e.dirty = true;
    this.out.toast(actor, onFoot ? `A caminho de ${d.name} a pé.` : `${tr.name} para ${d.name} (−${tr.price.toLocaleString("pt-PT")} Kz).`, true);
    this.mission(actor, e, "viajar");
  }

  private async buyCar(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const car = CARS.find((c) => c.id === id);
    if (!car) return this.out.toast(actor, "Esse carro não existe.", false);
    if (e.life.car === car.id) return this.out.toast(actor, "Já tens este carro.", false);
    if (!e.homes.length) return this.out.toast(actor, "Primeiro precisas de uma casa para estacionar o carro.", false);
    e.money = await this.wallets.apply(actor.characterId, -car.price, `car.${car.id}`, `car:${actor.characterId}:${this.op()}`);
    e.life.car = car.id;
    e.dirty = true;
    recordNews("carro", this.district.name, `${actor.name ?? "Alguém"} comprou um ${car.name} (${this.district.name}).`, this.now());
    this.out.toast(actor, `Compraste: ${car.name}. Está estacionado à porta de casa.`, true);
  }

  private async homeEat(actor: LifeActor, e: Entry): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    if (!this.near(actor, (p) => p.kind === "home_eat") || !this.ownsInterior(e, interiorAt(this.district, actor.x, actor.y)))
      return this.out.toast(actor, "Só podes cozinhar na cozinha da tua casa.", false);
    e.money = await this.wallets.apply(actor.characterId, -HOME_MEAL.price, "food.casa", `food:${actor.characterId}:${this.op()}:casa`);
    e.life.needs = applyFood(e.life.needs, { ...HOME_MEAL });
    e.dirty = true;
    this.out.toast(actor, `Cozinhaste em casa (−${HOME_MEAL.price} Kz).`, true);
  }

  // ---------------------------------------------------------------- relógio

  /** Chamar várias vezes por segundo: conclui ações com tempo e aplica o desgaste. */
  async tick(): Promise<void> {
    const t = this.now();
    for (const [actor, e] of this.entries) {
      if (!e.busy) continue;
      // afastou-se: interrompe (quem está detido/a não se livra a andar)
      if (e.busy.kind !== "preso" && Math.hypot(actor.x - e.busy.x, actor.y - e.busy.y) > 60) {
        e.busy = null;
        this.out.toast(actor, "Interrompeste o que estavas a fazer.", false);
        this.sendSelf(actor);
        continue;
      }
      if (t < e.busy.until) continue;
      const kind = e.busy.kind;
      const item = e.busy.item;
      e.busy = null;
      await this.finish(actor, e, kind, item);
      this.sendSelf(actor);
    }
    this.lastDecay ??= t;
    if (t - this.lastDecay >= 10_000) {
      // limite: um processo parado não aplica horas de desgaste de uma vez
      const minutes = Math.min(2, (t - this.lastDecay) / 60_000);
      this.lastDecay = t;
      for (const [actor, e] of this.entries) {
        e.life.needs = decay(e.life.needs, minutes);
        this.healthAndCrime(actor, e, minutes, t);
        e.life.forma = Math.max(0, e.life.forma - FORMA_DECAY * minutes);
        // filhos menores sem cuidados há mais de um dia: a consciência pesa (humor desce)
        if (e.life.filhos.some((f) => faseDe(idadeAnos(f, t)) && f.cuidadoDia !== angolaDay(t) && f.cuidadoDia !== angolaDay(t - 86_400_000)))
          e.life.needs = { ...e.life.needs, mood: Math.max(0, e.life.needs.mood - 0.3 * minutes) };
        // estar perto do par anima
        const pa = e.life.partner ? this.actorById(e.life.partner.id) : undefined;
        if (pa && Math.hypot(pa.x - actor.x, pa.y - actor.y) < 600) e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + 1.5 * minutes) };
        // chuva na rua estraga o humor (dentro de casa ou de um edifício não)
        const sky = weatherAt(t).ceu;
        if ((sky === "chuva" || sky === "trovoada") && !interiorAt(this.district, actor.x, actor.y))
          e.life.needs = { ...e.life.needs, mood: Math.max(0, e.life.needs.mood - 0.6 * minutes) };
        e.dirty = true;
        const i = interiorAt(this.district, actor.x, actor.y);
        if (i && RESIDENTIAL.has(i.venue)) this.evictIfNeeded(actor, e);
        this.sendSelf(actor);
      }
    }
  }

  private async finish(actor: LifeActor, e: Entry, kind: Busy["kind"], item?: string): Promise<void> {
    const n = e.life.needs;
    e.dirty = true;
    if (kind === "loja") {
      await this.shopShiftEnd(actor, e);
      return;
    }
    if (kind === "preso") {
      this.out.toast(actor, "Foste libertado/a. Juízo, hein!", true);
      return;
    }
    if (kind === "work") {
      const job = jobById(e.life.jobId);
      if (!job) return;
      rollDay(e.life, this.now());
      const idx = e.life.shiftsCount;
      const before = careerLevel(job, e.life.carreira[job.id] ?? 0, e.life.education);
      const level = CARREIRA[before]!;
      const pay = Math.round(job.pay * level.mult * shiftFactor(idx) * (isHoliday(this.now()) ? 1.5 : 1)); // nível da carreira; feriado +50%
      e.money = await this.wallets.apply(actor.characterId, pay, `work.${job.id}`, `shift:${actor.characterId}:${e.life.shiftsDay}:${idx}`);
      e.life.shiftsCount = idx + 1;
      e.life.needs = { ...n, energy: Math.max(0, n.energy - 12), hunger: Math.max(0, n.hunger - 8) };
      const note = (idx >= 2 ? ` (turno ${idx + 1} do dia: ${Math.round(shiftFactor(idx) * 100)}%)` : "") + (isHoliday(this.now()) ? " · feriado +50%" : "");
      this.out.toast(actor, `Turno concluído: +${pay.toLocaleString("pt-PT")} Kz${note}.`, true);
      // experiência: um turno a mais nesta carreira; ao passar um patamar, promoção
      e.life.carreira[job.id] = (e.life.carreira[job.id] ?? 0) + 1;
      this.assocAdd(actor, e, ASSOC_POINTS.turno);
      const after = careerLevel(job, e.life.carreira[job.id]!, e.life.education);
      if (after > before) {
        const nv = CARREIRA[after]!;
        this.out.toast(actor, `Promoção! Agora és ${nv.titulo} — ${job.name}. O salário passa a ${Math.round(job.pay * nv.mult).toLocaleString("pt-PT")} Kz por turno.`, true);
        recordNews("emprego", this.district.name, `${actor.name ?? "Alguém"} foi promovido/a a ${nv.titulo.toLowerCase()} (${job.name}).`, this.now());
      } else if (before === CARREIRA.length - 2 && (e.life.carreira[job.id] ?? 0) >= CARREIRA[CARREIRA.length - 1]!.turnos && e.life.education < chefeEducation(job)) {
        this.out.toast(actor, `Já tens experiência para chefe, mas precisas de estudos nível ${chefeEducation(job)}.`, false);
      }
      this.mission(actor, e, "trabalhar");
    } else if (kind === "biscato") {
      const b = BISCATOS[item ?? ""];
      if (!b) return;
      const sexta = hasEvent(this.now(), "sexta") ? 1.25 : 1;
      const pay = Math.round(((b.pay[0] + (b.pay[1] - b.pay[0]) * this.rand()) * sexta) / 10) * 10;
      e.money = await this.wallets.apply(actor.characterId, pay, `biscato.${item}`, `biscato:${actor.characterId}:${e.life.biscatosDay}:${e.life.biscatos}`);
      e.life.biscatos += 1;
      e.life.needs = { ...n, energy: Math.max(0, n.energy - b.energy), hunger: Math.max(0, n.hunger - 4) };
      this.out.toast(actor, `${b.name}: +${pay.toLocaleString("pt-PT")} Kz (${e.life.biscatos}/${BISCATOS_PER_DAY} hoje).`, true);
      this.mission(actor, e, "biscato");
    } else if (kind === "study" && item === "uni") {
      const u = e.life.uni;
      if (!u.curso) return;
      u.aulas += 1;
      e.life.needs = { ...n, energy: Math.max(0, n.energy - 8) };
      this.mission(actor, e, "estudar");
      if (u.aulas >= UNI_LESSONS) {
        const curso = CURSOS[u.curso]?.name ?? u.curso;
        if (!u.licenciaturas.includes(u.curso)) u.licenciaturas.push(u.curso);
        u.curso = null;
        u.aulas = 0;
        recordNews("missoes", this.district.name, `${actor.name ?? "Alguém"} licenciou-se em ${curso} no Instituto Superior Politécnico do Huambo!`, this.now());
        this.out.toast(actor, `Parabéns! És licenciado/a em ${curso}. Vê as vagas novas.`, true);
      } else {
        this.out.toast(actor, `Aula concluída (${u.aulas}/${UNI_LESSONS}).`, true);
      }
    } else if (kind === "study") {
      this.mission(actor, e, "estudar");
      e.life.study += 1;
      if (e.life.study >= LESSONS_PER_LEVEL) {
        e.life.study = 0;
        e.life.education = Math.min(MAX_EDUCATION, e.life.education + 1);
        this.out.toast(actor, `Subiste para estudos nível ${e.life.education}!`, true);
      } else {
        this.out.toast(actor, `Aula concluída (${e.life.study}/${LESSONS_PER_LEVEL}).`, true);
      }
      e.life.needs = { ...n, energy: Math.max(0, n.energy - 8) };
    } else if (kind === "sleep") {
      e.life.needs = { ...n, energy: 100, mood: Math.min(100, n.mood + 10) };
      this.out.toast(actor, "Dormiste bem no hotel.", true);
      this.mission(actor, e, "dormir");
    } else if (kind === "sleep_casa") {
      e.life.needs = { ...n, energy: 100, mood: Math.min(100, n.mood + 15) };
      this.out.toast(actor, "Dormiste na tua cama. Não há nada como a nossa casa.", true);
      this.mission(actor, e, "dormir");
    } else if (kind === "sleep_rua") {
      e.life.needs = { ...n, energy: Math.min(100, n.energy + 40), mood: Math.max(0, n.mood - 15) };
      this.out.toast(actor, "Dormiste no banco da paragem. Estás com o corpo dorido.", true);
    }
  }

  // ---------------------------------------------------------------- roupa, SMS, conquistas

  /** Roupa de fardo: compra-se nas bancas do mercado e fica no guarda-roupa. */
  private async buyClothes(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const r = ROUPAS[idx];
    if (!r) return this.out.toast(actor, "Essa roupa não existe.", false);
    const inside = interiorAt(this.district, actor.x, actor.y);
    if (!(this.near(actor, (p) => p.kind === "door" && p.venue === "mercado", 2) || inside?.venue === "mercado"))
      return this.out.toast(actor, "Roupa de fardo compra-se nas bancas do mercado.", false);
    if (e.life.roupas.includes(r.hue)) return this.wear(actor, e, r.hue);
    e.money = await this.wallets.apply(actor.characterId, -r.price, "roupa.compra", `roupa:${actor.characterId}:${r.hue}`);
    e.life.roupas.push(r.hue);
    e.dirty = true;
    this.out.toast(actor, `Compraste: ${r.name} (−${r.price.toLocaleString("pt-PT")} Kz).`, true);
    this.wear(actor, e, r.hue);
  }

  private wear(actor: LifeActor, e: Entry, hue: number): void {
    if (!e.life.roupas.includes(hue)) return this.out.toast(actor, "Essa roupa não é tua. Compra no mercado.", false);
    this.out.appearance?.(actor, hue);
    this.out.toast(actor, hue < 0 ? "Vestiste a tua roupa de sempre." : `Vestiste: ${ROUPAS.find((x) => x.hue === hue)?.name ?? "roupa nova"}.`, true);
  }

  /** SMS a um amigo (em qualquer bairro), pago com saldo do telemóvel. */
  private sendSms(actor: LifeActor, e: Entry, idx: number, raw: string | undefined): void {
    const f = e.life.friends[idx];
    if (!f) return this.out.toast(actor, "Escolhe um amigo da lista.", false);
    if (mutedUntil(actor.characterId, this.now())) return this.out.toast(actor, `Estás silenciado/a pela moderação ${untilText(mutedUntil(actor.characterId, this.now()))}.`, false);
    const text = sanitizeChat(raw)?.slice(0, 120);
    if (!text) return this.out.toast(actor, "Escreve a mensagem.", false);
    if (e.life.phoneCredit < SMS_PRICE) return this.out.toast(actor, "Sem saldo no telemóvel. Carrega na loja de telecomunicações.", false);
    e.life.phoneCredit -= SMS_PRICE;
    e.dirty = true;
    const online = this.out.sms?.(f.id, actor.name ?? "Amigo", text, actor.characterId) ?? false;
    if (!online) this.store(f.id, { kind: "sms", from: actor.name ?? "Amigo", fromId: actor.characterId, text, at: this.now() });
    this.out.toast(actor, online ? `SMS enviado a ${f.name}.` : `SMS enviado a ${f.name} (vai ler quando entrar).`, true);
  }

  /** Conquistas: verificadas no estado real; cada uma paga um prémio uma só vez e sai no jornal. */
  private checkAchievements(actor: LifeActor, e: Entry): void {
    const L = e.life;
    const has: Record<string, boolean> = {
      primeiro_emprego: !!L.jobId,
      casa_propria: e.homes.some((h) => h.tenure === "buy"),
      licenciado: L.uni.licenciaturas.length > 0,
      casado: !!L.partner?.married,
      empresario: !!L.negocio,
      agricultor: L.colhidoTotal >= 100,
      viajante: L.visitados.length >= 10,
      milionario: e.money + e.bank >= 1_000_000,
      popular: L.friends.length >= 5,
      elegante: L.roupas.filter((h) => h >= 0).length >= 4,
      criador: L.criacao.vendidos >= 10,
      atleta: L.forma >= 80,
      poupado: L.prazosFeitos > 0,
      sabichao: L.quizCertas >= 20,
      pai_mae: L.filhos.length > 0 || L.geracao > 1,
      geracao: L.geracao > 1,
      promovido: Object.entries(L.carreira).some(([j, n]) => { const jb = jobById(j); return !!jb && careerLevel(jb, n, L.education) >= 1; }),
      chefe: Object.entries(L.carreira).some(([j, n]) => { const jb = jobById(j); return !!jb && careerLevel(jb, n, L.education) >= CARREIRA.length - 1; }),
      generoso: L.presentes >= 5,
    };
    for (const [id, ok] of Object.entries(has)) {
      if (!ok || L.conquistas.includes(id)) continue;
      const c = CONQUISTAS[id]!;
      L.conquistas.push(id);
      e.dirty = true;
      this.out.toast(actor, `Conquista: ${c.name}! Recolhe o prémio no Perfil.`, true);
      recordNews("missoes", this.district.name, `${actor.name ?? "Alguém"} ganhou a conquista «${c.name}».`, this.now());
    }
  }

  /** Recolher os prémios das conquistas ganhas (cada prémio paga-se uma só vez). */
  private async claimAchievements(actor: LifeActor, e: Entry): Promise<void> {
    const L = e.life;
    const due = L.conquistas.filter((id) => !L.conquistasPagas.includes(id));
    if (!due.length) return this.out.toast(actor, "Não tens prémios de conquistas por recolher.", false);
    let total = 0;
    for (const id of due) {
      const c = CONQUISTAS[id]!;
      e.money = await this.wallets.apply(actor.characterId, c.reward, `conquista.${id}`, `conquista:${actor.characterId}:${id}`);
      L.conquistasPagas.push(id);
      total += c.reward;
    }
    e.dirty = true;
    this.out.toast(actor, `Prémios das conquistas: +${total.toLocaleString("pt-PT")} Kz.`, true);
  }

  // ---------------------------------------------------------------- kixikila

  private async kixikila(actor: LifeActor, e: Entry, a: string, n: number): Promise<void> {
    const g = e.life.group;
    if (!g) {
      e.kixi = null;
      if (a !== "kixi_ver") this.out.toast(actor, "A kixikila faz-se com o teu grupo. Entra num grupo primeiro.", false);
      return;
    }
    if (a !== "kixi_ver" && actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para a kixikila precisas de uma conta.", false);
    let k = await this.kixi.byGroup(g.id);
    const me = { id: actor.characterId, name: actor.name ?? "Membro" };
    if (a === "kixi_criar") {
      if (k && k.status !== "acabada") return this.out.toast(actor, "O grupo já tem uma kixikila.", false);
      if (k) await this.kixi.remove(k.id);
      const quota = [1000, 5000, 10000][n - 1];
      if (!quota) return this.out.toast(actor, "Escolhe a quota.", false);
      k = await this.kixi.create(g.id, quota, me);
      this.out.toast(actor, `Kixikila criada: ${quota.toLocaleString("pt-PT")} Kz por volta. Chama o pessoal do grupo para aderir.`, true);
    } else if (a === "kixi_aderir") {
      if (!k) return this.out.toast(actor, "O grupo ainda não tem kixikila.", false);
      const r = await this.kixi.join(k.id, me);
      if (!r) return this.out.toast(actor, k.status !== "aberta" ? "Esta kixikila já começou." : "Já estás nesta kixikila.", false);
      k = r;
      this.out.toast(actor, "Aderiste à kixikila do grupo.", true);
    } else if (a === "kixi_comecar") {
      if (!k) return this.out.toast(actor, "O grupo ainda não tem kixikila.", false);
      const r = await this.kixi.start(k.id, actor.characterId);
      if (!r) return this.out.toast(actor, k.creator !== actor.characterId ? "Só quem criou a kixikila a pode começar." : "Precisam de ser pelo menos 2.", false);
      k = r;
      this.out.toast(actor, "A kixikila começou! Cada um paga a quota da volta; quem está na vez recebe tudo.", true);
    } else if (a === "kixi_pagar") {
      if (!k || k.status !== "a_correr") return this.out.toast(actor, "Não há kixikila a correr.", false);
      if (!k.members.some((m) => m.id === actor.characterId)) return this.out.toast(actor, "Não estás nesta kixikila.", false);
      if (k.paid.includes(actor.characterId)) return this.out.toast(actor, "Já pagaste esta volta.", false);
      const key = `kixi:${k.id}:${k.round}:${actor.characterId}`;
      e.money = await this.wallets.apply(actor.characterId, -k.quota, "kixikila.quota", key);
      const r = await this.kixi.markPaid(k.id, k.round, actor.characterId);
      if (!r) {
        e.money = await this.wallets.apply(actor.characterId, k.quota, "kixikila.devolucao", key + ":devolve");
        return this.out.toast(actor, "A volta mudou entretanto; devolvemos a quota.", false);
      }
      k = r;
      this.out.toast(actor, `Pagaste a quota (${k.quota.toLocaleString("pt-PT")} Kz).`, true);
    } else if (a === "kixi_receber") {
      if (!k || k.status !== "a_correr") return this.out.toast(actor, "Não há kixikila a correr.", false);
      const turn = k.members[k.round % k.members.length];
      if (turn?.id !== actor.characterId) return this.out.toast(actor, `Esta volta é de ${turn?.name ?? "outra pessoa"}.`, false);
      if (k.paid.length < k.members.length) return this.out.toast(actor, `Faltam pagar ${k.members.length - k.paid.length} pessoa(s).`, false);
      const before = await this.kixi.closeRound(k.id, k.round);
      if (!before) return this.out.toast(actor, "Esta volta já foi recebida.", false);
      const pot = before.quota * before.members.length;
      e.money = await this.wallets.apply(actor.characterId, pot, "kixikila.recebe", `kixi:${before.id}:${before.round}:pote`);
      recordNews("grupo", this.district.name, `Kixikila do grupo «${g.name}»: ${actor.name ?? "alguém"} recebeu ${pot.toLocaleString("pt-PT")} Kz.`, this.now());
      this.out.toast(actor, `Recebeste a kixikila: +${pot.toLocaleString("pt-PT")} Kz!`, true);
      k = await this.kixi.byGroup(g.id);
    }
    e.kixi = k;
  }

  // ---------------------------------------------------------------- classificados

  private async listingCreate(actor: LifeActor, e: Entry, item: string | undefined, qty: number, price: number): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para vender nos Classificados precisas de uma conta.", false);
    if (!item || !(item === "usd" || item in CROPS)) return this.out.toast(actor, "Só se vende colheita ou dólares.", false);
    if (!Number.isInteger(qty) || qty < 1) return this.out.toast(actor, "Indica a quantidade.", false);
    if (!Number.isInteger(price) || price < 100 || price > 1_000_000) return this.out.toast(actor, "O preço tem de estar entre 100 e 1.000.000 Kz.", false);
    if ((await this.listings.countOpen(actor.characterId)) >= 5) return this.out.toast(actor, "Já tens 5 anúncios abertos.", false);
    const have = item === "usd" ? e.life.usd : e.life.colheita[item] ?? 0;
    if (have < qty) return this.out.toast(actor, "Não tens isso tudo.", false);
    // o que se vende fica guardado no anúncio (não se vende duas vezes)
    if (item === "usd") e.life.usd -= qty;
    else {
      e.life.colheita[item] = have - qty;
      if (e.life.colheita[item] === 0) delete e.life.colheita[item];
    }
    e.dirty = true;
    await this.listings.create({ seller: actor.characterId, sellerName: actor.name ?? "Vendedor", bairro: this.district.name, item, qty, price });
    this.out.toast(actor, `Anúncio publicado: ${qty} ${item === "usd" ? "USD" : "kg de " + CROPS[item]!.name} por ${price.toLocaleString("pt-PT")} Kz.`, true);
  }

  private async listingBuy(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para comprar nos Classificados precisas de uma conta.", false);
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const open = (await this.listings.open(200)).find((l) => l.id === id);
    if (!open) return this.out.toast(actor, "Esse anúncio já não está disponível.", false);
    if (open.seller === actor.characterId) return this.out.toast(actor, "Esse anúncio é teu.", false);
    const key = `classif:${id}`;
    e.money = await this.wallets.apply(actor.characterId, -open.price, "classificados.compra", `${key}:paga:${actor.characterId}`);
    const l = await this.listings.take(id, actor.characterId);
    if (!l) {
      e.money = await this.wallets.apply(actor.characterId, open.price, "classificados.devolucao", `${key}:devolve:${actor.characterId}`);
      return this.out.toast(actor, "Alguém comprou primeiro. Devolvemos o teu dinheiro.", false);
    }
    await this.wallets.apply(l.seller, l.price, "classificados.venda", `${key}:recebe`);
    if (l.item === "usd") e.life.usd += l.qty;
    else e.life.colheita[l.item] = (e.life.colheita[l.item] ?? 0) + l.qty;
    e.dirty = true;
    this.out.toast(actor, `Compraste ${l.qty} ${l.item === "usd" ? "USD" : "kg de " + (CROPS[l.item]?.name ?? l.item)} a ${l.sellerName}.`, true);
    const seller = this.actorById(l.seller);
    if (seller) {
      const se = this.entries.get(seller)!;
      se.money = await this.wallets.balance(seller.characterId);
      this.out.toast(seller, `Vendeste nos Classificados: +${l.price.toLocaleString("pt-PT")} Kz.`, true);
      this.sendSelf(seller);
    } else {
      const text = `Vendeste ${l.qty} ${l.item === "usd" ? "USD" : "kg"} por ${l.price} Kz.`;
      if (!this.out.sms?.(l.seller, "Classificados", text)) this.store(l.seller, { kind: "sms", from: "Classificados", text, at: this.now() });
    }
  }

  private async listingCancel(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const l = await this.listings.cancel(id, actor.characterId);
    if (!l) return this.out.toast(actor, "Esse anúncio já não está aberto.", false);
    if (l.item === "usd") e.life.usd += l.qty;
    else e.life.colheita[l.item] = (e.life.colheita[l.item] ?? 0) + l.qty;
    e.dirty = true;
    this.out.toast(actor, "Anúncio retirado: voltou para ti.", true);
  }

  // ---------------------------------------------------------------- Muxima

  private async post(actor: LifeActor, raw: string | undefined): Promise<void> {
    const text = sanitizeChat(raw)?.slice(0, 160);
    if (!text || text.length < 2) return this.out.toast(actor, "Escreve alguma coisa para publicar.", false);
    const t = this.now();
    const times = (this.postTimes.get(actor.characterId) ?? []).filter((x) => t - x < 3_600_000);
    if (times.length >= 5) return this.out.toast(actor, "Já publicaste muito nesta hora. Volta mais logo!", false);
    times.push(t);
    this.postTimes.set(actor.characterId, times);
    await this.posts.create(actor.characterId, actor.name ?? "Alguém", this.district.name, text);
    this.out.toast(actor, "Publicado no Muxima!", true);
  }

  private async likePost(actor: LifeActor, id: string | undefined): Promise<void> {
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    const ok = await this.posts.like(id, actor.characterId);
    if (!ok) this.out.toast(actor, "Já gostaste desta publicação.", false);
  }

  // ---------------------------------------------------------------- universidade e saúde

  private uniPick(actor: LifeActor, e: Entry, curso: string | undefined): void {
    if (!curso || !CURSOS[curso]) return this.out.toast(actor, "Esse curso não existe.", false);
    if (e.life.education < MAX_EDUCATION) return this.out.toast(actor, "Para a Universidade precisas de acabar os estudos (nível máximo) na escola.", false);
    if (e.life.uni.licenciaturas.includes(curso)) return this.out.toast(actor, "Já és licenciado/a nesse curso.", false);
    if (e.life.uni.curso && e.life.uni.curso !== curso && e.life.uni.aulas > 0) this.out.toast(actor, "Mudaste de curso: as aulas do outro curso perdem-se.", false);
    e.life.uni = { ...e.life.uni, curso, aulas: e.life.uni.curso === curso ? e.life.uni.aulas : 0 };
    e.dirty = true;
    this.out.toast(actor, `Inscreveste-te em ${CURSOS[curso]!.name}. As aulas são no Instituto Superior Politécnico (Bairro Académico).`, true);
  }

  private async uniLesson(actor: LifeActor, e: Entry): Promise<void> {
    if (e.life.education < MAX_EDUCATION) return this.out.toast(actor, "Para a Universidade precisas de acabar os estudos na escola.", false);
    if (!e.life.uni.curso) return this.out.toast(actor, "Primeiro escolhe um curso (app Estudos no telemóvel).", false);
    e.money = await this.wallets.apply(actor.characterId, -UNI_PRICE, "uni.propina", `uni:${actor.characterId}:${this.op()}`);
    this.startBusy(actor, e, "study");
    const busy = e.busy as Busy | null;
    if (busy) busy.item = "uni";
  }

  /** Doente demais para trabalhar/estudar? (avisa) */
  private tooSick(actor: LifeActor, e: Entry): boolean {
    const d = e.life.doenca ? DOENCAS[e.life.doenca.id] : undefined;
    if (d?.blocks) {
      this.out.toast(actor, d.texto, false);
      return true;
    }
    return false;
  }

  /** A cada minuto de jogo: adoecer (chuva, paludismo à noite na época das chuvas), sintomas, cura natural; assaltos à noite. */
  private healthAndCrime(actor: LifeActor, e: Entry, minutes: number, t: number): void {
    const outside = !interiorAt(this.district, actor.x, actor.y);
    const w = weatherAt(t);
    const hour = new Date(t + 3600_000).getUTCHours();
    const night = hour >= 21 || hour < 5;
    // quem está em forma adoece menos (até metade com forma 100)
    const fit = 1 - e.life.forma / 200;
    const p = (perMin: number) => this.rand() < 1 - Math.pow(1 - perMin * fit, minutes);
    if (!e.life.doenca && outside) {
      if ((w.ceu === "chuva" || w.ceu === "trovoada" || (w.epoca === "cacimbo" && night)) && p(0.012)) {
        e.life.doenca = { id: "gripe", since: t };
        this.out.toast(actor, "Apanhaste uma gripe. Na farmácia há medicamentos.", false);
      } else if (w.epoca === "chuvas" && night && p(0.004)) {
        e.life.doenca = { id: "paludismo", since: t };
        this.out.toast(actor, "Picada de mosquito: estás com paludismo! Vai ao centro de saúde ou ao hospital.", false);
      }
    }
    const d = e.life.doenca ? DOENCAS[e.life.doenca.id] : undefined;
    if (d) {
      const n = e.life.needs;
      e.life.needs = {
        ...n,
        energy: Math.max(0, n.energy - d.energy * minutes),
        mood: Math.max(0, n.mood - d.mood * minutes),
        health: Math.max(0, n.health - d.health * minutes),
      };
      if (d.selfHealMin !== null && t - e.life.doenca!.since > d.selfHealMin * 60_000) {
        e.life.doenca = null;
        this.out.toast(actor, "Já estás melhor da gripe.", true);
      }
    }
    // assalto: à noite, na rua, com muito dinheiro na carteira
    if (outside && night && e.money >= ROUBO_MIN_WALLET && p(0.01)) {
      const amount = Math.min(ROUBO_MAX, Math.round(e.money * 0.2));
      const key = `roubo:${actor.characterId}:${t}`;
      void this.wallets.apply(actor.characterId, -amount, "roubo", key).then((m) => {
        e.money = m;
        e.life.roubo = { amount, at: t, recovered: false };
        e.dirty = true;
        recordNews("sorte", this.district.name, `Assalto à noite em ${this.district.name}: levaram ${amount.toLocaleString("pt-PT")} Kz a ${actor.name ?? "um morador"}. A polícia pede para guardarem o dinheiro no banco.`, t);
        this.out.toast(actor, `Foste assaltado/a! Levaram ${amount.toLocaleString("pt-PT")} Kz. Vai à esquadra registar a ocorrência (até 30 min).`, false);
        this.sendSelf(actor);
      }).catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------- namoro e casamento

  private actorById(characterId: string): LifeActor | undefined {
    for (const a of this.entries.keys()) if (a.characterId === characterId) return a;
    return undefined;
  }

  private loveAsk(actor: LifeActor, e: Entry, toEid: string | undefined): void {
    const target = this.byEid(toEid);
    if (!target || target === actor) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    if (Math.hypot(target.x - actor.x, target.y - actor.y) > TRANSFER_NEAR_CM) return this.out.toast(actor, "Aproxima-te da pessoa (assim não, de longe!).", false);
    if (this.blocks(target, actor.characterId) || this.blocks(actor, target.characterId)) return this.out.toast(actor, "Não podes enviar pedidos a essa pessoa.", false);
    if (e.life.partner) return this.out.toast(actor, `Já tens par: ${e.life.partner.name}.`, false);
    const te = this.entries.get(target)!;
    if (te.life.partner) return this.out.toast(actor, `${target.name ?? "Essa pessoa"} já tem par.`, false);
    te.loveReq = { from: actor };
    this.out.toast(actor, `Pediste ${target.name ?? "alguém"} em namoro. Agora é esperar a resposta…`, true);
    this.out.toast(target, `${actor.name ?? "Alguém"} pediu-te em namoro! Responde em Família no telemóvel.`, true);
    this.sendSelf(target);
  }

  private loveAnswer(actor: LifeActor, e: Entry, yes: boolean): void {
    const req = e.loveReq;
    e.loveReq = undefined;
    if (!req) return this.out.toast(actor, "Não tens pedidos de namoro.", false);
    const fe = this.entries.get(req.from);
    if (!yes) {
      if (fe) this.out.toast(req.from, `${actor.name ?? "A pessoa"} disse que não. Fica para a próxima!`, false);
      return this.out.toast(actor, "Recusaste o pedido.", true);
    }
    if (!fe) return this.out.toast(actor, "Essa pessoa já saiu. Fica para a próxima.", false);
    if (fe.life.partner || e.life.partner) return this.out.toast(actor, "Um de vocês já tem par.", false);
    const t = this.now();
    e.life.partner = { id: req.from.characterId, name: req.from.name ?? "Par", since: t, married: false };
    fe.life.partner = { id: actor.characterId, name: actor.name ?? "Par", since: t, married: false };
    e.dirty = fe.dirty = true;
    this.out.toast(actor, `Agora namoras com ${req.from.name ?? "alguém"}!`, true);
    this.out.toast(req.from, `${actor.name ?? "A pessoa"} aceitou! Agora namoram.`, true);
    this.sendSelf(req.from);
  }

  /** Pedido de casamento: os dois dentro da mesma igreja; paga quem pede (ao aceitar). */
  private weddingAsk(actor: LifeActor, e: Entry): void {
    const p = e.life.partner;
    if (!p) return this.out.toast(actor, "Para casar primeiro tens de namorar.", false);
    if (p.married) return this.out.toast(actor, "Já são casados!", false);
    const i = interiorAt(this.district, actor.x, actor.y);
    if (i?.venue !== "igreja") return this.out.toast(actor, "Casa-se na igreja do bairro: entrem os dois na igreja.", false);
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para casar precisas de uma conta.", false);
    if (this.now() - p.since < WEDDING_MIN_DATING_MS) return this.out.toast(actor, "Ainda é cedo: namorem mais um bocadinho antes de casar.", false);
    const pa = this.actorById(p.id);
    if (!pa || interiorAt(this.district, pa.x, pa.y)?.id !== i.id) return this.out.toast(actor, `${p.name} tem de estar aqui dentro da igreja contigo.`, false);
    const pe = this.entries.get(pa)!;
    pe.weddingReq = { from: actor };
    this.out.toast(actor, `Pediste ${p.name} em casamento! (${WEDDING_PRICE.toLocaleString("pt-PT")} Kz se aceitar)`, true);
    this.out.toast(pa, `${actor.name ?? "O teu par"} pediu-te em casamento! Responde em Família no telemóvel.`, true);
    this.sendSelf(pa);
  }

  private async weddingAnswer(actor: LifeActor, e: Entry, yes: boolean): Promise<void> {
    const req = e.weddingReq;
    e.weddingReq = undefined;
    if (!req) return this.out.toast(actor, "Não tens pedidos de casamento.", false);
    const fe = this.entries.get(req.from);
    if (!yes) {
      if (fe) this.out.toast(req.from, `${actor.name ?? "O teu par"} ainda não quer casar.`, false);
      return this.out.toast(actor, "Disseste que ainda não.", true);
    }
    if (!fe || e.life.partner?.id !== req.from.characterId) return this.out.toast(actor, "O pedido já não vale.", false);
    const i = interiorAt(this.district, actor.x, actor.y);
    if (i?.venue !== "igreja" || interiorAt(this.district, req.from.x, req.from.y)?.id !== i.id) return this.out.toast(actor, "Os dois têm de estar dentro da igreja.", false);
    try {
      fe.money = await this.wallets.apply(req.from.characterId, -WEDDING_PRICE, "casamento", `casamento:${req.from.characterId}:${actor.characterId}:${this.op()}`);
    } catch (err) {
      if (err instanceof InsufficientFunds) {
        this.out.toast(req.from, `Não tens ${WEDDING_PRICE.toLocaleString("pt-PT")} Kz para o casamento.`, false);
        return this.out.toast(actor, "O casamento fica para depois (falta dinheiro para a festa).", false);
      }
      throw err;
    }
    e.life.partner!.married = true;
    fe.life.partner!.married = true;
    e.dirty = fe.dirty = true;
    recordNews("amizade", this.district.name, `Casamento na ${i.name}: ${req.from.name ?? "?"} e ${actor.name ?? "?"} disseram o «sim»!`, this.now());
    this.out.toast(actor, `Casaste com ${req.from.name ?? "o teu par"}! Felicidades!`, true);
    this.out.toast(req.from, `Casaste com ${actor.name ?? "o teu par"}! Felicidades!`, true);
    this.sendSelf(req.from);
  }

  /** Acabar o namoro (frente a frente) ou divorciar (no tribunal ou na administração, paga quem pede). */
  private async breakUp(actor: LifeActor, e: Entry): Promise<void> {
    const p = e.life.partner;
    if (!p) return this.out.toast(actor, "Não tens par.", false);
    const pa = this.actorById(p.id);
    if (!pa) return this.out.toast(actor, `Isso conversa-se frente a frente: espera que ${p.name} esteja no mesmo sítio que tu.`, false);
    if (p.married) {
      const v = interiorAt(this.district, actor.x, actor.y)?.venue;
      if (v !== "tribunal" && v !== "administracao") return this.out.toast(actor, "O divórcio trata-se no Tribunal ou na Administração.", false);
      e.money = await this.wallets.apply(actor.characterId, -DIVORCE_PRICE, "divorcio", `divorcio:${actor.characterId}:${this.op()}`);
    }
    const pe = this.entries.get(pa)!;
    e.life.partner = null;
    pe.life.partner = null;
    e.dirty = pe.dirty = true;
    this.out.toast(actor, p.married ? "Divórcio tratado. Cada um segue o seu caminho." : "Acabaste o namoro.", true);
    this.out.toast(pa, p.married ? `${actor.name ?? "O teu par"} pediu o divórcio.` : `${actor.name ?? "O teu par"} acabou o namoro.`, false);
    this.sendSelf(pa);
  }

  // ---------------------------------------------------------------- negócios

  private async businessOpen(actor: LifeActor, e: Entry, tipo: string | undefined): Promise<void> {
    const n = NEGOCIOS[tipo ?? ""];
    if (!n) return this.out.toast(actor, "Esse negócio não existe.", false);
    if (e.life.negocio) return this.out.toast(actor, "Já tens um negócio. Vende-o primeiro para abrir outro.", false);
    if (interiorAt(this.district, actor.x, actor.y)?.venue !== "administracao") return this.out.toast(actor, "O alvará do negócio tira-se na Administração do bairro.", false);
    if (!e.life.docs.bi) return this.out.toast(actor, "Para abrir um negócio precisas de BI.", false);
    e.money = await this.wallets.apply(actor.characterId, -n.cost, `negocio.abrir.${tipo}`, `negocio:${actor.characterId}:${this.op()}`);
    e.life.negocio = { tipo: tipo!, nivel: 1, lastCollect: this.now(), investido: n.cost };
    e.dirty = true;
    recordNews("missoes", this.district.name, `${actor.name ?? "Alguém"} abriu um negócio: ${n.name} (${this.district.name}).`, this.now());
    this.out.toast(actor, `Abriste: ${n.name}. Rende ${negocioPerHour(tipo!, 1).toLocaleString("pt-PT")} Kz por hora.`, true);
  }

  private businessPending(e: Entry): number {
    const b = e.life.negocio;
    if (!b) return 0;
    const hours = Math.min(NEGOCIO_MAX_HOURS, Math.max(0, (this.now() - b.lastCollect) / 3_600_000));
    return Math.floor(hours * negocioPerHour(b.tipo, b.nivel));
  }

  private async businessCollect(actor: LifeActor, e: Entry): Promise<void> {
    const b = e.life.negocio;
    if (!b) return this.out.toast(actor, "Ainda não tens negócio.", false);
    const amount = this.businessPending(e);
    if (amount < 1) return this.out.toast(actor, "Ainda não há lucro para recolher.", false);
    e.money = await this.wallets.apply(actor.characterId, amount, `negocio.lucro.${b.tipo}`, `negocio-lucro:${actor.characterId}:${b.lastCollect}`);
    b.lastCollect = this.now();
    e.dirty = true;
    this.out.toast(actor, `Lucro do negócio: +${amount.toLocaleString("pt-PT")} Kz.`, true);
  }

  private async businessUpgrade(actor: LifeActor, e: Entry): Promise<void> {
    const b = e.life.negocio;
    if (!b) return this.out.toast(actor, "Ainda não tens negócio.", false);
    if (b.nivel >= NEGOCIO_MAX_NIVEL) return this.out.toast(actor, "O teu negócio já está no máximo.", false);
    await this.businessCollect(actor, e).catch(() => undefined); // recolhe antes de mudar o rendimento
    const cost = negocioUpgradeCost(b.tipo, b.nivel);
    e.money = await this.wallets.apply(actor.characterId, -cost, `negocio.melhorar.${b.tipo}`, `negocio-up:${actor.characterId}:${b.nivel}:${this.op()}`);
    b.nivel += 1;
    b.investido += cost;
    e.dirty = true;
    this.out.toast(actor, `Negócio melhorado para o nível ${b.nivel}: ${negocioPerHour(b.tipo, b.nivel).toLocaleString("pt-PT")} Kz/hora.`, true);
  }

  private async businessSell(actor: LifeActor, e: Entry): Promise<void> {
    const b = e.life.negocio;
    if (!b) return this.out.toast(actor, "Ainda não tens negócio.", false);
    const pending = this.businessPending(e);
    const value = Math.round(b.investido * 0.5) + pending;
    e.money = await this.wallets.apply(actor.characterId, value, `negocio.venda.${b.tipo}`, `negocio-venda:${actor.characterId}:${b.lastCollect}:${b.investido}`);
    e.life.negocio = null;
    e.dirty = true;
    this.out.toast(actor, `Vendeste o negócio por ${value.toLocaleString("pt-PT")} Kz.`, true);
  }

  // ---------------------------------------------------------------- imóveis

  private async listHousing(e: Entry): Promise<void> {
    const t = this.now();
    const out: NonNullable<Entry["imoveis"]> = [];
    for (const d of this.district.places ?? []) {
      if (d.kind !== "door" || !RESIDENTIAL.has(d.venue ?? "") || !d.interiors?.length) continue;
      let free = 0;
      for (const id of d.interiors) if (!(await this.properties.get(this.district.id, id, t))) free++;
      const price = HOUSING[d.venue ?? ""] ?? { buy: 0, rentPerDay: 0 };
      out.push({ door: d.id, name: d.name, venue: d.venue ?? "", free, total: d.interiors.length, buy: price.buy, rentPerDay: price.rentPerDay, x: d.x, y: d.y });
    }
    e.imoveis = out.sort((a, b) => b.free - a.free || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- criação de animais

  private atMarket(actor: LifeActor): boolean {
    const inside = interiorAt(this.district, actor.x, actor.y);
    return !!this.near(actor, (p) => p.kind === "door" && p.venue === "mercado", 2) || inside?.venue === "mercado";
  }

  /** Ovos postos desde a última contagem: só enquanto as galinhas estão alimentadas. */
  private tallyEggs(e: Entry): void {
    const c = e.life.criacao;
    const t = this.now();
    const hens = c.animais.filter((a) => ANIMAIS[a.tipo]?.ovos).length;
    if (hens === 0) {
      c.ovosAt = t;
      return;
    }
    const end = Math.min(t, c.fedUntil); // com fome não põem
    if (end <= c.ovosAt) return;
    const laid = Math.floor((end - c.ovosAt) / (OVO_MIN * 60_000));
    if (laid > 0) {
      c.ovos = Math.min(hens * OVOS_MAX, c.ovos + laid * hens);
      c.ovosAt += laid * OVO_MIN * 60_000;
    }
  }

  private async animalBuy(actor: LifeActor, e: Entry, tipo: string | undefined): Promise<void> {
    const a = ANIMAIS[tipo ?? ""];
    if (!a) return this.out.toast(actor, "Esse animal não se vende no mercado.", false);
    if (!this.atMarket(actor)) return this.out.toast(actor, "Os animais compram-se no mercado do bairro.", false);
    const c = e.life.criacao;
    if (c.animais.length >= MAX_ANIMAIS) return this.out.toast(actor, `O quintal já tem ${MAX_ANIMAIS} animais.`, false);
    const price = Math.round(a.price * (await this.marketFactor(tipo!))); // mercado vivo: muita procura encarece
    if (e.money < price) return this.out.toast(actor, `Precisas de ${price.toLocaleString("pt-PT")} Kz.`, false);
    this.tallyEggs(e);
    e.money = await this.wallets.apply(actor.characterId, -price, `criacao.compra.${tipo}`, `criacao:${actor.characterId}:${this.op()}`);
    this.marketTrade(tipo!, -1);
    c.animais.push({ tipo: tipo!, desde: this.now() });
    if (c.animais.length === 1) c.ovosAt = this.now();
    e.dirty = true;
    this.out.toast(actor, `Compraste ${a.name.toLowerCase() === "galinha" ? "uma galinha" : "um " + a.name.toLowerCase()} (−${price.toLocaleString("pt-PT")} Kz). Não te esqueças da ração.`, true);
  }

  private async animalFeed(actor: LifeActor, e: Entry): Promise<void> {
    const c = e.life.criacao;
    if (!c.animais.length) return this.out.toast(actor, "Não tens animais. Compra-os no mercado.", false);
    const cost = RACAO_PRICE * c.animais.length;
    if (e.money < cost) return this.out.toast(actor, `A ração custa ${cost.toLocaleString("pt-PT")} Kz.`, false);
    this.tallyEggs(e);
    const t = this.now();
    if (c.fedUntil - t > FEED_MIN * 60_000 * 0.5) return this.out.toast(actor, "Os animais ainda estão de barriga cheia.", false);
    e.money = await this.wallets.apply(actor.characterId, -cost, "criacao.racao", `racao:${actor.characterId}:${this.op()}`);
    if (c.fedUntil < t) c.ovosAt = t;
    c.fedUntil = t + FEED_MIN * 60_000;
    e.dirty = true;
    this.out.toast(actor, `Deste ração aos animais (−${cost.toLocaleString("pt-PT")} Kz). Ficam bem durante ${FEED_MIN / 60} horas.`, true);
  }

  private animalEggs(actor: LifeActor, e: Entry): void {
    this.tallyEggs(e);
    const c = e.life.criacao;
    if (c.ovos <= 0) return this.out.toast(actor, "Ainda não há ovos. Galinhas alimentadas põem um ovo a cada " + OVO_MIN + " min.", false);
    this.out.toast(actor, `Tens ${c.ovos} ovos guardados. Vende-os no mercado (${OVO_PRICE} Kz cada).`, true);
  }

  /** Vender um animal crescido (por tipo) ou os ovos ("ovos"), no mercado. */
  private async animalSell(actor: LifeActor, e: Entry, what: string | undefined): Promise<void> {
    if (!this.atMarket(actor)) return this.out.toast(actor, "Vende-se no mercado do bairro.", false);
    this.tallyEggs(e);
    const c = e.life.criacao;
    const t = this.now();
    const feira = hasEvent(t, "feira") ? 1.3 : 1;
    if (what === "ovos") {
      if (c.ovos <= 0) return this.out.toast(actor, "Não tens ovos para vender.", false);
      const total = Math.round(c.ovos * OVO_PRICE * (await this.marketFactor("ovos")) * feira);
      e.money = await this.wallets.apply(actor.characterId, total, "criacao.ovos", `ovos:${actor.characterId}:${this.op()}`);
      this.marketTrade("ovos", c.ovos);
      this.assocAdd(actor, e, (total / 100) * ASSOC_POINTS.venda);
      this.out.toast(actor, `Vendeste ${c.ovos} ovos: +${total.toLocaleString("pt-PT")} Kz.`, true);
      c.ovos = 0;
      c.vendidos += 1;
      e.dirty = true;
      return;
    }
    const a = ANIMAIS[what ?? ""];
    if (!a) return this.out.toast(actor, "O que queres vender?", false);
    const idx = c.animais.findIndex((x) => x.tipo === what && t - x.desde >= a.growMin * 60_000);
    if (idx < 0) {
      const young = c.animais.find((x) => x.tipo === what);
      return this.out.toast(actor, young ? `O ${a.name.toLowerCase()} ainda está a crescer: faltam ${Math.ceil((young.desde + a.growMin * 60_000 - t) / 60_000)} min.` : `Não tens ${a.name.toLowerCase()}.`, false);
    }
    const hungry = t > c.fedUntil;
    const total = Math.round(a.sell * (await this.marketFactor(what!)) * (hungry ? FOME_FACTOR : 1) * feira);
    e.money = await this.wallets.apply(actor.characterId, total, `criacao.venda.${what}`, `criacao-venda:${actor.characterId}:${this.op()}`);
    this.marketTrade(what!, 1);
    this.assocAdd(actor, e, (total / 100) * ASSOC_POINTS.venda);
    c.animais.splice(idx, 1);
    c.vendidos += 1;
    e.dirty = true;
    this.out.toast(actor, `Vendeste ${a.name.toLowerCase() === "galinha" ? "uma galinha" : "o " + a.name.toLowerCase()}: +${total.toLocaleString("pt-PT")} Kz${hungry ? " (estava magro de fome)" : ""}.`, true);
  }

  // ---------------------------------------------------------------- mercado vivo

  /** Preço atual ÷ preço normal (1 = normal). Lê o preço fresco na altura da troca. */
  private async marketFactor(item: string): Promise<number> {
    const m = MARKET_ITEMS[item];
    if (!m) return 1;
    try {
      this.marketCache = await this.market.prices(this.now());
      this.marketAt = this.now();
    } catch {
      /* sem base de dados: fica o último preço conhecido */
    }
    return (this.marketCache[item] ?? m.base) / m.base;
  }

  /** Regista a troca no mercado partilhado (falhas não estragam a venda). */
  private marketTrade(item: string, qty: number): void {
    if (!MARKET_ITEMS[item] || !qty) return;
    void this.market
      .trade(item, qty, this.now())
      .then((p) => {
        this.marketCache[item] = p;
      })
      .catch(() => undefined);
  }

  /** Atualiza a cache dos preços para o telemóvel (no máximo uma vez por minuto). */
  private refreshMarket(): void {
    if (this.now() - this.marketAt < 60_000) return;
    this.marketAt = this.now();
    void this.market
      .prices(this.now())
      .then((p) => (this.marketCache = p))
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------- desporto

  private train(actor: LifeActor, e: Entry, id: string | undefined): void {
    const tr = TREINOS[id ?? ""];
    if (!tr) return this.out.toast(actor, "Esse treino não existe.", false);
    const inside = interiorAt(this.district, actor.x, actor.y);
    if (tr.rua && inside) return this.out.toast(actor, "Sai para a rua para treinar.", false);
    if (!tr.rua && !(inside && RESIDENTIAL.has(inside.venue))) return this.out.toast(actor, "Os exercícios fazem-se em casa.", false);
    const L = e.life;
    const day = angolaDay(this.now());
    if (L.treinosDay !== day) {
      L.treinosDay = day;
      L.treinos = 0;
    }
    if (L.treinos >= TREINOS_POR_DIA) return this.out.toast(actor, "Já treinaste muito hoje. O corpo precisa de descanso.", false);
    if (L.doenca) return this.out.toast(actor, "Estás doente: trata-te primeiro.", false);
    if (L.needs.energy < tr.energy + 5) return this.out.toast(actor, "Estás sem energia para treinar. Descansa ou come.", false);
    const n = L.needs;
    L.needs = { ...n, energy: n.energy - tr.energy, hunger: Math.max(0, n.hunger - tr.hunger), mood: Math.min(100, n.mood + tr.mood), health: Math.min(100, n.health + 2) };
    L.forma = Math.min(100, L.forma + tr.forma);
    L.treinos += 1;
    e.dirty = true;
    this.out.toast(actor, `${tr.name}: forma ${Math.round(L.forma)}/100 (+${tr.forma}).`, true);
  }

  // ---------------------------------------------------------------- depósito a prazo

  private async termOpen(actor: LifeActor, e: Entry, amount: number | undefined, termo: string | undefined): Promise<void> {
    const p = PRAZOS[termo ?? ""];
    if (!p) return this.out.toast(actor, "Escolhe o prazo.", false);
    if (e.life.prazo) return this.out.toast(actor, "Já tens um depósito a prazo. Levanta-o primeiro.", false);
    const n = Math.round(amount ?? 0);
    if (!Number.isFinite(n) || n < PRAZO_MIN || n > PRAZO_MAX)
      return this.out.toast(actor, `O depósito a prazo vai de ${PRAZO_MIN.toLocaleString("pt-PT")} a ${PRAZO_MAX.toLocaleString("pt-PT")} Kz.`, false);
    if (e.money < n) return this.out.toast(actor, "Não tens esse dinheiro na carteira.", false);
    e.money = await this.wallets.apply(actor.characterId, -n, `prazo.abrir.${termo}`, `prazo:${actor.characterId}:${this.op()}`);
    const t = this.now();
    e.life.prazo = { amount: n, start: t, maturesAt: t + p.minutes * 60_000, rate: p.rate, termo: termo! };
    e.dirty = true;
    this.out.toast(actor, `Depósito a prazo de ${n.toLocaleString("pt-PT")} Kz por ${p.name} a ${Math.round(p.rate * 100)}%.`, true);
  }

  private async termClose(actor: LifeActor, e: Entry): Promise<void> {
    const d = e.life.prazo;
    if (!d) return this.out.toast(actor, "Não tens depósito a prazo.", false);
    const ready = this.now() >= d.maturesAt;
    const total = ready ? Math.round(d.amount * (1 + d.rate)) : d.amount;
    e.life.prazo = null; // antes de pagar: um segundo pedido não paga duas vezes
    e.dirty = true;
    e.money = await this.wallets.apply(actor.characterId, total, ready ? "prazo.juros" : "prazo.antecipado", `prazo-fim:${actor.characterId}:${this.op()}`);
    if (ready) e.life.prazosFeitos += 1;
    this.out.toast(
      actor,
      ready ? `Levantaste o depósito com juros: +${total.toLocaleString("pt-PT")} Kz (${(total - d.amount).toLocaleString("pt-PT")} Kz de juros).` : `Levantaste antes do fim do prazo: recebes só os ${total.toLocaleString("pt-PT")} Kz, sem juros.`,
      true,
    );
  }

  // ---------------------------------------------------------------- convites (crescer pelo WhatsApp)

  private turnosTotais(e: Entry): number {
    return Object.values(e.life.carreira).reduce((a, b) => a + b, 0);
  }

  private async inviteLoad(actor: LifeActor, e: Entry): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return;
    try {
      const code = await this.invites.codeFor(actor.characterId, actor.name ?? "");
      const st = await this.invites.stats(actor.characterId);
      const u = await this.invites.usedBy(actor.characterId);
      e.inviteView = { code, ...st, usei: u ? { owner: u.owner, rewarded: u.rewarded } : null };
    } catch {
      /* sem base de dados */
    }
  }

  /** Entrar com o código de quem convidou (uma vez, no início da vida). */
  private async inviteUse(actor: LifeActor, e: Entry, raw: string | undefined): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para usar um convite precisas de uma conta.", false);
    const code = cleanCode(raw);
    if (!code) return this.out.toast(actor, "O código tem 6 letras/números.", false);
    if (this.turnosTotais(e) >= INVITE_MIN_SHIFTS) return this.out.toast(actor, "Os convites são para quem está a começar.", false);
    const o = await this.invites.ownerOf(code);
    if (!o) return this.out.toast(actor, "Esse código não existe.", false);
    if (o.owner === actor.characterId) return this.out.toast(actor, "Esse código é teu!", false);
    if (!(await this.invites.use(actor.characterId, actor.name ?? "", code, o.owner))) return this.out.toast(actor, "Já entraste com um convite.", false);
    this.out.toast(actor, `Convite de ${o.ownerName || "um amigo"} aceite! Faz ${INVITE_MIN_SHIFTS} turnos de trabalho e os dois ganham ${INVITE_PRIZE.toLocaleString("pt-PT")} Kz.`, true);
    await this.inviteLoad(actor, e);
  }

  /** Prémio do convite: quando quem foi convidado já fez os primeiros turnos, os dois recebem. */
  private async inviteReward(actor: LifeActor, e: Entry): Promise<void> {
    const u = await this.invites.usedBy(actor.characterId);
    if (!u) return this.out.toast(actor, "Não entraste com nenhum convite.", false);
    if (u.rewarded) return this.out.toast(actor, "Já recebeste o prémio do convite.", false);
    if (this.turnosTotais(e) < INVITE_MIN_SHIFTS) return this.out.toast(actor, `Faz ${INVITE_MIN_SHIFTS} turnos de trabalho (vais em ${this.turnosTotais(e)}).`, false);
    const st = await this.invites.stats(u.owner);
    const owner = await this.invites.reward(actor.characterId);
    if (!owner) return this.out.toast(actor, "Já recebeste o prémio do convite.", false);
    e.money = await this.wallets.apply(actor.characterId, INVITE_PRIZE, "convite.convidado", `convite-in:${actor.characterId}`);
    if (st.premiados < INVITE_MAX_REWARDS) {
      await this.wallets.apply(owner, INVITE_PRIZE, "convite.dono", `convite-dono:${actor.characterId}`);
      const text = `${actor.name ?? "O teu convidado"} já está a fazer a vida no Huambo: recebeste ${INVITE_PRIZE.toLocaleString("pt-PT")} Kz pelo convite!`;
      if (!this.out.sms?.(owner, "Convites", text)) this.store(owner, { kind: "sms", from: "Convites", text, at: this.now() });
    }
    this.out.toast(actor, `Prémio do convite: +${INVITE_PRIZE.toLocaleString("pt-PT")} Kz (e quem te convidou também ganhou).`, true);
    await this.inviteLoad(actor, e);
  }

  // ---------------------------------------------------------------- estabelecimentos da cidade

  private interiorById(id: string): Interior | undefined {
    return this.district.interiors?.find((i) => i.id === id);
  }

  /** Muda um estabelecimento com segurança (versão), juntando antes o rendimento dos clientes do bairro. */
  private async mutateVenue(id: string, fn: (v: OwnedVenue) => string | void): Promise<{ v: OwnedVenue | null; err?: string }> {
    for (let k = 0; k < 5; k++) {
      const v = await this.venues.get(id);
      if (!v) return { v: null, err: "Esse estabelecimento não tem dono." };
      this.settleVenue(v);
      const err = fn(v);
      if (err) return { v, err };
      if (await this.venues.save(v)) return { v: { ...v, version: v.version + 1 } };
    }
    return { v: null, err: "Está muito movimentado. Tenta outra vez." };
  }

  private settleVenue(v: OwnedVenue): void {
    const t = this.now();
    const hours = Math.min(VENUE_MAX_HOURS, Math.max(0, (t - v.lastTick) / 3600_000));
    v.caixa += Math.floor(hours * venuePerHour(v.venue, v.nivel));
    v.lastTick = t;
  }

  /** Parte do que um jogador pagou dentro de um estabelecimento com dono vai para a caixa do dono. */
  private venueRevenue(actor: LifeActor, amount: number): void {
    const i = interiorAt(this.district, actor.x, actor.y);
    if (!i || !VENUES_FOR_SALE[i.venue] || amount <= 0) return;
    const cut = Math.floor(amount * VENUE_CUT);
    if (cut <= 0) return;
    void this.venues
      .get(i.id)
      .then((v) => {
        if (!v || v.owner === actor.characterId) return;
        return this.mutateVenue(i.id, (x) => {
          x.caixa += cut;
        });
      })
      .catch(() => undefined);
  }

  private async venueLoad(actor: LifeActor, e: Entry): Promise<void> {
    try {
      const meus = await this.venues.byOwner(actor.characterId);
      const bairro = await this.venues.byBairro(this.district.id);
      for (const v of [...meus, ...bairro]) this.settleVenue(v);
      e.venueView = { meus, bairro };
    } catch {
      /* sem base de dados */
    }
  }

  /** Comprar o estabelecimento onde se está (tem de estar à venda). */
  private async venueBuy(actor: LifeActor, e: Entry): Promise<void> {
    const i = interiorAt(this.district, actor.x, actor.y);
    const cat = i ? VENUES_FOR_SALE[i.venue] : undefined;
    if (!i || !cat) return this.out.toast(actor, "Entra no estabelecimento que queres comprar (cantina, padaria, churrasqueira, farmácia, loja, discoteca ou hotel).", false);
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para comprar um estabelecimento precisas de uma conta.", false);
    if (!e.life.docs.bi) return this.out.toast(actor, "Para comprar um estabelecimento precisas de BI.", false);
    const existing = await this.venues.get(i.id);
    if (existing) return this.out.toast(actor, existing.owner === actor.characterId ? "Este sítio já é teu!" : `${i.name} já tem dono: ${existing.ownerName}.`, false);
    if ((await this.venues.byOwner(actor.characterId)).length >= VENUE_MAX_OWNED) return this.out.toast(actor, `Já tens ${VENUE_MAX_OWNED} estabelecimentos. Vende um para comprar outro.`, false);
    if (e.money < cat.price) return this.out.toast(actor, `${i.name} custa ${cat.price.toLocaleString("pt-PT")} Kz.`, false);
    const op = this.op();
    e.money = await this.wallets.apply(actor.characterId, -cat.price, `estab.compra.${i.venue}`, `estab:${actor.characterId}:${op}`);
    const v = await this.venues.claim({ interiorId: i.id, owner: actor.characterId, ownerName: actor.name ?? "", bairro: this.district.id, venue: i.venue, nome: i.name, nivel: 1, caixa: 0, investido: cat.price, lastTick: this.now() });
    if (!v) {
      e.money = await this.wallets.apply(actor.characterId, cat.price, "estab.compra.devolvida", `estab-dev:${actor.characterId}:${op}`);
      return this.out.toast(actor, "Alguém comprou este sítio agora mesmo.", false);
    }
    recordNews("casa", this.district.name, `${actor.name ?? "Alguém"} comprou ${i.name} (${this.district.name}).`, this.now());
    this.out.toast(actor, `Agora és dono/a de ${i.name}! Recebes ${Math.round(VENUE_CUT * 100)}% do que os clientes pagam aqui e ${venuePerHour(i.venue, 1).toLocaleString("pt-PT")} Kz por hora.`, true);
    await this.venueLoad(actor, e);
  }

  private async venueCollect(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const mine = (await this.venues.byOwner(actor.characterId)).filter((v) => !id || v.interiorId === id);
    if (!mine.length) return this.out.toast(actor, "Não tens estabelecimentos.", false);
    let total = 0;
    for (const v0 of mine) {
      let amount = 0;
      const r = await this.mutateVenue(v0.interiorId, (v) => {
        if (v.owner !== actor.characterId) return "Já não é teu.";
        amount = v.caixa;
        v.caixa = 0;
      });
      if (r.err || amount <= 0) continue;
      e.money = await this.wallets.apply(actor.characterId, amount, `estab.lucro.${v0.venue}`, `estab-lucro:${v0.interiorId}:${r.v!.version}`);
      total += amount;
    }
    if (total <= 0) return this.out.toast(actor, "Ainda não há lucro para recolher.", false);
    this.assocAdd(actor, e, (total / 100) * ASSOC_POINTS.venda);
    this.out.toast(actor, `Recolheste ${total.toLocaleString("pt-PT")} Kz dos teus estabelecimentos.`, true);
    await this.venueLoad(actor, e);
  }

  private async venueUpgrade(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const v0 = id ? await this.venues.get(id) : null;
    if (!v0 || v0.owner !== actor.characterId) return this.out.toast(actor, "Esse estabelecimento não é teu.", false);
    if (v0.nivel >= VENUE_MAX_LEVEL) return this.out.toast(actor, "Já está no nível máximo.", false);
    const cost = venueUpgradeCost(v0.venue, v0.nivel);
    if (e.money < cost) return this.out.toast(actor, `Melhorar custa ${cost.toLocaleString("pt-PT")} Kz.`, false);
    const op = this.op();
    e.money = await this.wallets.apply(actor.characterId, -cost, `estab.melhorar.${v0.venue}`, `estab-mel:${actor.characterId}:${op}`);
    const r = await this.mutateVenue(v0.interiorId, (v) => {
      if (v.owner !== actor.characterId) return "Já não é teu.";
      if (v.nivel >= VENUE_MAX_LEVEL) return "Já está no nível máximo.";
      v.nivel += 1;
      v.investido += cost;
    });
    if (r.err) {
      e.money = await this.wallets.apply(actor.characterId, cost, "estab.melhorar.devolvido", `estab-mel-dev:${actor.characterId}:${op}`);
      return this.out.toast(actor, r.err, false);
    }
    this.out.toast(actor, `${v0.nome} passou ao nível ${r.v!.nivel}: rende ${venuePerHour(v0.venue, r.v!.nivel).toLocaleString("pt-PT")} Kz por hora.`, true);
    await this.venueLoad(actor, e);
  }

  private async venueSell(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const v = id ? await this.venues.get(id) : null;
    if (!v || v.owner !== actor.characterId) return this.out.toast(actor, "Esse estabelecimento não é teu.", false);
    this.settleVenue(v);
    if (!(await this.venues.release(v.interiorId, v.version))) return this.out.toast(actor, "Está muito movimentado. Tenta outra vez.", false);
    const total = Math.round(v.investido * VENUE_RESALE) + v.caixa;
    e.money = await this.wallets.apply(actor.characterId, total, `estab.venda.${v.venue}`, `estab-venda:${v.interiorId}:${v.version}`);
    this.out.toast(actor, `Vendeste ${v.nome}: +${total.toLocaleString("pt-PT")} Kz (com a caixa).`, true);
    await this.venueLoad(actor, e);
  }

  // ---------------------------------------------------------------- crime organizado (negócios ilegais)

  private async illegalOpen(actor: LifeActor, e: Entry, tipo: string | undefined): Promise<void> {
    const n = ILEGAIS[tipo ?? ""];
    if (!n) return this.out.toast(actor, "Esse esquema não existe.", false);
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Precisas de uma conta.", false);
    if (e.life.ilegal) return this.out.toast(actor, "Já tens um esquema a correr. Fecha-o primeiro.", false);
    if (e.life.jobId === "policia") return this.out.toast(actor, "És agente da polícia! Não te metas nisso.", false);
    if (e.money < n.cost) return this.out.toast(actor, `Para começar precisas de ${n.cost.toLocaleString("pt-PT")} Kz.`, false);
    e.money = await this.wallets.apply(actor.characterId, -n.cost, `ilegal.abrir.${tipo}`, `ilegal:${actor.characterId}:${this.op()}`);
    const t = this.now();
    e.life.ilegal = { tipo: tipo!, desde: t, lastCollect: t, investido: n.cost };
    e.dirty = true;
    this.out.toast(actor, `Começaste: ${n.name}. Rende ${n.perHour.toLocaleString("pt-PT")} Kz por hora… enquanto a polícia não descobrir.`, true);
  }

  /** Recolher o lucro do esquema: quanto mais tempo acumulado, maior o risco de rusga. */
  private async illegalCollect(actor: LifeActor, e: Entry): Promise<void> {
    const il = e.life.ilegal;
    if (!il) return this.out.toast(actor, "Não tens nenhum esquema.", false);
    const n = ILEGAIS[il.tipo]!;
    const t = this.now();
    const hours = Math.min(24, Math.max(0, (t - il.lastCollect) / 3600_000));
    const amount = Math.floor(hours * n.perHour);
    if (amount < 1) return this.out.toast(actor, "Ainda não há lucro para recolher.", false);
    if (this.rand() < raidChance(il.tipo, hours)) return this.raid(actor, e, null);
    il.lastCollect = t;
    e.dirty = true;
    e.money = await this.wallets.apply(actor.characterId, amount, `ilegal.lucro.${il.tipo}`, `ilegal-lucro:${actor.characterId}:${t}`);
    this.out.toast(actor, `Recolheste ${amount.toLocaleString("pt-PT")} Kz do ${n.name.toLowerCase()}. Ninguém viu… desta vez.`, true);
  }

  private illegalClose(actor: LifeActor, e: Entry): void {
    if (!e.life.ilegal) return this.out.toast(actor, "Não tens nenhum esquema.", false);
    e.life.ilegal = null;
    e.dirty = true;
    this.out.toast(actor, "Fechaste o esquema. Vida limpa a partir de agora.", true);
  }

  /** Rusga: perde-se o esquema e o lucro, multa, detenção e cadastro. Se foi um/a agente, recebe parte da multa. */
  private async raid(actor: LifeActor, e: Entry, agent: LifeActor | null): Promise<void> {
    const il = e.life.ilegal;
    if (!il) return;
    const n = ILEGAIS[il.tipo]!;
    const multa = Math.min(e.money, Math.round(il.investido * MULTA_FRACAO));
    e.life.ilegal = null;
    e.life.rusgas += 1;
    e.life.docs.registo = false; // fica com cadastro
    e.dirty = true;
    if (multa > 0) e.money = await this.wallets.apply(actor.characterId, -multa, "policia.multa", `multa:${actor.characterId}:${this.op()}`);
    e.busy = null;
    this.startBusy(actor, e, "preso");
    recordNews("missoes", this.district.name, `Rusga da polícia em ${this.district.name}: desmantelado ${n.name.toLowerCase()} de ${actor.name ?? "um morador"}.`, this.now());
    this.out.toast(actor, `RUSGA! A polícia apanhou o teu ${n.name.toLowerCase()}. Multa de ${multa.toLocaleString("pt-PT")} Kz, ficas detido/a uns minutos e perdes o registo criminal limpo.`, false);
    if (agent) {
      const ae = this.entries.get(agent);
      const premio = Math.round(multa * RUSGA_PREMIO);
      if (ae && premio > 0) {
        ae.money = await this.wallets.apply(agent.characterId, premio, "policia.premio", `premio-rusga:${agent.characterId}:${this.op()}`);
        this.sendSelf(agent);
      }
      this.out.toast(agent, `Rusga bem-sucedida: desmantelaste ${n.name.toLowerCase()} de ${actor.name ?? "um suspeito"}. Prémio: ${premio.toLocaleString("pt-PT")} Kz.`, true);
    }
    this.sendSelf(actor);
  }

  /** Agente da polícia em serviço na esquadra: patrulha o bairro e pode apanhar esquemas de quem está nesta sala. */
  private async policePatrol(actor: LifeActor, e: Entry): Promise<void> {
    if (e.life.jobId !== "policia") return this.out.toast(actor, "Só agentes da polícia fazem patrulhas.", false);
    if (interiorAt(this.district, actor.x, actor.y)?.venue !== "esquadra") return this.out.toast(actor, "As patrulhas começam na esquadra.", false);
    if (e.life.needs.energy < 15) return this.out.toast(actor, "Estás cansado(a) demais para patrulhar.", false);
    e.life.needs = { ...e.life.needs, energy: e.life.needs.energy - 10 };
    e.dirty = true;
    const suspects = [...this.entries.entries()].filter(([a, x]) => a !== actor && x.life.ilegal);
    if (!suspects.length || this.rand() > 0.5) return this.out.toast(actor, "Patrulha feita: tudo calmo no bairro.", true);
    const [who, we] = suspects[Math.floor(this.rand() * suspects.length)]!;
    await this.raid(who, we, actor);
  }

  // ---------------------------------------------------------------- lojas dos jogadores

  /**
   * Muda uma loja com segurança: lê, faz as contas das vendas aos clientes do bairro desde a última
   * vez, aplica a mudança e grava só se ninguém mexeu entretanto (senão tenta outra vez).
   * fn devolve um texto de erro para desistir, ou nada para gravar.
   */
  private async mutateShop(id: string, fn: (s: Shop) => string | void): Promise<{ shop: Shop | null; err?: string }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const s = await this.shops.get(id);
      if (!s) return { shop: null, err: "Essa loja já não existe." };
      this.settleShop(s);
      const err = fn(s);
      if (err) return { shop: s, err };
      if (await this.shops.save(s)) return { shop: { ...s, version: s.version + 1 } };
    }
    return { shop: null, err: "A loja está muito movimentada. Tenta outra vez." };
  }

  /** Vendas aos clientes do bairro (não-jogadores) desde a última conta. */
  private settleShop(s: Shop): void {
    const t = this.now();
    const hours = (t - s.lastTick) / 3600_000;
    if (hours <= 0) return;
    const r = simulateSales(s.stock, hours, s.empregados.length, this.rand);
    s.stock = r.stock;
    s.caixa += r.revenue;
    s.vendas += r.revenue;
    s.lastTick = t;
  }

  private atShopMarket(actor: LifeActor, s: Shop): boolean {
    return this.district.id === s.bairro && this.atMarket(actor);
  }

  private async shopLoad(actor: LifeActor, e: Entry): Promise<void> {
    try {
      const minha = await this.shops.byOwner(actor.characterId);
      if (minha) this.settleShop(minha);
      let emprego: Shop | null = null;
      if (e.life.lojaEmprego) {
        emprego = await this.shops.get(e.life.lojaEmprego.shopId);
        if (!emprego || !emprego.empregados.some((x) => x.id === actor.characterId)) {
          e.life.lojaEmprego = null; // foi despedido/a ou a loja fechou
          e.dirty = true;
          emprego = null;
        }
      }
      const aqui = (await this.shops.byBairro(this.district.id)).filter((x) => x.owner !== actor.characterId);
      for (const x of aqui) this.settleShop(x);
      e.shopView = { minha, emprego, aqui };
    } catch {
      /* sem base de dados: fica o que se sabia */
    }
  }

  private async shopOpen(actor: LifeActor, e: Entry, rawName: string | undefined): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para abrir uma loja precisas de uma conta.", false);
    if (!this.atMarket(actor)) return this.out.toast(actor, "As bancas abrem-se no mercado do bairro: vai lá.", false);
    const nome = sanitizeDisplayName(rawName) ?? `Banca de ${actor.name ?? "Morador"}`.slice(0, 40);
    if (e.money < SHOP_OPEN_PRICE) return this.out.toast(actor, `A licença da banca custa ${SHOP_OPEN_PRICE.toLocaleString("pt-PT")} Kz.`, false);
    if (await this.shops.byOwner(actor.characterId)) return this.out.toast(actor, "Já tens uma loja.", false);
    e.money = await this.wallets.apply(actor.characterId, -SHOP_OPEN_PRICE, "loja.licenca", `loja-abrir:${actor.characterId}:${this.op()}`);
    const s = await this.shops.create({ owner: actor.characterId, ownerName: actor.name ?? "", bairro: this.district.id, nome, caixa: 0, stock: {}, empregados: [], vendas: 0, lastTick: this.now() });
    if (!s) {
      e.money = await this.wallets.apply(actor.characterId, SHOP_OPEN_PRICE, "loja.licenca.devolvida", `loja-abrir-dev:${actor.characterId}:${this.op()}`);
      return this.out.toast(actor, "Já tens uma loja.", false);
    }
    recordNews("grupo", this.district.name, `${actor.name ?? "Alguém"} abriu a ${nome} no mercado de ${this.district.name}.`, this.now());
    this.out.toast(actor, `Abriste a ${nome}! Compra stock ao grossista e escolhe os preços.`, true);
    await this.shopLoad(actor, e);
  }

  private async shopRestock(actor: LifeActor, e: Entry, item: string | undefined, qty: number): Promise<void> {
    const it = SHOP_ITEMS[item ?? ""];
    if (!it) return this.out.toast(actor, "Esse produto não existe.", false);
    if (!Number.isInteger(qty) || qty < 1 || qty > SHOP_MAX_STOCK) return this.out.toast(actor, "Quantidade inválida.", false);
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Não tens loja.", false);
    if (!this.atShopMarket(actor, mine)) return this.out.toast(actor, "O grossista está no mercado onde fica a tua banca.", false);
    const have = mine.stock[item!]?.qty ?? 0;
    const n = Math.min(qty, SHOP_MAX_STOCK - have);
    if (n <= 0) return this.out.toast(actor, `Já tens o máximo de ${it.name.toLowerCase()} (${SHOP_MAX_STOCK}).`, false);
    const cost = n * it.cost;
    if (e.money < cost) return this.out.toast(actor, `${n} × ${it.name} custa ${cost.toLocaleString("pt-PT")} Kz no grossista.`, false);
    e.money = await this.wallets.apply(actor.characterId, -cost, `loja.stock.${item}`, `loja-stock:${actor.characterId}:${this.op()}`);
    const r = await this.mutateShop(mine.id, (s) => {
      const cur = s.stock[item!] ?? { qty: 0, price: it.cost * 2 };
      s.stock[item!] = { qty: Math.min(SHOP_MAX_STOCK, cur.qty + n), price: cur.price };
    });
    if (r.err) {
      e.money = await this.wallets.apply(actor.characterId, cost, "loja.stock.devolvido", `loja-stock-dev:${actor.characterId}:${this.op()}`);
      return this.out.toast(actor, r.err, false);
    }
    this.out.toast(actor, `Compraste ${n} × ${it.name} ao grossista (−${cost.toLocaleString("pt-PT")} Kz).`, true);
    await this.shopLoad(actor, e);
  }

  private async shopPrice(actor: LifeActor, e: Entry, item: string | undefined, price: number): Promise<void> {
    const it = SHOP_ITEMS[item ?? ""];
    if (!it) return this.out.toast(actor, "Esse produto não existe.", false);
    if (!Number.isInteger(price) || price < it.cost || price > it.cost * SHOP_PRICE_MAX)
      return this.out.toast(actor, `O preço de ${it.name.toLowerCase()} vai de ${it.cost} a ${it.cost * SHOP_PRICE_MAX} Kz.`, false);
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Não tens loja.", false);
    const r = await this.mutateShop(mine.id, (s) => {
      if (!s.stock[item!]) return "Compra primeiro esse produto ao grossista.";
      s.stock[item!]!.price = price;
    });
    if (r.err) return this.out.toast(actor, r.err, false);
    this.out.toast(actor, `${it.name}: agora a ${price.toLocaleString("pt-PT")} Kz.`, true);
    await this.shopLoad(actor, e);
  }

  /** Comprar numa banca de outro jogador (no mercado desse bairro): come/bebe logo. */
  private async shopBuy(actor: LifeActor, e: Entry, shopId: string | undefined, item: string | undefined): Promise<void> {
    const it = SHOP_ITEMS[item ?? ""];
    if (!it || !shopId) return this.out.toast(actor, "Escolhe o produto.", false);
    const s0 = await this.shops.get(shopId);
    if (!s0) return this.out.toast(actor, "Essa loja já fechou.", false);
    if (s0.owner === actor.characterId) return this.out.toast(actor, "Essa banca é tua!", false);
    if (!this.atShopMarket(actor, s0)) return this.out.toast(actor, "Vai ao mercado onde fica essa banca.", false);
    if (s0.owner && this.blocks(actor, s0.owner)) return this.out.toast(actor, "Bloqueaste quem tem essa banca.", false);
    const price = s0.stock[item!]?.price ?? 0;
    if (!price || (s0.stock[item!]?.qty ?? 0) <= 0) return this.out.toast(actor, `Acabou ${it.name.toLowerCase()} nesta banca.`, false);
    if (e.money < price) return this.out.toast(actor, `Custa ${price.toLocaleString("pt-PT")} Kz.`, false);
    // primeiro paga (falha sem dinheiro); se o produto acabar entretanto, devolve-se
    const op = this.op();
    e.money = await this.wallets.apply(actor.characterId, -price, `loja.compra.${item}`, `loja-compra:${actor.characterId}:${op}`);
    const r = await this.mutateShop(shopId, (s) => {
      const st = s.stock[item!];
      if (!st || st.qty <= 0) return `Acabou ${it.name.toLowerCase()} nesta banca.`;
      if (st.price !== price) return "O preço mudou agora mesmo. Vê outra vez.";
      st.qty -= 1;
      s.caixa += price;
      s.vendas += price;
    });
    if (r.err) {
      e.money = await this.wallets.apply(actor.characterId, price, "loja.compra.devolvida", `loja-compra-dev:${actor.characterId}:${op}`);
      return this.out.toast(actor, r.err, false);
    }
    e.life.needs = applyFood(e.life.needs, { id: item!, name: it.name, price, hunger: it.hunger ?? 0, mood: it.mood, energy: it.energy });
    e.dirty = true;
    this.out.toast(actor, `Compraste ${it.name} na ${s0.nome} (−${price.toLocaleString("pt-PT")} Kz).`, true);
    const owner = this.actorById(s0.owner);
    if (owner) this.out.toast(owner, `${actor.name ?? "Um cliente"} comprou ${it.name.toLowerCase()} na tua banca (+${price} Kz na caixa).`, true);
    this.mission(actor, e, "comer");
    await this.shopLoad(actor, e);
  }

  /** O dono tira o dinheiro da caixa para a carteira. */
  private async shopCollect(actor: LifeActor, e: Entry): Promise<void> {
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Não tens loja.", false);
    let amount = 0;
    const r = await this.mutateShop(mine.id, (s) => {
      if (s.caixa <= 0) return "A caixa está vazia.";
      amount = s.caixa;
      s.caixa = 0;
    });
    if (r.err) return this.out.toast(actor, r.err, false);
    e.money = await this.wallets.apply(actor.characterId, amount, "loja.caixa", `loja-caixa:${mine.id}:${r.shop!.version}`);
    this.assocAdd(actor, e, (amount / 100) * ASSOC_POINTS.venda);
    this.out.toast(actor, `Tiraste ${amount.toLocaleString("pt-PT")} Kz da caixa da ${mine.nome}.`, true);
    await this.shopLoad(actor, e);
  }

  private async shopHire(actor: LifeActor, e: Entry, eid: string | undefined, wageIdx: number): Promise<void> {
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Primeiro abre uma loja.", false);
    const target = this.byEid(eid);
    if (!target || target === actor) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    if (Math.hypot(target.x - actor.x, target.y - actor.y) > TRANSFER_NEAR_CM * 2) return this.out.toast(actor, "Aproxima-te da pessoa para lhe propor trabalho.", false);
    if (this.blocks(target, actor.characterId)) return this.out.toast(actor, "Essa pessoa não aceita propostas tuas.", false);
    const salario = SHOP_WAGES[wageIdx - 1];
    if (!salario) return this.out.toast(actor, "Escolhe o salário do turno.", false);
    if (mine.empregados.length >= SHOP_MAX_EMPLOYEES) return this.out.toast(actor, `A banca já tem ${SHOP_MAX_EMPLOYEES} empregados.`, false);
    if (mine.empregados.some((x) => x.id === target.characterId)) return this.out.toast(actor, "Já trabalha contigo.", false);
    const te = this.entries.get(target)!;
    te.shopOffer = { from: actor, shopId: mine.id, nome: mine.nome, salario };
    this.out.toast(actor, `Propuseste trabalho a ${target.name ?? "alguém"} (${salario.toLocaleString("pt-PT")} Kz por turno).`, true);
    this.out.toast(target, `${actor.name ?? "Alguém"} quer contratar-te na ${mine.nome}: ${salario.toLocaleString("pt-PT")} Kz por turno. Responde na app Lojas.`, true);
    this.sendSelf(target);
  }

  private async shopOfferAnswer(actor: LifeActor, e: Entry, yes: boolean): Promise<void> {
    const o = e.shopOffer;
    e.shopOffer = undefined;
    if (!o) return this.out.toast(actor, "Não tens propostas.", false);
    if (!yes) {
      if (this.entries.has(o.from)) this.out.toast(o.from, `${actor.name ?? "A pessoa"} recusou o trabalho na tua banca.`, false);
      return this.out.toast(actor, "Recusaste a proposta.", true);
    }
    if (e.life.lojaEmprego) return this.out.toast(actor, "Já trabalhas noutra loja. Sai primeiro.", false);
    const r = await this.mutateShop(o.shopId, (s) => {
      if (s.empregados.length >= SHOP_MAX_EMPLOYEES) return "A banca já não tem vaga.";
      if (!s.empregados.some((x) => x.id === actor.characterId)) s.empregados.push({ id: actor.characterId, name: (actor.name ?? "").slice(0, 40), salario: o.salario });
    });
    if (r.err) return this.out.toast(actor, r.err, false);
    e.life.lojaEmprego = { shopId: o.shopId, nome: o.nome, bairro: r.shop!.bairro };
    e.dirty = true;
    this.out.toast(actor, `Agora trabalhas na ${o.nome}. Faz turnos no mercado (app Lojas).`, true);
    if (this.entries.has(o.from)) this.out.toast(o.from, `${actor.name ?? "A pessoa"} aceitou trabalhar na tua banca!`, true);
    await this.shopLoad(actor, e);
  }

  private async shopFire(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Não tens loja.", false);
    let name = "";
    const r = await this.mutateShop(mine.id, (s) => {
      const x = s.empregados[idx];
      if (!x) return "Escolhe um empregado da lista.";
      name = x.name;
      s.empregados.splice(idx, 1);
    });
    if (r.err) return this.out.toast(actor, r.err, false);
    this.out.toast(actor, `Despediste ${name}.`, true);
    await this.shopLoad(actor, e);
  }

  private async shopQuit(actor: LifeActor, e: Entry): Promise<void> {
    const job = e.life.lojaEmprego;
    if (!job) return this.out.toast(actor, "Não trabalhas em nenhuma loja.", false);
    await this.mutateShop(job.shopId, (s) => {
      s.empregados = s.empregados.filter((x) => x.id !== actor.characterId);
    });
    e.life.lojaEmprego = null;
    e.dirty = true;
    this.out.toast(actor, `Saíste da ${job.nome}.`, true);
  }

  private async shopShiftStart(actor: LifeActor, e: Entry): Promise<void> {
    const job = e.life.lojaEmprego;
    if (!job) return this.out.toast(actor, "Não trabalhas em nenhuma loja.", false);
    const s = await this.shops.get(job.shopId);
    if (!s || !s.empregados.some((x) => x.id === actor.characterId)) {
      e.life.lojaEmprego = null;
      e.dirty = true;
      return this.out.toast(actor, "Já não trabalhas nessa loja.", false);
    }
    if (!this.atShopMarket(actor, s)) return this.out.toast(actor, `A ${s.nome} fica no mercado de ${getDistrict(s.bairro)?.name ?? s.bairro}.`, false);
    if (e.life.needs.energy < 10) return this.out.toast(actor, "Estás cansado(a) demais para trabalhar.", false);
    this.startBusy(actor, e, "loja");
    if (e.busy?.kind === "loja") this.out.toast(actor, `Turno na ${s.nome}: a atender clientes…`, true);
  }

  /** Fim do turno na loja: o empregado atende clientes (vende mais) e é pago pela caixa da loja. */
  private async shopShiftEnd(actor: LifeActor, e: Entry): Promise<void> {
    const job = e.life.lojaEmprego;
    if (!job) return;
    let salario = 0;
    let vendeu = 0;
    const r = await this.mutateShop(job.shopId, (s) => {
      const me = s.empregados.find((x) => x.id === actor.characterId);
      if (!me) return "Já não trabalhas nessa loja.";
      // um turno com alguém ao balcão atende mais gente (como 2 horas de clientes com mais um empregado)
      const extra = simulateSales(s.stock, 2, s.empregados.length + 1, this.rand);
      s.stock = extra.stock;
      s.caixa += extra.revenue;
      s.vendas += extra.revenue;
      vendeu = extra.revenue;
      if (s.caixa < me.salario) return `A caixa da ${s.nome} não tem dinheiro para te pagar (o turno vendeu ${extra.revenue} Kz).`;
      s.caixa -= me.salario;
      salario = me.salario;
    });
    const n = e.life.needs;
    e.life.needs = { ...n, energy: Math.max(0, n.energy - 12), hunger: Math.max(0, n.hunger - 8) };
    e.dirty = true;
    if (r.err) return this.out.toast(actor, r.err, false);
    e.money = await this.wallets.apply(actor.characterId, salario, "loja.salario", `loja-salario:${job.shopId}:${r.shop!.version}`);
    this.assocAdd(actor, e, ASSOC_POINTS.turno);
    this.out.toast(actor, `Turno na ${job.nome}: vendeste ${vendeu.toLocaleString("pt-PT")} Kz e recebeste ${salario.toLocaleString("pt-PT")} Kz.`, true);
  }

  private async shopClose(actor: LifeActor, e: Entry): Promise<void> {
    const mine = await this.shops.byOwner(actor.characterId);
    if (!mine) return this.out.toast(actor, "Não tens loja.", false);
    this.settleShop(mine);
    if (!(await this.shops.remove(mine.id, mine.version))) return this.out.toast(actor, "A loja está a ser usada agora. Tenta outra vez.", false);
    if (mine.caixa > 0) e.money = await this.wallets.apply(actor.characterId, mine.caixa, "loja.fecho", `loja-fecho:${mine.id}`);
    this.out.toast(actor, `Fechaste a ${mine.nome}${mine.caixa > 0 ? ` e levaste ${mine.caixa.toLocaleString("pt-PT")} Kz da caixa` : ""}. O stock que sobrou foi dado aos vizinhos.`, true);
    await this.shopLoad(actor, e);
  }

  // ---------------------------------------------------------------- associações de bairro

  /** Soma pontos à associação de quem fez a atividade (em segundo plano). */
  private assocAdd(actor: LifeActor, e: Entry, pontos: number): void {
    const b = e.life.associacao;
    const p = Math.round(pontos);
    if (!b || p <= 0) return;
    void this.assoc.add(actor.characterId, b, angolaWeek(this.now()), p).catch(() => undefined);
  }

  private async assocJoin(actor: LifeActor, e: Entry): Promise<void> {
    const i = interiorAt(this.district, actor.x, actor.y);
    if (i?.venue !== "administracao" && i?.venue !== "governo")
      return this.out.toast(actor, "A sede da associação é a Administração do bairro: entra lá para aderir.", false);
    const week = angolaWeek(this.now());
    if (e.life.associacao === this.district.id) return this.out.toast(actor, `Já és membro da associação de ${this.district.name}.`, false);
    if (e.life.associacao && e.life.assocSemana === week) return this.out.toast(actor, "Só podes mudar de associação uma vez por semana.", false);
    e.life.associacao = this.district.id;
    e.life.assocSemana = week;
    e.dirty = true;
    this.out.toast(actor, `Bem-vindo/a à associação de moradores de ${this.district.name}! Colher, trabalhar, vender e cuidar dos filhos dá pontos ao bairro.`, true);
    await this.assocLoad(actor, e);
  }

  private async assocLoad(_actor: LifeActor, e: Entry): Promise<void> {
    const t = this.now();
    const week = angolaWeek(t);
    const prev = previousWeek(t);
    try {
      const [ranking, anterior, me, mePrev] = await Promise.all([
        this.assoc.ranking(week, 30),
        this.assoc.ranking(prev, 3),
        this.assoc.member(e.life.associacao ? this.charOf(e) : "", week),
        this.assoc.member(this.charOf(e), prev),
      ]);
      const mine = ranking.find((r) => r.bairro === e.life.associacao);
      e.assocView = { semana: week, ranking, total: mine?.pontos ?? 0, meus: me?.bairro === e.life.associacao ? me.pontos : 0, anterior, meusAnterior: mePrev };
    } catch {
      /* sem base de dados: fica o que já se sabia */
    }
  }

  private charOf(e: Entry): string {
    for (const [a, x] of this.entries) if (x === e) return a.characterId;
    return "";
  }

  /** Prémios: «objetivo» (a associação chegou à meta desta semana) e «top» (1.º lugar da semana passada). */
  private async assocPrize(actor: LifeActor, e: Entry, kind: string | undefined): Promise<void> {
    const t = this.now();
    await this.assocLoad(actor, e);
    const v = e.assocView;
    if (!v) return this.out.toast(actor, "Não foi possível ver a associação agora.", false);
    if (kind === "objetivo") {
      const key = `objetivo:${v.semana}`;
      if (!e.life.associacao) return this.out.toast(actor, "Primeiro adere à associação do bairro.", false);
      if (e.life.assocPremios.includes(key)) return this.out.toast(actor, "Já recolheste o prémio do objetivo desta semana.", false);
      if (v.total < ASSOC_GOAL) return this.out.toast(actor, `O bairro ainda vai em ${v.total}/${ASSOC_GOAL} pontos.`, false);
      if (v.meus < ASSOC_MIN_POINTS) return this.out.toast(actor, `Contribui primeiro: precisas de ${ASSOC_MIN_POINTS} pontos teus esta semana (tens ${v.meus}).`, false);
      e.life.assocPremios = [...e.life.assocPremios, key].slice(-20);
      e.dirty = true;
      e.money = await this.wallets.apply(actor.characterId, ASSOC_GOAL_PRIZE, "assoc.objetivo", `assoc-obj:${actor.characterId}:${v.semana}`);
      return this.out.toast(actor, `O bairro cumpriu o objetivo da semana! +${ASSOC_GOAL_PRIZE.toLocaleString("pt-PT")} Kz.`, true);
    }
    if (kind === "top") {
      const prev = previousWeek(t);
      const key = `top:${prev}`;
      const top = v.anterior[0];
      const mp = v.meusAnterior;
      if (e.life.assocPremios.includes(key)) return this.out.toast(actor, "Já recolheste o prémio do 1.º lugar.", false);
      if (!top || !mp || mp.bairro !== top.bairro) return this.out.toast(actor, "A tua associação não ficou em 1.º lugar na semana passada.", false);
      if (mp.pontos < ASSOC_MIN_POINTS) return this.out.toast(actor, `Só recebe quem contribuiu (pelo menos ${ASSOC_MIN_POINTS} pontos na semana passada).`, false);
      e.life.assocPremios = [...e.life.assocPremios, key].slice(-20);
      e.dirty = true;
      e.money = await this.wallets.apply(actor.characterId, ASSOC_TOP_PRIZE, "assoc.top", `assoc-top:${actor.characterId}:${prev}`);
      recordNews("grupo", getDistrict(top.bairro)?.name ?? top.bairro, `A associação de ${getDistrict(top.bairro)?.name ?? top.bairro} ganhou a semana no Huambo!`, t);
      return this.out.toast(actor, `${getDistrict(top.bairro)?.name ?? top.bairro} foi o melhor bairro da semana passada! +${ASSOC_TOP_PRIZE.toLocaleString("pt-PT")} Kz.`, true);
    }
    return this.out.toast(actor, "Que prémio?", false);
  }

  // ---------------------------------------------------------------- família: filhos e gerações

  private babyAsk(actor: LifeActor, e: Entry, rawName: string | undefined, sexo: string | undefined): void {
    const p = e.life.partner;
    if (!p?.married) return this.out.toast(actor, "Para terem filhos primeiro casem-se na igreja.", false);
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para teres filhos precisas de uma conta.", false);
    if (!e.homes.length) return this.out.toast(actor, "Primeiro arranjem uma casa (comprada ou arrendada) para a criança.", false);
    if (e.life.filhos.length >= MAX_FILHOS) return this.out.toast(actor, `Já têm ${MAX_FILHOS} filhos — a casa está cheia!`, false);
    const i = interiorAt(this.district, actor.x, actor.y);
    if (i?.venue !== "saude") return this.out.toast(actor, "O parto é no centro de saúde: vão os dois lá dentro.", false);
    const pa = this.actorById(p.id);
    if (!pa || interiorAt(this.district, pa.x, pa.y)?.id !== i.id) return this.out.toast(actor, `${p.name} tem de estar aqui contigo no centro de saúde.`, false);
    if (e.money < PARTO_PRICE) return this.out.toast(actor, `O parto custa ${PARTO_PRICE.toLocaleString("pt-PT")} Kz.`, false);
    const sx: "m" | "f" = sexo === "f" ? "f" : sexo === "m" ? "m" : this.rand() < 0.5 ? "m" : "f";
    const pool = sx === "f" ? NOMES_F : NOMES_M;
    const nome = sanitizeDisplayName(rawName) ?? pool[Math.floor(this.rand() * pool.length)]!;
    this.entries.get(pa)!.babyReq = { from: actor, nome, sexo: sx };
    this.out.toast(actor, `Perguntaste a ${p.name} se querem ter um filho/a (${nome}).`, true);
    this.out.toast(pa, `${actor.name ?? "O teu par"} quer ter um filho/a convosco: ${nome}. Responde em Família no telemóvel.`, true);
    this.sendSelf(pa);
  }

  private async babyAnswer(actor: LifeActor, e: Entry, yes: boolean): Promise<void> {
    const req = e.babyReq;
    e.babyReq = undefined;
    if (!req) return this.out.toast(actor, "Não há nenhum pedido.", false);
    const fe = this.entries.get(req.from);
    if (!yes) {
      if (fe) this.out.toast(req.from, `${actor.name ?? "O teu par"} acha que ainda não é altura.`, false);
      return this.out.toast(actor, "Disseste que ainda não.", true);
    }
    if (!fe || e.life.partner?.id !== req.from.characterId || !e.life.partner.married) return this.out.toast(actor, "O pedido já não vale.", false);
    if (fe.life.filhos.length >= MAX_FILHOS || e.life.filhos.length >= MAX_FILHOS) return this.out.toast(actor, "A família já está completa.", false);
    try {
      fe.money = await this.wallets.apply(req.from.characterId, -PARTO_PRICE, "familia.parto", `parto:${req.from.characterId}:${this.op()}`);
    } catch (err) {
      if (err instanceof InsufficientFunds) return this.out.toast(actor, "Falta dinheiro para o parto.", false);
      throw err;
    }
    const t = this.now();
    const filho: Filho = { id: `f-${req.from.characterId.slice(0, 8)}-${this.op()}`, nome: req.nome, sexo: req.sexo, nasceu: t, cuidadoDia: angolaDay(t), cuidados: 0, estudos: 0, ajudaDia: null };
    for (const [who, ent] of [[req.from, fe], [actor, e]] as const) {
      ent.life.filhos.push({ ...filho });
      ent.life.needs = { ...ent.life.needs, mood: Math.min(100, ent.life.needs.mood + 20) };
      ent.dirty = true;
      this.out.toast(who, `Nasceu ${req.nome}! ${req.sexo === "f" ? "Uma menina" : "Um menino"} cheio/a de saúde. Parabéns!`, true);
      this.sendSelf(who);
    }
    recordNews("familia", this.district.name, `Nasceu ${req.nome}, filho/a de ${req.from.name ?? "?"} e ${actor.name ?? "?"}.`, t);
  }

  private async childCare(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const f = e.life.filhos[idx];
    if (!f) return this.out.toast(actor, "Escolhe um filho da lista.", false);
    const t = this.now();
    const anos = idadeAnos(f, t);
    const fase = faseDe(anos);
    if (!fase) return this.out.toast(actor, `${f.nome} já é adulto/a e cuida de si.`, false);
    const day = angolaDay(t);
    if (f.cuidadoDia === day) return this.out.toast(actor, `Hoje já cuidaste de ${f.nome}.`, false);
    if (e.money < fase.price) return this.out.toast(actor, `${fase.texto} custa ${fase.price.toLocaleString("pt-PT")} Kz.`, false);
    f.cuidadoDia = day; // antes de pagar: não se cobra duas vezes no mesmo dia
    e.dirty = true;
    e.money = await this.wallets.apply(actor.characterId, -fase.price, "familia.cuidar", `cuidar:${actor.characterId}:${f.id}:${day}`);
    f.cuidados += 1;
    this.assocAdd(actor, e, ASSOC_POINTS.cuidar);
    let extra = "";
    if (anos >= 6 && f.cuidados % CUIDADOS_POR_NIVEL === 0 && f.estudos < 4) {
      f.estudos += 1;
      extra = ` ${f.nome} passou de classe: estudos nível ${f.estudos}!`;
    }
    e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + 6) };
    this.out.toast(actor, `${fase.texto} para ${f.nome} (−${fase.price.toLocaleString("pt-PT")} Kz).${extra}`, true);
  }

  private async childHelp(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const f = e.life.filhos[idx];
    if (!f) return this.out.toast(actor, "Escolhe um filho da lista.", false);
    const t = this.now();
    if (idadeAnos(f, t) < IDADE_ADULTA) return this.out.toast(actor, `${f.nome} ainda é menor: ainda és tu que ajudas!`, false);
    const day = angolaDay(t);
    if (f.ajudaDia === day) return this.out.toast(actor, `${f.nome} já te ajudou hoje.`, false);
    f.ajudaDia = day;
    e.dirty = true;
    const amount = AJUDA_BASE + AJUDA_POR_ESTUDO * f.estudos;
    e.money = await this.wallets.apply(actor.characterId, amount, "familia.ajuda", `ajuda:${actor.characterId}:${f.id}:${day}`);
    e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + 5) };
    this.out.toast(actor, `${f.nome} veio visitar-te e deixou ${amount.toLocaleString("pt-PT")} Kz.`, true);
  }

  /**
   * Nova geração: continuar a vida como um filho/a adulto/a. Herda o dinheiro, o banco, as casas
   * e o carro (é a mesma conta); recomeça os estudos, o emprego, a carreira e o namoro.
   */
  private async nextGeneration(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const f = e.life.filhos[idx];
    if (!f) return this.out.toast(actor, "Escolhe um filho da lista.", false);
    if (idadeAnos(f, this.now()) < IDADE_ADULTA) return this.out.toast(actor, `${f.nome} ainda não é adulto/a.`, false);
    if (e.busy) return this.out.toast(actor, "Acaba primeiro o que estás a fazer.", false);
    const old = actor.name ?? "?";
    const L = e.life;
    L.filhos.splice(idx, 1); // os irmãos ficam na família
    L.geracao += 1;
    L.education = f.estudos;
    L.study = 0;
    L.jobId = null;
    L.carreira = {};
    L.partner = null;
    L.uni = { curso: null, aulas: 0, licenciaturas: [] };
    L.doenca = null;
    L.needs = { hunger: 90, energy: 100, mood: 90, health: 100 };
    e.dirty = true;
    actor.name = f.nome;
    this.out.rename?.(actor, f.nome);
    recordNews("familia", this.district.name, `${old} passou o testemunho: ${f.nome} continua a família (${L.geracao}.ª geração).`, this.now());
    this.out.toast(actor, `Agora és ${f.nome}, ${L.geracao}.ª geração da família. Herdaste o dinheiro, o banco e as casas de ${old}.`, true);
  }

  // ---------------------------------------------------------------- segurança: bloquear e denunciar

  /** true se `receiver` bloqueou a personagem `senderId`. */
  blocks(receiver: LifeActor, senderId: string): boolean {
    return !!this.entries.get(receiver)?.life.bloqueados.some((b) => b.id === senderId);
  }

  private block(actor: LifeActor, e: Entry, eid: string | undefined): void {
    const target = this.byEid(eid);
    if (!target || target === actor) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    const L = e.life;
    if (L.bloqueados.some((b) => b.id === target.characterId)) return this.out.toast(actor, "Já bloqueaste essa pessoa.", false);
    if (L.bloqueados.length >= MAX_BLOQUEADOS) return this.out.toast(actor, "Já tens muitas pessoas bloqueadas.", false);
    L.bloqueados.push({ id: target.characterId, name: (target.name ?? "Alguém").slice(0, 40) });
    // deixa de ser amigo (e cancela pedidos pendentes dessa pessoa)
    L.friends = L.friends.filter((f) => f.id !== target.characterId);
    const te = this.entries.get(target);
    if (te && te.life.friends.some((f) => f.id === actor.characterId)) {
      te.life.friends = te.life.friends.filter((f) => f.id !== actor.characterId);
      te.dirty = true;
      this.sendSelf(target);
    }
    if (e.friendReq?.from === target) e.friendReq = undefined;
    if (e.loveReq?.from === target) e.loveReq = undefined;
    if (e.weddingReq?.from === target) e.weddingReq = undefined;
    e.dirty = true;
    this.out.toast(actor, `Bloqueaste ${target.name ?? "essa pessoa"}. Não vês o que diz nem recebes pedidos, SMS ou presentes.`, true);
  }

  private unblock(actor: LifeActor, e: Entry, idx: number): void {
    const b = e.life.bloqueados[idx];
    if (!b) return this.out.toast(actor, "Escolhe alguém da lista.", false);
    e.life.bloqueados.splice(idx, 1);
    e.dirty = true;
    this.out.toast(actor, `Desbloqueaste ${b.name}.`, true);
  }

  private async report(actor: LifeActor, e: Entry, eid: string | undefined, motivo: string | undefined, extra: string | undefined): Promise<void> {
    const target = this.byEid(eid);
    if (!target || target === actor) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    if (!motivo || !(motivo in MOTIVOS_DENUNCIA)) return this.out.toast(actor, "Escolhe o motivo da denúncia.", false);
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para denunciar precisas de uma conta (não convidado). Podes bloquear a pessoa.", false);
    const L = e.life;
    const day = angolaDay(this.now());
    if (L.denunciasDay !== day) {
      L.denunciasDay = day;
      L.denuncias = 0;
    }
    if (L.denuncias >= DENUNCIAS_POR_DIA) return this.out.toast(actor, "Já fizeste muitas denúncias hoje. Podes bloquear a pessoa.", false);
    L.denuncias += 1;
    e.dirty = true;
    const note = sanitizeChat(extra)?.slice(0, 160);
    await this.reports.add({
      reporter: actor.characterId,
      reporterName: actor.name ?? "",
      reported: target.characterId,
      reportedName: target.name ?? "",
      reason: note ? `${motivo}: ${note}` : motivo,
      bairro: this.district.id,
      context: this.out.recentChat?.(target.characterId) ?? [],
    });
    this.out.toast(actor, `Denúncia enviada (${MOTIVOS_DENUNCIA[motivo]}). Obrigado — a equipa vai rever. Também podes bloquear a pessoa.`, true);
  }

  // ---------------------------------------------------------------- Saber Huambo

  private quizToday(e: Entry): { day: string; ids: number[] } {
    const day = angolaDay(this.now());
    if (e.life.quizDay !== day) {
      e.life.quizDay = day;
      e.life.quizFeitas = 0;
      e.life.quizCertasHoje = 0;
    }
    return { day, ids: quizDoDia(day) };
  }

  private async quizAnswer(actor: LifeActor, e: Entry, ans: number): Promise<void> {
    const { day, ids } = this.quizToday(e);
    const L = e.life;
    if (L.quizFeitas >= QUIZ_POR_DIA) return this.out.toast(actor, "Já respondeste às perguntas de hoje. Volta amanhã!", false);
    const q = QUIZ[ids[L.quizFeitas]!]!;
    if (!Number.isInteger(ans) || ans < 0 || ans >= q.o.length) return this.out.toast(actor, "Escolhe uma das respostas.", false);
    const idx = L.quizFeitas;
    L.quizFeitas += 1; // antes de pagar: não se responde duas vezes à mesma
    e.dirty = true;
    if (ans === q.c) {
      L.quizCertasHoje += 1;
      L.quizCertas += 1;
      e.money = await this.wallets.apply(actor.characterId, QUIZ_PREMIO, "quiz.premio", `quiz:${actor.characterId}:${day}:${idx}`);
      this.out.toast(actor, `Certo! +${QUIZ_PREMIO} Kz.`, true);
    } else {
      this.out.toast(actor, `Errado. A resposta certa era: ${q.o[q.c]}.`, false);
    }
  }

  // ---------------------------------------------------------------- presentes

  private async sendGift(actor: LifeActor, e: Entry, idx: number, id: string | undefined): Promise<void> {
    const g = PRESENTES[id ?? ""];
    if (!g) return this.out.toast(actor, "Esse presente não existe.", false);
    // n = 1000 é o par; senão o amigo n da lista
    const to = idx === 999 ? (e.life.partner ? { id: e.life.partner.id, name: e.life.partner.name } : undefined) : e.life.friends[idx];
    if (!to) return this.out.toast(actor, "Escolhe a quem queres oferecer.", false);
    const here0 = this.actorById(to.id);
    if (here0 && this.blocks(here0, actor.characterId)) return this.out.toast(actor, "Essa pessoa não aceita nada teu.", false);
    const price = this.giftPrice(g.price);
    if (e.money < price) return this.out.toast(actor, `${g.name} custa ${price.toLocaleString("pt-PT")} Kz.`, false);
    e.money = await this.wallets.apply(actor.characterId, -price, `presente.${id}`, `presente:${actor.characterId}:${this.op()}`);
    e.life.presentes += 1;
    e.dirty = true;
    const from = actor.name ?? "Alguém";
    const here = this.actorById(to.id);
    if (here) this.receiveGift(here, from, g.name, g.mood);
    else {
      // ligado noutra sala: chega já; desligado: fica guardado e chega quando entrar
      if (!(this.out.gift?.(to.id, from, g.name, g.mood, actor.characterId) ?? false)) {
        this.store(to.id, { kind: "gift", from, fromId: actor.characterId, name: g.name, mood: g.mood, at: this.now() });
        this.store(to.id, { kind: "sms", from, fromId: actor.characterId, text: `Mandei-te um presente: ${g.name.toLowerCase()}!`, at: this.now() });
      }
    }
    this.out.toast(actor, `Ofereceste ${g.name.toLowerCase()} a ${to.name} (−${price.toLocaleString("pt-PT")} Kz).`, true);
  }

  /** Dia da Mulher e quadra do Natal: presentes a metade do preço. */
  private giftPrice(base: number): number {
    const t = this.now();
    return hasEvent(t, "mulher") || hasEvent(t, "quadra_natal") || hasEvent(t, "natal") ? Math.round(base / 2) : base;
  }

  /** Prenda do dia num feriado ou data especial: uma vez por pessoa e por dia. */
  private async claimDayPrize(actor: LifeActor, e: Entry): Promise<void> {
    const t = this.now();
    const p = dayPrize(t);
    if (!p) return this.out.toast(actor, "Hoje não há prenda do dia. Vê a Agenda para os próximos feriados.", false);
    const day = angolaDay(t);
    if (e.life.prendaDia === day) return this.out.toast(actor, "Já recolheste a prenda de hoje.", false);
    e.life.prendaDia = day; // antes de pagar: um segundo pedido não paga duas vezes
    e.dirty = true;
    e.money = await this.wallets.apply(actor.characterId, p.premio, `evento.${p.id}`, `evento:${actor.characterId}:${day}`);
    e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + 10) };
    this.out.toast(actor, `${p.name}: recebeste a prenda do dia (+${p.premio.toLocaleString("pt-PT")} Kz e bom humor)!`, true);
  }

  /** Guarda para quem está desligado (falhas da base de dados não rebentam a ação). */
  private store(to: string, item: InboxItem): void {
    void this.inbox.push(to, item).catch(() => undefined);
  }

  /** Entrega o que estava à espera (SMS e presentes), salvo de quem foi bloqueado. */
  private async deliverInbox(actor: LifeActor): Promise<void> {
    let items: InboxItem[] = [];
    try {
      items = await this.inbox.take(actor.characterId);
    } catch {
      return;
    }
    for (const m of items) {
      if (m.fromId && this.blocks(actor, m.fromId)) continue;
      if (m.kind === "sms") this.out.toast(actor, `SMS de ${m.from}: «${m.text ?? ""}»`, true);
      else this.receiveGift(actor, m.from, m.name ?? "um presente", m.mood ?? 0);
    }
  }

  /** Presente que chegou de outra sala (a pessoa está aqui). */
  giftArrived(actor: LifeActor, from: string, name: string, mood: number, fromId?: string): void {
    if (fromId && this.blocks(actor, fromId)) return;
    this.receiveGift(actor, from, name, mood);
  }

  private receiveGift(actor: LifeActor, from: string, name: string, mood: number): void {
    const e = this.entries.get(actor);
    if (!e) return;
    e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + mood) };
    e.dirty = true;
    this.out.toast(actor, `${from} ofereceu-te ${name.toLowerCase()}! (+${mood} humor)`, true);
    this.sendSelf(actor);
  }

  // ---------------------------------------------------------------- seguro de saúde

  private insured(e: Entry): boolean {
    return e.life.seguroAte > this.now();
  }

  private async buyInsurance(actor: LifeActor, e: Entry): Promise<void> {
    if (this.insured(e)) return this.out.toast(actor, "Já tens seguro de saúde ativo.", false);
    if (e.money < SEGURO_PRICE) return this.out.toast(actor, `O seguro custa ${SEGURO_PRICE.toLocaleString("pt-PT")} Kz.`, false);
    e.money = await this.wallets.apply(actor.characterId, -SEGURO_PRICE, "seguro.saude", `seguro:${actor.characterId}:${this.op()}`);
    e.life.seguroAte = this.now() + SEGURO_MS;
    e.dirty = true;
    this.out.toast(actor, "Seguro de saúde ativo durante 24 horas: consultas, vacinas e medicamentos sem pagar.", true);
  }

  // ---------------------------------------------------------------- lavras

  private async lavraPlant(actor: LifeActor, e: Entry, crop: string | undefined): Promise<void> {
    const c = CROPS[crop ?? ""];
    if (!c) return this.out.toast(actor, "Essa cultura não existe.", false);
    if (e.life.lavra) return this.out.toast(actor, "A tua lavra já está semeada. Colhe primeiro.", false);
    e.money = await this.wallets.apply(actor.characterId, -c.seed, `lavra.semente.${crop}`, `lavra:${actor.characterId}:${this.op()}`);
    const t = this.now();
    e.life.lavra = { crop: crop!, plantedAt: t, readyAt: t + c.minutes * 60_000, watered: false };
    e.dirty = true;
    this.out.toast(actor, `Semeaste ${c.name} (−${c.seed} Kz). Rega e volta daqui a ${c.minutes} minutos.`, true);
  }

  private lavraWater(actor: LifeActor, e: Entry): void {
    const l = e.life.lavra;
    if (!l) return this.out.toast(actor, "A tua lavra está vazia. Semeia primeiro.", false);
    if (l.watered) return this.out.toast(actor, "Já regaste. Agora é esperar.", true);
    // na época das chuvas a chuva rega sozinha; senão gasta um pouco de energia (ir buscar água)
    if (e.life.needs.energy < 5) return this.out.toast(actor, "Estás sem forças para ir regar.", false);
    l.watered = true;
    e.life.needs = { ...e.life.needs, energy: Math.max(0, e.life.needs.energy - 4) };
    e.dirty = true;
    this.out.toast(actor, "Regaste a lavra.", true);
  }

  private lavraHarvest(actor: LifeActor, e: Entry): void {
    const l = e.life.lavra;
    if (!l) return this.out.toast(actor, "A tua lavra está vazia.", false);
    const c = CROPS[l.crop]!;
    const t = this.now();
    if (t < l.readyAt) return this.out.toast(actor, `${c.name} ainda não está pronto: faltam ${Math.ceil((l.readyAt - t) / 60_000)} min.`, false);
    // choveu durante o crescimento conta como rega
    const rained = weatherAt(l.plantedAt).ceu === "chuva" || weatherAt(l.readyAt).ceu === "chuva" || weatherAt(l.plantedAt).ceu === "trovoada";
    const agro = e.life.uni.licenciaturas.includes("agronomia") ? 1.5 : 1; // engenheiro agrónomo colhe mais
    const epoca = hasEvent(t, "colheita") ? 1.25 : 1; // abril a junho no planalto
    const kg = Math.round(c.kg * (l.watered || rained ? 1 : DRY_FACTOR) * agro * epoca);
    e.life.colheita[l.crop] = (e.life.colheita[l.crop] ?? 0) + kg;
    e.life.colhidoTotal += kg;
    this.assocAdd(actor, e, kg * ASSOC_POINTS.colheita);
    e.life.lavra = null;
    e.dirty = true;
    this.out.toast(actor, `Colheste ${kg} kg de ${c.name}${l.watered || rained ? "" : " (sem rega rendeu metade)"}. Vende no mercado.`, true);
  }

  private async lavraSell(actor: LifeActor, e: Entry): Promise<void> {
    const inside = interiorAt(this.district, actor.x, actor.y);
    if (!(this.near(actor, (p) => p.kind === "door" && p.venue === "mercado", 2) || inside?.venue === "mercado"))
      return this.out.toast(actor, "A colheita vende-se no mercado do bairro.", false);
    let total = 0;
    const feira = hasEvent(this.now(), "feira") ? 1.3 : 1; // sábado: dia de feira
    const sold = { ...e.life.colheita };
    for (const [k, kg] of Object.entries(sold)) total += Math.round(kg * (CROPS[k]?.price ?? 0) * (await this.marketFactor(k)) * feira);
    if (total <= 0) return this.out.toast(actor, "Não tens colheita para vender.", false);
    e.money = await this.wallets.apply(actor.characterId, total, "lavra.venda", `lavra-venda:${actor.characterId}:${this.op()}`);
    e.life.colheita = {};
    for (const [k, kg] of Object.entries(sold)) this.marketTrade(k, kg); // muita oferta faz baixar o preço
    this.assocAdd(actor, e, (total / 100) * ASSOC_POINTS.venda);
    e.dirty = true;
    this.out.toast(actor, `Vendeste a colheita no mercado: +${total.toLocaleString("pt-PT")} Kz.`, true);
  }

  // ---------------------------------------------------------------- ambição de vida

  /** Progresso (0..1) de uma ambição, medido no estado real da personagem. */
  private ambitionProgress(e: Entry, id: string): number {
    switch (id) {
      case "rico":
        return Math.min(1, (e.money + e.bank) / 1_000_000);
      case "casa":
        return e.homes.some((h) => h.tenure === "buy") ? 1 : 0;
      case "doutor":
        return e.life.education / MAX_EDUCATION;
      case "popular":
        return Math.min(1, e.life.friends.length / 10);
      case "carro":
        return e.life.car ? 1 : 0;
      case "agricultor":
        return Math.min(1, e.life.colhidoTotal / 200);
    }
    return 0;
  }

  private ambitionPick(actor: LifeActor, e: Entry, id: string | undefined): void {
    if (!id || !AMBICOES[id]) return this.out.toast(actor, "Essa ambição não existe.", false);
    if (e.life.ambicoesFeitas.includes(id)) return this.out.toast(actor, "Já cumpriste essa ambição. Escolhe outra!", false);
    e.life.ambicao = id;
    e.dirty = true;
    this.out.toast(actor, `A tua ambição agora: ${AMBICOES[id].text}.`, true);
  }

  private async ambitionClaim(actor: LifeActor, e: Entry): Promise<void> {
    const id = e.life.ambicao;
    if (!id) return this.out.toast(actor, "Ainda não escolheste uma ambição.", false);
    if (this.ambitionProgress(e, id) < 1) return this.out.toast(actor, "Ainda não cumpriste a tua ambição.", false);
    const a = AMBICOES[id]!;
    e.money = await this.wallets.apply(actor.characterId, a.reward, `ambicao.${id}`, `ambicao:${actor.characterId}:${id}`);
    e.life.ambicoesFeitas.push(id);
    e.life.ambicao = null;
    e.dirty = true;
    recordNews("missoes", this.district.name, `${actor.name ?? "Alguém"} cumpriu a ambição de vida: ${a.text}!`, this.now());
    this.out.toast(actor, `Ambição cumprida! +${a.reward.toLocaleString("pt-PT")} Kz. Escolhe a próxima.`, true);
  }

  // ---------------------------------------------------------------- biscatos

  /** Biscato: sem estudos nem documentos; engraxar/lavar na paragem, carregar no mercado, zungar na rua. */
  private biscato(actor: LifeActor, e: Entry, id: string | undefined): void {
    const b = BISCATOS[id ?? ""];
    if (!b) return this.out.toast(actor, "Esse biscato não existe.", false);
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    const day = angolaDay(this.now());
    if (e.life.biscatosDay !== day) {
      e.life.biscatosDay = day;
      e.life.biscatos = 0;
    }
    if (e.life.biscatos >= BISCATOS_PER_DAY) return this.out.toast(actor, "Já fizeste biscatos que chegue hoje. Descansa!", false);
    if (e.life.needs.energy < 10) return this.out.toast(actor, "Estás sem forças. Come ou dorme primeiro.", false);
    if (this.tooSick(actor, e)) return;
    const inside = interiorAt(this.district, actor.x, actor.y);
    if (b.where === "stop" && !this.near(actor, (p) => p.kind === "stop", 2))
      return this.out.toast(actor, `${b.name} faz-se na paragem do bairro.`, false);
    if (b.where === "mercado" && !(this.near(actor, (p) => p.kind === "door" && p.venue === "mercado", 2) || inside?.venue === "mercado"))
      return this.out.toast(actor, "Vai ao mercado do bairro para carregar sacos.", false);
    if (b.where === "rua" && inside) return this.out.toast(actor, "Para zungar tens de estar na rua.", false);
    this.startBusy(actor, e, "biscato");
    const busy = e.busy as Busy | null;
    if (busy) busy.item = id;
    e.dirty = true;
  }

  // ---------------------------------------------------------------- câmbio

  /** Comprar (usd > 0) ou vender (usd < 0) dólares à taxa do dia. */
  private async cambio(actor: LifeActor, e: Entry, usd: number): Promise<void> {
    if (!Number.isInteger(usd) || usd === 0 || Math.abs(usd) > 1000) return this.out.toast(actor, "Troca entre 1 e 1.000 USD de cada vez.", false);
    const day = angolaDay(this.now());
    if (e.life.cambioDay !== day) {
      e.life.cambioDay = day;
      e.life.cambioUsd = 0;
    }
    if (e.life.cambioUsd + Math.abs(usd) > CAMBIO_DAILY_USD) return this.out.toast(actor, `Limite do dia: ${CAMBIO_DAILY_USD} USD.`, false);
    const pr = cambioPrices(day);
    if (usd > 0) {
      const kz = usd * pr.buy;
      e.money = await this.wallets.apply(actor.characterId, -kz, "cambio.compra", `cambio:${actor.characterId}:${this.op()}`);
      e.life.usd += usd;
      this.out.toast(actor, `Compraste ${usd} USD por ${kz.toLocaleString("pt-PT")} Kz.`, true);
    } else {
      if (e.life.usd < -usd) return this.out.toast(actor, "Não tens esses dólares.", false);
      const kz = -usd * pr.sell;
      e.life.usd += usd;
      e.money = await this.wallets.apply(actor.characterId, kz, "cambio.venda", `cambio:${actor.characterId}:${this.op()}`);
      this.out.toast(actor, `Vendeste ${-usd} USD por ${kz.toLocaleString("pt-PT")} Kz.`, true);
    }
    e.life.cambioUsd += Math.abs(usd);
    e.dirty = true;
  }

  // ---------------------------------------------------------------- rádio

  private listenRadio(actor: LifeActor, e: Entry): void {
    const t = this.now();
    if (e.radioAt && t - e.radioAt < 20 * 60_000) return this.out.toast(actor, "Já estás a ouvir a rádio. A música faz bem!", true);
    e.radioAt = t;
    e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + RADIO_MOOD) };
    e.dirty = true;
    this.out.toast(actor, `A ouvir a Rádio do Bairro: o humor sobe (+${RADIO_MOOD}).`, true);
  }

  /** Dedicatória na rádio: paga e devolve o texto limpo (null = recusado). Quem chama envia a todo o bairro. */
  async radioDedication(actor: LifeActor, raw: unknown): Promise<string | null> {
    const e = this.entries.get(actor);
    if (!e) return null;
    const text = sanitizeChat(raw);
    if (!text) return null;
    try {
      e.money = await this.wallets.apply(actor.characterId, -RADIO_PRICE, "radio.dedicatoria", `radio:${actor.characterId}:${this.op()}`);
    } catch (err) {
      if (err instanceof InsufficientFunds) {
        this.out.toast(actor, `Uma dedicatória custa ${RADIO_PRICE} Kz.`, false);
        return null;
      }
      throw err;
    }
    recordNews("radio", this.district.name, `📻 ${actor.name ?? "Alguém"}: «${text}»`, this.now());
    this.out.toast(actor, `Dedicatória no ar (−${RADIO_PRICE} Kz).`, true);
    this.sendSelf(actor);
    return text;
  }

  // ---------------------------------------------------------------- amigos

  private byEid(eid: string | undefined): LifeActor | undefined {
    for (const a of this.entries.keys()) if (String(a.eid) === eid) return a;
    return undefined;
  }

  private friendRequest(actor: LifeActor, e: Entry, toEid: string | undefined): void {
    const target = this.byEid(toEid);
    if (!target || target === actor) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    if (Math.hypot(target.x - actor.x, target.y - actor.y) > TRANSFER_NEAR_CM * 2) return this.out.toast(actor, "Aproxima-te da pessoa para a convidar.", false);
    if (this.blocks(target, actor.characterId) || this.blocks(actor, target.characterId)) return this.out.toast(actor, "Não podes enviar pedidos a essa pessoa.", false);
    if (e.life.friends.some((f) => f.id === target.characterId)) return this.out.toast(actor, "Já são amigos.", false);
    if (e.life.friends.length >= MAX_FRIENDS) return this.out.toast(actor, `Já tens ${MAX_FRIENDS} amigos.`, false);
    const te = this.entries.get(target)!;
    te.friendReq = { from: actor, at: this.now() };
    this.out.toast(actor, `Pedido de amizade enviado a ${target.name ?? "alguém"}.`, true);
    this.out.toast(target, `${actor.name ?? "Alguém"} quer ser teu amigo. Abre Amigos no telemóvel.`, true);
    this.sendSelf(target);
  }

  private friendAnswer(actor: LifeActor, e: Entry, yes: boolean): void {
    const req = e.friendReq;
    e.friendReq = undefined;
    if (!req) return this.out.toast(actor, "Não tens pedidos de amizade.", false);
    const fe = this.entries.get(req.from);
    if (!yes) return this.out.toast(actor, "Pedido recusado.", true);
    if (!fe) return this.out.toast(actor, "Essa pessoa já saiu. Pede-lhe outra vez quando a vires.", false);
    const add = (who: Entry, other: LifeActor) => {
      if (!who.life.friends.some((f) => f.id === other.characterId) && who.life.friends.length < MAX_FRIENDS) who.life.friends.push({ id: other.characterId, name: other.name ?? "Amigo" });
      who.dirty = true;
    };
    add(e, req.from);
    add(fe, actor);
    this.onboard(actor, e, "social");
    this.onboard(req.from, fe, "social");
    this.out.toast(actor, `Agora és amigo de ${req.from.name ?? "alguém"}!`, true);
    this.out.toast(req.from, `${actor.name ?? "Alguém"} aceitou a tua amizade!`, true);
    this.sendSelf(req.from);
  }

  private friendRemove(actor: LifeActor, e: Entry, idx: number): void {
    const f = e.life.friends[idx];
    if (!f) return;
    e.life.friends.splice(idx, 1);
    e.dirty = true;
    this.out.toast(actor, `${f.name} saiu da tua lista de amigos.`, true);
  }

  // ---------------------------------------------------------------- grupos

  private async groupCreate(actor: LifeActor, e: Entry, raw: string | undefined): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para criar um grupo precisas de uma conta.", false);
    if (e.life.group) return this.out.toast(actor, `Já estás no grupo ${e.life.group.name}. Sai primeiro.`, false);
    const name = sanitizeChat(raw)?.replace(/[*]/g, "").trim() ?? "";
    if (name.length < 3 || name.length > 30) return this.out.toast(actor, "O nome do grupo tem de ter entre 3 e 30 letras.", false);
    e.money = await this.wallets.balance(actor.characterId);
    if (e.money < GROUP_PRICE) return this.out.toast(actor, `Criar um grupo custa ${GROUP_PRICE.toLocaleString("pt-PT")} Kz.`, false);
    let g;
    try {
      g = await this.groups.create(name, actor.characterId);
    } catch (err) {
      if (err instanceof GroupNameTaken) return this.out.toast(actor, "Já existe um grupo com esse nome.", false);
      throw err;
    }
    e.money = await this.wallets.apply(actor.characterId, -GROUP_PRICE, "grupo.criar", `grupo:${actor.characterId}:${g.id}`);
    e.life.group = { id: g.id, name: g.name };
    e.dirty = true;
    recordNews("grupo", this.district.name, `Nasceu um grupo novo: «${g.name}», criado por ${actor.name ?? "alguém"}.`, this.now());
    this.out.toast(actor, `Criaste o grupo «${g.name}».`, true);
  }

  private async groupJoin(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    if (e.life.group) return this.out.toast(actor, `Já estás no grupo ${e.life.group.name}. Sai primeiro.`, false);
    const g = id ? await this.groups.get(id) : null;
    if (!g) return this.out.toast(actor, "Esse grupo não existe.", false);
    await this.groups.adjust(g.id, 1);
    e.life.group = { id: g.id, name: g.name };
    e.dirty = true;
    this.out.toast(actor, `Entraste no grupo «${g.name}».`, true);
  }

  private async groupLeave(actor: LifeActor, e: Entry): Promise<void> {
    const g = e.life.group;
    if (!g) return this.out.toast(actor, "Não estás em nenhum grupo.", false);
    await this.groups.adjust(g.id, -1);
    e.life.group = null;
    e.dirty = true;
    this.out.toast(actor, `Saíste do grupo «${g.name}».`, true);
  }

  /** Grupo da personagem (para a conversa do grupo). */
  groupOf(actor: LifeActor): { id: string; name: string } | null {
    return this.entries.get(actor)?.life.group ?? null;
  }

  /** Algo social aconteceu (ex.: falou e alguém ouviu) → missões. */
  social(actor: LifeActor, kind: "conversar"): void {
    const e = this.entries.get(actor);
    if (!e) return;
    rollMissions(e.life.missions, this.now(), actor.characterId);
    const before = e.life.missions.done.join();
    this.mission(actor, e, kind);
    if (e.life.missions.done.join() !== before) this.sendSelf(actor);
  }

  /** Sorte do dia: grátis, uma vez por dia (Angola); o prémio é sorteado aqui no servidor. */
  private async sorte(actor: LifeActor, e: Entry): Promise<void> {
    const day = angolaDay(this.now());
    if (e.life.sorteDay === day) return this.out.toast(actor, "Já rodaste a sorte hoje. Volta amanhã!", false);
    const prize = rollSorte(this.rand()) * (hasEvent(this.now(), "aniversario") ? 2 : 1);
    e.life.sorteDay = day;
    e.dirty = true;
    if (prize > 0) e.money = await this.wallets.apply(actor.characterId, prize, "sorte.dia", `sorte:${actor.characterId}:${day}`);
    if (prize >= 2500) recordNews("sorte", this.district.name, `${actor.name ?? "Alguém"} ganhou ${prize.toLocaleString("pt-PT")} Kz na sorte do dia (${this.district.name}).`, this.now());
    this.out.toast(actor, prize > 0 ? `Sorte do dia: ganhaste ${prize.toLocaleString("pt-PT")} Kz!` : "Sorte do dia: hoje não calhou nada. Amanhã há mais!", prize > 0);
  }

  /** Dar dinheiro a alguém que está perto (cara a cara, como na rua). Convidados não podem. */
  private async transfer(actor: LifeActor, e: Entry, toEid: string | undefined, amount: number): Promise<void> {
    if (actor.userId?.startsWith("guest:")) return this.out.toast(actor, "Para transferir dinheiro precisas de uma conta (não convidado).", false);
    if (!Number.isInteger(amount) || amount < TRANSFER_MIN || amount > TRANSFER_MAX)
      return this.out.toast(actor, `Podes transferir entre ${TRANSFER_MIN} e ${TRANSFER_MAX.toLocaleString("pt-PT")} Kz de cada vez.`, false);
    let target: LifeActor | undefined;
    for (const a of this.entries.keys()) if (String(a.eid) === toEid && a !== actor) target = a;
    if (!target) return this.out.toast(actor, "Essa pessoa já não está aqui.", false);
    if (target.userId?.startsWith("guest:")) return this.out.toast(actor, "Essa pessoa joga como convidado e não pode receber dinheiro.", false);
    if (Math.hypot(target.x - actor.x, target.y - actor.y) > TRANSFER_NEAR_CM) return this.out.toast(actor, "Aproxima-te da pessoa para lhe dar o dinheiro.", false);
    if (this.blocks(target, actor.characterId)) return this.out.toast(actor, "Essa pessoa não aceita nada teu.", false);
    const te = this.entries.get(target)!;
    const op = this.op();
    // primeiro tira (falha sem dinheiro), depois dá; chaves únicas = não se repete
    e.money = await this.wallets.apply(actor.characterId, -amount, "transfer.out", `transfer:${actor.characterId}:${op}:out`);
    te.money = await this.wallets.apply(target.characterId, amount, "transfer.in", `transfer:${actor.characterId}:${op}:in`);
    this.out.toast(actor, `Deste ${amount.toLocaleString("pt-PT")} Kz a ${target.name ?? "alguém"}.`, true);
    this.out.toast(target, `${actor.name ?? "Alguém"} deu-te ${amount.toLocaleString("pt-PT")} Kz.`, true);
    this.sendSelf(target);
  }

  /** Uma ação real conta para a missão do dia (se for uma das de hoje). */
  /** Primeiros passos: marca o passo feito e avisa (o prémio recolhe-se no telemóvel). */
  private onboard(actor: LifeActor, e: Entry, step: string): void {
    if (e.life.inicio.includes(step) || !PRIMEIROS_PASSOS.some((p) => p.id === step)) return;
    e.life.inicio.push(step);
    e.dirty = true;
    const p = PRIMEIROS_PASSOS.find((x) => x.id === step)!;
    this.out.toast(actor, `Primeiro passo feito: ${p.text}! Recolhe ${p.reward.toLocaleString("pt-PT")} Kz no telemóvel.`, true);
  }

  private async claimOnboarding(actor: LifeActor, e: Entry, step: string | undefined): Promise<void> {
    const L = e.life;
    if (step === "tudo") {
      if (PRIMEIROS_PASSOS.some((p) => !L.inicioPagos.includes(p.id))) return this.out.toast(actor, "Recolhe primeiro todos os passos.", false);
      if (L.inicioPagos.includes("tudo")) return this.out.toast(actor, "Já recolheste este prémio.", false);
      L.inicioPagos.push("tudo");
      e.dirty = true;
      e.money = await this.wallets.apply(actor.characterId, PRIMEIROS_PASSOS_BONUS, "inicio.tudo", `inicio:${actor.characterId}:tudo`);
      return this.out.toast(actor, `Completaste os primeiros passos! +${PRIMEIROS_PASSOS_BONUS.toLocaleString("pt-PT")} Kz. Agora a vida é tua.`, true);
    }
    const p = PRIMEIROS_PASSOS.find((x) => x.id === step);
    if (!p) return this.out.toast(actor, "Passo desconhecido.", false);
    if (!L.inicio.includes(p.id)) return this.out.toast(actor, `Ainda não fizeste: ${p.text}.`, false);
    if (L.inicioPagos.includes(p.id)) return this.out.toast(actor, "Já recolheste este prémio.", false);
    L.inicioPagos.push(p.id);
    e.dirty = true;
    e.money = await this.wallets.apply(actor.characterId, p.reward, `inicio.${p.id}`, `inicio:${actor.characterId}:${p.id}`);
    this.out.toast(actor, `${p.text}: +${p.reward.toLocaleString("pt-PT")} Kz.`, true);
  }

  private mission(actor: LifeActor, e: Entry, kind: string, detail = ""): void {
    const step = ({ visitar: "entrar", comer: "comer", trabalhar: "turno", banco: "social" } as Record<string, string>)[kind];
    if (step) this.onboard(actor, e, step);
    const m = e.life.missions;
    const i = m.ids.indexOf(kind);
    const wasDone = i >= 0 && m.done[i];
    if (!progressMission(m, kind, detail)) return;
    e.dirty = true;
    if (!wasDone && m.done[i]) this.out.toast(actor, `Missão feita: ${MISSIONS[kind]?.text ?? kind}. Recolhe o prémio no telemóvel.`, true);
  }

  /** Recolher o prémio de uma missão feita (idempotente: cada prémio só se paga uma vez). */
  private async claimMission(actor: LifeActor, e: Entry, idx: number): Promise<void> {
    const m = e.life.missions;
    if (idx < 0 || idx >= m.ids.length) return this.out.toast(actor, "Missão desconhecida.", false);
    if (!m.done[idx]) return this.out.toast(actor, "Ainda não fizeste esta missão.", false);
    if (m.claimed[idx]) return this.out.toast(actor, "Já recolheste este prémio.", false);
    const id = m.ids[idx]!;
    const reward = MISSIONS[id]?.reward ?? 0;
    e.money = await this.wallets.apply(actor.characterId, reward, `mission.${id}`, `mission:${actor.characterId}:${m.day}:${idx}`);
    m.claimed[idx] = true;
    e.dirty = true;
    let note = "";
    if (m.claimed.every(Boolean)) {
      const bonus = this.streakBonus(m.streak);
      e.money = await this.wallets.apply(actor.characterId, bonus, "mission.streak", `mission-full:${actor.characterId}:${m.day}`);
      note = ` Dia completo! Sequência de ${m.streak} dia(s): +${bonus.toLocaleString("pt-PT")} Kz.`;
      if (m.streak >= 3) recordNews("missoes", this.district.name, `${actor.name ?? "Alguém"} já completa as missões há ${m.streak} dias seguidos.`, this.now());
    }
    this.out.toast(actor, `Prémio recolhido: +${reward.toLocaleString("pt-PT")} Kz.${note}`, true);
  }

  /** Bónus do dia completo: cresce com a sequência (até 7 dias seguidos). */
  private streakBonus(streak: number): number {
    return Math.round(STREAK_BONUS * Math.min(7, Math.max(1, streak)) / 7 / 100) * 100 + STREAK_BONUS / 2;
  }

  sendSelf(actor: LifeActor): void {
    const e = this.entries.get(actor);
    if (!e) return;
    this.checkAchievements(actor, e);
    if (actor.name && !actor.userId?.startsWith("guest:")) noteWealth(actor.characterId, actor.name, e.money + e.bank, this.now());
    const r = (v: number) => Math.round(v);
    const t = this.now();
    this.out.self(actor, {
      money: e.money,
      needs: { hunger: r(e.life.needs.hunger), energy: r(e.life.needs.energy), mood: r(e.life.needs.mood), health: r(e.life.needs.health) },
      family: e.life.family,
      familyLabel: FAMILY_LABEL[e.life.family],
      education: e.life.education,
      study: e.life.study,
      job: e.life.jobId,
      shifts: e.life.shiftsCount,
      parentsToday: e.life.parentsDay === angolaDay(t),
      busy: e.busy ? { kind: e.busy.kind, msLeft: Math.max(0, e.busy.until - t), total: e.busy.until - e.busy.startedAt } : null,
      bank: e.bank,
      docs: { ...e.life.docs },
      phoneCredit: e.life.phoneCredit,
      car: e.life.car,
      inside: (() => {
        const i = interiorAt(this.district, actor.x, actor.y);
        return i ? { id: i.id, venue: i.venue, name: i.name, ...(i.unit ? { unit: i.unit } : {}) } : null;
      })(),
      homes: e.homes.map((h) => ({ unit: h.unit, name: this.interior(h.unit)?.name ?? h.unit, tenure: h.tenure, paidUntil: h.paidUntil })),
      offer: e.offer,
      travel: e.travel,
      birth: e.life.birth
        ? {
            classe: e.life.family,
            pais: e.life.birth.pais,
            provincia: e.life.birth.provincia,
            bairro: e.life.birth.bairro,
            bairroNome: getDistrict(e.life.birth.bairro)?.name ?? e.life.birth.bairro,
            kumbu: STARTING_MONEY[e.life.family],
            nova: e.newborn,
          }
        : null,
      sorteHoje: e.life.sorteDay === angolaDay(t),
      biscatos: { feitos: e.life.biscatosDay === angolaDay(t) ? e.life.biscatos : 0, max: BISCATOS_PER_DAY },
      cambio: (() => {
        const pr = cambioPrices(angolaDay(t));
        return { usd: e.life.usd, rate: pr.rate, buy: pr.buy, sell: pr.sell, usadoHoje: e.life.cambioDay === angolaDay(t) ? e.life.cambioUsd : 0, limite: CAMBIO_DAILY_USD };
      })(),
      friends: e.life.friends.map((f) => {
        const w = whereIs(f.id);
        return { name: f.name, online: !!w, bairro: w?.districtName ?? null, district: w?.district ?? null, roomId: w?.roomId ?? null };
      }),
      friendReq: e.friendReq && this.entries.has(e.friendReq.from) ? { name: e.friendReq.from.name ?? "Alguém" } : null,
      group: e.life.group,
      tempo: { ...weatherAt(t), previsao: forecast(t, 4) },
      lavra: e.life.lavra
        ? { crop: e.life.lavra.crop, name: CROPS[e.life.lavra.crop]?.name ?? e.life.lavra.crop, readyInS: Math.max(0, Math.ceil((e.life.lavra.readyAt - t) / 1000)), watered: e.life.lavra.watered }
        : null,
      colheita: { ...e.life.colheita },
      ambicao: e.life.ambicao
        ? { id: e.life.ambicao, text: AMBICOES[e.life.ambicao]!.text, reward: AMBICOES[e.life.ambicao]!.reward, progress: this.ambitionProgress(e, e.life.ambicao) }
        : null,
      ambicoesFeitas: [...e.life.ambicoesFeitas],
      partner: e.life.partner ? { name: e.life.partner.name, married: e.life.partner.married, online: !!whereIs(e.life.partner.id), desde: e.life.partner.since } : null,
      loveReq: e.loveReq && this.entries.has(e.loveReq.from) ? { name: e.loveReq.from.name ?? "Alguém" } : null,
      weddingReq: e.weddingReq && this.entries.has(e.weddingReq.from) ? { name: e.weddingReq.from.name ?? "O teu par" } : null,
      negocio: e.life.negocio
        ? {
            tipo: e.life.negocio.tipo,
            name: NEGOCIOS[e.life.negocio.tipo]?.name ?? e.life.negocio.tipo,
            nivel: e.life.negocio.nivel,
            perHour: negocioPerHour(e.life.negocio.tipo, e.life.negocio.nivel),
            pendente: this.businessPending(e),
            melhorar: e.life.negocio.nivel < NEGOCIO_MAX_NIVEL ? negocioUpgradeCost(e.life.negocio.tipo, e.life.negocio.nivel) : null,
            maxHoras: NEGOCIO_MAX_HOURS,
          }
        : null,
      imoveis: e.imoveis ?? null,
      extrato: e.extrato ?? null,
      bloqueados: e.life.bloqueados.map((b) => ({ name: b.name })),
      denuncias: { hoje: e.life.denunciasDay === angolaDay(t) ? e.life.denuncias : 0, max: DENUNCIAS_POR_DIA, motivos: MOTIVOS_DENUNCIA },
      roupas: [...e.life.roupas],
      kixikila: e.kixi
        ? {
            quota: e.kixi.quota,
            status: e.kixi.status,
            round: e.kixi.round,
            members: e.kixi.members.map((m) => m.name),
            paid: e.kixi.paid.length,
            vez: e.kixi.status === "a_correr" ? e.kixi.members[e.kixi.round % e.kixi.members.length]?.name ?? null : null,
            souMembro: e.kixi.members.some((m) => m.id === actor.characterId),
            jaPaguei: e.kixi.paid.includes(actor.characterId),
            souCriador: e.kixi.creator === actor.characterId,
          }
        : null,
      conquistas: Object.entries(CONQUISTAS).map(([id, c]) => ({ id, name: c.name, text: c.text, reward: c.reward, feita: e.life.conquistas.includes(id), paga: e.life.conquistasPagas.includes(id) })),
      eventos: eventsAt(t),
      agenda: upcoming(t, 8),
      convite: actor.userId?.startsWith("guest:")
        ? null
        : {
            code: e.inviteView?.code ?? null,
            convidados: e.inviteView?.convidados ?? 0,
            premiados: e.inviteView?.premiados ?? 0,
            usei: !!e.inviteView?.usei,
            recebido: !!e.inviteView?.usei?.rewarded,
            premioPronto: !!e.inviteView?.usei && !e.inviteView.usei.rewarded && this.turnosTotais(e) >= INVITE_MIN_SHIFTS,
            turnos: this.turnosTotais(e),
            precisa: INVITE_MIN_SHIFTS,
            premio: INVITE_PRIZE,
            podeUsar: !e.inviteView?.usei && this.turnosTotais(e) < INVITE_MIN_SHIFTS,
          },
      inicio: e.life.inicioPagos.includes("tudo")
        ? null
        : {
            passos: PRIMEIROS_PASSOS.map((p) => ({ ...p, feito: e.life.inicio.includes(p.id), pago: e.life.inicioPagos.includes(p.id) })),
            bonus: PRIMEIROS_PASSOS_BONUS,
            acabado: PRIMEIROS_PASSOS.every((p) => e.life.inicioPagos.includes(p.id)),
          },
      estabelecimentos: (() => {
        const vv = e.venueView;
        const here = interiorAt(this.district, actor.x, actor.y);
        const hereOwned = here ? vv?.bairro.find((x) => x.interiorId === here.id) : undefined;
        return {
          meus: (vv?.meus ?? []).map((v) => ({
            id: v.interiorId,
            nome: v.nome,
            venue: VENUES_FOR_SALE[v.venue]?.name ?? v.venue,
            bairro: getDistrict(v.bairro)?.name ?? v.bairro,
            nivel: v.nivel,
            caixa: v.caixa,
            perHour: venuePerHour(v.venue, v.nivel),
            melhorar: v.nivel < VENUE_MAX_LEVEL ? venueUpgradeCost(v.venue, v.nivel) : null,
            vender: Math.round(v.investido * VENUE_RESALE),
          })),
          aqui:
            here && VENUES_FOR_SALE[here.venue]
              ? { id: here.id, nome: here.name, venue: VENUES_FOR_SALE[here.venue]!.name, dono: hereOwned ? hereOwned.ownerName : null, preco: hereOwned ? null : VENUES_FOR_SALE[here.venue]!.price, souDono: hereOwned?.owner === actor.characterId }
              : null,
          bairro: (vv?.bairro ?? []).map((v) => ({ nome: v.nome, dono: v.ownerName, nivel: v.nivel })),
          catalogo: Object.entries(VENUES_FOR_SALE).map(([k, x]) => ({ venue: k, name: x.name, price: x.price, perHour: x.perHour })),
          max: VENUE_MAX_OWNED,
          parte: VENUE_CUT,
        };
      })(),
      ilegal: (() => {
        const il = e.life.ilegal;
        if (!il) return null;
        const n = ILEGAIS[il.tipo]!;
        const hours = Math.min(24, Math.max(0, (t - il.lastCollect) / 3600_000));
        return { tipo: il.tipo, name: n.name, perHour: n.perHour, pendente: Math.floor(hours * n.perHour), risco: Math.round(raidChance(il.tipo, hours) * 100), texto: n.texto };
      })(),
      ilegais: Object.entries(ILEGAIS).map(([k, x]) => ({ tipo: k, name: x.name, cost: x.cost, perHour: x.perHour, texto: x.texto })),
      preso: e.busy?.kind === "preso" ? Math.max(0, Math.ceil((e.busy.until - t) / 1000)) : 0,
      loja: (() => {
        const v = e.shopView;
        const itens = (sh: Shop) =>
          Object.entries(sh.stock)
            .filter(([k]) => SHOP_ITEMS[k])
            .map(([k, x]) => ({ item: k, name: SHOP_ITEMS[k]!.name, qty: x.qty, price: x.price, cost: SHOP_ITEMS[k]!.cost }));
        return {
          minha: v?.minha
            ? { nome: v.minha.nome, caixa: v.minha.caixa, vendas: v.minha.vendas, bairro: getDistrict(v.minha.bairro)?.name ?? v.minha.bairro, itens: itens(v.minha), empregados: v.minha.empregados.map((x) => ({ name: x.name, salario: x.salario })) }
            : null,
          emprego: v?.emprego ? { nome: v.emprego.nome, bairro: getDistrict(v.emprego.bairro)?.name ?? v.emprego.bairro, dono: v.emprego.ownerName } : e.life.lojaEmprego ? { nome: e.life.lojaEmprego.nome, bairro: getDistrict(e.life.lojaEmprego.bairro)?.name ?? e.life.lojaEmprego.bairro, dono: "" } : null,
          aqui: (v?.aqui ?? []).map((x) => ({ id: x.id, nome: x.nome, dono: x.ownerName, itens: itens(x).filter((i) => i.qty > 0).map(({ cost: _c, ...rest }) => rest) })),
          oferta: e.shopOffer ? { from: e.shopOffer.from.name ?? "Alguém", nome: e.shopOffer.nome, salario: e.shopOffer.salario } : null,
          catalogo: Object.entries(SHOP_ITEMS).map(([k, x]) => ({ item: k, name: x.name, cost: x.cost })),
          licenca: SHOP_OPEN_PRICE,
          salarios: SHOP_WAGES,
        };
      })(),
      associacao: (() => {
        const v = e.assocView;
        const week = angolaWeek(t);
        const fresh = v && v.semana === week ? v : undefined;
        const top = fresh?.anterior[0];
        return {
          bairro: e.life.associacao,
          nome: e.life.associacao ? (getDistrict(e.life.associacao)?.name ?? e.life.associacao) : null,
          semana: week,
          total: fresh?.total ?? 0,
          meus: fresh?.meus ?? 0,
          objetivo: ASSOC_GOAL,
          premioObjetivo: ASSOC_GOAL_PRIZE,
          objetivoRecolhido: e.life.assocPremios.includes(`objetivo:${week}`),
          ranking: (fresh?.ranking ?? []).map((r) => ({ ...r, nome: getDistrict(r.bairro)?.name ?? r.bairro })),
          topAnterior: top
            ? {
                nome: getDistrict(top.bairro)?.name ?? top.bairro,
                pontos: top.pontos,
                souMembro: fresh?.meusAnterior?.bairro === top.bairro && (fresh?.meusAnterior?.pontos ?? 0) >= ASSOC_MIN_POINTS,
                recolhido: e.life.assocPremios.includes(`top:${previousWeek(t)}`),
                premio: ASSOC_TOP_PRIZE,
              }
            : null,
          aqui: this.district.name,
        };
      })(),
      mercado: (() => {
        this.refreshMarket();
        return Object.entries(MARKET_ITEMS).map(([k, m]) => ({ item: k, name: m.name, unit: m.unit, preco: Math.round(this.marketCache[k] ?? m.base), base: m.base }));
      })(),
      prendaHoje: (() => {
        const p = dayPrize(t);
        return p ? { name: p.name, premio: p.premio, recolhida: e.life.prendaDia === angolaDay(t) } : null;
      })(),
      visitados: e.life.visitados.length,
      uni: { curso: e.life.uni.curso, cursoNome: e.life.uni.curso ? CURSOS[e.life.uni.curso]?.name ?? null : null, aulas: e.life.uni.aulas, total: UNI_LESSONS, licenciaturas: [...e.life.uni.licenciaturas], preco: UNI_PRICE },
      doenca: e.life.doenca ? { id: e.life.doenca.id, name: DOENCAS[e.life.doenca.id]?.name ?? e.life.doenca.id, texto: DOENCAS[e.life.doenca.id]?.texto ?? "" } : null,
      roubo: e.life.roubo && !e.life.roubo.recovered && t - e.life.roubo.at <= ROUBO_RECOVER_MS ? { amount: e.life.roubo.amount, recuperavel: true } : null,
      criacao: (() => {
        this.tallyEggs(e);
        const c = e.life.criacao;
        return {
          animais: c.animais.map((a) => ({ tipo: a.tipo, name: ANIMAIS[a.tipo]?.name ?? a.tipo, prontoEmS: Math.max(0, Math.ceil((a.desde + (ANIMAIS[a.tipo]?.growMin ?? 0) * 60_000 - t) / 1000)) })),
          alimentadosS: Math.max(0, Math.ceil((c.fedUntil - t) / 1000)),
          ovos: c.ovos,
          max: MAX_ANIMAIS,
          racao: RACAO_PRICE,
        };
      })(),
      filhos: e.life.filhos.map((f) => {
        const anos = idadeAnos(f, t);
        const fase = faseDe(anos);
        return {
          nome: f.nome,
          sexo: f.sexo,
          idade: anos,
          fase: fase?.fase ?? "adulto/a",
          adulto: !fase,
          estudos: f.estudos,
          cuidadoHoje: f.cuidadoDia === angolaDay(t),
          custo: fase?.price ?? 0,
          cuidadoTexto: fase?.texto ?? "",
          ajudaHoje: f.ajudaDia === angolaDay(t),
          ajuda: AJUDA_BASE + AJUDA_POR_ESTUDO * f.estudos,
        };
      }),
      babyReq: e.babyReq ? { name: e.babyReq.from.name ?? "O teu par", nome: e.babyReq.nome } : null,
      geracao: e.life.geracao,
      carreira: (() => {
        const job = jobById(e.life.jobId);
        if (!job) return null;
        const n = e.life.carreira[job.id] ?? 0;
        const lv = careerLevel(job, n, e.life.education);
        const nx = CARREIRA[lv + 1];
        const blocked = !!nx && lv + 1 === CARREIRA.length - 1 && e.life.education < chefeEducation(job);
        return {
          titulo: CARREIRA[lv]!.titulo,
          nivel: lv,
          turnos: n,
          proximo: nx ? { titulo: nx.titulo, faltam: Math.max(0, nx.turnos - n), estudos: blocked ? chefeEducation(job) : null } : null,
          salario: Math.round(job.pay * CARREIRA[lv]!.mult),
        };
      })(),
      curriculo: Object.entries(e.life.carreira)
        .map(([j, n]) => {
          const jb = jobById(j)!;
          return { job: j, name: jb.name, titulo: CARREIRA[careerLevel(jb, n, e.life.education)]!.titulo, turnos: n };
        })
        .sort((a, b) => b.turnos - a.turnos),
      quiz: (() => {
        const { ids } = this.quizToday(e);
        const q = e.life.quizFeitas < QUIZ_POR_DIA ? QUIZ[ids[e.life.quizFeitas]!]! : null;
        return { n: e.life.quizFeitas, total: QUIZ_POR_DIA, certasHoje: e.life.quizCertasHoje, certas: e.life.quizCertas, pergunta: q?.q ?? null, opcoes: q?.o ?? [], premio: QUIZ_PREMIO };
      })(),
      seguro: { ativo: this.insured(e), faltamS: Math.max(0, Math.ceil((e.life.seguroAte - t) / 1000)), preco: SEGURO_PRICE },
      forma: { valor: Math.round(e.life.forma), treinosHoje: e.life.treinosDay === angolaDay(t) ? e.life.treinos : 0, max: TREINOS_POR_DIA },
      prazo: e.life.prazo
        ? {
            amount: e.life.prazo.amount,
            termo: e.life.prazo.termo,
            name: PRAZOS[e.life.prazo.termo]?.name ?? e.life.prazo.termo,
            rate: e.life.prazo.rate,
            faltamS: Math.max(0, Math.ceil((e.life.prazo.maturesAt - t) / 1000)),
            total: Math.round(e.life.prazo.amount * (1 + e.life.prazo.rate)),
          }
        : null,
      missions: {
        items: e.life.missions.ids.map((id, i) => ({ id, text: MISSIONS[id]?.text ?? id, reward: MISSIONS[id]?.reward ?? 0, done: e.life.missions.done[i] === true, claimed: e.life.missions.claimed[i] === true })),
        streak: e.life.missions.streak,
        streakBonus: this.streakBonus(e.life.missions.streak + (e.life.missions.lastFullDay === e.life.missions.day ? 0 : 1)),
        progress: e.life.missions.ids.includes("visitar") ? e.life.missions.seen.length : 0,
      },
    });
  }
}
