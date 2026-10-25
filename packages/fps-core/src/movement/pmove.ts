import type { Vec3 } from '../math';
import { STATS } from '../stats';
import { Button, isPressed, type ButtonName, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { EPSILON, X, Y, Z, hullBlocked, offset, sweep, type Hull } from './collision';

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
export type MovementState = 'walk' | 'sprint' | 'tacticalSprint';

export type Stance = 'stand' | 'crouch' | 'prone';

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
  };
}

function pressedNow(state: MoveState, cmd: UserCmd, button: ButtonName): boolean {
  return isPressed(cmd, button) && (state.prevButtons & Button[button]) === 0;
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
function updateStance(state: MoveState, cmd: UserCmd, world: World, dt: number): void {
  let desired: Stance = isPressed(cmd, 'Prone') ? 'prone' : isPressed(cmd, 'Crouch') ? 'crouch' : 'stand';
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

/** Advances one player by one tick. */
export function pmove(state: MoveState, cmd: UserCmd, world: World, dt: number): void {
  state.yaw = cmd.yaw;
  state.grounded = onGround(world, state.position, hullFor(state.stance));
  updateStance(state, cmd, world, dt);
  const hull = hullFor(state.stance);

  updateSprint(state, cmd, dt);
  const w = wish(cmd, state.yaw, baseSpeed(state, cmd));
  if (state.grounded) {
    applyFriction(state, dt);
    accelerate(state, w.dir, w.speed, M.groundAcceleration.value, dt);
    state.velocity = [state.velocity[0], 0, state.velocity[2]];
  } else {
    accelerate(state, w.dir, w.speed, M.airAcceleration.value, dt);
  }

  // Horizontal move, one axis at a time.
  let pos = state.position;
  for (const axis of [X, Z] as const) {
    const r = sweep(world, pos, hull, axis, state.velocity[axis] * dt);
    pos = offset(pos, axis, r.moved);
    if (r.hit && Math.abs(r.moved) < Math.abs(state.velocity[axis] * dt)) {
      const v: [number, number, number] = [...state.velocity];
      v[axis] = 0;
      state.velocity = v;
    }
  }

  // Vertical move: exact parabola within the tick (average of start and end velocity).
  if (!state.grounded) {
    const vy0 = state.velocity[1];
    const vy1 = vy0 - M.gravity.value * dt;
    const r = sweep(world, pos, hull, Y, ((vy0 + vy1) / 2) * dt);
    pos = offset(pos, Y, r.moved);
    state.velocity = [state.velocity[0], r.hit ? 0 : vy1, state.velocity[2]];
    if (r.hit && vy1 < 0) state.grounded = true;
  }

  state.position = pos;
  state.prevButtons = cmd.buttons;
}
