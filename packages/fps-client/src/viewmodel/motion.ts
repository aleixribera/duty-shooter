/**
 * How the weapon in hand moves with the body (next-level ticket 10): it tilts
 * into a strafe, lags the look, hangs back through a jump and a fall, dips on
 * landing, tucks in crouched and cants over in a slide, swings to the sprint
 * carry, and bobs to the footsteps. Every layer is a spring, and the whole of
 * it is one offset on the pivot every gun hangs from, so a gun takes part by
 * being held, with nothing of its own to write.
 *
 * Two things it never does: it moves nothing but the gun (the aim is the
 * camera's, and stays where the player put it), and it is still while aiming.
 * Aimed, only the breath is left, a fifth of a millimetre.
 *
 * The camera-motion setting scales all of it; at 0 the gun does not move at
 * all between its poses. The sprint carry is the one thing left whole: it
 * says the gun is not ready, which is not decoration.
 *
 * No three.js, so it runs in a test as it runs in the game.
 */
import type { MovementState, Stance } from '@duty-shooter/fps-core';
import { Stride, fallSpeed, gaitOf, onFoot } from '../motion';
import { Spring } from '../spring';

const DEG = Math.PI / 180;

export interface WeaponMotionInput {
  /** Frame time (s). */
  readonly dt: number;
  /** The camera-motion setting, 0 to 1. */
  readonly amount: number;
  /** How far aimed, 0 to 1, eased. */
  readonly ads: number;
  readonly movement: MovementState;
  readonly stance: Stance;
  /** Speed over the ground (m/s). */
  readonly speed: number;
  /** Speed to the right of the view (m/s), negative to the left. */
  readonly strafe: number;
  /** Speed upward (m/s), negative falling. */
  readonly rise: number;
  /** How far the view turned this frame (radians). */
  readonly lookDelta: { readonly yaw: number; readonly pitch: number };
  /** How heavy the gun is to swing: 1 the M4A1, more a longer gun (it lags further and settles later). */
  readonly weight: number;
  /** False while the hands are busy (a reload, a melee): no sprint carry then. */
  readonly carries: boolean;
}

/** An offset on the gun: metres in view space (right, up, back), and radians (pitch up, yaw left, roll anticlockwise). */
export interface WeaponOffset {
  readonly p: [number, number, number];
  readonly r: [number, number, number];
  /** How far into the sprint carry, 0 to 1 (a touch past 1 as it arrives). */
  sprint: number;
}

type Pose = { readonly p: readonly [number, number, number]; readonly r: readonly [number, number, number] };

/** Crouched: the gun tucked in toward the chest and rolled a little inward. */
const CROUCH: Pose = { p: [-0.014, 0.008, 0.012], r: [0, 0.02, 0.1] };
/** Prone: lower, over the forearm. */
const PRONE: Pose = { p: [-0.012, -0.012, 0.005], r: [0, 0.03, 0.15] };
/** A slide: canted hard over and pushed out ahead, the way the body leans back. */
const SLIDE: Pose = { p: [-0.035, -0.018, -0.02], r: [0.05, 0.14, 0.34] };

/** A strafe at this speed (m/s) tilts the gun all the way. */
const FULL_STRAFE = 5;
const STRAFE_ROLL = 4.5 * DEG;
const STRAFE_LAG = 0.007;
/** The look's turn rate (rad/s) to the sway's reach, and the reach (m and rad come from it). */
const SWAY_PER_RATE = 0.015;
const SWAY_REACH_X = 0.05;
const SWAY_REACH_Y = 0.04;
/** Rising and falling: how far the gun hangs back (m per m/s), its reach, and how far the muzzle tips the other way (rad per m). */
const AIR_LAG = 0.0042;
const AIR_REACH = 0.028;
const AIR_PITCH = 1.6;
/** Landing: the spring's kick per m/s of fall, its most, and what the dip is worth in metres and in a nod. */
const LAND_KICK = 0.11;
const LAND_MOST = 1.9;
const LAND_DROP = 0.42;
const LAND_NOD = 1.1;
/** The bob, in metres at a full walk: down at each footfall, and to the side the weight is on. */
const BOB_DOWN = 0.013;
const BOB_SIDE = 0.01;
/** The breath, in metres: from the hip, and what is left of it aimed. */
const BREATH = 0.0015;
const BREATH_AIMED = 0.0002;

export class WeaponMotion {
  readonly stride = new Stride();
  readonly #swayX = new Spring(90, 12);
  readonly #swayY = new Spring(90, 12);
  readonly #tilt = new Spring(70, 13);
  readonly #air = new Spring(75, 11);
  readonly #dip = new Spring(120, 11);
  readonly #crouch = new Spring(110, 15);
  readonly #prone = new Spring(110, 15);
  readonly #slide = new Spring(150, 17);
  readonly #sprint = new Spring(130, 17);
  #time = 0;
  readonly #out: WeaponOffset = { p: [0, 0, 0], r: [0, 0, 0], sprint: 0 };

  /** A landing from `fallHeight` metres: the gun drops and nods by how fast the body came down. */
  land(fallHeight: number): void {
    this.#dip.velocity -= Math.min(LAND_MOST, fallSpeed(fallHeight) * LAND_KICK);
  }

  /** A footstep sounded: the bob lands with it. */
  footfall(): void {
    this.stride.footfall();
  }

  /** A frame's offset. The same object each call. */
  update(input: WeaponMotionInput): WeaponOffset {
    const { dt, movement, stance } = input;
    this.#time += dt;
    const stepping = onFoot(movement);
    const sprinting = movement === 'sprint';
    // A heavier gun swings on slower springs: the same shapes, later.
    const heavy = dt / Math.max(0.5, input.weight);
    const rate = dt > 0 ? 1 / dt : 0;

    this.stride.advance(input.speed * dt, dt, gaitOf(stance, movement), stepping);
    this.#swayX.update(heavy, Math.max(-SWAY_REACH_X, Math.min(SWAY_REACH_X, -input.lookDelta.yaw * rate * SWAY_PER_RATE)));
    this.#swayY.update(heavy, Math.max(-SWAY_REACH_Y, Math.min(SWAY_REACH_Y, input.lookDelta.pitch * rate * SWAY_PER_RATE)));
    this.#tilt.update(heavy, Math.max(-1, Math.min(1, input.strafe / FULL_STRAFE)));
    const airborne = movement === 'airborne';
    this.#air.update(heavy, airborne ? Math.max(-AIR_REACH, Math.min(AIR_REACH, -input.rise * AIR_LAG)) : 0);
    this.#dip.update(heavy);
    const sliding = movement === 'slide';
    this.#crouch.update(dt, stance === 'crouch' && !sliding ? 1 : 0);
    this.#prone.update(dt, stance === 'prone' ? 1 : 0);
    this.#slide.update(dt, sliding ? 1 : 0);
    this.#sprint.update(dt, sprinting && input.carries ? 1 : 0);

    // Everything below is hip-only, and the setting's to scale.
    const hip = (1 - input.ads) * input.amount;
    const walk = this.stride.amount * (1 + Math.max(0, this.#sprint.value) * 0.8);
    const bobX = this.stride.side * BOB_SIDE * walk;
    const bobY = (this.stride.lift - 1) * BOB_DOWN * walk;
    const breath = Math.sin(this.#time * 1.4) * (BREATH * (1 - input.ads) + BREATH_AIMED * input.ads) * input.amount;
    const crouch = this.#crouch.value;
    const prone = this.#prone.value;
    const slide = this.#slide.value;
    const tilt = this.#tilt.value;
    const dip = this.#dip.value;
    const posed = (i: 0 | 1 | 2, of: 'p' | 'r') => CROUCH[of][i] * crouch + PRONE[of][i] * prone + SLIDE[of][i] * slide;

    const out = this.#out;
    out.p[0] = (bobX + this.#swayX.value * 0.6 - tilt * STRAFE_LAG + posed(0, 'p')) * hip;
    out.p[1] = (bobY + this.#swayY.value * 0.5 + this.#air.value + dip * LAND_DROP + posed(1, 'p')) * hip + breath;
    out.p[2] = posed(2, 'p') * hip;
    out.r[0] = (this.#swayY.value * 0.6 + -this.#air.value * AIR_PITCH + dip * LAND_NOD + posed(0, 'r')) * hip;
    out.r[1] = (this.#swayX.value * 0.8 + this.stride.side * 0.012 * walk + posed(1, 'r')) * hip;
    out.r[2] = (bobX * 2 + this.#swayX.value * 1.2 - tilt * STRAFE_ROLL + posed(2, 'r')) * hip;
    out.sprint = this.#sprint.value;
    return out;
  }
}
