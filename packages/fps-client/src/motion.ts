/**
 * What the camera and the weapon in hand share of the body's motion
 * (next-level ticket 10): the stride the bob and the footstep sounds both walk
 * to, how hard a landing was, and the sideways speed the view leans with.
 *
 * No three.js and no DOM, so it runs in a test as it runs in the game.
 */
import { STATS, type MovementState, type Stance, type Vec3 } from '@duty-shooter/fps-core';

/** A full stride (two footsteps), in metres, by how the body is moving. */
export const STEP_LENGTH = { walk: 1.45, sprint: 1.75, crouch: 1.1, prone: 0.9 } as const;
export type Gait = keyof typeof STEP_LENGTH;

/** How a body on its feet is moving, for its stride. */
export function gaitOf(stance: Stance, movement: MovementState): Gait {
  return stance === 'prone' ? 'prone' : stance === 'crouch' ? 'crouch' : movement === 'sprint' ? 'sprint' : 'walk';
}

/** On its feet and stepping: not in the air, on a ledge, a ladder or sliding. */
export function onFoot(movement: MovementState): boolean {
  return movement !== 'airborne' && movement !== 'mantle' && movement !== 'slide' && movement !== 'ladder';
}

/** The speed (m/s) a body lands at after falling `fallHeight` metres. */
export function fallSpeed(fallHeight: number): number {
  return Math.sqrt(2 * STATS.movement.gravity.value * Math.max(0, fallHeight));
}

/** A velocity's part to the right of a view turned `yaw` (m/s): positive strafing right. */
export function strafeSpeed(velocity: Vec3, yaw: number): number {
  return velocity[0] * Math.cos(yaw) - velocity[2] * Math.sin(yaw);
}

/** The speed at which the bob is whole (m/s): a little over a sprint. */
const FULL_BOB_SPEED = 7;

/**
 * The stride: a phase that goes up by one each footstep, walked by the
 * distance covered, so the bob keeps the feet's time at any speed. A footstep
 * sound (`footfall`) pulls the phase onto its beat, so what is heard and what
 * is seen land together.
 */
export class Stride {
  #phase = 0;
  /** What is left of a footfall's correction, eased in over a few frames. */
  #pull = 0;
  #amount = 0;

  /** A frame: `distance` metres over the ground in `dt` seconds. */
  advance(distance: number, dt: number, gait: Gait, stepping: boolean): void {
    const speed = dt > 0 ? distance / dt : 0;
    if (stepping && distance < 1) this.#phase += distance / (STEP_LENGTH[gait] / 2);
    const k = 1 - Math.exp(-dt / 0.06);
    this.#phase += this.#pull * k;
    this.#pull -= this.#pull * k;
    this.#amount += ((stepping ? Math.min(1, speed / FULL_BOB_SPEED) : 0) - this.#amount) * (1 - Math.exp(-dt / 0.12));
    if (this.#phase > 1024) this.#phase -= 1024;
  }

  /** A footstep sounded: the phase belongs on a whole number now. */
  footfall(): void {
    const at = this.#phase + this.#pull;
    this.#pull += Math.round(at) - at;
  }

  /** 0 as a foot lands, 1 in the middle of the step. */
  get lift(): number {
    return (1 - Math.cos(2 * Math.PI * this.#phase)) / 2;
  }

  /** The foot the weight is on: 1 as the right lands, -1 as the left does, through 0 between. */
  get side(): number {
    return Math.cos(Math.PI * this.#phase);
  }

  /** How much of a walk this is, 0 standing (or off its feet) to 1 at a sprint, eased. */
  get amount(): number {
    return this.#amount;
  }
}
