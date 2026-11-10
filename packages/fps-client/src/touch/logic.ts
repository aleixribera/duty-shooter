/**
 * The touch layer's rules as plain functions, apart from the page: which
 * finger owns which control, what the move stick asks for, how a drag turns
 * the view, when auto-fire pulls the trigger and how much the aim slows over a
 * target. `controls.ts` is the page around them.
 */

/** The stick's travel (CSS px) from where the thumb landed to full deflection. */
export const STICK_RADIUS = 56;
/** Travel inside this share of the radius is rest: a thumb never lands dead still. */
export const STICK_DEADZONE = 0.16;
/** Pushed this far (of full) and mostly forward, the stick sprints. */
export const STICK_SPRINT = 0.92;
/** How far forward of sideways a push must be to sprint: forward at least this share of the deflection. */
export const STICK_SPRINT_FORWARD = 0.75;
/** Dragged this far past the top of its travel (in radii), the stick locks the sprint: the thumb can lift and the run goes on. */
export const STICK_LOCK = 1.7;

export interface StickRead {
  /** The usercmd's axes, each -1 to 1: forward is up the screen. */
  readonly forward: number;
  readonly right: number;
  /** Full forward deflection: the run. */
  readonly sprint: boolean;
  /** Dragged past the top of the travel: the sprint lock's place. */
  readonly lock: boolean;
  /** Where the knob draws, px from the stick's centre, kept inside the travel. */
  readonly knobX: number;
  readonly knobY: number;
}

/**
 * The stick, from how far the thumb is from where it landed (px, y down the
 * screen). A radial deadzone, then the rest of the travel rescaled so walking
 * starts from nothing, as the controller's sticks do.
 */
export function readStick(dx: number, dy: number, radius = STICK_RADIUS): StickRead {
  const travel = Math.hypot(dx, dy);
  const m = Math.min(1, travel / radius);
  if (m <= STICK_DEADZONE || travel === 0) return { forward: 0, right: 0, sprint: false, lock: false, knobX: 0, knobY: 0 };
  const ux = dx / travel;
  const uy = dy / travel;
  const out = (m - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  const forward = -uy * out;
  const forwardShare = -uy;
  return {
    forward,
    right: ux * out,
    sprint: m >= STICK_SPRINT && forwardShare >= STICK_SPRINT_FORWARD,
    lock: forwardShare >= STICK_SPRINT_FORWARD && travel >= radius * STICK_LOCK,
    knobX: ux * m * radius,
    knobY: uy * m * radius,
  };
}

/** Degrees the view turns per CSS px of drag at sensitivity 1, before acceleration. */
export const LOOK_DEGREES_PER_PX = 0.034;
/** The vertical turn against the horizontal: a thumb's arc drifts up and down, and the fight is mostly level. */
export const LOOK_VERTICAL = 0.72;
/** Drag speeds (px per ms) between which the gain climbs from slow to fast. */
const LOOK_SLOW_SPEED = 0.06;
const LOOK_FAST_SPEED = 1.5;
/** The gain at a creeping drag (fine aim) and at a flick (turning round). */
const LOOK_SLOW_GAIN = 0.62;
const LOOK_FAST_GAIN = 1.9;

/** The acceleration: how much a drag at `speed` (px per ms) turns for its distance, against the base rate. */
export function lookGain(speed: number): number {
  const t = Math.max(0, Math.min(1, (speed - LOOK_SLOW_SPEED) / (LOOK_FAST_SPEED - LOOK_SLOW_SPEED)));
  // Smoothstep: no kink where the gain starts or stops climbing.
  const s = t * t * (3 - 2 * t);
  return LOOK_SLOW_GAIN + (LOOK_FAST_GAIN - LOOK_SLOW_GAIN) * s;
}

/**
 * What a drag turns the view by (radians; yaw left is positive, pitch up is
 * positive, as the mouse's): `dx`, `dy` px moved in `dtMs`, at the touch
 * sensitivity (1 to 20), times `scale` (the sights' and the aim slowdown's).
 */
export function lookTurn(dx: number, dy: number, dtMs: number, sensitivity: number, scale = 1): { readonly yaw: number; readonly pitch: number } {
  if (dx === 0 && dy === 0) return { yaw: 0, pitch: 0 };
  // Events closer than a frame apart would read as flicks; ones that waited (a held finger) as creeping.
  const dt = Math.max(4, Math.min(50, dtMs));
  const k = ((LOOK_DEGREES_PER_PX * sensitivity * Math.PI) / 180) * lookGain(Math.hypot(dx, dy) / dt) * scale;
  return { yaw: -dx * k, pitch: -dy * k * LOOK_VERTICAL };
}

/**
 * Which finger owns which control. A control follows the one pointer that
 * pressed it and nobody else: a second finger on a control already held does
 * nothing, and lifting a finger frees only what it held.
 */
export class PointerBook<C> {
  readonly #byPointer = new Map<number, C>();

  /** Gives `control` to `pointer` if both are free; false (and nothing changes) otherwise. */
  claim(pointer: number, control: C): boolean {
    if (this.#byPointer.has(pointer)) return false;
    for (const held of this.#byPointer.values()) if (held === control) return false;
    this.#byPointer.set(pointer, control);
    return true;
  }

  /** The control `pointer` holds, if any. */
  owner(pointer: number): C | null {
    return this.#byPointer.get(pointer) ?? null;
  }

  /** Whether `pointer` is the one holding `control`. */
  owns(pointer: number, control: C): boolean {
    return this.#byPointer.get(pointer) === control;
  }

  held(control: C): boolean {
    for (const c of this.#byPointer.values()) if (c === control) return true;
    return false;
  }

  /** Frees what `pointer` held and returns it; null for a finger that held nothing. */
  release(pointer: number): C | null {
    const control = this.#byPointer.get(pointer) ?? null;
    this.#byPointer.delete(pointer);
    return control;
  }

  /** Frees everything, oldest first: the controls that were held. */
  clear(): C[] {
    const held = [...this.#byPointer.values()];
    this.#byPointer.clear();
    return held;
  }

  get size(): number {
    return this.#byPointer.size;
  }
}

/** A point or direction in the world. */
export type V3 = readonly [number, number, number];

/** How wide a body is for the crosshair's purposes (m): a little inside the shoulders, so auto-fire's shots land. */
export const BODY_RADIUS = 0.3;

export interface AimRead {
  /** Metres along the view to the point nearest the body. */
  readonly along: number;
  /** Metres between the view's line and the body's axis there; under BODY_RADIUS the crosshair is on it. */
  readonly miss: number;
}

/**
 * Where the view's line passes a standing body: `feet` its position and
 * `height` how tall it stands now (its eye height). Null for a body behind
 * the eye. The body is the segment from knee to head, so a crosshair on the
 * head or the chest counts and one on the ground at its feet does not.
 */
export function aimAt(eye: V3, forward: V3, feet: V3, height: number): AimRead | null {
  const low = feet[1] + height * 0.25;
  const high = feet[1] + height * 1.04;
  const cx = feet[0] - eye[0];
  const cz = feet[2] - eye[2];
  // Where the view passes the body's axis seen from above, and the height it has there, kept on the segment.
  const flat2 = forward[0] * forward[0] + forward[2] * forward[2];
  const pass = flat2 > 1e-9 ? (cx * forward[0] + cz * forward[2]) / flat2 : 0;
  const y = Math.max(low, Math.min(high, eye[1] + forward[1] * pass));
  // The view's nearest point to that point of the body: a look over its head measures to the head.
  const along = cx * forward[0] + (y - eye[1]) * forward[1] + cz * forward[2];
  if (along <= 0) return null;
  const px = eye[0] + forward[0] * along - feet[0];
  const py = eye[1] + forward[1] * along - y;
  const pz = eye[2] + forward[2] * along - feet[2];
  return { along, miss: Math.hypot(px, py, pz) };
}

/** Inside this many body radii of a target, a touch drag turns slower. */
const SLOW_REACH = 3.2;
/** The slowest the drag gets, with the crosshair on the body. */
export const SLOW_FLOOR = 0.55;
/** No slowdown past this angle off the crosshair (radians): point blank, a body's reach would otherwise fill the screen. */
const SLOW_MAX_ANGLE = (7 * Math.PI) / 180;

/**
 * The aim slowdown: what a touch drag is scaled by with a target this close
 * to the crosshair. 1 away from any target, down to SLOW_FLOOR on the body.
 * It only ever scales the player's own drag: the view never moves by itself.
 */
export function aimSlowdown(aim: AimRead | null): number {
  if (!aim) return 1;
  const reach = BODY_RADIUS * SLOW_REACH;
  if (aim.miss >= reach || Math.atan2(aim.miss, aim.along) > SLOW_MAX_ANGLE) return 1;
  const t = Math.max(0, (aim.miss - BODY_RADIUS) / (reach - BODY_RADIUS));
  return SLOW_FLOOR + (1 - SLOW_FLOOR) * t;
}

/** The crosshair must rest on an enemy this long (ms) before auto-fire pulls the trigger: a sweep past one does not shoot. */
export const AUTO_FIRE_DELAY_MS = 170;
/** Auto-fire holds on this long (ms) after the crosshair slips off, so tracking a runner does not stutter the burst. */
export const AUTO_FIRE_LINGER_MS = 110;

export interface AutoFireState {
  /** When the crosshair came onto a target (ms), or null while off one. */
  readonly since: number | null;
  /** When it was last on one (ms). */
  readonly lastOn: number;
  /** Whether the trigger is held now. */
  readonly holding: boolean;
  /** When the next press of a one-shot-per-press weapon is due (ms). */
  readonly nextPress: number;
}

export const AUTO_FIRE_IDLE: AutoFireState = { since: null, lastOn: -Infinity, holding: false, nextPress: 0 };

export interface AutoFireInput {
  readonly now: number;
  /** The crosshair is on an enemy that can be hit: in sight, alive, inside the weapon's range. */
  readonly onTarget: boolean;
  /** The player could fire now: alive, in play, a round in the magazine, not reloading, throwing or reviving. */
  readonly ready: boolean;
  /** A full-auto weapon fires while held; the others once per press. */
  readonly auto: boolean;
  /** The weapon's time between shots (ms). */
  readonly interval: number;
}

/** What auto-fire does this frame: hold the trigger, and whether this frame is a fresh press. */
export interface AutoFireOut {
  readonly state: AutoFireState;
  readonly hold: boolean;
  readonly press: boolean;
}

/**
 * Auto-fire's rule. The trigger goes down once the crosshair has rested on a
 * target for the delay, stays down while it is on (and a moment after), and
 * comes up when it leaves or the player cannot fire. A weapon that fires once
 * per press is pressed again each time its next shot is due.
 */
export function autoFire(state: AutoFireState, input: AutoFireInput): AutoFireOut {
  const { now } = input;
  if (!input.ready) return { state: AUTO_FIRE_IDLE, hold: false, press: false };
  const since = input.onTarget ? (state.since ?? now) : null;
  const lastOn = input.onTarget ? now : state.lastOn;
  const rested = since !== null && now - since >= AUTO_FIRE_DELAY_MS;
  // Once firing, a slip off the target is forgiven for a moment; before the first shot it is not.
  const hold = rested || (state.holding && now - lastOn <= AUTO_FIRE_LINGER_MS);
  if (!hold) return { state: { since, lastOn, holding: false, nextPress: state.nextPress }, hold: false, press: false };
  if (input.auto) return { state: { since, lastOn, holding: true, nextPress: state.nextPress }, hold: true, press: !state.holding };
  // One shot per press: press when the next is due, and only with the crosshair truly on (no lingering shot into a wall).
  const press = input.onTarget && now >= state.nextPress;
  return { state: { since, lastOn, holding: true, nextPress: press ? now + input.interval + 30 : state.nextPress }, hold: false, press };
}

/**
 * How far a weapon reaches for auto-fire (m), from its damage bands: half
 * again past its last falloff band (past that its shots are spread and weak,
 * and firing gives the player away for nothing), or `open` for a weapon with
 * no falloff at all (a rifle that kills at any distance).
 */
export function autoFireRange(bandRanges: readonly (number | undefined)[], open = 160): number {
  const ranges = bandRanges.filter((r): r is number => r !== undefined);
  return ranges.length === 0 ? open : Math.max(...ranges) * 1.5;
}
