import type { Vec3 } from '../math';
import { STATS } from '../stats';
import { isPressed, type UserCmd } from '../usercmd';
import type { World } from '../world';
import { EPSILON, X, Y, Z, offset, sweep, type Hull } from './collision';

/**
 * Player movement ("pmove"), Quake/IW lineage: friction, then acceleration
 * toward a wish velocity, then a collision move. Every tuning number comes
 * from the stats file.
 */

const M = STATS.movement;
const S = STATS.stance;

/** How far below the feet the ground check looks. Numerical, not a gameplay value. */
const GROUND_PROBE = 1e-3;

/** The movement-relevant state of one player. Mutated in place by {@link pmove}. */
export interface MoveState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  grounded: boolean;
}

export function createMoveState(position: Vec3, yaw: number): MoveState {
  return { position, velocity: [0, 0, 0], yaw, grounded: false };
}

function hullFor(): Hull {
  return { halfWidth: S.hullHalfWidth.value, height: S.standHullHeight.value };
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

/** Top speed for the current movement mode before directional scaling. */
function baseSpeed(cmd: UserCmd): number {
  let speed = M.walkSpeed.value;
  if (isPressed(cmd, 'Ads')) speed *= M.adsMoveMultiplier.value;
  return speed;
}

function applyFriction(state: MoveState, dt: number): void {
  const [vx, vy, vz] = state.velocity;
  const speed = Math.hypot(vx, vz);
  if (speed < EPSILON) {
    state.velocity = [0, vy, 0];
    return;
  }
  const control = Math.max(speed, M.stopSpeed.value);
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
  const hull = hullFor();
  state.yaw = cmd.yaw;
  state.grounded = onGround(world, state.position, hull);

  const w = wish(cmd, state.yaw, baseSpeed(cmd));
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
}
