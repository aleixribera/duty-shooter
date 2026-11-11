import { STATS, WEAPON_IDS, type WeaponId } from '../stats';
import { bulletDamage } from './damage';
import type { HitZone } from './hitboxes';

/**
 * Shots a weapon needs to kill a player at full health with every shot
 * hitting `zone` at `distance` metres. A shotgun blast counts the pellets
 * that land (all of them by default).
 */
export function shotsToKill(weapon: WeaponId, distance: number, zone: HitZone = 'upperTorso', pelletsHit?: number): number {
  const pellets = pelletsHit ?? STATS.weapons[weapon].damage.pellets?.value ?? 1;
  const perShot = bulletDamage(distance, zone, weapon) * pellets;
  return perShot > 0 ? Math.ceil(STATS.health.max.value / perShot - 1e-9) : Infinity;
}

/**
 * Seconds from a weapon's first shot to its shot number `shot` (1 is the
 * first) at its fastest rate: a pump or bolt cycling in between, a burst
 * weapon waiting out its delay after every burst.
 */
function timeOfShot(weapon: WeaponId, shot: number): number {
  const h = STATS.weapons[weapon].handling;
  const interval = 60 / h.fireRate.value;
  const burst = h.burstRounds?.value;
  if (!burst || !Number.isFinite(shot)) return (shot - 1) * interval;
  const bursts = Math.floor((shot - 1) / burst);
  return bursts * ((burst - 1) * interval + (h.burstDelay?.value ?? interval)) + ((shot - 1) % burst) * interval;
}

/** Seconds from the first shot to the killing shot at the weapon's fastest rate (a pump or bolt cycling in between, a burst rifle waiting between bursts). */
export function timeToKill(weapon: WeaponId, distance: number, zone: HitZone = 'upperTorso', pelletsHit?: number): number {
  return timeOfShot(weapon, shotsToKill(weapon, distance, zone, pelletsHit));
}

export interface TimeToKill {
  readonly weapon: WeaponId;
  readonly distance: number;
  readonly shots: number;
  /** Seconds. */
  readonly time: number;
}

/** Shots and time to kill with upper-torso hits for every weapon at each distance: the balance report's table. */
export function timeToKillTable(distances: readonly number[] = [5, 10, 15, 25, 40, 60]): TimeToKill[] {
  return WEAPON_IDS.flatMap((weapon) => distances.map((distance) => ({ weapon, distance, shots: shotsToKill(weapon, distance), time: timeToKill(weapon, distance) })));
}
