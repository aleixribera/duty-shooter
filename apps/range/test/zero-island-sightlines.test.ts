import { describe, expect, it } from 'vitest';
import type { SoftCover } from '@duty-shooter/fps-core';
import { regionAt, REGION_IDS } from '../src/map/zero-island-terrain';
import { quantile, report, type Sighted } from './support/sightlines';
import { AREA, line, map, mapSeconds, standing } from './support/island-sightlines';

// A crouched body, as bots see it, is measured in zero-island-sightlines-crouched.test.ts.

const { land, sea, seconds, nodes, links } = standing();

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
const onRoof = (p: Sighted) => map.solids.some((s, i) => /^(cover|built)-/.test(map.looks[i]?.side ?? '') && p.x > s.min[0] - 1 && p.x < s.max[0] + 1 && p.z > s.min[2] - 1 && p.z < s.max[2] + 1 && Math.abs(s.max[1] - p.y) < 0.6);
const onFoot = (p: Sighted) => !onRoof(p);

describe('Zero Island: sightlines', () => {
  it('reports what it measured', () => {
    console.log(`${map.solids.length} solids, ${nodes} nodes, ${links} links, map ${mapSeconds.toFixed(2)} s, sampled in ${seconds.toFixed(1)} s`);
    console.log(line('land', land));
    for (const id of REGION_IDS) console.log(line(id, land.filter((p) => regionAt(p.x, p.z) === id)));
    console.log(line('shallows', sea));
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
