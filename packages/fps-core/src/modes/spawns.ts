import { raycastWorld } from '../combat/projectiles';
import { distance, type Vec3 } from '../math';
import type { PlayerOutput } from '../simulation';
import { STATS } from '../stats';
import type { ModeContext, SpawnPoint } from './game-mode';

/** Distance (m) beyond which an enemy adds nothing more to a spawn's safety. */
const FAR_ENOUGH = 40;
/** How much being near a teammate is worth against being far from enemies. */
const TEAMMATE_WEIGHT = 0.5;

function eye(position: Vec3, height: number): Vec3 {
  return [position[0], position[1] + height, position[2]];
}

/** True when the living enemy can see a player standing on the spawn point. */
function seenBy(enemy: PlayerOutput, spawn: SpawnPoint, ctx: ModeContext): boolean {
  return raycastWorld(ctx.world, eye(enemy.position, enemy.eyeHeight), eye(spawn.position, STATS.stance.standEyeHeight.value)) === null;
}

/**
 * The safest spawn: none in sight of a living enemy if possible, then the
 * best mix of distance from living enemies and nearness to living teammates.
 * Ties go to the earlier spawn, so the choice is deterministic.
 */
export function scoredSpawn(candidates: readonly SpawnPoint[], teammates: readonly PlayerOutput[], enemies: readonly PlayerOutput[], ctx: ModeContext): SpawnPoint | null {
  let best: { spawn: SpawnPoint; hidden: boolean; score: number } | null = null;
  for (const spawn of candidates) {
    const hidden = !enemies.some((e) => seenBy(e, spawn, ctx));
    const nearestEnemy = enemies.length ? Math.min(...enemies.map((e) => distance(e.position, spawn.position))) : FAR_ENOUGH;
    const nearestMate = teammates.length ? Math.min(...teammates.map((m) => distance(m.position, spawn.position))) : 0;
    const score = Math.min(FAR_ENOUGH, nearestEnemy) - TEAMMATE_WEIGHT * Math.min(FAR_ENOUGH, nearestMate);
    if (!best || (hidden && !best.hidden) || (hidden === best.hidden && score > best.score)) best = { spawn, hidden, score };
  }
  return best?.spawn ?? null;
}
