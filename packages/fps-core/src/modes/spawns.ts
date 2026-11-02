import { sightBlocked } from '../combat/projectiles';
import { distance, type Vec3 } from '../math';
import type { PlayerOutput } from '../simulation';
import { STATS } from '../stats';
import type { ModeContext, SpawnPoint } from './game-mode';

/** Distance (m) beyond which an enemy adds nothing more to a spawn's safety. */
const FAR_ENOUGH = 40;
/** How much being near a teammate is worth against being far from enemies. */
const TEAMMATE_WEIGHT = 0.5;
/** No spawn this close (m) to a living enemy while any other will do. */
const TOO_CLOSE = 8;
/** How many of a player's own latest spawns they avoid going back to. */
const REMEMBERED = 2;
/** How much less safe (m of the distance score) than the safest a spawn may be and still be drawn, so players don't keep appearing in one spot. */
const SAFE_ENOUGH = 10;

function eye(position: Vec3, height: number): Vec3 {
  return [position[0], position[1] + height, position[2]];
}

/** True when the living enemy can see a player standing on the spawn point (windows don't hide anyone). */
function seenBy(enemy: PlayerOutput, spawn: SpawnPoint, ctx: ModeContext): boolean {
  return !sightBlocked(ctx.world, eye(enemy.position, enemy.eyeHeight), eye(spawn.position, STATS.stance.standEyeHeight.value));
}

/** Two spawn points closer than this (m) are the same place. */
const SAME_PLACE = 0.5;

function samePlace(a: SpawnPoint, b: SpawnPoint): boolean {
  return distance(a.position, b.position) < SAME_PLACE;
}

/** `spawns` with any point at the same place as an earlier one left out. */
export function distinctSpawns(spawns: readonly SpawnPoint[]): SpawnPoint[] {
  const out: SpawnPoint[] = [];
  for (const s of spawns) if (!out.some((o) => samePlace(o, s))) out.push(s);
  return out;
}

/** True when a living enemy stands within 8 m of the spawn. */
export function overrun(spawn: SpawnPoint, enemies: readonly PlayerOutput[]): boolean {
  return enemies.some((e) => distance(e.position, spawn.position) < TOO_CLOSE);
}

/**
 * The safest spawn, by these rules in order: never within 8 m of a living
 * enemy, out of every living enemy's sight, one the mode `favoured` (when it
 * says), not one of the player's own last two spawns (`recent`), then the
 * best mix of distance from living enemies and nearness to living teammates.
 * Each rule gives way only when no candidate meets it. With `random`, the
 * spawn is drawn from every candidate that meets the same rules and scores
 * within {@link SAFE_ENOUGH} of the best mix, so the same situation doesn't
 * always give the same spot; without it, ties go to the earlier spawn.
 */
export function scoredSpawn(
  candidates: readonly SpawnPoint[],
  teammates: readonly PlayerOutput[],
  enemies: readonly PlayerOutput[],
  ctx: ModeContext,
  recent: readonly SpawnPoint[] = [],
  favoured?: (spawn: SpawnPoint) => boolean,
  random?: () => number,
): SpawnPoint | null {
  const ranked = candidates.map((spawn) => {
    const nearestEnemy = enemies.length ? Math.min(...enemies.map((e) => distance(e.position, spawn.position))) : FAR_ENOUGH;
    const nearestMate = teammates.length ? Math.min(...teammates.map((m) => distance(m.position, spawn.position))) : 0;
    const rank = [
      nearestEnemy >= TOO_CLOSE ? 1 : 0,
      enemies.some((e) => seenBy(e, spawn, ctx)) ? 0 : 1,
      favoured?.(spawn) ? 1 : 0,
      recent.some((r) => samePlace(r, spawn)) ? 0 : 1,
      Math.min(FAR_ENOUGH, nearestEnemy) - TEAMMATE_WEIGHT * Math.min(FAR_ENOUGH, nearestMate),
    ];
    return { spawn, rank };
  });
  let best: (typeof ranked)[number] | null = null;
  for (const r of ranked) if (!best || better(r.rank, best.rank)) best = r;
  if (!best || !random) return best?.spawn ?? null;
  const top = best.rank;
  const SCORE = top.length - 1;
  const pool = ranked.filter((r) => r.rank.every((v, i) => (i === SCORE ? v >= top[i]! - SAFE_ENOUGH : v === top[i])));
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!.spawn;
}

/** The numbers 0 to `n - 1` in a random order. */
export function shuffledOrder(n: number, random: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

function better(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** Each player's latest spawns, so they don't keep coming back at the same spot. */
export class RecentSpawns {
  readonly #spawns = new Map<string, SpawnPoint[]>();

  of(id: string): readonly SpawnPoint[] {
    return this.#spawns.get(id) ?? [];
  }

  /** Remembers `spawn` for `id` and returns it. */
  add(id: string, spawn: SpawnPoint): SpawnPoint {
    this.#spawns.set(id, [spawn, ...this.of(id)].slice(0, REMEMBERED));
    return spawn;
  }

  forget(id: string): void {
    this.#spawns.delete(id);
  }

  clear(): void {
    this.#spawns.clear();
  }
}
