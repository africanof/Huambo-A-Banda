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
import { whereIs } from "./presence.js";
import { sanitizeChat } from "./social.js";

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

  constructor(
    private readonly district: District,
    private readonly wallets: WalletRepository,
    private readonly out: LifeOutput,
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
    deps: { properties?: PropertyRepository; bank?: BankRepository; groups?: GroupRepository } = {},
  ) {
    this.properties = deps.properties ?? new MemoryPropertyRepository(wallets);
    this.bank = deps.bank ?? new MemoryBankRepository(wallets);
    this.groups = deps.groups ?? new MemoryGroupRepository();
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

  async handle(actor: LifeActor, msg: ActionMessage): Promise<void> {
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
    e.life.jobId = job.id;
    e.dirty = true;
    this.out.toast(actor, `Novo emprego: ${job.name}. Vai a ${job.where} para trabalhar.`, true);
  }

  private startWork(actor: LifeActor, e: Entry): void {
    const job = jobById(e.life.jobId);
    if (!job) return this.out.toast(actor, "Ainda não tens emprego. Vê as vagas no telemóvel.", false);
    if (!this.near(actor, (p) => p.job === job.place)) return this.out.toast(actor, `Vai a ${job.where} para trabalhar.`, false);
    if (e.life.needs.energy < 10 || e.life.needs.hunger < 5) return this.out.toast(actor, "Estás sem forças. Come ou dorme primeiro.", false);
    this.startBusy(actor, e, "work");
  }

  private async startPaid(actor: LifeActor, e: Entry, kind: "study" | "sleep", price: number, where: (p: Place) => boolean, hint: string): Promise<void> {
    if (e.busy) return this.out.toast(actor, "Estás ocupado(a).", false);
    if (!this.near(actor, where)) return this.out.toast(actor, hint, false);
    if (kind === "study" && e.life.education >= MAX_EDUCATION) return this.out.toast(actor, "Já tens o nível máximo de estudos.", false);
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
    if (sv.price > 0) e.money = await this.wallets.apply(actor.characterId, -sv.price, `service.${sv.id}`, `service:${actor.characterId}:${this.op()}:${sv.id}`);
    if (sv.doc) e.life.docs[sv.doc] = true;
    if (sv.credit) e.life.phoneCredit += sv.credit;
    const n = e.life.needs;
    const c = (v: number) => Math.max(0, Math.min(100, v));
    e.life.needs = { hunger: n.hunger, mood: c(n.mood + (sv.mood ?? 0)), health: c(n.health + (sv.health ?? 0)), energy: c(n.energy + (sv.energy ?? 0)) };
    e.dirty = true;
    this.out.toast(actor, sv.price > 0 ? `${sv.name}: feito (−${sv.price.toLocaleString("pt-PT")} Kz).` : `${sv.name}: feito.`, true);
    this.mission(actor, e, "servico");
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
      const pay = Math.round((b.pay[0] + (b.pay[1] - b.pay[0]) * this.rand()) / 10) * 10;
      e.money = await this.wallets.apply(actor.characterId, pay, `biscato.${item}`, `biscato:${actor.characterId}:${e.life.biscatosDay}:${e.life.biscatos}`);
      e.life.biscatos += 1;
      e.life.needs = { ...n, energy: Math.max(0, n.energy - b.energy), hunger: Math.max(0, n.hunger - 4) };
      this.out.toast(actor, `${b.name}: +${pay.toLocaleString("pt-PT")} Kz (${e.life.biscatos}/${BISCATOS_PER_DAY} hoje).`, true);
      this.mission(actor, e, "biscato");
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
    const prize = rollSorte(this.rand());
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
      missions: {
        items: e.life.missions.ids.map((id, i) => ({ id, text: MISSIONS[id]?.text ?? id, reward: MISSIONS[id]?.reward ?? 0, done: e.life.missions.done[i] === true, claimed: e.life.missions.claimed[i] === true })),
        streak: e.life.missions.streak,
        streakBonus: this.streakBonus(e.life.missions.streak + (e.life.missions.lastFullDay === e.life.missions.day ? 0 : 1)),
        progress: e.life.missions.ids.includes("visitar") ? e.life.missions.seen.length : 0,
      },
    });
  }
}
