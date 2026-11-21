// The island measured for sightlines, shared by zero-island-sightlines.test.ts (standing) and
// zero-island-sightlines-crouched.test.ts (a crouched body, as bots see it): two files, so the samplings run side by side.
import { Terrain, createWorld } from '@duty-shooter/fps-core';
import { buildMapById, insidePolygon, mapConcealment, mapSolids } from '../../src/map/maps';
import { islandNav } from './island-nav';
import { SUMMIT, SUMMIT_RADIUS } from '../../src/map/zero-island-terrain';
import { report, type Sighted, type Standing } from './sightlines';

const before = performance.now();
export const map = buildMapById('zero-island');
export const mapSeconds = (performance.now() - before) / 1000;
export const world = createWorld(mapSolids(map), { terrain: map.terrain, concealment: mapConcealment(map) });
const terrain = new Terrain(map.terrain!);
export const nav = islandNav(map);
const GRID = 12;
export const AREA = 96;

const standable = (x: number, z: number) => insidePolygon(map.playArea!, x, z) && !terrain.steepAt(x, z) && Math.hypot(x - SUMMIT.x, z - SUMMIT.z) > SUMMIT_RADIUS;

/** One standing point on a nav node per cell of a grid: everywhere a player or bot can stand, roofs and bridges included. */
export function landPoints(): Standing[] {
  const cells = new Map<number, Standing>();
  for (const { position: [x, y, z], escape } of nav.nodes) {
    // A way out (ticket 75) is where a stranded body starts back, not a place to stand.
    if (escape) continue;
    const key = Math.floor(x / GRID) * 100_000 + Math.floor(z / GRID);
    if (!cells.has(key)) cells.set(key, { x, y, z });
  }
  return [...cells.values()];
}

/** The shallows inside the Boundary: nobody needs to be there, but anyone can wade them. */
export function seaPoints(): Standing[] {
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

/** What the sampling is told: where a body can stand. */
export const options = { standable };

export const line = (name: string, points: readonly Sighted[]) => {
  const r = report(points, 15);
  return `${name.padEnd(16)} ${String(r.points).padStart(5)} points, cover median ${r.coverMedian.toFixed(1)} worst ${r.coverWorst.toFixed(1)}, within 15 m ${(r.covered * 100).toFixed(1)}%, view median ${r.viewMedian} p90 ${r.viewP90}, past 150 m ${(r.lanes * 100).toFixed(1)}%`;
};

