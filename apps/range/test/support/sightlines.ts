import { segmentSolid, sightBlocked, type Terrain, type Vec3, type World } from '@duty-shooter/fps-core';

/**
 * What a sniper and a person looking for cover would each measure, sampled
 * across a map on terrain. Everything comes from the same collision bullets and
 * movement use, so nothing here takes a map's word for what is cover.
 */

/** Eye height of someone standing (m). */
const EYE = 1.6;
/** A body low behind cover: the height a ray has to be stopped at (m). */
const CHEST = 1.05;
/** How much a crest has to stand proud of the ground either side of it to hide a crouched body. */
const CREST = 1;
/** Half the span a crest is measured across (m). */
const SHOULDER = 6;
const BEARINGS = 16;
/** Bearings looked along for cover: finer, as a post is narrow. */
const COVER_BEARINGS = 48;

export interface Standing {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Sighted extends Standing {
  /** Metres to the nearest hard cover, Infinity past `reach`. */
  readonly cover: number;
  /** Along each bearing, the farthest metres at which a person standing on the ground could be seen. */
  readonly views: readonly number[];
}

export interface SightOptions {
  /** Where a person can stand at the far end of a view. */
  readonly standable: (x: number, z: number) => boolean;
  /** How far to look for cover (m). */
  readonly coverReach?: number;
  /** How far a view is followed (m). */
  readonly viewReach?: number;
  /** Metres between the people looked for along a view. */
  readonly viewStep?: number;
  /** How high above the ground the person looked for is seen (m): a standing eye by default. */
  readonly target?: number;
  /** Count soft cover (`world.concealment`) as hiding them, as a bot's eyes do. */
  readonly soft?: boolean;
}

/** True when a crest at `r` metres along (ux, uz) stands proud of the ground either side of it, or the point is down in a ditch that does. */
function crestAt(t: Terrain, p: Standing, ux: number, uz: number, r: number): boolean {
  const h = (d: number) => t.heightAt(p.x + ux * d, p.z + uz * d);
  const peak = h(r);
  return peak - Math.max(h(r - SHOULDER), h(r + SHOULDER)) >= CREST || (r <= SHOULDER && peak - p.y >= CREST && h(-r) - p.y >= CREST);
}

/** Metres to the nearest thing that would stop a bullet aimed at a crouched body: a solid, or a crest of ground. */
export function nearestCover(world: World, p: Standing, reach: number): number {
  const t = world.terrain!;
  const chest: Vec3 = [p.x, p.y + CHEST, p.z];
  let best = Infinity;
  for (let k = 0; k < COVER_BEARINGS; k++) {
    const turn = (k / COVER_BEARINGS) * Math.PI * 2;
    const [ux, uz] = [Math.cos(turn), Math.sin(turn)];
    const far: Vec3 = [p.x + ux * reach, chest[1], p.z + uz * reach];
    const hit = world.bullets.firstHit(chest, far, (i) => (world.solids[i]!.material === 'glass' ? null : segmentSolid(chest, far, world.solids[i]!)));
    if (hit && hit.t * reach < best) best = hit.t * reach;
    for (let r = 2; r < Math.min(best, reach); r += 2) {
      if (crestAt(t, p, ux, uz, r)) {
        best = r;
        break;
      }
    }
  }
  return best;
}

/** Along each bearing from `p`, the farthest person standing on the ground its eye can see. */
function viewsFrom(world: World, p: Standing, o: Required<Pick<SightOptions, 'viewReach' | 'viewStep'>> & SightOptions): number[] {
  const target = o.target ?? EYE;
  const t = world.terrain!;
  const eye: Vec3 = [p.x, p.y + EYE, p.z];
  const out: number[] = [];
  for (let k = 0; k < BEARINGS; k++) {
    const turn = (k / BEARINGS) * Math.PI * 2;
    const [ux, uz] = [Math.cos(turn), Math.sin(turn)];
    let far = 0;
    for (let r = o.viewStep; r <= o.viewReach; r += o.viewStep) {
      const [x, z] = [p.x + ux * r, p.z + uz * r];
      if (!o.standable(x, z)) continue;
      const seen: Vec3 = [x, t.heightAt(x, z) + target, z];
      if (!sightBlocked(world, eye, seen) && !(o.soft && world.concealment?.hides(eye, seen))) far = r;
    }
    out.push(far);
  }
  return out;
}

/** Measures one point. */
export function sight(world: World, p: Standing, options: SightOptions): Sighted {
  const o = { viewReach: 320, viewStep: 10, ...options };
  return { ...p, cover: nearestCover(world, p, options.coverReach ?? 24), views: viewsFrom(world, p, o) };
}

export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]! : 0;
}

export interface SightReport {
  readonly points: number;
  /** Metres to hard cover. */
  readonly coverMedian: number;
  readonly coverWorst: number;
  /** The share of points with hard cover within the distance asked for. */
  readonly covered: number;
  /** Over every point and bearing: the farthest visible person. */
  readonly viewMedian: number;
  readonly viewP90: number;
  /** The share of views past 150 m: the lanes. */
  readonly lanes: number;
}

export function report(points: readonly Sighted[], coverWithin: number): SightReport {
  const views = points.flatMap((p) => p.views);
  const covers = points.map((p) => p.cover);
  return {
    points: points.length,
    coverMedian: quantile(covers, 0.5),
    coverWorst: covers.length ? Math.max(...covers) : 0,
    covered: covers.filter((c) => c <= coverWithin).length / (covers.length || 1),
    viewMedian: quantile(views, 0.5),
    viewP90: quantile(views, 0.9),
    lanes: views.filter((v) => v > 150).length / (views.length || 1),
  };
}
