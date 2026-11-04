import { zoneCentre, type HitPose } from './combat/hitboxes';
import { sightBlocked } from './combat/projectiles';
import type { Vec3 } from './math';
import type { ObjectiveState } from './modes/game-mode';
import type { PlayerId, PlayerOutput, TeamId } from './simulation';
import { STATS } from './stats';
import type { World } from './world';

/**
 * Pings (ticket 66): one key marks what a player aims at for their Squad (or
 * team): an enemy, a place, a Supply Drop, a Reboot Card or a Beacon. The
 * client says what it aimed at; the server checks it against what it knows,
 * so a ping can't mark an enemy the pinger couldn't see or a crate that
 * isn't there, and keeps each seat to a few at a time.
 */

/** What a ping marks. The first four are the wheel's; the rest come from aiming at the thing. */
export type PingKind = 'enemy' | 'go' | 'defend' | 'help' | 'drop' | 'card' | 'beacon';
export const PING_KINDS: readonly PingKind[] = ['enemy', 'go', 'defend', 'help', 'drop', 'card', 'beacon'];
/** The wheel's choices, clockwise from the top. */
export const PING_WHEEL: readonly PingKind[] = ['enemy', 'go', 'defend', 'help'];

/** A place-like ping: one a seat has at a time, the newest replacing the last. An enemy mark stands on its own. */
export function placePing(kind: PingKind): boolean {
  return kind !== 'enemy';
}

/** What a client asks to mark: the kind it chose, where its aim met the world, and the enemy under the crosshair if one was. */
export interface PingRequest {
  readonly kind: PingKind;
  readonly at: Vec3;
  readonly target?: PlayerId;
}

/** A ping as the Squad is told of it. `until` is simulation time. */
export interface PingEvent {
  readonly type: 'ping';
  /** Numbers it in the match, so a client can tell one from the next. */
  readonly id: number;
  readonly kind: PingKind;
  readonly player: PlayerId;
  readonly team: TeamId;
  /** Where it stands: an enemy where they were when pinged (it never follows them). */
  readonly position: Vec3;
  /** The enemy marked, if one was. */
  readonly target: PlayerId | null;
  readonly until: number;
}

/** What the server knows when it checks a ping. */
export interface PingWorld {
  readonly world: World;
  readonly players: readonly PlayerOutput[];
  readonly objective: ObjectiveState | null;
  /** Simulation time (s). */
  readonly time: number;
  /** Whether `a` may hurt `b`: the mode's friendly-fire rule, so an enemy is anyone on another side. */
  enemies(a: PlayerOutput, b: PlayerOutput): boolean;
}

const pose = (p: PlayerOutput): HitPose => ({ position: p.position, yaw: p.yaw, stance: p.stance, eyeHeight: p.eyeHeight });
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const finite = (v: Vec3) => v.every(Number.isFinite);
/** Half the view (radians) a pinged enemy must stand within: one behind the pinger, or off to the side, it can't be looking at. */
const PING_VIEW = Math.PI / 3;
/** Whether `at` lies within {@link PING_VIEW} of where `by` faces, on the ground plane. */
function ahead(by: PlayerOutput, at: Vec3): boolean {
  const dx = at[0] - by.position[0];
  const dz = at[2] - by.position[2];
  const d = Math.hypot(dx, dz);
  if (d < 1) return true;
  return (-Math.sin(by.yaw) * dx - Math.cos(by.yaw) * dz) / d >= Math.cos(PING_VIEW);
}

/** Each seat's allowance of pings: a few at once, then one every so often. */
export class Pings {
  readonly #budget = new Map<PlayerId, { tokens: number; at: number }>();
  #next = 1;

  /** A new match: everyone's allowance back, the numbering from 1. */
  reset(): void {
    this.#budget.clear();
    this.#next = 1;
  }

  /** Whether `id` may ping at `time`; spends one if so. */
  #spend(id: PlayerId, time: number): boolean {
    const burst = STATS.ping.burst.value;
    const b = this.#budget.get(id) ?? { tokens: burst, at: time };
    b.tokens = Math.min(burst, b.tokens + (time - b.at) / STATS.ping.refill.value);
    b.at = time;
    this.#budget.set(id, b);
    if (b.tokens < 1 - 1e-9) return false;
    b.tokens -= 1;
    return true;
  }

  /**
   * `by` asks to mark `req`: the ping its Squad is told of, or null when it
   * can't (out of the fight, too many lately, or nowhere it could mark). An
   * enemy it can't see, or a thing that isn't where it aimed, is marked as the
   * place instead.
   */
  request(by: PlayerOutput, req: PingRequest, w: PingWorld): PingEvent | null {
    if (!by.alive || by.kind !== 'player' || !finite(req.at)) return null;
    // Spent before any raycast: a seat out of pings costs the server nothing.
    if (!this.#spend(by.id, w.time)) return null;
    const resolved = this.#resolve(by, req, w);
    if (!resolved) return null;
    const life = resolved.kind === 'enemy' ? STATS.ping.enemyLife.value : STATS.ping.placeLife.value;
    return { type: 'ping', id: this.#next++, kind: resolved.kind, player: by.id, team: by.team, position: resolved.position, target: resolved.target, until: w.time + life };
  }

  #resolve(by: PlayerOutput, req: PingRequest, w: PingWorld): { kind: PingKind; position: Vec3; target: PlayerId | null } | null {
    const P = STATS.ping;
    const eye: Vec3 = [by.position[0], by.position[1] + by.eyeHeight, by.position[2]];
    if (req.kind === 'enemy' && req.target !== undefined) {
      const t = w.players.find((p) => p.id === req.target);
      if (t && t.alive && t.kind === 'player' && w.enemies(by, t) && flat(by.position, t.position) <= P.enemyReach.value) {
        const seen = ahead(by, t.position) && [zoneCentre(pose(t), 'upperTorso'), zoneCentre(pose(t), 'head')].some((to) => !sightBlocked(w.world, eye, to) && !w.world.concealment?.hides(eye, to));
        if (seen) return { kind: 'enemy', position: t.position, target: t.id };
      }
    }
    if (flat(by.position, req.at) > P.reach.value) return null;
    const near = (p: Vec3) => flat(p, req.at) <= P.objectReach.value && Math.abs(p[1] - req.at[1]) <= P.objectReach.value * 2;
    const o = w.objective?.kind === 'battle-royale' ? w.objective : null;
    if (req.kind === 'drop') {
      const d = o?.drops?.find((x) => !x.opened && near(x.position));
      if (d) return { kind: 'drop', position: d.position, target: null };
    } else if (req.kind === 'card') {
      const c = o?.cards?.find((x) => x.team === by.team && x.position && near(x.position));
      if (c?.position) return { kind: 'card', position: c.position, target: null };
    } else if (req.kind === 'beacon') {
      const b = o?.beacons?.find((x) => near(x.position));
      if (b) return { kind: 'beacon', position: b.position, target: null };
    }
    const kind = req.kind === 'drop' || req.kind === 'card' || req.kind === 'beacon' ? 'go' : req.kind;
    return { kind, position: req.at, target: null };
  }
}

/** Parses a ping request from the wire, or null. */
export function parsePing(value: Record<string, unknown>): PingRequest | null {
  const { kind, at, target } = value;
  if (typeof kind !== 'string' || !(PING_KINDS as readonly string[]).includes(kind)) return null;
  if (!Array.isArray(at) || at.length !== 3 || !at.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (target !== undefined && !(typeof target === 'string' && target.length <= 40)) return null;
  return { kind: kind as PingKind, at: [at[0], at[1], at[2]] as Vec3, ...(target === undefined ? {} : { target }) };
}
