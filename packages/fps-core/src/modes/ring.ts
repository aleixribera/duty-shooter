import type { Vec3 } from '../math';
import { STATS } from '../stats';
import type { PlayGround, Town } from './ground';

/** A circle on the ground plane. */
export interface Circle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** One hold-and-shrink step of the Ring. Times are seconds of match. */
export interface RingStage {
  readonly start: number;
  /** When the hold ends and the wall starts moving. */
  readonly shrinkAt: number;
  /** When it has reached `to`. */
  readonly shrinkEnd: number;
  readonly from: Circle;
  readonly to: Circle;
  /** What standing outside costs during this Stage. */
  readonly damage: number;
}

/** Tries at a free spot for a circle before settling for the one on the way to the end. */
const TRIES = 12;
/** The first circle clears the land's edge by this much (m). */
const MARGIN = 5;
/** A Ring closing on a town keeps this share of its radius round the end inside each circle, and closes no farther out. */
const TOWN_HEART = 0.6;

/**
 * Every circle of a match, from `random`: the same stream replays them. The end
 * is chosen first, on land (in one of the ground's towns, mostly), then each circle is a random one inside the last
 * that still holds the end, so all of them nest and the last closes on land.
 * The Stages' times scale with the match, so a short test match has the whole
 * Ring in it.
 */
export function planRing(ground: PlayGround, random: () => number, timeLimit: number): RingStage[] {
  const R = STATS.royale;
  const rows = Object.values(R.ring);
  const pace = timeLimit / R.matchLength.value;
  const first: Circle = { x: ground.centre[0], z: ground.centre[1], radius: ground.radius + MARGIN };
  // Most matches end in a town, among buildings; the rest anywhere on land.
  let town = ground.towns.length > 0 && random() < R.townEnd.value ? ground.towns[Math.floor(random() * ground.towns.length)]! : null;
  const inTown = town && ground.inTown(town, random);
  if (inTown === null) town = null;
  const [endX, , endZ] = ground.spot(inTown ?? Math.floor(random() * ground.count));
  const stages: RingStage[] = [];
  let from = first;
  let time = 0;
  for (const row of rows) {
    const radius = first.radius * row.radius.value;
    const room = from.radius - radius;
    // Closing on a town, each circle holds the town round the end too, so the late Stages are fought in it.
    const hold = town ? Math.min(town.radius * TOWN_HEART, radius / 2) : 0;
    let to: Circle | null = null;
    for (let t = 0; t < TRIES && !to; t++) {
      const [turn, out] = [random() * Math.PI * 2, Math.sqrt(random()) * room];
      const [x, z] = [from.x + Math.cos(turn) * out, from.z + Math.sin(turn) * out];
      if (Math.hypot(x - endX, z - endZ) <= radius - hold) to = { x, z, radius };
    }
    if (!to) {
      // The end is inside `from` (by its hold, which shrinks with the circles), so this far along the line to it is inside `from` and holds the end.
      const away = Math.hypot(endX - from.x, endZ - from.z);
      const k = away > room ? room / away : 1;
      to = { x: from.x + (endX - from.x) * k, z: from.z + (endZ - from.z) * k, radius };
    }
    const shrinkAt = time + row.hold.value * pace;
    const shrinkEnd = shrinkAt + row.shrink.value * pace;
    stages.push({ start: time, shrinkAt, shrinkEnd, from, to, damage: row.damage.value });
    from = to;
    time = shrinkEnd;
  }
  const last = stages.at(-1);
  if (last && stages.length > 1) stages[stages.length - 1] = { ...last, to: { ...drifted(ground, first, last.from, last.to, town), radius: last.to.radius } };
  return stages;
}

/**
 * Where the last circle closes: not where it stood but `finalDrift` of its
 * radius on, the way the Ring was heading (through the end it was closing on,
 * or on from the island's middle), at the open ground nearest that point that
 * a route joins to the ground the Ring was closing on (the circle before it
 * holds that), so it never drifts across water or onto a cliff top nobody
 * inside can climb to. A Ring closing on a town stays in its heart, so its
 * last fight is among the buildings. It draws no randomness, so the rest of
 * a seed's match is as it was.
 */
function drifted(ground: PlayGround, first: Circle, from: Circle, end: Circle, town: Town | null): { x: number; z: number } {
  const want = from.radius * STATS.royale.finalDrift.value;
  let [dx, dz] = [end.x - from.x, end.z - from.z];
  if (Math.hypot(dx, dz) < 1) [dx, dz] = [from.x - first.x, from.z - first.z];
  if (Math.hypot(dx, dz) < 1) [dx, dz] = [1, 0];
  const k = want / Math.hypot(dx, dz);
  let [x, z] = [from.x + dx * k, from.z + dz * k];
  if (town) {
    const [heart, off] = [town.radius * TOWN_HEART, Math.hypot(x - town.x, z - town.z)];
    if (off > heart) [x, z] = [town.x + ((x - town.x) * heart) / off, town.z + ((z - town.z) * heart) / off];
  }
  // The part of the island the Ring was closing on: the open ground nearest where the last circle stood.
  const area = areaNear(ground, end.x, end.z);
  // Open ground nearest there; the wider the water or the cliffs, the further it looks.
  for (let reach = 8; reach <= 512; reach *= 2) {
    const spot = ground.near(x, z, reach).find((i) => area === null || ground.area(i) === area);
    if (spot !== undefined) {
      const [sx, , sz] = ground.spot(spot);
      return { x: sx, z: sz };
    }
  }
  return { x: end.x, z: end.z };
}

/** The nav area of the open ground nearest (x, z), or null on ground with no nav. */
function areaNear(ground: PlayGround, x: number, z: number): number | null {
  for (let reach = 8; reach <= 4096; reach *= 2) {
    const spot = ground.near(x, z, reach)[0];
    if (spot !== undefined) return ground.area(spot);
  }
  return null;
}

/** The Stage in play at `time`: the last, once it has closed. */
export function stageAt(plan: readonly RingStage[], time: number): number {
  const i = plan.findIndex((s) => time < s.shrinkEnd);
  return i < 0 ? plan.length - 1 : i;
}

/** Where the wall stands at `time`. */
export function ringAt(plan: readonly RingStage[], time: number): Circle {
  const s = plan[stageAt(plan, time)]!;
  const f = Math.max(0, Math.min(1, (time - s.shrinkAt) / (s.shrinkEnd - s.shrinkAt)));
  return { x: s.from.x + (s.to.x - s.from.x) * f, z: s.from.z + (s.to.z - s.from.z) * f, radius: s.from.radius + (s.to.radius - s.from.radius) * f };
}

/** HP a second the Ring takes from a seat standing at `position` at `time`. */
export function ringDamage(plan: readonly RingStage[], position: Vec3, time: number): number {
  if (plan.length === 0) return 0;
  const { x, z, radius } = ringAt(plan, time);
  return Math.hypot(position[0] - x, position[2] - z) > radius ? plan[stageAt(plan, time)]!.damage : 0;
}
