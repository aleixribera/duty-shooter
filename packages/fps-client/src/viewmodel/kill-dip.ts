/**
 * The kill dip (PLAN item 9f): when your shot kills, the gun drops out of the
 * way for a moment so the falling body is seen instead of hidden behind the
 * front sight post, then comes back.
 *
 * It dips in 60 ms, holds about 150 ms at the bottom, and eases back over half a
 * second while the body lands, so the fall is in view from the hit to the
 * ground (review 14h judged frames 250 ms and 500 ms after the kill). Shots fired
 * through it leave it be: with a held trigger the kill lands about three rounds
 * before a player can let go, and cutting the dip there would hide every
 * full-auto kill. The aim is the camera's: the dip moves only the gun, never
 * where a shot goes, so a shot at a second enemy goes where it always would.
 *
 * No three.js, so it runs in a test as it runs in the game.
 */

/** Seconds to reach the bottom, the hold there, and the ease back. */
export const DIP_DOWN = 0.06;
export const DIP_HOLD = 0.2;
export const DIP_BACK = 0.5;

const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** The dip's depth, 0 (gun where it rests) to 1 (all the way down), `t` seconds after the kill. */
export function dipAt(t: number): number {
  if (t < 0) return 0;
  if (t < DIP_DOWN) return 1 - (1 - t / DIP_DOWN) ** 2;
  if (t < DIP_HOLD) return 1;
  return 1 - smooth((t - DIP_HOLD) / DIP_BACK);
}

export class KillDip {
  #t = Infinity;
  #value = 0;

  /** Your shot killed. A dip already running starts again from where it is, never jumping up first. */
  kill(): void {
    this.#t = this.#value > 0 ? DIP_DOWN * (1 - Math.sqrt(1 - this.#value)) : 0;
  }

  /** Advances by `dt` seconds and returns the depth, 0 to 1. */
  update(dt: number): number {
    if (this.#t !== Infinity) {
      this.#t += dt;
      this.#value = dipAt(this.#t);
      if (this.#t >= DIP_HOLD + DIP_BACK) this.#t = Infinity;
    } else this.#value = 0;
    return this.#value;
  }

  get value(): number {
    return this.#value;
  }
}
