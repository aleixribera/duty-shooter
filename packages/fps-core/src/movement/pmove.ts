import type { Vec3 } from '../math';
import { STATS } from '../stats';
import { Button, isPressed, type ButtonName, type UserCmd } from '../usercmd';
import type { Terrain } from '../terrain';
import type { Ladder, World } from '../world';
import { EPSILON, Y, clipVelocity, hullBlocked, offset, onSteepTerrain, slideMove, sweepY, wading, type Flat, type Hull, type MoveResult } from './collision';
import { findLedge, mantleDuration, type MantleBand } from './mantle';

/**
 * Player movement ("pmove"), Quake/IW lineage: friction, then acceleration
 * toward a wish velocity, then a collision move. Every tuning number comes
 * from the stats file.
 */

const M = STATS.movement;
const S = STATS.stance;
const T = STATS.terrain;

/** How far below the feet the ground check looks. Numerical, not a gameplay value. */
const GROUND_PROBE = 1e-3;

/** What the player is doing, as reported in the match outputs. */
export type MovementState = 'walk' | 'sprint' | 'tacticalSprint' | 'airborne' | 'mantle' | 'slide' | 'ladder';

export type Stance = 'stand' | 'crouch' | 'prone';

/** A mantle in progress: a timed, committal move from `from` to `to`. */
interface MantleProgress {
  readonly band: MantleBand;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly duration: number;
  ticks: number;
}

interface LadderProgress {
  readonly route: Ladder;
  /** Forward input climbs up when entered at the bottom, down when entered at the top. */
  readonly direction: 1 | -1;
  phase: 'topEntry' | 'climb' | 'topExit';
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
  ladder: LadderProgress | null;
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
    ladder: null,
  };
}

/** Ladder movement is deliberately slow; collision still stops the player's
 * hull at a ceiling or obstructed landing. */
const LADDER_SPEED = 1.8;
function advanceLadder(state: MoveState, cmd: UserCmd, world: World, dt: number): void {
  const l = state.ladder!;
  const {bottom, landing} = l.route;
  const hull = hullFor('stand');
  const dx = bottom[0]-landing[0], dz = bottom[2]-landing[2];
  const length = Math.hypot(dx,dz);
  const nx = dx/length, nz = dz/length;
  if (pressedNow(state, cmd, 'Jump')) {
    state.ladder = null;
    state.movement = 'airborne';
    state.grounded = false;
    state.velocity = [nx*3,2,nz*3];
    state.airPeak = state.position[1];
    return;
  }
  const input = Math.max(-1,Math.min(1,cmd.forward));
  let pos = state.position;
  if (l.phase === 'topEntry' || l.phase === 'topExit') {
    const towardBottom = (l.phase === 'topEntry') === (input >= 0);
    const target = towardBottom ? bottom : landing;
    const x = target[0]-pos[0], z = target[2]-pos[2], distance = Math.hypot(x,z);
    const step = Math.min(distance,LADDER_SPEED*dt*Math.abs(input));
    if (distance > EPSILON && step > 0) pos = slideMove(world,pos,hull,x/distance*step,z/distance*step).pos;
    if (Math.hypot(target[0]-pos[0],target[2]-pos[2]) < 0.01) {
      if (towardBottom) l.phase = 'climb';
      else { state.ladder = null; state.grounded = true; }
    }
  } else {
    const delta = LADDER_SPEED*dt*input*l.direction;
    const target = Math.max(bottom[1],Math.min(landing[1],pos[1]+delta));
    const moved = sweepY(world,pos,hull,target-pos[1]).moved;
    pos = offset(pos,Y,moved);
    if (delta > 0 && pos[1] >= landing[1]-EPSILON) l.phase = 'topExit';
    if (delta < 0 && pos[1] <= bottom[1]+EPSILON) { state.ladder = null; state.grounded = true; }
  }
  state.velocity = [(pos[0]-state.position[0])/dt,(pos[1]-state.position[1])/dt,(pos[2]-state.position[2])/dt];
  state.position = pos;
  state.movement = 'ladder';
  state.airPeak = null;
}

/** Attach only while walking toward a ladder from a supported end. */
function enterLadder(state: MoveState, cmd: UserCmd, world: World): void {
  if (!state.grounded || state.stance !== 'stand' || cmd.forward <= 0.2 || isPressed(cmd,'Jump')) return;
  const hull = hullFor('stand');
  const forward = basis(cmd.yaw).forward;
  for (const route of world.ladders) {
    const {bottom,landing} = route;
    const x = bottom[0]-landing[0], z = bottom[2]-landing[2], length = Math.hypot(x,z);
    if (length < EPSILON || landing[1] <= bottom[1]) continue;
    const facing = (forward[0]*x+forward[1]*z)/length;
    const near = (p: Vec3) => Math.hypot(state.position[0]-p[0],state.position[2]-p[2]) < 0.55 && Math.abs(state.position[1]-p[1]) < 0.12;
    if (near(bottom) && facing < -0.5) {
      const moved = slideMove(world,state.position,hull,bottom[0]-state.position[0],bottom[2]-state.position[2]);
      if (Math.hypot(moved.pos[0]-bottom[0],moved.pos[2]-bottom[2]) > 0.01) continue;
      state.position = moved.pos;
      state.ladder = {route,direction:1,phase:'climb'};
    } else if (near(landing) && facing > 0.5) {
      state.ladder = {route,direction:-1,phase:'topEntry'};
    } else continue;
    state.slide = null;
    state.velocity = [0,0,0];
    state.grounded = false;
    state.airPeak = null;
    return;
  }
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

/** Top speed for the current movement mode before directional scaling; `scale` is the weapon in hand's speed multiplier. */
function baseSpeed(state: MoveState, cmd: UserCmd, scale: number): number {
  if (state.movement === 'tacticalSprint') return M.tacticalSprintSpeed.value * scale;
  if (state.movement === 'sprint') return M.sprintSpeed.value * scale;
  if (inProneTransition(state)) return 0;
  let speed = M.walkSpeed.value * stanceScale(state.stance) * scale;
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

/** On something to stand on: ground past the slope limit doesn't count. */
function onGround(world: World, pos: Vec3, hull: Hull): boolean {
  return sweepY(world, pos, hull, -GROUND_PROBE).hit && !onSteepTerrain(world, pos, hull, GROUND_PROBE);
}

/**
 * Carries a ground-plane move over the terrain. The feet climb to the ground
 * where the move ends, unless that ground is past the slope limit or more
 * than a step above them, or the hull doesn't fit there: then the ground
 * stops the move like a wall, and it carries on along the face if it can.
 * Moving down or across a steep slope is free, so a player on one can leave it.
 */
function overTerrain(world: World, terrain: Terrain, from: Vec3, hull: Hull, moved: MoveResult): MoveResult {
  const climb = (p: Vec3): Vec3 | null => {
    const ground = terrain.heightAt(p[0], p[2]);
    const rise = ground - p[1];
    if (rise <= EPSILON) return p;
    if (rise > M.stepHeight.value || terrain.steepAt(p[0], p[2])) return null;
    const up: Vec3 = [p[0], ground, p[2]];
    return hullBlocked(world, up, hull) ? null : up;
  };
  const end = climb(moved.pos);
  if (end) return end === moved.pos ? moved : { pos: end, normals: moved.normals };
  const dx = moved.pos[0] - from[0];
  const dz = moved.pos[2] - from[2];
  const length = Math.hypot(dx, dz);
  const n: Flat = terrain.downhillAt(moved.pos[0], moved.pos[2]) ?? [-dx / length, -dz / length];
  const into = dx * n[0] + dz * n[1];
  const along = climb(slideMove(world, from, hull, dx - n[0] * into, dz - n[1] * into).pos);
  return { pos: along ?? from, normals: [...moved.normals, n] };
}

/** What sliding on a steep slope leaves of a velocity: none of it into the ground, and no more than the slide speed. */
function alongSlope(terrain: Terrain, pos: Vec3, v: Vec3): Vec3 {
  const n = terrain.normalAt(pos[0], pos[2]);
  const into = Math.min(0, v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);
  const x = v[0] - n[0] * into;
  const y = v[1] - n[1] * into;
  const z = v[2] - n[2] * into;
  const k = Math.min(1, T.slopeSlideSpeed.value / Math.max(EPSILON, Math.hypot(x, y, z)));
  return [x * k, y * k, z * k];
}

/**
 * Ground move with step-up: if walking is blocked, try the same move from
 * up to one step height higher and settle back down onto the step. The
 * stepped move wins if it lands on something and gets further.
 */
function stepMove(world: World, pos: Vec3, hull: Hull, dx: number, dz: number): MoveResult {
  const flat = slideMove(world, pos, hull, dx, dz);
  if (flat.normals.length === 0) return flat;
  const up = sweepY(world, pos, hull, M.stepHeight.value).moved;
  if (up <= EPSILON) return flat;
  const raised = slideMove(world, offset(pos, Y, up), hull, dx, dz);
  const down = sweepY(world, raised.pos, hull, -up);
  if (!down.hit) return flat;
  const travelled = (r: MoveResult) => Math.hypot(r.pos[0] - pos[0], r.pos[2] - pos[2]);
  if (travelled(raised) <= travelled(flat) + EPSILON) return flat;
  return { pos: offset(raised.pos, Y, down.moved), normals: raised.normals };
}

/** Sideways steps the door assist tries, out to its reach. */
const ASSIST_STEPS = 6;
/** The door assist acts only on a move at most this far off head on into the face (cosine). */
const ASSIST_HEAD_ON = 0.5;

/**
 * Door assist: a move that runs head on into the edge of a door frame (or
 * any corner) slips sideways round it, so a hull that catches the frame does
 * not stall there. It looks along the face, out to the reach on either side,
 * for the nearest spot the move could carry on from for a hull width, and
 * slides toward it at the assist speed. The velocity keeps its part into the
 * face meanwhile, so the player is not slowed by the frame. Null when no
 * such spot is in reach (a plain wall).
 */
function doorAssist(world: World, hull: Hull, moved: MoveResult, dx: number, dz: number, dt: number): Vec3 | null {
  const n = moved.normals[0];
  const length = Math.hypot(dx, dz);
  if (!n || length < EPSILON) return null;
  const dir: Flat = [dx / length, dz / length];
  if (-(dir[0] * n[0] + dir[1] * n[1]) < ASSIST_HEAD_ON) return null;
  const reach = M.doorAssistReach.value;
  const probe = hull.halfWidth * 2;
  const pos = moved.pos;
  // Prefer the side the move already leans toward.
  const lean = dir[0] * -n[1] + dir[1] * n[0] < 0 ? -1 : 1;
  for (let i = 1; i <= ASSIST_STEPS; i++) {
    const e = (reach * i) / ASSIST_STEPS;
    for (const side of [lean, -lean]) {
      const t: Flat = [-n[1] * side, n[0] * side];
      const aside = slideMove(world, pos, hull, t[0] * e, t[1] * e);
      if (aside.normals.length > 0) continue;
      if (slideMove(world, aside.pos, hull, dir[0] * probe, dir[1] * probe).normals.length > 0) continue;
      const step = Math.min(e, M.doorAssistSpeed.value * dt);
      return slideMove(world, pos, hull, t[0] * step, t[1] * step).pos;
    }
  }
  return null;
}

/** Advances one player by one tick. `speedScale` scales walk and sprint speeds for the weapon in hand. */
export function pmove(state: MoveState, cmd: UserCmd, world: World, dt: number, speedScale = 1): void {
  state.yaw = cmd.yaw;
  state.landedFrom = null;
  if (state.mantle) {
    advanceMantle(state, state.mantle, dt);
    state.prevButtons = cmd.buttons;
    return;
  }
  state.mantleBand = null;
  if (state.ladder) {
    advanceLadder(state,cmd,world,dt);
    state.prevButtons = cmd.buttons;
    return;
  }
  // Nothing but a spawn or a lunge puts feet under the ground, and they come straight up.
  if (world.terrain) {
    const ground = world.terrain.heightAt(state.position[0], state.position[2]);
    if (ground > state.position[1]) state.position = [state.position[0], ground, state.position[2]];
  }
  state.grounded = onGround(world, state.position, hullFor(state.stance));
  updateStance(state, cmd, world, dt, updateSlide(state, cmd, dt));
  const hull = hullFor(state.stance);

  enterLadder(state,cmd,world);
  if (state.ladder) {
    advanceLadder(state,cmd,world,dt);
    state.prevButtons = cmd.buttons;
    return;
  }

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
  const w = wish(cmd, state.yaw, baseSpeed(state, cmd, wading(world, state.position) ? speedScale * T.wadeMultiplier.value : speedScale));
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
  const assisted = state.stance === 'prone' ? null : doorAssist(world, hull, moved, dx, dz, dt);
  const horizontal: MoveResult = assisted ? { pos: assisted, normals: [] } : moved;
  const landed = world.terrain ? overTerrain(world, world.terrain, state.position, hull, horizontal) : horizontal;
  let pos = landed.pos;
  const [vx, vz]: Flat = clipVelocity(state.velocity[0], state.velocity[2], landed.normals);
  state.velocity = [vx, state.velocity[1], vz];

  let onSlope = false;
  if (startedGrounded) {
    // Ground snapping: follow the floor down steps; past a step height, start falling.
    if (!onGround(world, pos, hull)) {
      const down = sweepY(world, pos, hull, -M.stepHeight.value);
      if (down.hit) pos = offset(pos, Y, down.moved);
      else state.grounded = false;
    }
  } else {
    // Airborne: exact parabola within the tick (average of start and end velocity).
    const vy0 = state.velocity[1];
    const vy1 = vy0 - M.gravity.value * dt;
    const r = sweepY(world, pos, hull, ((vy0 + vy1) / 2) * dt);
    pos = offset(pos, Y, r.moved);
    onSlope = r.hit && vy1 < 0 && onSteepTerrain(world, pos, hull, GROUND_PROBE);
    if (onSlope) {
      state.velocity = alongSlope(world.terrain!, pos, [state.velocity[0], vy1, state.velocity[2]]);
    } else {
      state.velocity = [state.velocity[0], r.hit ? 0 : vy1, state.velocity[2]];
      if (r.hit && vy1 < 0 && !jumped) state.grounded = true;
    }
  }

  if (state.grounded) {
    if (state.airPeak !== null) state.landedFrom = Math.max(0, state.airPeak - pos[1]);
    state.airPeak = null;
  } else {
    state.movement = 'airborne';
    state.airPeak = Math.max(state.airPeak ?? state.position[1], state.position[1], pos[1]);
    if (onSlope) {
      // A slope ends a fall, and a long slide isn't one.
      if (state.airPeak - pos[1] > M.stepHeight.value) state.landedFrom = state.airPeak - pos[1];
      state.airPeak = pos[1];
    }
  }
  state.position = pos;
  state.prevButtons = cmd.buttons;
}

/** Moves the player horizontally toward `target` (a melee lunge), stopping at solids. */
export function lunge(state: MoveState, world: World, target: Vec3): void {
  const moved = slideMove(world, state.position, hullFor(state.stance), target[0] - state.position[0], target[2] - state.position[2]);
  state.position = moved.pos;
}
