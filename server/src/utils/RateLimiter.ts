/**
 * Token bucket simples e sem alocações por pedido.
 * Usado para limitar pedidos HTTP por IP e mensagens de jogo por tipo.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.last = now;
  }

  take(cost = 1, now: number = Date.now()): boolean {
    const elapsed = (now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Mapa de buckets por chave (ex.: IP), com limpeza periódica para não crescer sem limite. */
export class KeyedRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly maxKeys = 50_000,
  ) {}

  take(key: string, now: number = Date.now()): boolean {
    if (now - this.lastSweep > 60_000 || this.buckets.size > this.maxKeys) {
      this.buckets.clear();
      this.lastSweep = now;
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillPerSecond, now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(1, now);
  }
}
