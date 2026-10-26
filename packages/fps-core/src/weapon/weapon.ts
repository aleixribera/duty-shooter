import { DEG } from '../math';
import type { MovementState } from '../movement/pmove';
import { noise } from '../random';
import { STATS } from '../stats';
import { Button, isPressed, type UserCmd } from '../usercmd';

/**
 * The weapon state machine for the stock M4A1: draw, ready (idle or
 * firing), reload (tactical or empty, with an add-ammo point), inspect and
 * melee, plus ADS and the sprint-to-fire lock. It decides when shots happen
 * (to the sub-tick) and the spread and recoil of each; the simulation turns
 * shots into projectiles.
 */

const W = STATS.weapon;
const A = STATS.accuracy;
const ML = STATS.melee;

/** What the weapon is doing. "ready" covers idle and firing. */
export type WeaponAction = 'draw' | 'ready' | 'reload' | 'inspect' | 'melee';
export type ReloadKind = 'tactical' | 'empty';

export interface WeaponState {
  ammo: number;
  reserve: number;
  action: WeaponAction;
  /** Seconds since the current action started. */
  actionTime: number;
  reload: ReloadKind | null;
  ammoAdded: boolean;
  meleeResolved: boolean;
  /** ADS fraction: 0 hipfire, 1 fully aimed. */
  ads: number;
  /** Weapon clock (s): advances by one tick per processed usercmd. */
  clock: number;
  /** Clock time of the earliest next shot allowed by the fire rate. */
  nextShot: number;
  /** Clock time before which nothing may fire (sprint-to-fire, end of mantle). */
  fireReadyAt: number;
  lastShot: number;
  /** Index into the recoil pattern of the next shot. */
  shotIndex: number;
  /** Shots fired in this life, for the spread sequence. */
  shotsFired: number;
  reloadHeld: number;
  prevButtons: number;
}

export function createWeaponState(): WeaponState {
  return {
    ammo: W.magazineSize.value,
    reserve: W.reserveAmmo.value,
    action: 'draw',
    actionTime: 0,
    reload: null,
    ammoAdded: false,
    meleeResolved: false,
    ads: 0,
    clock: 0,
    nextShot: 0,
    // Nothing fires until the draw animation ends.
    fireReadyAt: W.drawTime.value,
    lastShot: -1e9,
    shotIndex: 0,
    shotsFired: 0,
    reloadHeld: 0,
    prevButtons: 0,
  };
}

/** One shot decided by the weapon this tick. */
export interface Shot {
  /** When it fired, as a fraction of the tick in [0, 1). */
  readonly fraction: number;
  /** Position in the recoil pattern (0 = first shot). */
  readonly index: number;
  /** Spread offset of the shot from the aim direction, in radians. */
  readonly spreadYaw: number;
  readonly spreadPitch: number;
  /** View kick the shot applies after firing, in radians. */
  readonly kickYaw: number;
  readonly kickPitch: number;
}

/** What the movement code reports to the weapon this tick. */
export interface WeaponContext {
  readonly movement: MovementState;
  readonly horizontalSpeed: number;
  readonly alive: boolean;
  /** Per-player seed for the spread sequence. */
  readonly seed: number;
}

export interface WeaponEvents {
  readonly shots: Shot[];
  /** Set when the melee strike happens this tick. */
  melee: boolean;
  reloadStarted: ReloadKind | null;
  ammoAdded: boolean;
  reloadCancelled: boolean;
}

/** Vertical and horizontal kick of the shot at `index` in the recoil pattern (degrees). */
export function recoilKick(index: number): { pitch: number; yaw: number } {
  const pitch = index === 0 ? A.firstShotKick.value : A.verticalKick.value;
  // Drifts right over the first third of a magazine, then back left, with a
  // small fixed wobble per shot so the pattern has texture but repeats exactly.
  const drift = Math.sin((index / W.magazineSize.value) * Math.PI * 2 + 0.6);
  const wobble = (noise(index, 0x4d34) - 0.5) * 0.8;
  return { pitch, yaw: -A.horizontalKick.value * (drift + wobble) };
}

/** Hipfire spread half-angle (degrees) for the movement state, before ADS. */
export function hipSpread(movement: MovementState, horizontalSpeed: number): number {
  if (movement === 'airborne' || movement === 'mantle') return A.hipSpreadAirborne.value;
  const f = Math.min(1, horizontalSpeed / STATS.movement.walkSpeed.value);
  return A.hipSpreadStill.value + (A.hipSpreadMoving.value - A.hipSpreadStill.value) * f;
}

/** Current spread half-angle (degrees): hipfire spread scaled away by ADS. */
export function currentSpread(state: WeaponState, movement: MovementState, horizontalSpeed: number): number {
  return hipSpread(movement, horizontalSpeed) * (1 - state.ads);
}

function pressed(state: WeaponState, cmd: UserCmd, bit: number): boolean {
  return (cmd.buttons & bit) !== 0 && (state.prevButtons & bit) === 0;
}

function startReload(state: WeaponState, events: WeaponEvents): void {
  state.action = 'reload';
  state.actionTime = 0;
  state.reload = state.ammo === 0 ? 'empty' : 'tactical';
  state.ammoAdded = false;
  events.reloadStarted = state.reload;
}

function finishAction(state: WeaponState): void {
  state.action = 'ready';
  state.actionTime = 0;
  state.reload = null;
}

function addAmmo(state: WeaponState, events: WeaponEvents): void {
  const take = Math.min(W.magazineSize.value - state.ammo, state.reserve);
  state.ammo += take;
  state.reserve -= take;
  state.ammoAdded = true;
  events.ammoAdded = true;
}

function reloadTimes(kind: ReloadKind): { addAmmo: number; duration: number } {
  return kind === 'empty'
    ? { addAmmo: W.emptyReloadAddAmmo.value, duration: W.emptyReloadDuration.value }
    : { addAmmo: W.tacticalReloadAddAmmo.value, duration: W.tacticalReloadDuration.value };
}

/** True when the usercmd asks to fire this tick (held, or a tap inside the tick). */
export function wantsFire(cmd: UserCmd): boolean {
  return isPressed(cmd, 'Fire') || cmd.firePresses.length > 0;
}

/** Advances the weapon by one tick of `dt` seconds and reports what happened. */
export function updateWeapon(state: WeaponState, cmd: UserCmd, ctx: WeaponContext, dt: number): WeaponEvents {
  const events: WeaponEvents = { shots: [], melee: false, reloadStarted: null, ammoAdded: false, reloadCancelled: false };
  const t0 = state.clock;
  const t1 = t0 + dt;
  state.clock = t1;
  if (!ctx.alive) {
    state.prevButtons = cmd.buttons;
    return events;
  }

  const sprinting = ctx.movement === 'sprint' || ctx.movement === 'tacticalSprint';
  if (sprinting) {
    const lock = ctx.movement === 'tacticalSprint' ? W.tacticalSprintToFire.value : W.sprintToFire.value;
    state.fireReadyAt = Math.max(state.fireReadyAt, t1 + lock);
    if (state.action === 'reload') {
      // Sprinting cancels a reload; ammo already added stays in the magazine.
      if (!state.ammoAdded) events.reloadCancelled = true;
      finishAction(state);
    }
    if (state.action === 'inspect') finishAction(state);
  }
  if (ctx.movement === 'mantle') state.fireReadyAt = Math.max(state.fireReadyAt, t1);

  // ADS moves toward its target over the ADS time, in and out.
  const adsAllowed = !sprinting && ctx.movement !== 'mantle' && state.action !== 'melee';
  const adsTarget = isPressed(cmd, 'Ads') && adsAllowed ? 1 : 0;
  const adsStep = dt / W.adsTime.value;
  state.ads = adsTarget === 1 ? Math.min(1, state.ads + adsStep) : Math.max(0, state.ads - adsStep);

  // Reload held long enough with a full magazine inspects the weapon.
  state.reloadHeld = isPressed(cmd, 'Reload') ? state.reloadHeld + dt : 0;
  const reloadPress = pressed(state, cmd, Button.Reload);
  const meleePress = pressed(state, cmd, Button.Melee);
  const fire = wantsFire(cmd);

  if (meleePress && state.action !== 'draw' && state.action !== 'melee' && ctx.movement !== 'mantle') {
    if (state.action === 'reload' && !state.ammoAdded) events.reloadCancelled = true;
    state.action = 'melee';
    state.actionTime = 0;
    state.reload = null;
    state.meleeResolved = false;
  }

  state.actionTime += dt;
  switch (state.action) {
    case 'draw':
      if (state.actionTime >= W.drawTime.value - 1e-9) finishAction(state);
      break;
    case 'melee':
      if (!state.meleeResolved && state.actionTime >= ML.impactTime.value - 1e-9) {
        state.meleeResolved = true;
        events.melee = true;
      }
      if (state.actionTime >= ML.duration.value - 1e-9) finishAction(state);
      break;
    case 'reload': {
      const times = reloadTimes(state.reload ?? 'tactical');
      if (!state.ammoAdded && state.actionTime >= times.addAmmo - 1e-9) addAmmo(state, events);
      if (state.actionTime >= times.duration - 1e-9) finishAction(state);
      // Firing after the add-ammo point skips the rest of the animation.
      else if (state.ammoAdded && fire) finishAction(state);
      break;
    }
    case 'inspect':
      if (state.actionTime >= W.inspectDuration.value - 1e-9 || fire || adsTarget > 0 || reloadPress || sprinting) finishAction(state);
      break;
    case 'ready':
      break;
  }

  if (state.action === 'ready' && state.ammo < W.magazineSize.value && state.reserve > 0) {
    if (reloadPress || (fire && state.ammo === 0)) startReload(state, events);
  }
  if (state.action === 'ready' && state.ammo === W.magazineSize.value && state.reloadHeld >= W.inspectHoldTime.value - 1e-9 && !fire) {
    state.action = 'inspect';
    state.actionTime = 0;
  }

  if (state.action === 'ready' && fire && !sprinting) fireShots(state, cmd, ctx, t0, t1, events);
  state.prevButtons = cmd.buttons;
  return events;
}

/** Fires every shot due in [t0, t1) at the fire rate, from the sub-tick press time. */
function fireShots(state: WeaponState, cmd: UserCmd, ctx: WeaponContext, t0: number, t1: number, events: WeaponEvents): void {
  const dt = t1 - t0;
  const interval = 60 / W.fireRate.value;
  const held = isPressed(cmd, 'Fire');
  const newPress = cmd.firePresses.length > 0 || pressed(state, cmd, Button.Fire);
  const pressTime = t0 + (cmd.firePresses[0] ?? 0) * dt;
  // A held trigger keeps firing from the start of the tick; a new press fires from its sub-tick time.
  let time = Math.max(newPress ? pressTime : t0, state.nextShot, state.fireReadyAt);
  const spread = currentSpread(state, ctx.movement, ctx.horizontalSpeed) * DEG;
  while (time < t1 - 1e-12 && state.ammo > 0 && (held || events.shots.length === 0)) {
    if (time - state.lastShot > W.recoilResetTime.value + 1e-9) state.shotIndex = 0;
    const angle = noise(ctx.seed, state.shotsFired, 1) * Math.PI * 2;
    const radius = spread * Math.sqrt(noise(ctx.seed, state.shotsFired, 2));
    const kick = recoilKick(state.shotIndex);
    events.shots.push({
      fraction: (time - t0) / dt,
      index: state.shotIndex,
      spreadYaw: Math.cos(angle) * radius,
      spreadPitch: Math.sin(angle) * radius,
      kickYaw: kick.yaw * DEG,
      kickPitch: kick.pitch * DEG,
    });
    state.ammo -= 1;
    state.shotIndex += 1;
    state.shotsFired += 1;
    state.lastShot = time;
    state.nextShot = time + interval;
    time = state.nextShot;
    if (!held) break;
  }
}
