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
import { eventsAt, hasEvent } from "./events.js";
import { MemoryPostRepository, type PostRepository } from "../persistence/PostRepository.js";
import { MemoryKixikilaRepository, type Kixikila, type KixikilaRepository } from "../persistence/KixikilaRepository.js";
import { MemoryListingRepository, type ListingRepository } from "../persistence/ListingRepository.js";
import { MemoryReportRepository, type ReportRepository } from "../persistence/ReportRepository.js";
import { MemoryInboxRepository, type InboxItem, type InboxRepository } from "../persistence/InboxRepository.js";
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
  /** extrato pedido (últimos movimentos da carteira) */
  extrato?: WalletMove[];
  /** kixikila do grupo (lida quando a app pede ou depois de cada ação) */
  kixi?: Kixikila | null;
  /** pedido de namoro recebido / pedido de casamento recebido */
  loveReq?: { from: LifeActor };
  weddingReq?: { from: LifeActor };
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
  /** últimas falas de uma personagem nesta sala (contexto de uma denúncia) */
  recentChat?(characterId: string): string[];
}

const RESIDENTIAL = new Set(Object.keys(HOUSING));

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
  visitados: number;
  uni: { curso: string | null; cursoNome: string | null; aulas: number; total: number; licenciaturas: string[]; preco: number };
  doenca: { id: string; name: string; texto: string } | null;
  roubo: { amount: number; recuperavel: boolean } | null;
  criacao: { animais: Array<{ tipo: string; name: string; prontoEmS: number }>; alimentadosS: number; ovos: number; max: number; racao: number };
  forma: { valor: number; treinosHoje: number; max: number };
  prazo: { amount: number; termo: string; name: string; rate: number; faltamS: number; total: number } | null;
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
  /** Muxima: quantas publicações por pessoa na última hora */
  private readonly postTimes = new Map<string, number[]>();

  constructor(
    private readonly district: District,
    private readonly wallets: WalletRepository,
    private readonly out: LifeOutput,
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
    deps: { properties?: PropertyRepository; bank?: BankRepository; groups?: GroupRepository; posts?: PostRepository; kixikila?: KixikilaRepository; listings?: ListingRepository; reports?: ReportRepository; inbox?: InboxRepository } = {},
  ) {
    this.properties = deps.properties ?? new MemoryPropertyRepository(wallets);
    this.bank = deps.bank ?? new MemoryBankRepository(wallets);
    this.groups = deps.groups ?? new MemoryGroupRepository();
    this.posts = deps.posts ?? new MemoryPostRepository();
    this.kixi = deps.kixikila ?? new MemoryKixikilaRepository();
    this.listings = deps.listings ?? new MemoryListingRepository();
    this.reports = deps.reports ?? new MemoryReportRepository();
    this.inbox = deps.inbox ?? new MemoryInboxRepository();
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
    if (sv.doc) e.life.docs[sv.doc] = true;
    if (sv.credit) e.life.phoneCredit += sv.credit;
    const n = e.life.needs;
    const c = (v: number) => Math.max(0, Math.min(100, v));
    const boost = (sv.venue === "igreja" && hasEvent(this.now(), "missa")) || (sv.venue === "discoteca" && hasEvent(this.now(), "sexta")) ? 2 : 1;
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
      // afastou-se: interrompe
      if (Math.hypot(actor.x - e.busy.x, actor.y - e.busy.y) > 60) {
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
    if (kind === "work") {
      const job = jobById(e.life.jobId);
      if (!job) return;
      rollDay(e.life, this.now());
      const idx = e.life.shiftsCount;
      const pay = Math.round(job.pay * shiftFactor(idx));
      e.money = await this.wallets.apply(actor.characterId, pay, `work.${job.id}`, `shift:${actor.characterId}:${e.life.shiftsDay}:${idx}`);
      e.life.shiftsCount = idx + 1;
      e.life.needs = { ...n, energy: Math.max(0, n.energy - 12), hunger: Math.max(0, n.hunger - 8) };
      const note = idx >= 2 ? ` (turno ${idx + 1} do dia: ${Math.round(shiftFactor(idx) * 100)}%)` : "";
      this.out.toast(actor, `Turno concluído: +${pay.toLocaleString("pt-PT")} Kz${note}.`, true);
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
    if (e.money < a.price) return this.out.toast(actor, `Precisas de ${a.price.toLocaleString("pt-PT")} Kz.`, false);
    this.tallyEggs(e);
    e.money = await this.wallets.apply(actor.characterId, -a.price, `criacao.compra.${tipo}`, `criacao:${actor.characterId}:${this.op()}`);
    c.animais.push({ tipo: tipo!, desde: this.now() });
    if (c.animais.length === 1) c.ovosAt = this.now();
    e.dirty = true;
    this.out.toast(actor, `Compraste ${a.name.toLowerCase() === "galinha" ? "uma galinha" : "um " + a.name.toLowerCase()} (−${a.price.toLocaleString("pt-PT")} Kz). Não te esqueças da ração.`, true);
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
      const total = Math.round(c.ovos * OVO_PRICE * feira);
      e.money = await this.wallets.apply(actor.characterId, total, "criacao.ovos", `ovos:${actor.characterId}:${this.op()}`);
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
    const total = Math.round(a.sell * (hungry ? FOME_FACTOR : 1) * feira);
    e.money = await this.wallets.apply(actor.characterId, total, `criacao.venda.${what}`, `criacao-venda:${actor.characterId}:${this.op()}`);
    c.animais.splice(idx, 1);
    c.vendidos += 1;
    e.dirty = true;
    this.out.toast(actor, `Vendeste ${a.name.toLowerCase() === "galinha" ? "uma galinha" : "o " + a.name.toLowerCase()}: +${total.toLocaleString("pt-PT")} Kz${hungry ? " (estava magro de fome)" : ""}.`, true);
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
    if (e.money < g.price) return this.out.toast(actor, `${g.name} custa ${g.price.toLocaleString("pt-PT")} Kz.`, false);
    e.money = await this.wallets.apply(actor.characterId, -g.price, `presente.${id}`, `presente:${actor.characterId}:${this.op()}`);
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
    this.out.toast(actor, `Ofereceste ${g.name.toLowerCase()} a ${to.name} (−${g.price.toLocaleString("pt-PT")} Kz).`, true);
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
    const kg = Math.round(c.kg * (l.watered || rained ? 1 : DRY_FACTOR) * agro);
    e.life.colheita[l.crop] = (e.life.colheita[l.crop] ?? 0) + kg;
    e.life.colhidoTotal += kg;
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
    for (const [k, kg] of Object.entries(e.life.colheita)) total += Math.round(kg * (CROPS[k]?.price ?? 0) * feira);
    if (total <= 0) return this.out.toast(actor, "Não tens colheita para vender.", false);
    e.money = await this.wallets.apply(actor.characterId, total, "lavra.venda", `lavra-venda:${actor.characterId}:${this.op()}`);
    e.life.colheita = {};
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
  private mission(actor: LifeActor, e: Entry, kind: string, detail = ""): void {
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
