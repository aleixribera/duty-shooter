import { DEG } from '../math';
import type { MovementState } from '../movement/pmove';
import { noise } from '../random';
import { STATS, isShellReload, type WeaponId, type WeaponRow } from '../stats';
import { Button, isPressed, type UserCmd } from '../usercmd';

/**
 * The weapon state machine, driven by the weapon's row in the stats table:
 * draw, ready (idle or firing), cycle (working a pump or bolt), reload
 * (a magazine, or shells one at a time, with add-ammo points), inspect,
 * melee and holster, plus ADS, scope sway and the sprint-to-fire lock. It
 * decides when shots happen (to the sub-tick) and the spread and recoil of
 * each; the simulation turns shots into projectiles.
 */

const W = STATS.weapon;
const ML = STATS.melee;

/** What the weapon is doing. "ready" covers idle and firing. */
export type WeaponAction = 'draw' | 'ready' | 'cycle' | 'reload' | 'inspect' | 'melee' | 'holster' | 'grenade';
/** A reload started with rounds left, or empty (one more step to chamber). */
export type ReloadKind = 'tactical' | 'empty';

export interface WeaponState {
  readonly id: WeaponId;
  /** Rounds in the magazine. The reserve is unlimited: a reload always fills it. */
  ammo: number;
  action: WeaponAction;
  /** Seconds since the current action started. */
  actionTime: number;
  reload: ReloadKind | null;
  /** A magazine reload: the magazine went in. A shell reload: at least one shell did. */
  ammoAdded: boolean;
  /** Shells loaded in the current shell reload. */
  shellsLoaded: number;
  meleeResolved: boolean;
  /** ADS fraction: 0 hipfire, 1 fully aimed. */
  ads: number;
  /** Seconds aimed and standing still, which settles scope sway. */
  steady: number;
  /** Weapon clock (s): advances by one tick per processed usercmd. */
  clock: number;
  /** Clock time of the earliest next shot allowed by the fire rate. */
  nextShot: number;
  /** Clock time before which nothing may fire (draw, sprint-to-fire, end of mantle). */
  fireReadyAt: number;
  lastShot: number;
  /** Index into the recoil pattern of the next shot. */
  shotIndex: number;
  /** Shots fired in this life, for the spread sequence. */
  shotsFired: number;
  reloadHeld: number;
  prevButtons: number;
}

export function weaponRow(id: WeaponId): WeaponRow {
  return STATS.weapons[id];
}

export function createWeaponState(id: WeaponId = 'm4a1'): WeaponState {
  const row = weaponRow(id);
  return {
    id,
    ammo: row.handling.magazineSize.value,
    action: 'draw',
    actionTime: 0,
    reload: null,
    ammoAdded: false,
    shellsLoaded: 0,
    meleeResolved: false,
    ads: 0,
    steady: 0,
    clock: 0,
    nextShot: 0,
    // Nothing fires until the draw animation ends.
    fireReadyAt: row.handling.drawTime.value,
    lastShot: -1e9,
    shotIndex: 0,
    shotsFired: 0,
    reloadHeld: 0,
    prevButtons: 0,
  };
}

/**
 * Raises a weapon that was put away (a switch): it keeps its magazine and
 * picks up the clock of the weapon it replaces, and nothing fires until the
 * draw ends. `buttons` are the buttons held now, so a held trigger or
 * reload isn't read as a new press.
 */
export function drawWeapon(state: WeaponState, clock: number, buttons: number): void {
  state.clock = clock;
  state.action = 'draw';
  state.actionTime = 0;
  state.reload = null;
  state.ammoAdded = false;
  state.shellsLoaded = 0;
  state.ads = 0;
  state.steady = 0;
  state.shotIndex = 0;
  state.reloadHeld = 0;
  state.nextShot = Math.min(state.nextShot, clock);
  state.lastShot = Math.min(state.lastShot, clock);
  state.fireReadyAt = clock + weaponRow(state.id).handling.drawTime.value;
  state.prevButtons = buttons;
}

/** One shot decided by the weapon this tick. */
export interface Shot {
  /** When it fired, as a fraction of the tick in [0, 1). */
  readonly fraction: number;
  /** Position in the recoil pattern (0 = first shot). */
  readonly index: number;
  /** Spread offset of the shot from the aim direction, in radians (the centre of a pellet pattern). */
  readonly spreadYaw: number;
  readonly spreadPitch: number;
  /** Offsets of each projectile from the aim direction (radians): one per pellet, or just the shot's. */
  readonly projectiles: readonly (readonly [yaw: number, pitch: number])[];
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
  /** Set when the holster finished this tick: the other weapon comes up. */
  holstered: boolean;
}

/** Vertical and horizontal kick of the shot at `index` in a weapon's recoil pattern (degrees). */
export function recoilKick(index: number, id: WeaponId = 'm4a1'): { pitch: number; yaw: number } {
  const row = weaponRow(id);
  const a = row.accuracy;
  const bounce = a.kickBounce?.value ?? 0;
  // An SMG's climb alternates up and down around the vertical kick.
  const pitch = index === 0 ? a.firstShotKick.value : a.verticalKick.value * (1 + (index % 2 === 1 ? bounce : -bounce));
  // Drifts right over the first third of a magazine, then back left, with a
  // small fixed wobble per shot so the pattern has texture but repeats exactly.
  const drift = Math.sin((index / row.handling.magazineSize.value) * Math.PI * 2 + 0.6);
  const wobble = (noise(index, 0x4d34) - 0.5) * 0.8;
  return { pitch, yaw: -a.horizontalKick.value * (drift + wobble) };
}

/** Hipfire spread half-angle (degrees) for the movement state, before ADS. */
export function hipSpread(movement: MovementState, horizontalSpeed: number, id: WeaponId = 'm4a1'): number {
  const a = weaponRow(id).accuracy;
  if (movement === 'airborne' || movement === 'mantle') return a.hipSpreadAirborne.value;
  const f = Math.min(1, horizontalSpeed / STATS.movement.walkSpeed.value);
  return a.hipSpreadStill.value + (a.hipSpreadMoving.value - a.hipSpreadStill.value) * f;
}

/** Current spread half-angle (degrees): hipfire spread blended toward the aimed spread (0, or a shotgun's cone) by ADS. */
export function currentSpread(state: WeaponState, movement: MovementState, horizontalSpeed: number): number {
  const aimed = weaponRow(state.id).accuracy.aimedSpread?.value ?? 0;
  return hipSpread(movement, horizontalSpeed, state.id) * (1 - state.ads) + aimed * state.ads;
}

/** Share of the scope sway left after standing still and aimed for the settle time. */
export const SWAY_SETTLED = 0.2;

/**
 * Scope sway (radians) the aim point drifts by: a slow figure-of-eight
 * driven by the weapon clock, scaled by ADS, settling to a fifth over the
 * weapon's settle time while the player stands still. Zero for weapons
 * without a scope.
 */
export function swayOffset(state: WeaponState): { yaw: number; pitch: number } {
  const a = weaponRow(state.id).accuracy;
  if (!a.sway || !a.swaySettle || state.ads <= 0) return { yaw: 0, pitch: 0 };
  const settle = Math.min(1, state.steady / a.swaySettle.value);
  const amplitude = a.sway.value * DEG * state.ads * (1 - (1 - SWAY_SETTLED) * settle);
  const t = state.clock;
  return { yaw: amplitude * Math.sin(t * Math.PI * 2 * 0.31), pitch: amplitude * 0.7 * Math.sin(t * Math.PI * 2 * 0.53 + 1) };
}

function pressed(state: WeaponState, cmd: UserCmd, bit: number): boolean {
  return (cmd.buttons & bit) !== 0 && (state.prevButtons & bit) === 0;
}

function startReload(state: WeaponState, events: WeaponEvents): void {
  state.action = 'reload';
  state.actionTime = 0;
  state.reload = state.ammo === 0 ? 'empty' : 'tactical';
  state.ammoAdded = false;
  state.shellsLoaded = 0;
  events.reloadStarted = state.reload;
}

function finishAction(state: WeaponState): void {
  state.action = 'ready';
  state.actionTime = 0;
  state.reload = null;
}

/** Lowers the weapon to cook a grenade. A reload before its add-ammo point is lost. */
export function lowerForGrenade(state: WeaponState, events: WeaponEvents): void {
  if (state.action === 'reload' && !state.ammoAdded) events.reloadCancelled = true;
  state.action = 'grenade';
  state.actionTime = 0;
  state.reload = null;
}

/** Brings the weapon back up after a grenade: ready at once (the throw time covers the raise). */
export function raiseAfterGrenade(state: WeaponState): void {
  if (state.action === 'grenade') finishAction(state);
}

/** Puts the weapon away; the caller raises the other one when `holstered` is reported. A reload before its add-ammo point is lost. */
export function startHolster(state: WeaponState, events: WeaponEvents): void {
  if (state.action === 'reload' && !state.ammoAdded) events.reloadCancelled = true;
  state.action = 'holster';
  state.actionTime = 0;
  state.reload = null;
  state.ads = 0;
}

/** True when the usercmd asks to fire this tick (held, or a tap inside the tick). */
export function wantsFire(cmd: UserCmd): boolean {
  return isPressed(cmd, 'Fire') || cmd.firePresses.length > 0;
}

/** True when a shot could leave the barrel right now (ready, loaded, not locked by a draw or sprint). */
export function canFire(state: WeaponState, movement: MovementState): boolean {
  const sprinting = movement === 'sprint' || movement === 'tacticalSprint';
  return state.action === 'ready' && state.ammo > 0 && !sprinting && state.clock >= state.fireReadyAt - 1e-9;
}

export function emptyEvents(): WeaponEvents {
  return { shots: [], melee: false, reloadStarted: null, ammoAdded: false, reloadCancelled: false, holstered: false };
}

/** Advances the weapon by one tick of `dt` seconds and reports what happened. */
export function updateWeapon(state: WeaponState, cmd: UserCmd, ctx: WeaponContext, dt: number, events: WeaponEvents = emptyEvents()): WeaponEvents {
  const row = weaponRow(state.id);
  const h = row.handling;
  const t0 = state.clock;
  const t1 = t0 + dt;
  state.clock = t1;
  if (!ctx.alive) {
    state.prevButtons = cmd.buttons;
    return events;
  }

  const sprinting = ctx.movement === 'sprint' || ctx.movement === 'tacticalSprint';
  if (sprinting) {
    const lock = ctx.movement === 'tacticalSprint' ? h.tacticalSprintToFire.value : h.sprintToFire.value;
    state.fireReadyAt = Math.max(state.fireReadyAt, t1 + lock);
    // A reload carries on through a sprint (MW2019 cancelled it); an inspect stops.
    if (state.action === 'inspect') finishAction(state);
  }
  if (ctx.movement === 'mantle') state.fireReadyAt = Math.max(state.fireReadyAt, t1);

  // ADS moves toward its target over the ADS time, in and out.
  const adsAllowed = !sprinting && ctx.movement !== 'mantle' && state.action !== 'melee' && state.action !== 'holster' && state.action !== 'grenade';
  const adsTarget = isPressed(cmd, 'Ads') && adsAllowed ? 1 : 0;
  const adsStep = dt / h.adsTime.value;
  state.ads = adsTarget === 1 ? Math.min(1, state.ads + adsStep) : Math.max(0, state.ads - adsStep);
  // Standing still while fully aimed settles scope sway; moving or lowering the sight starts it over.
  state.steady = state.ads >= 1 && ctx.horizontalSpeed < 0.1 && ctx.movement !== 'airborne' ? state.steady + dt : 0;

  // Reload held long enough with a full magazine inspects the weapon.
  state.reloadHeld = isPressed(cmd, 'Reload') ? state.reloadHeld + dt : 0;
  const reloadPress = pressed(state, cmd, Button.Reload);
  const meleePress = pressed(state, cmd, Button.Melee);
  const fire = wantsFire(cmd);

  if (meleePress && state.action !== 'draw' && state.action !== 'melee' && state.action !== 'holster' && state.action !== 'grenade' && ctx.movement !== 'mantle') {
    if (state.action === 'reload' && !state.ammoAdded) events.reloadCancelled = true;
    state.action = 'melee';
    state.actionTime = 0;
    state.reload = null;
    state.meleeResolved = false;
  }

  state.actionTime += dt;
  switch (state.action) {
    case 'draw':
      if (state.actionTime >= h.drawTime.value - 1e-9) finishAction(state);
      break;
    case 'holster':
      if (state.actionTime >= h.holsterTime.value - 1e-9) events.holstered = true;
      break;
    case 'cycle':
      if (state.actionTime >= (h.cycleTime?.value ?? 0) - 1e-9) finishAction(state);
      break;
    case 'melee':
      if (!state.meleeResolved && state.actionTime >= ML.impactTime.value - 1e-9) {
        state.meleeResolved = true;
        events.melee = true;
      }
      if (state.actionTime >= ML.duration.value - 1e-9) finishAction(state);
      break;
    case 'reload':
      advanceReload(state, row, fire, events);
      break;
    case 'inspect':
      if (state.actionTime >= W.inspectDuration.value - 1e-9 || fire || adsTarget > 0 || reloadPress || sprinting) finishAction(state);
      break;
    case 'grenade':
      // Lowered for a grenade: the simulation raises it again after the throw.
      break;
    case 'ready':
      break;
  }

  if (state.action === 'ready' && state.ammo < h.magazineSize.value) {
    if (reloadPress || (fire && state.ammo === 0)) startReload(state, events);
  }
  if (state.action === 'ready' && state.ammo === h.magazineSize.value && state.reloadHeld >= W.inspectHoldTime.value - 1e-9 && !fire) {
    state.action = 'inspect';
    state.actionTime = 0;
  }

  if (state.action === 'ready' && fire && !sprinting) fireShots(state, row, cmd, ctx, t0, t1, events);
  state.prevButtons = cmd.buttons;
  return events;
}

/**
 * A magazine reload puts the magazine in at its add-ammo point; firing after
 * that skips the rest. A shell reload loads one shell at a time until the
 * tube is full (then chambers a round if it started empty); firing once a
 * shell is in stops it.
 */
function advanceReload(state: WeaponState, row: WeaponRow, fire: boolean, events: WeaponEvents): void {
  const r = row.reload;
  const magazine = row.handling.magazineSize.value;
  const empty = state.reload === 'empty';
  if (isShellReload(r)) {
    const needed = magazine - state.ammo + state.shellsLoaded;
    while (state.shellsLoaded < needed && state.actionTime >= r.start.value + state.shellsLoaded * r.perShell.value - 1e-9) {
      state.ammo += 1;
      state.shellsLoaded += 1;
      state.ammoAdded = true;
      events.ammoAdded = true;
    }
    const done = r.start.value + (needed - 1) * r.perShell.value + (empty ? r.chamber.value : 0) + r.end.value;
    if (state.actionTime >= done - 1e-9 || (state.ammoAdded && fire)) finishAction(state);
    return;
  }
  const addAmmo = empty ? r.emptyAddAmmo.value : r.tacticalAddAmmo.value;
  const duration = empty ? r.emptyDuration.value : r.tacticalDuration.value;
  if (!state.ammoAdded && state.actionTime >= addAmmo - 1e-9) {
    state.ammo = magazine;
    state.ammoAdded = true;
    events.ammoAdded = true;
  }
  if (state.actionTime >= duration - 1e-9) finishAction(state);
  // Firing after the add-ammo point skips the rest of the animation.
  else if (state.ammoAdded && fire) finishAction(state);
}

/**
 * Fires every shot due in [t0, t1). Full auto fires at the fire rate while
 * the trigger is held, from the sub-tick press time. Semi-automatic, pump
 * and bolt weapons fire once per press, no faster than the fire rate (a
 * pump or bolt then cycles before the next).
 */
function fireShots(state: WeaponState, row: WeaponRow, cmd: UserCmd, ctx: WeaponContext, t0: number, t1: number, events: WeaponEvents): void {
  const dt = t1 - t0;
  const interval = 60 / row.handling.fireRate.value;
  const mode = row.traits.fireMode;
  const held = isPressed(cmd, 'Fire');
  const newPress = cmd.firePresses.length > 0 || pressed(state, cmd, Button.Fire);
  const spread = currentSpread(state, ctx.movement, ctx.horizontalSpeed) * DEG;
  const sway = swayOffset(state);

  const shoot = (time: number) => {
    if (time - state.lastShot > row.accuracy.recoilResetTime.value + 1e-9) state.shotIndex = 0;
    const centre = spreadPoint(ctx.seed, state.shotsFired, 1, spread);
    const pellets = row.damage.pellets?.value ?? 1;
    const projectiles = pellets === 1 ? [centre] : pelletPattern(ctx.seed, state.shotsFired, pellets, spread);
    const kick = recoilKick(state.shotIndex, state.id);
    events.shots.push({
      fraction: (time - t0) / dt,
      index: state.shotIndex,
      spreadYaw: centre[0] + sway.yaw,
      spreadPitch: centre[1] + sway.pitch,
      projectiles: projectiles.map(([y, p]) => [y + sway.yaw, p + sway.pitch] as const),
      kickYaw: kick.yaw * DEG,
      kickPitch: kick.pitch * DEG,
    });
    state.ammo -= 1;
    state.shotIndex += 1;
    state.shotsFired += 1;
    state.lastShot = time;
    state.nextShot = time + interval;
  };

  if (mode === 'auto') {
    const pressTime = t0 + (cmd.firePresses[0] ?? 0) * dt;
    // A held trigger keeps firing from the start of the tick; a new press fires from its sub-tick time.
    let time = Math.max(newPress ? pressTime : t0, state.nextShot, state.fireReadyAt);
    while (time < t1 - 1e-12 && state.ammo > 0 && (held || events.shots.length === 0)) {
      shoot(time);
      time = state.nextShot;
      if (!held) break;
    }
    return;
  }

  // One shot per press: the presses inside the tick, or a press at its start.
  const presses = cmd.firePresses.length > 0 ? cmd.firePresses : newPress ? [0] : [];
  for (const press of presses) {
    const time = Math.max(t0 + press * dt, state.nextShot, state.fireReadyAt);
    if (time >= t1 - 1e-12 || state.ammo <= 0) break;
    shoot(time);
    if (mode === 'pump' || mode === 'bolt') {
      // Work the pump or bolt: the cycle runs from the shot.
      state.action = 'cycle';
      state.actionTime = t1 - time;
      break;
    }
  }
}

/** A point in the spread cone for shot `n` (radians): uniform over the disc. */
function spreadPoint(seed: number, n: number, salt: number, spread: number): readonly [number, number] {
  const angle = noise(seed, n, salt) * Math.PI * 2;
  const radius = spread * Math.sqrt(noise(seed, n, salt + 1));
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/**
 * A pellet pattern (radians): one pellet near the centre and the rest in a
 * jittered ring across the cone, so every blast spreads the same way but
 * never looks stamped.
 */
function pelletPattern(seed: number, n: number, pellets: number, spread: number): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  const turn = noise(seed, n, 7) * Math.PI * 2;
  for (let i = 0; i < pellets; i++) {
    if (i === 0) {
      out.push(spreadPoint(seed, n, 11, spread * 0.25));
      continue;
    }
    const angle = turn + ((i - 1) / (pellets - 1)) * Math.PI * 2 + (noise(seed, n, 20 + i) - 0.5) * 0.6;
    const radius = spread * (0.45 + 0.55 * noise(seed, n, 40 + i));
    out.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return out;
}
