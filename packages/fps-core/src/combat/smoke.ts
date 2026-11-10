import type { Vec3 } from '../math';
import { STATS } from '../stats';

const S = STATS.tactical.smoke;

/**
 * A smoke's cloud (ticket 20): a squat ellipsoid standing on its canister,
 * `width` across and `height` up, growing to full size over `rise` after the
 * pop and thinning to nothing over the last `fade` of its `life`. Plain data,
 * the same on the server and in every page, so what hides a body from a bot
 * is what the page draws.
 */
export interface SmokeCloud {
  /** The canister's grenade id. */
  readonly id: number;
  /** Where the canister lies (its foot): the cloud stands over it. */
  readonly at: Vec3;
  /** Simulation time (s) of the pop. */
  readonly popped: number;
}

/** How much of the cloud stands at `time`, 0 to 1: it swells after the pop, holds, and thins out at the end. */
export function smokeAmount(cloud: Pick<SmokeCloud, 'popped'>, time: number): number {
  const age = time - cloud.popped;
  if (age < 0 || age >= S.life.value) return 0;
  const grow = Math.min(1, age / S.rise.value);
  const thin = Math.min(1, (S.life.value - age) / S.fade.value);
  return Math.min(1 - (1 - grow) * (1 - grow), thin);
}

/** The cloud's centre: half its height over the canister, so it reaches the ground and stands over a head. */
export function smokeCentre(cloud: SmokeCloud): Vec3 {
  return [cloud.at[0], cloud.at[1] + S.height.value * 0.5, cloud.at[2]];
}

/**
 * Whether the cloud stands between `a` and `b` at `time`: the segment passes
 * through its thick middle (the inner 80% of its size as it is now), or
 * starts or ends inside it. A thin edge, or a cloud still swelling past a
 * line, hides nothing yet.
 */
export function smokeHides(cloud: SmokeCloud, a: Vec3, b: Vec3, time: number): boolean {
  const amount = smokeAmount(cloud, time);
  if (amount < 0.35) return false;
  const c = smokeCentre(cloud);
  // In the cloud's own space, where it is a ball of radius 1.
  const rx = (S.width.value / 2) * amount * 0.8;
  const ry = (S.height.value / 2) * Math.max(0.6, amount) * 0.8;
  const p = [(a[0] - c[0]) / rx, (a[1] - c[1]) / ry, (a[2] - c[2]) / rx] as const;
  const d = [(b[0] - a[0]) / rx, (b[1] - a[1]) / ry, (b[2] - a[2]) / rx] as const;
  const dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const t = dd > 1e-12 ? Math.max(0, Math.min(1, -(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / dd)) : 0;
  const x = p[0] + d[0] * t;
  const y = p[1] + d[1] * t;
  const z = p[2] + d[2] * t;
  return x * x + y * y + z * z < 1;
}

/**
 * The world's smoke as it stands this tick: the simulation sets the clouds,
 * and anything that asks what a body can see (a bot, a ping) asks here too.
 * Bullets don't: smoke hides, it doesn't stop.
 */
export class SmokeField {
  #clouds: readonly SmokeCloud[] = [];
  #time = 0;

  /** The clouds standing at simulation time `time`. */
  set(clouds: readonly SmokeCloud[], time: number): void {
    this.#clouds = clouds;
    this.#time = time;
  }

  get clouds(): readonly SmokeCloud[] {
    return this.#clouds;
  }

  get time(): number {
    return this.#time;
  }

  /** Whether any cloud stands between `a` and `b` now. */
  hides(a: Vec3, b: Vec3): boolean {
    for (const c of this.#clouds) if (smokeHides(c, a, b, this.#time)) return true;
    return false;
  }
}
