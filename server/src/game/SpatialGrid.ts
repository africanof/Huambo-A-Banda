/**
 * Grelha espacial uniforme para Área de Interesse (AOI).
 *
 * Cada jogador só recebe as entidades das células à sua volta. Com 80 jogadores
 * por sala a diferença já é grande; é o que permite salas maiores no futuro
 * sem aumentar a banda de cada telemóvel.
 */
export class SpatialGrid {
  private readonly cells = new Map<number, Set<number>>();
  private readonly cellOf = new Map<number, number>();

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Suporta até 65k células por eixo — muito acima de qualquer bairro.
    return (cx & 0xffff) * 0x10000 + (cy & 0xffff);
  }

  upsert(id: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    const prev = this.cellOf.get(id);
    if (prev === k) return;
    if (prev !== undefined) this.cells.get(prev)?.delete(id);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(id);
    this.cellOf.set(id, k);
  }

  remove(id: number): void {
    const prev = this.cellOf.get(id);
    if (prev === undefined) return;
    const set = this.cells.get(prev);
    set?.delete(id);
    if (set && set.size === 0) this.cells.delete(prev);
    this.cellOf.delete(id);
  }

  /** Preenche `out` com os ids nas células dentro de `radiusCells` à volta de (x, y). */
  query(x: number, y: number, radiusCells: number, out: Set<number>): Set<number> {
    out.clear();
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let ix = cx - radiusCells; ix <= cx + radiusCells; ix++) {
      if (ix < 0) continue;
      for (let iy = cy - radiusCells; iy <= cy + radiusCells; iy++) {
        if (iy < 0) continue;
        const set = this.cells.get(this.key(ix, iy));
        if (set) for (const id of set) out.add(id);
      }
    }
    return out;
  }

  get size(): number {
    return this.cellOf.size;
  }
}
