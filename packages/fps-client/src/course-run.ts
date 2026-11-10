/**
 * The Course (next-level ticket 21): a timed run through a map's movement
 * course, from a start pad to a finish pad, against your own best. This is
 * the clock and its rules; where the pads are belongs to the map, and the
 * best time to the Profile.
 */
import type { Vec3 } from '@duty-shooter/fps-core';

/** An upright box in the world: its low and high corners. */
export interface CourseBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** The times (s) a run has to beat for each grade, best first. */
export interface CoursePar {
  readonly gold: number;
  readonly silver: number;
  readonly bronze: number;
}

/** Where a map's Course starts and ends. */
export interface CourseGates {
  /** The start pad: the clock starts as you leave it the right way. */
  readonly start: CourseBox;
  /** The way out of the start pad that starts the clock, along the ground (x, z). Leaving any other way starts nothing. */
  readonly toward: readonly [number, number];
  /** The finish pad: the clock stops as you step into it. */
  readonly finish: CourseBox;
  readonly par: CoursePar;
}

export type CourseGrade = 'gold' | 'silver' | 'bronze';

export type CourseEvent =
  /** Out of the start pad the right way: the clock is running. */
  | { readonly type: 'start' }
  /** Into the finish pad: the run's time (s). */
  | { readonly type: 'finish'; readonly seconds: number }
  /** The run is off: back on the start pad, dead, or out of time. */
  | { readonly type: 'abandon' };

/** A run that has taken this long (s) is not one any more: someone wandered off. */
export const COURSE_LIMIT = 180;

function inside(box: CourseBox, p: Vec3): boolean {
  return p[0] >= box.min[0] && p[0] <= box.max[0] && p[1] >= box.min[1] && p[1] <= box.max[1] && p[2] >= box.min[2] && p[2] <= box.max[2];
}

/** The grade `seconds` earns, or null for a run slower than bronze. */
export function courseGrade(seconds: number, par: CoursePar): CourseGrade | null {
  return seconds <= par.gold ? 'gold' : seconds <= par.silver ? 'silver' : seconds <= par.bronze ? 'bronze' : null;
}

/** A time as the clock shows it: seconds to the hundredth, minutes only once there are any ("27.41", "1:04.90"). */
export function courseTime(seconds: number): string {
  const hundredths = Math.max(0, Math.round(seconds * 100));
  const whole = Math.floor(hundredths / 100);
  const rest = String(hundredths % 100).padStart(2, '0');
  if (whole < 60) return `${whole}.${rest}`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${rest}`;
}

/** How a time stands against the one it is measured with: "-0.42" ahead, "+1.07" behind. */
export function courseDelta(seconds: number, against: number): string {
  const d = Math.round((seconds - against) * 100) / 100;
  return `${d < 0 ? '-' : '+'}${courseTime(Math.abs(d))}`;
}

/**
 * One player's runs at a Course. Fed where the player is each tick, it says
 * when a run starts, finishes or is off. Standing on the start pad sets it
 * ready; nothing but leaving the pad the right way starts the clock, so a
 * run can be taken at a sprint from behind the pad as well as from a stand.
 */
export class CourseRun {
  readonly #gates: CourseGates;
  /** Where the player last stood on the start pad, while they have not left it. */
  #ready: Vec3 | null = null;
  #startedAt: number | null = null;

  constructor(gates: CourseGates) {
    this.#gates = gates;
  }

  /** How long the run under way has taken at `time` (s), or null with none. */
  elapsed(time: number): number | null {
    return this.#startedAt === null ? null : Math.max(0, time - this.#startedAt);
  }

  /** The player is at `position` at `time` (s); null while there is no living body to time. */
  update(position: Vec3 | null, time: number): CourseEvent | null {
    const running = this.#startedAt !== null;
    if (position === null) {
      this.#ready = null;
      return running ? this.#stop() : null;
    }
    if (inside(this.#gates.start, position)) {
      this.#ready = position;
      return running ? this.#stop() : null;
    }
    const from = this.#ready;
    this.#ready = null;
    if (from) {
      const out = (position[0] - from[0]) * this.#gates.toward[0] + (position[2] - from[2]) * this.#gates.toward[1];
      if (out > 0) {
        this.#startedAt = time;
        return { type: 'start' };
      }
      return null;
    }
    if (!running) return null;
    const seconds = time - this.#startedAt!;
    if (inside(this.#gates.finish, position)) {
      this.#startedAt = null;
      return { type: 'finish', seconds };
    }
    return seconds > COURSE_LIMIT ? this.#stop() : null;
  }

  /** Nothing carried over: a new game, or the player taken somewhere else. */
  reset(): void {
    this.#ready = null;
    this.#startedAt = null;
  }

  #stop(): CourseEvent {
    this.#startedAt = null;
    return { type: 'abandon' };
  }
}
