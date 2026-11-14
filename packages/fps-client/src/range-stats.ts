/**
 * The Practice Range panel's readouts (Time to kill, Shots / hits, Distance), kept per gun: your own shots and hits as
 * the game presents them, in sim seconds. A drawn gun clears them, so no readout is the last gun's.
 */

/** How long after your last shot the Distance readout keeps the burst's first reading (s): the kick has settled by then. */
export const DISTANCE_HOLD = 0.6;

/** A target's readout after one of your hits: the time to kill once it fell, the shots since your first hit on it, and the hits. */
export interface EngagementReadout {
  readonly ttk: number | null;
  readonly shots: number;
  readonly hits: number;
}

interface Engagement {
  readonly start: number;
  shots: number;
  hits: number;
}

export class RangeStats {
  readonly #tick: number;
  readonly #engagements = new Map<string, Engagement>();
  /** When your own recent shots left (sim seconds). */
  #shots: number[] = [];
  #hold: { readonly value: number | null; readonly until: number } | null = null;
  #live: number | null = null;

  /** @param tick the sim's tick (s): a shot and the hit it made are presented on whole ticks. */
  constructor(tick: number) {
    this.#tick = tick;
  }

  /** A gun drawn, a new life or a new game: nothing carries over. */
  clear(): void {
    this.#engagements.clear();
    this.#shots = [];
    this.#hold = null;
  }

  /** One of your shots left the barrel at `time`. */
  shot(time: number): void {
    for (const eng of this.#engagements.values()) eng.shots += 1;
    this.#shots.push(time);
    if (this.#shots.length > 64) this.#shots.shift();
    // The kick lifts the crosshair off what you fired at: the Distance keeps what it read when the burst began.
    const value = this.#hold && time < this.#hold.until ? this.#hold.value : this.#live;
    this.#hold = { value, until: time + DISTANCE_HOLD };
  }

  /**
   * Your bullet hit `victim` at `time` after `travel` seconds in the air. A tick fires before it moves bullets, so a fast
   * gun's next shot can leave in the tick its first hit lands: a new engagement counts every shot since the one that hit.
   */
  hit(victim: string, time: number, travel: number, killed: boolean): EngagementReadout {
    const start = time - travel;
    const eng = this.#engagements.get(victim) ?? { start, shots: Math.max(1, this.#shots.filter((t) => t > start - this.#tick).length), hits: 0 };
    eng.hits += 1;
    if (killed) this.#engagements.delete(victim);
    else this.#engagements.set(victim, eng);
    return { ttk: killed ? time - eng.start : null, shots: eng.shots, hits: eng.hits };
  }

  /** A kill by a grenade or a knife ends the engagement without a readout: the time to kill times gunfire. */
  end(victim: string): void {
    this.#engagements.delete(victim);
  }

  /** The Distance readout at `time`, from `measure` (what lies under the crosshair now) unless a burst's kick holds it. */
  distance(time: number, measure: () => number | null): number | null {
    if (this.#hold && time < this.#hold.until) return this.#hold.value;
    this.#hold = null;
    this.#live = measure();
    return this.#live;
  }
}
