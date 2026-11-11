import type { Vec3 } from '../math';

/** The grid's cells are this wide (m): about how well a person places distant gunfire. */
const NOISE_CELL = 25;
/** Gunfire carries this far (m): what a person hears of it on the island. */
const EARSHOT = 400;
/** A cell's noise halves in about this long (s). */
const FADE = 18;
/** Below this a cell is quiet and dropped. */
const QUIET = 0.05;

interface Cell {
  heat: number;
  time: number;
  readonly x: number;
  readonly z: number;
}

/**
 * The island's gunfire and deaths, by 25 m cell, fading over half a minute:
 * the fights going on, as anyone in earshot could tell them by ear. A bot reads
 * only the cells within earshot of where it stands, so it learns no more than a
 * person listening would. Sparse: only cells with something in them are kept.
 */
export class NoiseGrid {
  readonly #cells = new Map<number, Cell>();

  #key(x: number, z: number): number {
    return (Math.floor(x / NOISE_CELL) + 512) * 1024 + (Math.floor(z / NOISE_CELL) + 512);
  }

  #now(c: Cell, time: number): number {
    return c.heat * Math.pow(0.5, Math.max(0, time - c.time) / FADE);
  }

  /** A sound at `p` (a shot is 1, a death more) at `time`. */
  add(p: Vec3, time: number, amount = 1): void {
    const key = this.#key(p[0], p[2]);
    const c = this.#cells.get(key);
    if (c) {
      c.heat = this.#now(c, time) + amount;
      c.time = time;
    } else {
      const x = (Math.floor(p[0] / NOISE_CELL) + 0.5) * NOISE_CELL;
      const z = (Math.floor(p[2] / NOISE_CELL) + 0.5) * NOISE_CELL;
      this.#cells.set(key, { heat: amount, time, x, z });
    }
  }

  /** How loud the cell holding `p` is at `time`. */
  heat(p: Vec3, time: number): number {
    const c = this.#cells.get(this.#key(p[0], p[2]));
    return c ? this.#now(c, time) : 0;
  }

  /**
   * The loudest cell within `reach` of `from` and farther than `beyond` (the
   * fight a listener is in isn't one it hears from afar), where `keep` allows:
   * its middle and how loud. Null when all is quiet.
   */
  loudest(from: Vec3, time: number, reach = EARSHOT, beyond = 0, keep?: (x: number, z: number) => boolean): { readonly x: number; readonly z: number; readonly heat: number } | null {
    let best: { x: number; z: number; heat: number } | null = null;
    for (const [key, c] of this.#cells) {
      const heat = this.#now(c, time);
      if (heat < QUIET) {
        this.#cells.delete(key);
        continue;
      }
      const d = Math.hypot(c.x - from[0], c.z - from[2]);
      if (d > reach || d < beyond || (best && heat <= best.heat) || (keep && !keep(c.x, c.z))) continue;
      best = { x: c.x, z: c.z, heat };
    }
    return best;
  }
}
