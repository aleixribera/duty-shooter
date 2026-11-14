import { sightBlocked, sightReach } from '../combat/projectiles';
import { distance, type Vec3 } from '../math';
import type { PlayerOutput } from '../simulation';
import { STATS } from '../stats';
import type { World } from '../world';
import type { ModeContext, SpawnPoint } from './game-mode';

/** Distance (m) beyond which an enemy adds nothing more to a spawn's safety. */
const FAR_ENOUGH = 40;
/** How much being near a teammate is worth against being far from enemies. */
const TEAMMATE_WEIGHT = 0.5;
/** No spawn this close (m) to a living enemy while any other will do. */
const TOO_CLOSE = 8;
/** A teammate standing this near (m) a spawn is on it: a player put there would stand inside them (a hull is 0.76 m across). */
const OCCUPIED = 1;
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

/** True when a living teammate stands on the spawn (within 1 m): a player put there would stand inside them. */
export function occupied(spawn: SpawnPoint, teammates: readonly PlayerOutput[]): boolean {
  return teammates.some((m) => distance(m.position, spawn.position) < OCCUPIED);
}

/**
 * The safest spawn, by these rules in order: never within 8 m of a living
 * enemy, out of every living enemy's sight, not on a living teammate (within
 * 1 m), the one the mode `favoured` most (when it says: higher first, `true` above `false`), not one of the player's own last two spawns (`recent`), then the
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
  favoured?: (spawn: SpawnPoint) => boolean | number,
  random?: () => number,
): SpawnPoint | null {
  const ranked = candidates.map((spawn) => {
    const nearestEnemy = enemies.length ? Math.min(...enemies.map((e) => distance(e.position, spawn.position))) : FAR_ENOUGH;
    const nearestMate = teammates.length ? Math.min(...teammates.map((m) => distance(m.position, spawn.position))) : 0;
    const rank = [
      nearestEnemy >= TOO_CLOSE ? 1 : 0,
      enemies.some((e) => seenBy(e, spawn, ctx)) ? 0 : 1,
      // The nearness to teammates below would put a player on top of one standing there, inside their body.
      occupied(spawn, teammates) ? 0 : 1,
      Number(favoured?.(spawn) ?? 0),
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

/** Opening deals tried per match: each grows a set from a different first spawn. */
const OPENING_TRIALS = 24;

/**
 * Spawns for `count` players placed at once (a free-for-all's opening), dealt
 * together so the match doesn't open on a fight: as few pairs of them in each
 * other's sight (or within 8 m of each other) as the map allows, then as far
 * apart as can be. Each trial
 * grows a set from a random first spawn, adding the spawn that brings the
 * fewest new pairs into sight and stands farthest from those already taken;
 * of the trials with the fewest pairs in sight, one is drawn from those whose
 * nearest two stand within {@link SAFE_ENOUGH} of the widest, so matches don't
 * always open on the same spots. In a random order, for the players in theirs.
 * None when the map has fewer distinct spawns than players: they share spots
 * whatever the deal, and placed one at a time they spread out best.
 */
export function openingSpawns(candidates: readonly SpawnPoint[], count: number, ctx: Pick<ModeContext, 'world'>, random: () => number = Math.random): SpawnPoint[] {
  const spots = distinctSpawns(candidates);
  const n = count;
  if (n <= 0 || n > spots.length) return [];
  // One player alone has nobody to be seen by: any spawn will do.
  if (n === 1) return [spots[Math.min(spots.length - 1, Math.floor(random() * spots.length))]!];
  const height = STATS.stance.standEyeHeight.value;
  const apart = spots.map((a) => spots.map((b) => distance(a.position, b.position)));
  // Either one seeing the other counts (a sight line is near enough the same both ways), and so does standing within 8 m, across a wall or not.
  const sees = spots.map((a, i) => spots.map((b, j) => i !== j && (apart[i]![j]! < TOO_CLOSE || !sightBlocked(ctx.world, eye(a.position, height), eye(b.position, height)))));
  const deals: { set: number[]; seen: number; spread: number }[] = [];
  for (let trial = 0; trial < OPENING_TRIALS; trial++) {
    const set = [Math.min(spots.length - 1, Math.floor(random() * spots.length))];
    let seen = 0;
    while (set.length < n) {
      let pick = -1;
      let pickSeen = Infinity;
      let pickNear = -Infinity;
      for (const i of shuffledOrder(spots.length, random)) {
        if (set.includes(i)) continue;
        const s = set.reduce((c, j) => c + (sees[i]![j]! || sees[j]![i]! ? 1 : 0), 0);
        const near = Math.min(...set.map((j) => apart[i]![j]!));
        if (s < pickSeen || (s === pickSeen && near > pickNear)) [pick, pickSeen, pickNear] = [i, s, near];
      }
      set.push(pick);
      seen += pickSeen;
    }
    let spread = Infinity;
    for (const i of set) for (const j of set) if (i < j) spread = Math.min(spread, apart[i]![j]!);
    deals.push({ set, seen, spread });
  }
  const fewest = Math.min(...deals.map((d) => d.seen));
  const widest = Math.max(...deals.filter((d) => d.seen === fewest).map((d) => d.spread));
  const pool = deals.filter((d) => d.seen === fewest && d.spread >= widest - SAFE_ENOUGH);
  const deal = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
  return shuffledOrder(deal.set.length, random).map((k) => spots[deal.set[k]!]!);
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

/** Ways a spawn's facing is chosen from, evenly round the compass (15 degrees apart). */
const FACINGS = 24;
/** Past this (m), more open ground ahead adds nothing to a facing. */
const OPEN_VIEW = 40;
/** A facing is judged by the view across it, the ways either side weighing less: about 60 degrees, as a screen shows. */
const VIEW_WEIGHTS = [0.5, 1, 2, 1, 0.5] as const;
/** What facing straight at `toward` is worth (m of open view): enough to choose between views alike, never to pick a wall. */
const TOWARD_WORTH = 4;

/**
 * The yaw a person put down at `position` should face: the way with the most open ground in front of them,
 * judged across the screen's width out to 40 m, so nobody starts nose to a wall or a hillside. `toward` (x, z),
 * when given, breaks near ties (where the match goes on). Yaw 0 looks down -Z. For ground with no facing of its own (a
 * Battle Royale's landings); a map's own spawns keep the facing they were given, turned only off a wall (`spawn-facing.ts`).
 */
export function landingFacing(world: World, position: Vec3, toward?: readonly [x: number, z: number]): number {
  const eyeAt = eye(position, STATS.stance.standEyeHeight.value);
  const yaws = Array.from({ length: FACINGS }, (_, i) => (i / FACINGS) * Math.PI * 2);
  const open = yaws.map((yaw) => OPEN_VIEW * sightReach(world, eyeAt, [eyeAt[0] - Math.sin(yaw) * OPEN_VIEW, eyeAt[1], eyeAt[2] - Math.cos(yaw) * OPEN_VIEW]));
  const half = (VIEW_WEIGHTS.length - 1) / 2;
  const total = VIEW_WEIGHTS.reduce((a, b) => a + b, 0);
  const goal = toward && Math.hypot(toward[0] - position[0], toward[1] - position[2]) > 1 ? Math.atan2(-(toward[0] - position[0]), -(toward[1] - position[2])) : null;
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < FACINGS; i++) {
    let view = 0;
    VIEW_WEIGHTS.forEach((w, k) => (view += w * open[(i + k - half + FACINGS) % FACINGS]!));
    const score = view / total + (goal === null ? 0 : TOWARD_WORTH * Math.cos(yaws[i]! - goal));
    if (score > bestScore) [best, bestScore] = [i, score];
  }
  return yaws[best]!;
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
