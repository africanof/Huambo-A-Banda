import { interiorAt, type District, type Interior, type Place } from "./districts.js";
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

/** O que o controlador precisa de saber de um jogador da sala. */
export interface LifeActor {
  characterId: string;
  x: number;
  y: number;
}

interface Busy {
  kind: keyof typeof DURATION;
  startedAt: number;
  until: number;
  x: number;
  y: number;
  place?: Place;
}

interface Entry {
  life: LifeState;
  money: number;
  bank: number;
  busy: Busy | null;
  dirty: boolean;
  /** frações (casas/apartamentos) desta personagem neste bairro */
  homes: Holding[];
  /** oferta de casas mostrada à porta de um edifício de habitação */
  offer: Offer | null;
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
  docs: { bi: boolean; registo: boolean };
  phoneCredit: number;
  /** interior onde estou (null = na rua) */
  inside: { id: string; venue: string; name: string; unit?: number } | null;
  homes: Array<{ unit: string; name: string; tenure: "buy" | "rent"; paidUntil: number | null }>;
  offer: Offer | null;
}

/** Catálogo enviado no WELCOME (o cliente desenha menus e vagas a partir dele). */
export function lifeCatalog() {
  return {
    jobs: JOBS,
    menus: MENUS,
    prices: { hotel: HOTEL_PRICE, study: STUDY_PRICE, homeMeal: HOME_MEAL.price },
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

  constructor(
    private readonly district: District,
    private readonly wallets: WalletRepository,
    private readonly out: LifeOutput,
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
    deps: { properties?: PropertyRepository; bank?: BankRepository } = {},
  ) {
    this.properties = deps.properties ?? new MemoryPropertyRepository(wallets);
    this.bank = deps.bank ?? new MemoryBankRepository(wallets);
  }

  /** Entrada na sala: estado guardado (ou personagem nova → família sorteada e dinheiro inicial). */
  async join(actor: LifeActor, stored: unknown | null): Promise<void> {
    let life: LifeState;
    if (stored) {
      life = sanitizeLife(stored, this.rand);
    } else {
      life = newLife(this.rand, this.now());
      await this.wallets.apply(actor.characterId, STARTING_MONEY[life.family], "family.start", `family:${actor.characterId}`);
    }
    rollDay(life, this.now());
    const money = await this.wallets.balance(actor.characterId);
    const bank = await this.bank.balance(actor.characterId);
    const e: Entry = { life, money, bank, busy: null, dirty: !stored, homes: [], offer: null };
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
    try {
      switch (msg.a) {
        case "self":
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
      }
    } catch (err) {
      if (err instanceof InsufficientFunds) this.out.toast(actor, "Não tens dinheiro suficiente.", false);
      else if (err instanceof GuestNotAllowed) this.out.toast(actor, "Para teres casa precisas de uma conta (não convidado).", false);
      else if (err instanceof PropertyTaken) this.out.toast(actor, err.already ? "Esta casa já é tua." : "Alguém ficou com esta casa primeiro.", false);
      else throw err;
    }
    this.sendSelf(actor);
  }

  private near(actor: LifeActor, test: (p: Place) => boolean): Place | undefined {
    let best: Place | undefined;
    let bestD = Infinity;
    for (const p of this.district.places ?? []) {
      if (!test(p)) continue;
      const d = Math.hypot(actor.x - p.x, actor.y - p.y);
      if (d <= p.radius && d < bestD) {
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
  }

  private takeJob(actor: LifeActor, e: Entry, jobId: string | undefined): void {
    const job = jobById(jobId);
    if (!job) return this.out.toast(actor, "Vaga desconhecida.", false);
    if (e.life.education < job.education) return this.out.toast(actor, `Precisas de estudos nível ${job.education}.`, false);
    for (const d of job.docs ?? []) {
      if (!e.life.docs[d]) return this.out.toast(actor, `Precisas de ${DOC_LABEL[d]} (${d === "bi" ? "Governo Provincial" : "Tribunal da Comarca"}).`, false);
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
    const door = this.near(actor, (p) => p.kind === "door");
    if (!door?.interiors?.length) return this.out.toast(actor, "Aproxima-te da porta de um edifício.", false);
    if (!RESIDENTIAL.has(door.venue ?? "")) {
      const i = this.interior(door.interiors[0]);
      if (!i) return;
      this.teleport(actor, e, i.entry.x, i.entry.y);
      return this.out.toast(actor, `Entraste: ${i.name}.`, true);
    }
    // habitação: só entra quem lá mora
    await this.refreshHomes(actor, e);
    const mine = door.interiors.map((id) => this.interior(id)).filter((i) => this.ownsInterior(e, i));
    const target = mine.find((i) => i!.id === unit) ?? mine[0];
    if (target) {
      this.teleport(actor, e, target.entry.x, target.entry.y);
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
  }

  private async service(actor: LifeActor, e: Entry, id: string | undefined): Promise<void> {
    const sv = SERVICES.find((s) => s.id === id);
    const spot = this.near(actor, (p) => p.kind === "service");
    const venue = this.interior(spot?.interior)?.venue;
    if (!sv || !spot || venue !== sv.venue) return this.out.toast(actor, "Esse serviço não é feito neste balcão.", false);
    if (sv.doc && e.life.docs[sv.doc]) return this.out.toast(actor, `Já tens ${DOC_LABEL[sv.doc]}.`, false);
    if (sv.needsDoc && !e.life.docs[sv.needsDoc]) return this.out.toast(actor, `Primeiro precisas do ${DOC_LABEL[sv.needsDoc]} (Governo Provincial).`, false);
    e.money = await this.wallets.apply(actor.characterId, -sv.price, `service.${sv.id}`, `service:${actor.characterId}:${this.op()}:${sv.id}`);
    if (sv.doc) e.life.docs[sv.doc] = true;
    if (sv.credit) e.life.phoneCredit += sv.credit;
    if (sv.mood) e.life.needs = { ...e.life.needs, mood: Math.min(100, e.life.needs.mood + sv.mood) };
    e.dirty = true;
    this.out.toast(actor, `${sv.name}: feito (−${sv.price.toLocaleString("pt-PT")} Kz).`, true);
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
      e.busy = null;
      await this.finish(actor, e, kind);
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

  private async finish(actor: LifeActor, e: Entry, kind: Busy["kind"]): Promise<void> {
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
    } else if (kind === "study") {
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
    } else if (kind === "sleep_casa") {
      e.life.needs = { ...n, energy: 100, mood: Math.min(100, n.mood + 15) };
      this.out.toast(actor, "Dormiste na tua cama. Não há nada como a nossa casa.", true);
    } else if (kind === "sleep_rua") {
      e.life.needs = { ...n, energy: Math.min(100, n.energy + 40), mood: Math.max(0, n.mood - 15) };
      this.out.toast(actor, "Dormiste no banco da paragem. Estás com o corpo dorido.", true);
    }
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
      inside: (() => {
        const i = interiorAt(this.district, actor.x, actor.y);
        return i ? { id: i.id, venue: i.venue, name: i.name, ...(i.unit ? { unit: i.unit } : {}) } : null;
      })(),
      homes: e.homes.map((h) => ({ unit: h.unit, name: this.interior(h.unit)?.name ?? h.unit, tenure: h.tenure, paidUntil: h.paidUntil })),
      offer: e.offer,
    });
  }
}
