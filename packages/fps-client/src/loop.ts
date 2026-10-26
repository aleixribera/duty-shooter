import { TICK_SECONDS } from '@duty-shooter/fps-core';

const TICK_MS = TICK_SECONDS * 1000;
/** After a long stall (tab in the background), drop time instead of running hundreds of ticks. */
const MAX_TICKS_PER_FRAME = 8;

/**
 * Runs the simulation at its fixed tick rate from the render loop. Each frame
 * runs however many ticks are due, telling each one the slice of real time it
 * covers (for sub-tick fire timestamps), then reports how far the frame is
 * into the next tick so rendering can interpolate.
 */
export class FixedTickLoop {
  #last: number | null = null;
  #accumulator = 0;
  #tickStart = 0;

  /**
   * Advances to `now` (performance.now ms), calling `tick(start, end)` per due
   * tick. Returns the interpolation fraction in [0, 1) between the previous
   * and the latest tick.
   */
  frame(now: number, tick: (start: number, end: number) => void): number {
    if (this.#last === null) {
      this.#last = now;
      this.#tickStart = now;
    }
    this.#accumulator += now - this.#last;
    this.#last = now;
    if (this.#accumulator > TICK_MS * MAX_TICKS_PER_FRAME) {
      this.#accumulator = TICK_MS;
      this.#tickStart = now - TICK_MS;
    }
    while (this.#accumulator >= TICK_MS) {
      const start = this.#tickStart;
      this.#tickStart += TICK_MS;
      this.#accumulator -= TICK_MS;
      tick(start, this.#tickStart);
    }
    return this.#accumulator / TICK_MS;
  }

  reset(): void {
    this.#last = null;
    this.#accumulator = 0;
  }
}
