import { performance } from "node:perf_hooks";

/**
 * Ciclo de jogo de passo fixo com acumulador.
 *
 * - `onStep(dt)` corre exatamente `simHz` vezes por segundo de tempo real
 *   (com recuperação limitada se o processo atrasar).
 * - `onSnapshot()` corre a cada `simHz / snapshotHz` passos, alinhado com a simulação.
 *
 * Usamos o nosso próprio ciclo (em vez do relógio da sala) para ter um ritmo
 * determinístico e independente de outros temporizadores do framework.
 */
export class GameLoop {
  private timer: NodeJS.Timeout | undefined;
  private acc = 0;
  private last = 0;
  private steps = 0;
  private readonly startedAt = performance.now();
  readonly stepMs: number;
  private readonly stepsPerSnapshot: number;

  constructor(
    simHz: number,
    snapshotHz: number,
    private readonly onStep: (dt: number) => void,
    private readonly onSnapshot: () => void,
    private readonly maxCatchUp = 5,
  ) {
    this.stepMs = 1000 / simHz;
    this.stepsPerSnapshot = Math.max(1, Math.round(simHz / snapshotHz));
  }

  /** Milissegundos desde o arranque do ciclo (relógio do servidor enviado aos clientes). */
  now(): number {
    return performance.now() - this.startedAt;
  }

  start(): void {
    if (this.timer) return;
    this.last = performance.now();
    this.timer = setInterval(() => this.frame(), this.stepMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Exposto para testes: avança o ciclo como se tivessem passado `elapsedMs`. */
  advance(elapsedMs: number): void {
    this.acc += elapsedMs;
    let ran = 0;
    while (this.acc >= this.stepMs && ran < this.maxCatchUp) {
      this.acc -= this.stepMs;
      ran++;
      this.onStep(this.stepMs / 1000);
      if (++this.steps % this.stepsPerSnapshot === 0) this.onSnapshot();
    }
    if (ran === this.maxCatchUp) this.acc = 0; // não entra em espiral se o processo bloquear
  }

  private frame(): void {
    const t = performance.now();
    const elapsed = t - this.last;
    this.last = t;
    this.advance(elapsed);
  }
}
