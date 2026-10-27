import { raycastWorld } from '../combat/projectiles';
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

function eye(position: Vec3, height: number): Vec3 {
  return [position[0], position[1] + height, position[2]];
}

/** True when the living enemy can see a player standing on the spawn point. */
function seenBy(enemy: PlayerOutput, spawn: SpawnPoint, ctx: ModeContext): boolean {
  return raycastWorld(ctx.world, eye(enemy.position, enemy.eyeHeight), eye(spawn.position, STATS.stance.standEyeHeight.value)) === null;
}

/**
 * The safest spawn, by these rules in order: never within 8 m of a living
 * enemy, out of every living enemy's sight, not one of the player's own last
 * two spawns (`recent`), then the best mix of distance from living enemies and
 * nearness to living teammates. Each rule gives way only when no candidate
 * meets it. Ties go to the earlier spawn, so the choice is deterministic.
 */
export function scoredSpawn(candidates: readonly SpawnPoint[], teammates: readonly PlayerOutput[], enemies: readonly PlayerOutput[], ctx: ModeContext, recent: readonly SpawnPoint[] = []): SpawnPoint | null {
  let best: { spawn: SpawnPoint; rank: readonly number[] } | null = null;
  for (const spawn of candidates) {
    const nearestEnemy = enemies.length ? Math.min(...enemies.map((e) => distance(e.position, spawn.position))) : FAR_ENOUGH;
    const nearestMate = teammates.length ? Math.min(...teammates.map((m) => distance(m.position, spawn.position))) : 0;
    const rank = [
      nearestEnemy >= TOO_CLOSE ? 1 : 0,
      enemies.some((e) => seenBy(e, spawn, ctx)) ? 0 : 1,
      recent.includes(spawn) ? 0 : 1,
      Math.min(FAR_ENOUGH, nearestEnemy) - TEAMMATE_WEIGHT * Math.min(FAR_ENOUGH, nearestMate),
    ];
    if (!best || better(rank, best.rank)) best = { spawn, rank };
  }
  return best?.spawn ?? null;
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
