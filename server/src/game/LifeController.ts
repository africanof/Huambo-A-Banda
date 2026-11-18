import type { District, Place } from "./districts.js";
import {
  DURATION,
  FAMILY_LABEL,
  HOTEL_PRICE,
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
import { InsufficientFunds, type WalletRepository } from "../persistence/index.js";
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
  busy: Busy | null;
  dirty: boolean;
}

export interface LifeOutput {
  self(actor: LifeActor, state: SelfState): void;
  toast(actor: LifeActor, text: string, ok: boolean): void;
}

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
}

/** Catálogo enviado no WELCOME (o cliente desenha menus e vagas a partir dele). */
export function lifeCatalog() {
  return { jobs: JOBS, menus: MENUS, prices: { hotel: HOTEL_PRICE, study: STUDY_PRICE }, durations: DURATION, lessonsPerLevel: LESSONS_PER_LEVEL };
}

/**
 * Sistema de vida de uma sala. Servidor autoritativo: o cliente pede ("comer funge"),
 * o servidor verifica o lugar, o dinheiro e o estado, e só então aplica.
 */
export class LifeController {
  private readonly entries = new Map<LifeActor, Entry>();
  private lastDecay: number | null = null;

  constructor(
    private readonly district: District,
    private readonly wallets: WalletRepository,
    private readonly out: LifeOutput,
    private readonly now: () => number = Date.now,
    private readonly rand: () => number = Math.random,
  ) {}

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
    this.entries.set(actor, { life, money, busy: null, dirty: !stored });
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
          await this.startPaid(actor, e, "study", STUDY_PRICE, (p) => p.job === "professor", "Vai à Escola Primária para estudar.");
          break;
        case "sleep":
          await this.startPaid(actor, e, "sleep", HOTEL_PRICE, (p) => p.kind === "sleep", "Vai ao hotel para dormir.");
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
      }
    } catch (err) {
      if (err instanceof InsufficientFunds) this.out.toast(actor, "Não tens dinheiro suficiente.", false);
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
    if (!place?.shop) return this.out.toast(actor, "Vai a uma cantina ou padaria para comer.", false);
    const item = (MENUS[place.shop] ?? []).find((m) => m.id === itemId);
    if (!item) return this.out.toast(actor, "Esse prato não existe aqui.", false);
    e.money = await this.wallets.apply(actor.characterId, -item.price, `food.${item.id}`, `food:${actor.characterId}:${this.now()}:${item.id}`);
    e.life.needs = applyFood(e.life.needs, item);
    e.dirty = true;
    this.out.toast(actor, `Comeste: ${item.name} (−${item.price} Kz).`, true);
  }

  private takeJob(actor: LifeActor, e: Entry, jobId: string | undefined): void {
    const job = jobById(jobId);
    if (!job) return this.out.toast(actor, "Vaga desconhecida.", false);
    if (e.life.education < job.education) return this.out.toast(actor, `Precisas de estudos nível ${job.education}.`, false);
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
    e.money = await this.wallets.apply(actor.characterId, -price, `${kind}.pay`, `${kind}:${actor.characterId}:${this.now()}`);
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
    });
  }
}
