import { describe, expect, it } from 'vitest';
import { Terrain, createWorld, type SoftCover } from '@duty-shooter/fps-core';
import { buildMapById, insidePolygon, mapConcealment, mapSolids } from '../src/map/maps';
import { islandNav } from './support/island-nav';
import { SUMMIT, SUMMIT_RADIUS, regionAt, REGION_IDS } from '../src/map/zero-island-terrain';
import { quantile, report, sight, type Sighted, type Standing } from './support/sightlines';

const before = performance.now();
const map = buildMapById('zero-island');
const mapSeconds = (performance.now() - before) / 1000;
const world = createWorld(mapSolids(map), { terrain: map.terrain, concealment: mapConcealment(map) });
const terrain = new Terrain(map.terrain!);
const nav = islandNav(map);
const GRID = 12;
const AREA = 96;

const standable = (x: number, z: number) => insidePolygon(map.playArea!, x, z) && !terrain.steepAt(x, z) && Math.hypot(x - SUMMIT.x, z - SUMMIT.z) > SUMMIT_RADIUS;

/** One standing point on a nav node per cell of a grid: everywhere a player or bot can stand, roofs and bridges included. */
function landPoints(): Standing[] {
  const cells = new Map<number, Standing>();
  for (const { position: [x, y, z] } of nav.nodes) {
    const key = Math.floor(x / GRID) * 100_000 + Math.floor(z / GRID);
    if (!cells.has(key)) cells.set(key, { x, y, z });
  }
  return [...cells.values()];
}

/** The shallows inside the Boundary: nobody needs to be there, but anyone can wade them. */
function seaPoints(): Standing[] {
  const out: Standing[] = [];
  const [ox, oz] = map.terrain!.origin;
  for (let z = oz + GRID / 2; z < oz + map.terrain!.rows; z += GRID) {
    for (let x = ox + GRID / 2; x < ox + map.terrain!.columns; x += GRID) {
      const y = terrain.heightAt(x, z);
      if (y < 0.3 && insidePolygon(map.playArea!, x, z)) out.push({ x, y, z });
    }
  }
  return out;
}

const options = { standable };
const CROUCHED = 1.1;
const t0 = performance.now();
const land: Sighted[] = landPoints().map((p) => sight(world, p, options));
const sea: Sighted[] = seaPoints().map((p) => sight(world, p, options));
/** The same points as a bot sees them: someone crouched (head 1.1 m up), through foliage or not. */
const crouched: Sighted[] = landPoints().map((p) => sight(world, p, { ...options, target: CROUCHED, soft: true }));
const crouchedBare: Sighted[] = landPoints().map((p) => sight(world, p, { ...options, target: CROUCHED }));
const seconds = (performance.now() - t0) / 1000;

const line = (name: string, points: readonly Sighted[]) => {
  const r = report(points, 15);
  return `${name.padEnd(16)} ${String(r.points).padStart(5)} points, cover median ${r.coverMedian.toFixed(1)} worst ${r.coverWorst.toFixed(1)}, within 15 m ${(r.covered * 100).toFixed(1)}%, view median ${r.viewMedian} p90 ${r.viewP90}, past 150 m ${(r.lanes * 100).toFixed(1)}%`;
};

/** The land cut into squares: an area is what a player would call one place. */
function areas(points: readonly Sighted[]): Map<string, Sighted[]> {
  const out = new Map<string, Sighted[]>();
  for (const p of points) {
    const key = `${Math.floor(p.x / AREA) * AREA},${Math.floor(p.z / AREA) * AREA}`;
    const list = out.get(key);
    if (list) list.push(p);
    else out.set(key, [p]);
  }
  return out;
}

const COVER_WITHIN = 15;
const SOFT_WITHIN = 6;
/** Spec: median clear line of sight about 50 m or less. The owner has asked twice for this to be a minimum, so the island beats it by a margin. */
const VIEW_MEDIAN = 35;
const REGION_MEDIAN = 45;
const AREA_MEDIAN = 60;
/** Standing on the ground or a deck; a roof is a high spot, earned by climbing it. */
const onRoof = (p: Sighted) => map.solids.some((s, i) => map.looks[i]?.side?.startsWith('cover-') && p.x > s.min[0] - 1 && p.x < s.max[0] + 1 && p.z > s.min[2] - 1 && p.z < s.max[2] + 1 && Math.abs(s.max[1] - p.y) < 0.6);
const onFoot = (p: Sighted) => !onRoof(p);

describe('Zero Island: sightlines', () => {
  it('reports what it measured', () => {
    console.log(`${map.solids.length} solids, ${nav.nodes.length} nodes, ${nav.packed.linkTo.length} links, map ${mapSeconds.toFixed(2)} s, sampled in ${seconds.toFixed(1)} s`);
    console.log(line('land', land));
    for (const id of REGION_IDS) console.log(line(id, land.filter((p) => regionAt(p.x, p.z) === id)));
    console.log(line('shallows', sea));
    console.log(line('crouched, bare', crouchedBare));
    console.log(line('crouched, soft', crouched));
    for (const id of REGION_IDS) console.log(line(`  ${id}`, crouched.filter((p) => regionAt(p.x, p.z) === id)));
    const worst = [...areas(land)].map(([key, points]) => ({ key, median: quantile(points.flatMap((p) => p.views), 0.5) })).sort((a, b) => b.median - a.median);
    console.log(worst.slice(0, 12).map((a) => `${a.key}: ${a.median}`).join('; '));
    expect(land.length).toBeGreaterThan(5000);
  });

  it('keeps every standing point within about 15 m of hard cover', () => {
    const bare = land.filter((p) => p.cover > COVER_WITHIN && onFoot(p)).map((p) => `${p.x},${p.y.toFixed(1)},${p.z}: ${p.cover.toFixed(1)}`);
    expect(bare.slice(0, 60)).toEqual([]);
    expect(sea.filter((p) => p.cover > COVER_WITHIN).map((p) => `${p.x},${p.z}`).slice(0, 20)).toEqual([]);
  });

  it('holds the median view under the target, on the land and in each Region', () => {
    expect(report(land, COVER_WITHIN).viewMedian).toBeLessThanOrEqual(VIEW_MEDIAN);
    for (const id of REGION_IDS) expect(report(land.filter((p) => regionAt(p.x, p.z) === id), COVER_WITHIN).viewMedian, id).toBeLessThanOrEqual(REGION_MEDIAN);
  });

  it('leaves no area open: not the crater floor, the airstrip, the snowfields or the desert', () => {
    const open = [...areas(land)].filter(([, points]) => points.length >= 8).map(([key, points]) => ({ key, median: quantile(points.flatMap((p) => p.views), 0.5) })).filter((a) => a.median > AREA_MEDIAN);
    expect(open).toEqual([]);
  });

  it("hides a crouched body from a bot's eyes sooner with the soft cover than without it", () => {
    expect(map.soft!.length).toBeGreaterThan(10_000);
    const [soft, bare] = [report(crouched, COVER_WITHIN), report(crouchedBare, COVER_WITHIN)];
    expect(soft.viewP90).toBeLessThan(bare.viewP90);
    expect(soft.lanes).toBeLessThan(bare.lanes);
  });

  it('puts soft cover a few steps from most of the open ground', () => {
    // Where a body can drop into a bush, grass or under a canopy: the places to fiddle about in between the hard cover.
    const cells = new Map<number, SoftCover[]>();
    const key = (i: number, j: number) => (i + 1000) * 2000 + j + 1000;
    for (const s of map.soft!) {
      const k = key(Math.floor(s.x / 10), Math.floor(s.z / 10));
      cells.set(k, [...(cells.get(k) ?? []), s]);
    }
    const near = (p: Sighted) => {
      const [ci, cj] = [Math.floor(p.x / 10), Math.floor(p.z / 10)];
      for (let i = ci - 1; i <= ci + 1; i++) {
        for (let j = cj - 1; j <= cj + 1; j++) {
          for (const s of cells.get(key(i, j)) ?? []) if (Math.hypot(s.x - p.x, s.z - p.z) - s.radius <= SOFT_WITHIN && s.top > p.y + 0.9 && s.bottom < p.y + 1.2) return true;
        }
      }
      return false;
    };
    const share = (points: readonly Sighted[]) => points.filter(near).length / points.length;
    const shares = Object.fromEntries(REGION_IDS.map((id) => [id, share(land.filter((p) => regionAt(p.x, p.z) === id))]));
    console.log(`soft cover within ${SOFT_WITHIN} m: land ${(share(land) * 100).toFixed(1)}%, ${REGION_IDS.map((id) => `${id} ${(shares[id]! * 100).toFixed(1)}%`).join(', ')}`);
    // The paved Regions (the city, the docks) are left to their hard cover.
    for (const id of ['ground-zero', 'the-dustlands', 'frostbite-peaks', 'mutant-jungle'] as const) expect(shares[id], id).toBeGreaterThan(0.6);
  });

  it('keeps a few long lanes for a sniper, and only a few', () => {
    const { lanes } = report(land, COVER_WITHIN);
    expect(lanes).toBeGreaterThan(0.005);
    expect(lanes).toBeLessThan(0.15);
  });
});
