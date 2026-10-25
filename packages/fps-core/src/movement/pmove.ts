import type { Vec3 } from '../math';
import { STATS } from '../stats';
import { Button, isPressed, type ButtonName, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { EPSILON, X, Y, Z, hullBlocked, offset, sweep, type Hull } from './collision';
import { findLedge, mantleDuration, type MantleBand } from './mantle';

/**
 * Player movement ("pmove"), Quake/IW lineage: friction, then acceleration
 * toward a wish velocity, then a collision move. Every tuning number comes
 * from the stats file.
 */

const M = STATS.movement;
const S = STATS.stance;

/** How far below the feet the ground check looks. Numerical, not a gameplay value. */
const GROUND_PROBE = 1e-3;

/** What the player is doing, as reported in the match outputs. */
export type MovementState = 'walk' | 'sprint' | 'tacticalSprint' | 'airborne' | 'mantle' | 'slide';

export type Stance = 'stand' | 'crouch' | 'prone';

/** A mantle in progress: a timed, committal move from `from` to `to`. */
interface MantleProgress {
  readonly band: MantleBand;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly duration: number;
  ticks: number;
}

/** The movement-relevant state of one player. Mutated in place by {@link pmove}. */
export interface MoveState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  grounded: boolean;
  movement: MovementState;
  stance: Stance;
  /** The stance the current transition started from. */
  stanceFrom: Stance;
  /** Eye height above the feet (m); moves toward the stance's eye height. */
  eyeHeight: number;
  /** Speed of the current eye-height transition (m/s). */
  eyeRate: number;
  /** Tactical sprint time left, in seconds. */
  tacticalStamina: number;
  /** Buttons of the previous tick's usercmd, for press detection. */
  prevButtons: number;
  /** Highest feet height since leaving the ground, or null while grounded. */
  airPeak: number | null;
  /** Height fallen (m) if the player landed this tick, otherwise null. */
  landedFrom: number | null;
  mantle: MantleProgress | null;
  /** Band of the mantle reported this tick, or null when not mantling. */
  mantleBand: MantleBand | null;
  slide: SlideProgress | null;
}

/** A slide in progress: direction locked at entry, speed falling from the entry speed. */
interface SlideProgress {
  readonly dir: readonly [number, number];
  readonly entrySpeed: number;
  ticks: number;
}

export function createMoveState(position: Vec3, yaw: number): MoveState {
  return {
    position,
    velocity: [0, 0, 0],
    yaw,
    grounded: false,
    movement: 'walk',
    stance: 'stand',
    stanceFrom: 'stand',
    eyeHeight: S.standEyeHeight.value,
    eyeRate: 0,
    tacticalStamina: M.tacticalSprintDuration.value,
    prevButtons: 0,
    airPeak: null,
    landedFrom: null,
    mantle: null,
    mantleBand: null,
    slide: null,
  };
}

/** Moves the mantle on by one tick along a straight line; on arrival the player stands on the ledge. */
function advanceMantle(state: MoveState, m: MantleProgress, dt: number): void {
  m.ticks += 1;
  const f = Math.min(1, (m.ticks * dt) / m.duration);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const next: Vec3 = f >= 1 - 1e-9 ? m.to : [lerp(m.from[0], m.to[0]), lerp(m.from[1], m.to[1]), lerp(m.from[2], m.to[2])];
  state.velocity = [(next[0] - state.position[0]) / dt, (next[1] - state.position[1]) / dt, (next[2] - state.position[2]) / dt];
  state.position = next;
  state.movement = 'mantle';
  state.mantleBand = m.band;
  if (next === m.to) {
    state.mantle = null;
    state.velocity = [0, 0, 0];
    state.grounded = true;
    state.airPeak = null;
  }
}

function pressedNow(state: MoveState, cmd: UserCmd, button: ButtonName): boolean {
  return isPressed(cmd, button) && (state.prevButtons & Button[button]) === 0;
}

function releasedNow(state: MoveState, cmd: UserCmd, button: ButtonName): boolean {
  return !isPressed(cmd, button) && (state.prevButtons & Button[button]) !== 0;
}

/**
 * Slide speed falls linearly from the entry speed over the slide duration.
 * The deceleration is derived so a slide entered at sprint speed covers the
 * stats-file slide distance. The linear curve is a modelling choice; MW2019's
 * curve is unmeasured (see the stats file).
 */
const SLIDE_DECELERATION = Math.max(
  0,
  (2 * (M.sprintSpeed.value * STATS.slide.duration.value - STATS.slide.distance.value)) / STATS.slide.duration.value ** 2,
);

/**
 * Starts, cancels or ends a slide. A slide starts when crouch is pressed
 * while sprinting on the ground. Once the cancel window is open, releasing
 * crouch or pressing jump cancels it into a standing sprint and refreshes
 * tactical sprint (MW2019 behaviour). Returns a stance to force this tick.
 */
function updateSlide(state: MoveState, cmd: UserCmd, dt: number): Stance | undefined {
  const slide = state.slide;
  if (slide) {
    const elapsed = slide.ticks * dt;
    if (!state.grounded) {
      state.slide = null;
      return undefined;
    }
    const windowOpen = elapsed >= STATS.slide.cancelWindowOpen.value - 1e-9;
    if (windowOpen && (releasedNow(state, cmd, 'Crouch') || pressedNow(state, cmd, 'Jump'))) {
      state.slide = null;
      state.tacticalStamina = M.tacticalSprintDuration.value;
      state.movement = isPressed(cmd, 'TacticalSprint') ? 'tacticalSprint' : 'sprint';
      return 'stand';
    }
    if (elapsed >= STATS.slide.duration.value - 1e-9) {
      state.slide = null;
      return undefined;
    }
    return 'crouch';
  }
  const sprinting = state.movement === 'sprint' || state.movement === 'tacticalSprint';
  if (state.grounded && sprinting && state.stance === 'stand' && pressedNow(state, cmd, 'Crouch')) {
    const speed = Math.hypot(state.velocity[0], state.velocity[2]);
    const dir: readonly [number, number] =
      speed > EPSILON ? [state.velocity[0] / speed, state.velocity[2] / speed] : basis(state.yaw).forward;
    state.slide = { dir, entrySpeed: speed, ticks: 0 };
    return 'crouch';
  }
  return undefined;
}

/**
 * Chooses walk, sprint or tactical sprint and updates tactical sprint
 * stamina: it drains over the tactical sprint duration and refills from
 * empty over the recharge time.
 */
function updateSprint(state: MoveState, cmd: UserCmd, dt: number): void {
  const canSprint = state.grounded && state.stance === 'stand' && cmd.forward > 0 && !isPressed(cmd, 'Ads');
  const wantsSprint = isPressed(cmd, 'Sprint') || isPressed(cmd, 'TacticalSprint');
  const wasTac = state.movement === 'tacticalSprint';
  const tacHeld = canSprint && isPressed(cmd, 'TacticalSprint') && state.tacticalStamina > 0;
  const tac = tacHeld && (wasTac || pressedNow(state, cmd, 'TacticalSprint'));

  const duration = M.tacticalSprintDuration.value;
  if (tac) {
    state.tacticalStamina = Math.max(0, state.tacticalStamina - dt);
  } else {
    state.tacticalStamina = Math.min(duration, state.tacticalStamina + (dt * duration) / M.tacticalSprintRecharge.value);
  }
  state.movement = tac ? 'tacticalSprint' : canSprint && wantsSprint ? 'sprint' : 'walk';
}

function hullFor(stance: Stance): Hull {
  const height = stance === 'stand' ? S.standHullHeight : stance === 'crouch' ? S.crouchHullHeight : S.proneHullHeight;
  return { halfWidth: S.hullHalfWidth.value, height: height.value };
}

function eyeFor(stance: Stance): number {
  return (stance === 'stand' ? S.standEyeHeight : stance === 'crouch' ? S.crouchEyeHeight : S.proneEyeHeight).value;
}

/** Stats-file time for a full transition between two stances. */
function transitionTime(from: Stance, to: Stance): number {
  if (to === 'prone') return S.toProneTime.value;
  if (from === 'prone') return (to === 'stand' ? S.proneToStandTime : S.proneToCrouchTime).value;
  return S.standCrouchTime.value;
}

/**
 * Moves toward the stance the buttons ask for (prone over crouch over
 * stand), if there is headroom, and moves the eye toward that stance's
 * height at the rate its transition time implies.
 */
function updateStance(state: MoveState, cmd: UserCmd, world: World, dt: number, forced?: Stance): void {
  let desired: Stance = forced ?? (isPressed(cmd, 'Prone') ? 'prone' : isPressed(cmd, 'Crouch') ? 'crouch' : 'stand');
  if (desired === 'prone' && !state.grounded) desired = state.stance;
  if (desired !== state.stance && !hullBlocked(world, state.position, hullFor(desired))) {
    state.eyeRate = Math.abs(eyeFor(state.stance) - eyeFor(desired)) / transitionTime(state.stance, desired);
    state.stanceFrom = state.stance;
    state.stance = desired;
  }
  const target = eyeFor(state.stance);
  const step = state.eyeRate * dt;
  state.eyeHeight = Math.abs(target - state.eyeHeight) <= step ? target : state.eyeHeight + Math.sign(target - state.eyeHeight) * step;
}

/** Going prone and getting up from prone are committal: no movement until the transition ends. */
function inProneTransition(state: MoveState): boolean {
  return state.eyeHeight !== eyeFor(state.stance) && (state.stance === 'prone' || state.stanceFrom === 'prone');
}

/** Unit forward and right vectors on the ground plane for a view yaw (yaw 0 looks down -Z). */
function basis(yaw: number): { forward: readonly [number, number]; right: readonly [number, number] } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return { forward: [-s, -c], right: [c, -s] };
}

/** Wish direction (unit, X/Z) and wish speed from the movement axes. */
function wish(cmd: UserCmd, yaw: number, baseSpeed: number): { dir: readonly [number, number]; speed: number } {
  let f = cmd.forward;
  let r = cmd.right;
  const len = Math.hypot(f, r);
  if (len < EPSILON) return { dir: [0, 0], speed: 0 };
  if (len > 1) {
    f /= len;
    r /= len;
  }
  // Directional speed scales: backpedal and strafe are slower than forward.
  const fs = f >= 0 ? f : f * M.backpedalMultiplier.value;
  const rs = r * M.strafeMultiplier.value;
  const { forward, right } = basis(yaw);
  const x = (forward[0] * fs + right[0] * rs) * baseSpeed;
  const z = (forward[1] * fs + right[1] * rs) * baseSpeed;
  const speed = Math.hypot(x, z);
  if (speed < EPSILON) return { dir: [0, 0], speed: 0 };
  return { dir: [x / speed, z / speed], speed };
}

function stanceScale(stance: Stance): number {
  return stance === 'crouch' ? M.crouchMultiplier.value : stance === 'prone' ? M.proneMultiplier.value : 1;
}

/** Top speed for the current movement mode before directional scaling. */
function baseSpeed(state: MoveState, cmd: UserCmd): number {
  if (state.movement === 'tacticalSprint') return M.tacticalSprintSpeed.value;
  if (state.movement === 'sprint') return M.sprintSpeed.value;
  if (inProneTransition(state)) return 0;
  let speed = M.walkSpeed.value * stanceScale(state.stance);
  if (isPressed(cmd, 'Ads')) speed *= M.adsMoveMultiplier.value;
  return speed;
}

/**
 * Quake-style ground friction. The stop speed is scaled by the stance speed
 * multiplier so friction and acceleration keep the same balance in every
 * stance (unscaled, it would stall a prone crawl). That scaling is a
 * modelling choice, not a sourced MW2019 behaviour.
 */
function applyFriction(state: MoveState, dt: number): void {
  const [vx, vy, vz] = state.velocity;
  const speed = Math.hypot(vx, vz);
  if (speed < EPSILON) {
    state.velocity = [0, vy, 0];
    return;
  }
  const control = Math.max(speed, M.stopSpeed.value * stanceScale(state.stance));
  const next = Math.max(0, speed - control * M.groundFriction.value * dt);
  const k = next / speed;
  state.velocity = [vx * k, vy, vz * k];
}

function accelerate(state: MoveState, dir: readonly [number, number], wishSpeed: number, accel: number, dt: number): void {
  const [vx, vy, vz] = state.velocity;
  const current = vx * dir[0] + vz * dir[1];
  const add = wishSpeed - current;
  if (add <= 0) return;
  const step = Math.min(add, accel * wishSpeed * dt);
  state.velocity = [vx + dir[0] * step, vy, vz + dir[1] * step];
}

function onGround(world: World, pos: Vec3, hull: Hull): boolean {
  return sweep(world, pos, hull, Y, -GROUND_PROBE).hit;
}

interface MoveResult {
  readonly pos: Vec3;
  readonly blocked: readonly [x: boolean, z: boolean];
}

/** Moves horizontally one axis at a time, stopping at boxes. */
function slideMove(world: World, pos: Vec3, hull: Hull, dx: number, dz: number): MoveResult {
  const rx = sweep(world, pos, hull, X, dx);
  const afterX = offset(pos, X, rx.moved);
  const rz = sweep(world, afterX, hull, Z, dz);
  return {
    pos: offset(afterX, Z, rz.moved),
    blocked: [rx.hit && Math.abs(rx.moved) < Math.abs(dx), rz.hit && Math.abs(rz.moved) < Math.abs(dz)],
  };
}

/**
 * Ground move with step-up: if walking is blocked, try the same move from
 * up to one step height higher and settle back down onto the step. The
 * stepped move wins if it lands on something and gets further.
 */
function stepMove(world: World, pos: Vec3, hull: Hull, dx: number, dz: number): MoveResult {
  const flat = slideMove(world, pos, hull, dx, dz);
  if (!flat.blocked[0] && !flat.blocked[1]) return flat;
  const up = sweep(world, pos, hull, Y, M.stepHeight.value).moved;
  if (up <= EPSILON) return flat;
  const raised = slideMove(world, offset(pos, Y, up), hull, dx, dz);
  const down = sweep(world, raised.pos, hull, Y, -up);
  if (!down.hit) return flat;
  const travelled = (r: MoveResult) => Math.hypot(r.pos[0] - pos[0], r.pos[2] - pos[2]);
  if (travelled(raised) <= travelled(flat) + EPSILON) return flat;
  return { pos: offset(raised.pos, Y, down.moved), blocked: raised.blocked };
}

/** Advances one player by one tick. */
export function pmove(state: MoveState, cmd: UserCmd, world: World, dt: number): void {
  state.yaw = cmd.yaw;
  state.landedFrom = null;
  if (state.mantle) {
    advanceMantle(state, state.mantle, dt);
    state.prevButtons = cmd.buttons;
    return;
  }
  state.mantleBand = null;
  state.grounded = onGround(world, state.position, hullFor(state.stance));
  updateStance(state, cmd, world, dt, updateSlide(state, cmd, dt));
  const hull = hullFor(state.stance);

  // Mantle: press jump facing a ledge in a height band (on the ground or in the air).
  if (pressedNow(state, cmd, 'Jump') && state.stance === 'stand') {
    const ledge = findLedge(world, state.position, state.yaw, hull);
    if (ledge) {
      const m: MantleProgress = { band: ledge.band, from: state.position, to: ledge.destination, duration: mantleDuration(ledge.band), ticks: 0 };
      state.mantle = m;
      advanceMantle(state, m, dt);
      state.prevButtons = cmd.buttons;
      return;
    }
  }

  let jumped = false;
  if (state.grounded && state.stance === 'stand' && pressedNow(state, cmd, 'Jump')) {
    state.velocity = [state.velocity[0], Math.sqrt(2 * M.gravity.value * M.jumpHeight.value), state.velocity[2]];
    state.grounded = false;
    jumped = true;
  }
  const startedGrounded = state.grounded;

  updateSprint(state, cmd, dt);
  const w = wish(cmd, state.yaw, baseSpeed(state, cmd));
  if (state.slide) {
    // Committed to the slide: speed follows the slide curve (midpoint of this tick), direction is locked.
    const s = state.slide;
    const speed = Math.max(0, s.entrySpeed - SLIDE_DECELERATION * (s.ticks + 0.5) * dt);
    state.velocity = [s.dir[0] * speed, 0, s.dir[1] * speed];
    state.movement = 'slide';
    s.ticks += 1;
  } else if (state.grounded) {
    applyFriction(state, dt);
    accelerate(state, w.dir, w.speed, M.groundAcceleration.value, dt);
    state.velocity = [state.velocity[0], 0, state.velocity[2]];
  } else {
    accelerate(state, w.dir, w.speed, M.airAcceleration.value, dt);
  }

  const dx = state.velocity[0] * dt;
  const dz = state.velocity[2] * dt;
  const moved = startedGrounded ? stepMove(world, state.position, hull, dx, dz) : slideMove(world, state.position, hull, dx, dz);
  let pos = moved.pos;
  state.velocity = [moved.blocked[0] ? 0 : state.velocity[0], state.velocity[1], moved.blocked[1] ? 0 : state.velocity[2]];

  if (startedGrounded) {
    // Ground snapping: follow the floor down steps; past a step height, start falling.
    if (!onGround(world, pos, hull)) {
      const down = sweep(world, pos, hull, Y, -M.stepHeight.value);
      if (down.hit) pos = offset(pos, Y, down.moved);
      else state.grounded = false;
    }
  } else {
    // Airborne: exact parabola within the tick (average of start and end velocity).
    const vy0 = state.velocity[1];
    const vy1 = vy0 - M.gravity.value * dt;
    const r = sweep(world, pos, hull, Y, ((vy0 + vy1) / 2) * dt);
    pos = offset(pos, Y, r.moved);
    state.velocity = [state.velocity[0], r.hit ? 0 : vy1, state.velocity[2]];
    if (r.hit && vy1 < 0 && !jumped) state.grounded = true;
  }

  if (state.grounded) {
    if (state.airPeak !== null) state.landedFrom = Math.max(0, state.airPeak - pos[1]);
    state.airPeak = null;
  } else {
    state.movement = 'airborne';
    state.airPeak = Math.max(state.airPeak ?? state.position[1], state.position[1], pos[1]);
  }
  state.position = pos;
  state.prevButtons = cmd.buttons;
}
