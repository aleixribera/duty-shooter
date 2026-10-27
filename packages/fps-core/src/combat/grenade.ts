import { dot, type Vec3 } from '../math';
import { STATS } from '../stats';
import type { Solid, World } from '../world';
import { segmentSolid, solidNormal } from './projectiles';

/**
 * The frag grenade as a physics object: gravity, bounces off anything that
 * blocks bullets or players (losing speed on each), rolling friction on the
 * ground, and rest. Stepped at the simulation rate; deterministic.
 */

const G = STATS.grenade;
const GRAVITY = STATS.weapon.projectileGravity.value;
/** Bounces slower than this into the ground (m/s) stop bouncing: the grenade rolls. */
const SETTLE_SPEED = 1;
/** Below this ground speed (m/s) a rolling grenade comes to rest. */
const REST_SPEED = 0.15;
/** Share of the speed along the surface an impact keeps. */
const IMPACT_GRIP = 0.8;

/** A live grenade. Plain, JSON-safe data. */
export interface Grenade {
  readonly id: number;
  /** Who threw it: a kill counts for them even after they die. */
  readonly thrower: string;
  /** The thrower's team when it left their hand (friendly fire stays off). */
  readonly team: number;
  position: Vec3;
  velocity: Vec3;
  /** Simulation time (s) it explodes. */
  readonly explodeAt: number;
  resting: boolean;
}

/** A grenade as the outputs report it. */
export type GrenadeOutput = Readonly<Grenade>;

interface Contact {
  readonly t: number;
  readonly point: Vec3;
  readonly normal: Vec3;
}

/** The first solid the segment a→b enters that blocks bullets or players (props aside). */
function contact(world: World, a: Vec3, b: Vec3): Contact | null {
  const test = (i: number) => {
    const s = world.solids[i] as Solid;
    return s.prop === null ? segmentSolid(a, b, s) : null;
  };
  const hits = [world.bullets.firstHit(a, b, test), world.movement.firstHit(a, b, test)].filter((h) => h !== null);
  const best = hits.reduce<(typeof hits)[number] | null>((x, h) => (x === null || h.t < x.t ? h : x), null);
  if (!best) return null;
  const point: Vec3 = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t, a[2] + (b[2] - a[2]) * best.t];
  return { t: best.t, point, normal: solidNormal(world.solids[best.index] as Solid, point) };
}

/** Moves a grenade on by `dt` seconds; returns the speed into the hardest surface it hit (0 when it hit nothing). */
export function moveGrenade(g: Grenade, world: World, dt: number): number {
  if (g.resting) return 0;
  let v: Vec3 = [g.velocity[0], g.velocity[1] - GRAVITY * dt, g.velocity[2]];
  let pos = g.position;
  let remaining = dt;
  let impact = 0;
  for (let i = 0; i < 4 && remaining > 1e-9; i++) {
    const to: Vec3 = [pos[0] + v[0] * remaining, pos[1] + v[1] * remaining, pos[2] + v[2] * remaining];
    const hit = contact(world, pos, to);
    if (!hit) {
      pos = to;
      break;
    }
    const n = hit.normal;
    // Stop just outside the surface.
    pos = [hit.point[0] + n[0] * 0.002, hit.point[1] + n[1] * 0.002, hit.point[2] + n[2] * 0.002];
    remaining *= 1 - hit.t;
    const into = -dot(v, n);
    if (into <= 0) continue;
    const along: Vec3 = [v[0] + n[0] * into, v[1] + n[1] * into, v[2] + n[2] * into];
    const floor = n[1] > 0.7;
    if (into > SETTLE_SPEED || !floor) {
      // A real bounce: it keeps part of its speed off the surface and loses some along it.
      impact = Math.max(impact, into);
      const out = into * G.restitution.value;
      v = [along[0] * IMPACT_GRIP + n[0] * out, along[1] * IMPACT_GRIP + n[1] * out, along[2] * IMPACT_GRIP + n[2] * out];
    } else {
      // Too slow to bounce off the ground: it rolls along it.
      v = along;
    }
  }
  // On the ground, rolling friction slows it to rest.
  const ground = contact(world, pos, [pos[0], pos[1] - 0.01, pos[2]]);
  if (ground && ground.normal[1] > 0.7 && v[1] <= SETTLE_SPEED) {
    const k = Math.max(0, 1 - G.rollFriction.value * dt);
    v = [v[0] * k, Math.max(0, v[1]), v[2] * k];
    if (Math.hypot(v[0], v[2]) < REST_SPEED && v[1] < 1e-6) {
      v = [0, 0, 0];
      g.resting = true;
    }
  }
  g.position = pos;
  g.velocity = v;
  return impact;
}

/** Blast damage at `distance` metres from the explosion: full at the centre, nothing at the radius. */
export function blastDamage(distance: number): number {
  return G.centreDamage.value * Math.max(0, 1 - distance / G.radius.value);
}
