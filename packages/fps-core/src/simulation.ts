import { hitBody, zoneCentre, type HitPose, type HitZone } from './combat/hitboxes';
import { bulletDamage } from './combat/damage';
import { advance, raycastWorld, type Projectile } from './combat/projectiles';
import { fallDamage } from './health';
import { DEG, distance, dot, length, lerpVec, sub, viewDirection, type Vec3 } from './math';
import type { MantleBand } from './movement/mantle';
import { createMoveState, lunge, pmove, type MoveState, type MovementState, type Stance } from './movement/pmove';
import { hashString, noise } from './random';
import { STATS } from './stats';
import { Button, usercmd, type UserCmd } from './usercmd';
import { createWeaponState, currentSpread, updateWeapon, wantsFire, type ReloadKind, type WeaponAction, type WeaponState } from './weapon/weapon';
import type { World } from './world';

/** Simulation rate in ticks per second, identical on client and server. */
export const TICK_RATE = 60;
/** Length of one tick in seconds. */
export const TICK_SECONDS = 1 / TICK_RATE;

/** Highest and lowest view pitch (radians). */
export const MAX_PITCH = 85 * DEG;

export type PlayerId = string;
export type TeamId = number;

/** A practice target: a player-shaped body with hitboxes that takes no input. */
export interface DummyOptions {
  /** Moves back and forth between the spawn position and `to` at `speed` m/s. */
  readonly rail?: { readonly to: Vec3; readonly speed: number };
}

export interface PlayerSpawn {
  readonly id: PlayerId;
  readonly team: TeamId;
  /** Feet position in world space (metres). */
  readonly position: Vec3;
  readonly yaw?: number;
  readonly pitch?: number;
  /** Makes this a range dummy instead of a player. */
  readonly dummy?: DummyOptions;
}

export type EntityKind = 'player' | 'dummy';

/** What the weapon is doing, as reported in the match outputs. */
export interface WeaponOutput {
  readonly action: WeaponAction;
  /** Seconds into the current action (draw, reload, inspect, melee). */
  readonly actionTime: number;
  readonly reload: ReloadKind | null;
  readonly ammo: number;
  /** ADS fraction: 0 hipfire, 1 fully aimed. */
  readonly ads: number;
  /** Current spread half-angle in degrees (0 when fully aimed). */
  readonly spread: number;
  /** True when a shot could leave the barrel right now (ready, loaded, not locked by sprint). */
  readonly canFire: boolean;
  /** Index into the recoil pattern of the next shot. */
  readonly shotIndex: number;
}

/** What the simulation reports about one player after a tick. */
export interface PlayerOutput {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly kind: EntityKind;
  /** Feet position in world space (metres). */
  readonly position: Vec3;
  /** Velocity in metres per second. */
  readonly velocity: Vec3;
  /** View yaw and pitch, including recoil and flinch. */
  readonly yaw: number;
  readonly pitch: number;
  /** What the player is doing this tick. */
  readonly movement: MovementState;
  /** The mantle height band while mantling, otherwise null. */
  readonly mantle: MantleBand | null;
  /** The stance the player is in or moving into. */
  readonly stance: Stance;
  /** Eye height above the feet (m); eases between stances over their transition times. */
  readonly eyeHeight: number;
  readonly health: number;
  readonly alive: boolean;
  /** Set only on the tick the player lands: how far they fell (m) and the fall damage taken. */
  readonly landing: Landing | null;
  readonly weapon: WeaponOutput;
}

export interface Landing {
  readonly fallHeight: number;
  readonly damage: number;
}

/** Something that happened during a tick. */
export type SimEvent =
  | { readonly type: 'shot'; readonly shooter: PlayerId; readonly origin: Vec3; readonly direction: Vec3; readonly index: number; readonly fraction: number }
  | {
      readonly type: 'hit';
      readonly shooter: PlayerId;
      readonly victim: PlayerId;
      readonly zone: HitZone;
      readonly damage: number;
      readonly distance: number;
      readonly point: Vec3;
      readonly killed: boolean;
      readonly cause: 'bullet' | 'melee';
    }
  | { readonly type: 'impact'; readonly shooter: PlayerId; readonly point: Vec3; readonly normal: Vec3; readonly material: string }
  | { readonly type: 'kill'; readonly killer: PlayerId | null; readonly victim: PlayerId; readonly cause: 'bullet' | 'melee' | 'fall'; readonly zone: HitZone | null }
  | { readonly type: 'melee'; readonly attacker: PlayerId; readonly victim: PlayerId | null }
  | { readonly type: 'reload'; readonly player: PlayerId; readonly phase: 'start' | 'addAmmo' | 'cancel'; readonly kind: ReloadKind | null };

/** Everything observable about the match after a tick. Plain data. */
export interface TickOutput {
  /** Number of ticks stepped so far; 0 before the first step. */
  readonly tick: number;
  /** Players and dummies in the order they were added. */
  readonly players: readonly PlayerOutput[];
  /** What happened during the tick, in order. */
  readonly events: readonly SimEvent[];
}

/**
 * Usercmds for one tick, keyed by player. A single usercmd steps the player
 * once. An array steps the player once per usercmd, in order (an empty array
 * leaves the player untouched this tick: the server uses this while a
 * client's usercmds are late). A missing entry means one tick of no input.
 */
export type TickCmds = Readonly<Partial<Record<PlayerId, UserCmd | readonly UserCmd[]>>>;

export interface SimulationOptions {
  /** Whether `attacker` may damage `victim` (friendly fire rules). Defaults to anyone but yourself. */
  readonly canDamage?: (attacker: PlayerInfo, victim: PlayerInfo) => boolean;
}

export interface PlayerInfo {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly kind: EntityKind;
}

/**
 * The full simulation state of one player: everything client prediction
 * needs to resume from a server snapshot. Plain, JSON-safe data.
 */
export interface PlayerState {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly kind: EntityKind;
  move: MoveState;
  weapon: WeaponState;
  /** Raw usercmd view angles of the last processed usercmd. */
  cmdYaw: number;
  cmdPitch: number;
  /** Recoil and flinch accumulated on top of the usercmd view angles (radians). */
  viewYaw: number;
  viewPitch: number;
  health: number;
  /** Simulation time (s) of the last damage, for regeneration. */
  lastDamage: number;
  landing: Landing | null;
  /** Simulation time (s) the player died, or null while alive. */
  diedAt: number | null;
  /** Counts respawns, so lag-compensated hits cannot reach a later life. */
  life: number;
  readonly spawn: { readonly position: Vec3; readonly yaw: number };
  readonly dummy: DummyOptions | null;
}

interface HistoryPose extends HitPose {
  readonly alive: boolean;
  readonly life: number;
}

/** Deep copy of plain data (objects, arrays, primitives). */
function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out as T;
  }
  return value;
}

/** The usercmds to apply to one player this tick (see {@link TickCmds}). */
function cmdList(sent: UserCmd | readonly UserCmd[] | undefined): readonly (UserCmd | undefined)[] {
  if (sent === undefined) return [undefined];
  return Array.isArray(sent) ? sent : [sent as UserCmd];
}

/** Turns -0 into 0 so outputs compare cleanly with deep equality. */
function clean(v: Vec3): Vec3 {
  return [v[0] + 0, v[1] + 0, v[2] + 0];
}

const C = STATS.combat;
const H = STATS.health;
const LAG_WINDOW_TICKS = C.lagCompensationWindow.value * TICK_RATE;
const MELEE_CONE = Math.cos(35 * DEG);
/** How close the lunge brings the attacker to the target's feet (m). */
const MELEE_STOP = 0.75;

/**
 * The fixed-tick, deterministic simulation. Steps one tick at a time from a
 * set of usercmds; the same world, players and cmds always give the same
 * outputs.
 */
export class Simulation {
  readonly world: World;
  #tick = 0;
  readonly #players = new Map<PlayerId, PlayerState>();
  #projectiles: Projectile[] = [];
  #events: SimEvent[] = [];
  /** Hitbox poses after each recent tick, for lag compensation. */
  readonly #history = new Map<number, Map<PlayerId, HistoryPose>>();
  readonly #canDamage: (attacker: PlayerInfo, victim: PlayerInfo) => boolean;

  constructor(world: World, options: SimulationOptions = {}) {
    this.world = world;
    this.#canDamage = options.canDamage ?? ((a, v) => a.id !== v.id);
  }

  get tick(): number {
    return this.#tick;
  }

  /** Simulation time in seconds. */
  get time(): number {
    return this.#tick * TICK_SECONDS;
  }

  addPlayer(spawn: PlayerSpawn): void {
    if (this.#players.has(spawn.id)) {
      throw new Error(`Player ${spawn.id} is already in the simulation`);
    }
    const yaw = spawn.yaw ?? 0;
    const pitch = spawn.pitch ?? 0;
    this.#players.set(spawn.id, {
      id: spawn.id,
      team: spawn.team,
      kind: spawn.dummy ? 'dummy' : 'player',
      move: createMoveState(spawn.position, yaw),
      weapon: createWeaponState(),
      cmdYaw: yaw,
      cmdPitch: pitch,
      viewYaw: 0,
      viewPitch: 0,
      health: H.max.value,
      lastDamage: -1e9,
      landing: null,
      diedAt: null,
      life: 0,
      spawn: { position: spawn.position, yaw },
      dummy: spawn.dummy ?? null,
    });
  }

  removePlayer(id: PlayerId): void {
    this.#players.delete(id);
  }

  has(id: PlayerId): boolean {
    return this.#players.has(id);
  }

  /** Brings a player back to life at full health and a fresh weapon (drawn), at `position`. */
  respawn(id: PlayerId, position: Vec3, yaw: number): void {
    const p = this.#players.get(id);
    if (!p) throw new Error(`No player ${id}`);
    p.move = createMoveState(position, yaw);
    p.weapon = createWeaponState();
    p.viewYaw = 0;
    p.viewPitch = 0;
    p.cmdYaw = yaw;
    p.cmdPitch = 0;
    p.health = H.max.value;
    p.lastDamage = -1e9;
    p.diedAt = null;
    p.landing = null;
    p.life += 1;
  }

  /** The full state of a player, deep-copied, for client prediction. */
  playerState(id: PlayerId): PlayerState | null {
    const p = this.#players.get(id);
    return p ? clone(p) : null;
  }

  /** Replaces a player's full state (adding the player if needed), e.g. from a server snapshot. */
  setPlayerState(state: PlayerState): void {
    this.#players.set(state.id, clone(state));
  }

  /** Hitbox pose of a player, as of the last step. */
  pose(id: PlayerId): HitPose | null {
    const p = this.#players.get(id);
    return p ? this.#poseOf(p) : null;
  }

  /** Moves the tick counter, e.g. to line client prediction up with the server's tick. */
  setTick(tick: number): void {
    this.#tick = tick;
  }

  /**
   * Advances the simulation by one tick and returns the resulting outputs.
   * With `replay`, only players move and their weapons run: no projectiles,
   * melee, regeneration, history or events. Client prediction uses it to
   * re-apply usercmds the server has not acknowledged yet.
   */
  step(cmds: TickCmds = {}, options: { readonly replay?: boolean } = {}): TickOutput {
    this.#events = [];
    this.#tick += 1;
    if (options.replay) {
      for (const player of this.#players.values()) {
        if (player.dummy) continue;
        for (const cmd of cmdList(cmds[player.id])) this.#stepPlayer(player, cmd, [], []);
      }
      this.#events = [];
      return this.output();
    }
    const spawned: Projectile[] = [];
    const melees: { attacker: PlayerState; rewind: number }[] = [];
    for (const player of this.#players.values()) {
      player.landing = null;
      if (player.dummy) {
        this.#stepDummy(player);
        continue;
      }
      for (const cmd of cmdList(cmds[player.id])) this.#stepPlayer(player, cmd, spawned, melees);
    }
    this.#regenerate();
    this.#record();
    for (const m of melees) this.#resolveMelee(m.attacker, m.rewind);
    this.#projectiles.push(...spawned);
    this.#stepProjectiles();
    return this.output();
  }

  #stepPlayer(player: PlayerState, sent: UserCmd | undefined, spawned: Projectile[], melees: { attacker: PlayerState; rewind: number }[]): void {
    const alive = player.health > 0;
    // No usercmd means no input; the view keeps its last angles. A dead player's input is ignored apart from the view.
    let cmd = sent && alive ? sent : usercmd({ yaw: sent?.yaw ?? player.cmdYaw, pitch: sent?.pitch ?? player.cmdPitch });
    player.cmdYaw = cmd.yaw;
    player.cmdPitch = cmd.pitch;
    // Firing breaks a sprint (the sprint-to-fire time then applies).
    if (wantsFire(cmd) && player.weapon.action === 'ready') {
      cmd = { ...cmd, buttons: cmd.buttons & ~(Button.Sprint | Button.TacticalSprint) };
    }
    const view = this.#viewAngles(player);
    pmove(player.move, { ...cmd, yaw: view.yaw, pitch: view.pitch }, this.world, TICK_SECONDS);
    const fell = player.move.landedFrom;
    if (fell !== null) {
      const damage = alive ? fallDamage(fell) : 0;
      player.landing = { fallHeight: fell, damage };
      if (damage > 0) this.#damage(player, damage, null, 'fall', null);
    }

    const w = updateWeapon(
      player.weapon,
      cmd,
      {
        movement: player.move.movement,
        horizontalSpeed: Math.hypot(player.move.velocity[0], player.move.velocity[2]),
        alive: player.health > 0,
        seed: hashString(player.id),
      },
      TICK_SECONDS,
    );
    if (w.reloadStarted) this.#events.push({ type: 'reload', player: player.id, phase: 'start', kind: w.reloadStarted });
    if (w.ammoAdded) this.#events.push({ type: 'reload', player: player.id, phase: 'addAmmo', kind: player.weapon.reload ?? null });
    if (w.reloadCancelled) this.#events.push({ type: 'reload', player: player.id, phase: 'cancel', kind: null });

    const rewind = cmd.viewTick === undefined ? 0 : Math.min(LAG_WINDOW_TICKS, Math.max(0, this.#tick - cmd.viewTick));
    if (w.melee) melees.push({ attacker: player, rewind });
    const eye: Vec3 = [player.move.position[0], player.move.position[1] + player.move.eyeHeight, player.move.position[2]];
    for (const shot of w.shots) {
      const aim = this.#viewAngles(player);
      const direction = viewDirection(aim.yaw + shot.spreadYaw, aim.pitch + shot.spreadPitch);
      const speed = STATS.weapon.muzzleVelocity.value;
      spawned.push({
        shooter: player.id,
        origin: eye,
        position: eye,
        velocity: [direction[0] * speed, direction[1] * speed, direction[2] * speed],
        rewind,
        pending: (1 - shot.fraction) * TICK_SECONDS,
      });
      this.#events.push({ type: 'shot', shooter: player.id, origin: eye, direction, index: shot.index, fraction: shot.fraction });
      // Recoil kicks the view after the shot leaves.
      player.viewYaw += shot.kickYaw;
      player.viewPitch += shot.kickPitch;
    }
  }

  /** View angles: usercmd angles plus recoil and flinch, with pitch clamped (the excess is dropped from the offset). */
  #viewAngles(p: PlayerState): { yaw: number; pitch: number } {
    const raw = p.cmdPitch + p.viewPitch;
    const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, raw));
    if (pitch !== raw) p.viewPitch = pitch - p.cmdPitch;
    return { yaw: p.cmdYaw + p.viewYaw, pitch };
  }

  #stepDummy(d: PlayerState): void {
    const rail = d.dummy?.rail;
    const time = this.time;
    if (d.health <= 0) {
      if (d.diedAt !== null && time - d.diedAt >= C.dummyResetDelay.value - 1e-9) {
        this.respawn(d.id, d.spawn.position, d.spawn.yaw);
      }
      d.move.velocity = [0, 0, 0];
      return;
    }
    if (!rail) return;
    const length = distance(d.spawn.position, rail.to);
    const period = (2 * length) / rail.speed;
    const phase = (time % period) / period;
    const f = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const next = lerpVec(d.spawn.position, rail.to, f);
    d.move.velocity = [(next[0] - d.move.position[0]) / TICK_SECONDS, 0, (next[2] - d.move.position[2]) / TICK_SECONDS];
    d.move.position = next;
    d.move.movement = rail.speed > STATS.movement.walkSpeed.value + 1e-6 ? 'sprint' : 'walk';
  }

  /** Health regenerates to full over the regen duration, starting the regen delay after the last damage. */
  #regenerate(): void {
    const time = this.time;
    const max = H.max.value;
    for (const p of this.#players.values()) {
      if (p.health <= 0 || p.health >= max) continue;
      if (time - p.lastDamage >= H.regenDelay.value - 1e-9) {
        p.health = Math.min(max, p.health + (max / H.regenDuration.value) * TICK_SECONDS);
      }
    }
  }

  #poseOf(p: PlayerState): HistoryPose {
    return {
      position: p.move.position,
      yaw: p.cmdYaw + p.viewYaw,
      stance: p.move.stance,
      eyeHeight: p.move.eyeHeight,
      alive: p.health > 0,
      life: p.life,
    };
  }

  #record(): void {
    const poses = new Map<PlayerId, HistoryPose>();
    for (const p of this.#players.values()) poses.set(p.id, this.#poseOf(p));
    this.#history.set(this.#tick, poses);
    this.#history.delete(this.#tick - Math.ceil(LAG_WINDOW_TICKS) - 2);
  }

  /** The hitbox pose of every player `rewind` ticks ago (fractional ticks interpolate). */
  #posesAt(rewind: number): Map<PlayerId, HistoryPose> {
    const at = this.#tick - rewind;
    const lo = Math.floor(at);
    const f = at - lo;
    const a = this.#history.get(lo);
    const b = this.#history.get(lo + 1);
    if (!a) return this.#history.get(this.#tick) ?? new Map();
    if (!b || f < 1e-9) return a;
    const out = new Map<PlayerId, HistoryPose>();
    for (const [id, pa] of a) {
      const pb = b.get(id);
      if (!pb) {
        out.set(id, pa);
        continue;
      }
      out.set(id, {
        position: lerpVec(pa.position, pb.position, f),
        yaw: pa.yaw + (pb.yaw - pa.yaw) * f,
        eyeHeight: pa.eyeHeight + (pb.eyeHeight - pa.eyeHeight) * f,
        stance: f < 0.5 ? pa.stance : pb.stance,
        alive: pa.alive && pb.alive && pa.life === pb.life,
        life: pa.life,
      });
    }
    return out;
  }

  #stepProjectiles(): void {
    const maxRange = STATS.weapon.projectileMaxRange.value;
    const next: Projectile[] = [];
    for (const p of this.#projectiles) {
      const seconds = p.pending;
      p.pending = TICK_SECONDS;
      const { from, to, velocity } = advance(p, seconds);
      const world = raycastWorld(this.world, from, to);
      let body: { victim: PlayerState; zone: HitZone; t: number } | null = null;
      const shooter = this.#players.get(p.shooter);
      for (const [id, pose] of this.#posesAt(p.rewind)) {
        const victim = this.#players.get(id);
        if (!victim || id === p.shooter || !pose.alive || pose.life !== victim.life || victim.health <= 0) continue;
        if (shooter && !this.#canDamage(shooter, victim)) continue;
        const hit = hitBody(pose, from, to);
        if (hit && (!body || hit.t < body.t)) body = { victim, zone: hit.zone, t: hit.t };
      }
      if (body && (!world || body.t <= world.t)) {
        const point = lerpVec(from, to, body.t);
        const dist = distance(p.origin, point);
        const damage = bulletDamage(dist, body.zone);
        const killed = this.#damage(body.victim, damage, p.shooter, 'bullet', body.zone);
        this.#events.push({ type: 'hit', shooter: p.shooter, victim: body.victim.id, zone: body.zone, damage, distance: dist, point, killed, cause: 'bullet' });
        this.#flinch(body.victim);
        continue;
      }
      if (world) {
        this.#events.push({ type: 'impact', shooter: p.shooter, point: world.point, normal: world.normal, material: world.material });
        continue;
      }
      p.position = to;
      p.velocity = velocity;
      if (distance(p.origin, to) < maxRange) next.push(p);
    }
    this.#projectiles = next;
  }

  /** Applies damage; returns true if it killed. Emits the kill event. */
  #damage(victim: PlayerState, amount: number, attacker: PlayerId | null, cause: 'bullet' | 'melee' | 'fall', zone: HitZone | null): boolean {
    if (victim.health <= 0) return false;
    victim.health = Math.max(0, victim.health - amount);
    victim.lastDamage = this.time;
    if (victim.health > 0) return false;
    victim.diedAt = this.time;
    this.#events.push({ type: 'kill', killer: attacker, victim: victim.id, cause, zone });
    return true;
  }

  /** Flinch: the victim's view kicks up, with a small fixed-pattern sideways component. */
  #flinch(victim: PlayerState): void {
    const amount = C.flinch.value * DEG;
    const side = noise(hashString(victim.id), this.#tick) < 0.5 ? -1 : 1;
    victim.viewPitch += amount;
    victim.viewYaw += side * amount * 0.25;
  }

  /** Quick melee: hits the nearest damageable body in front within lunge range, lunging the attacker to it. */
  #resolveMelee(attacker: PlayerState, rewind: number): void {
    const view = this.#viewAngles(attacker);
    const forward = viewDirection(view.yaw, 0);
    const eye: Vec3 = [attacker.move.position[0], attacker.move.position[1] + attacker.move.eyeHeight, attacker.move.position[2]];
    let best: { victim: PlayerState; pose: HistoryPose; dist: number } | null = null;
    for (const [id, pose] of this.#posesAt(rewind)) {
      const victim = this.#players.get(id);
      if (!victim || id === attacker.id || !pose.alive || pose.life !== victim.life || victim.health <= 0 || !this.#canDamage(attacker, victim)) continue;
      const chest = zoneCentre(pose, 'upperTorso');
      const flat: Vec3 = [chest[0] - eye[0], 0, chest[2] - eye[2]];
      const flatDist = length(flat);
      const reach = flatDist - STATS.stance.hullHalfWidth.value;
      if (reach > STATS.melee.lungeRange.value) continue;
      if (flatDist > 1e-6 && dot(flat, forward) / flatDist < MELEE_CONE) continue;
      if (raycastWorld(this.world, eye, chest)) continue;
      if (!best || flatDist < best.dist) best = { victim, pose, dist: flatDist };
    }
    if (!best) {
      this.#events.push({ type: 'melee', attacker: attacker.id, victim: null });
      return;
    }
    const toTarget = sub(best.pose.position, attacker.move.position);
    const flat = Math.hypot(toTarget[0], toTarget[2]);
    if (flat > MELEE_STOP) {
      const k = (flat - MELEE_STOP) / flat;
      lunge(attacker.move, this.world, [attacker.move.position[0] + toTarget[0] * k, attacker.move.position[1], attacker.move.position[2] + toTarget[2] * k]);
    }
    const damage = STATS.melee.damage.value;
    const point = zoneCentre(best.pose, 'upperTorso');
    const killed = this.#damage(best.victim, damage, attacker.id, 'melee', 'upperTorso');
    this.#events.push({ type: 'melee', attacker: attacker.id, victim: best.victim.id });
    this.#events.push({ type: 'hit', shooter: attacker.id, victim: best.victim.id, zone: 'upperTorso', damage, distance: best.dist, point, killed, cause: 'melee' });
    this.#flinch(best.victim);
  }

  /** The outputs as of the last step. */
  output(): TickOutput {
    return {
      tick: this.#tick,
      players: [...this.#players.values()].map((p) => this.#outputOf(p)),
      events: this.#events,
    };
  }

  #outputOf(p: PlayerState): PlayerOutput {
    const view = this.#viewAngles(p);
    const w = p.weapon;
    const speed = Math.hypot(p.move.velocity[0], p.move.velocity[2]);
    const sprinting = p.move.movement === 'sprint' || p.move.movement === 'tacticalSprint';
    return {
      id: p.id,
      team: p.team,
      kind: p.kind,
      position: clean(p.move.position),
      velocity: clean(p.move.velocity),
      yaw: view.yaw,
      pitch: view.pitch,
      movement: p.move.movement,
      mantle: p.move.mantleBand,
      stance: p.move.stance,
      eyeHeight: p.move.eyeHeight,
      health: p.health,
      alive: p.health > 0,
      landing: p.landing,
      weapon: {
        action: w.action,
        actionTime: w.actionTime,
        reload: w.reload,
        ammo: w.ammo,
        ads: w.ads,
        spread: currentSpread(w, p.move.movement, speed),
        canFire: p.health > 0 && w.action === 'ready' && w.ammo > 0 && !sprinting && w.clock >= w.fireReadyAt - 1e-9,
        shotIndex: w.shotIndex,
      },
    };
  }
}
