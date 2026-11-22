// The island measured for sightlines, shared by zero-island-sightlines.test.ts (standing) and
// zero-island-sightlines-crouched.test.ts (a crouched body, as bots see it): two files, so the samplings run side by side.
// Each sampling takes a quarter of a minute or more and comes out the same for the same sources, so it is kept
// (`measured`) and taken again only when the map, the engine or this measuring changes; CI always takes it afresh.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Terrain, createWorld, type World } from '@duty-shooter/fps-core';
// The island and the map helpers from their own files, not maps.ts: an edit to another map leaves the measurements kept.
import { buildZeroIsland } from '../../src/map/zero-island';
import { insidePolygon, mapConcealment, mapSolids } from '../../src/map/definition';
import { islandNav } from './island-nav';
import { SUMMIT, SUMMIT_RADIUS } from '../../src/map/zero-island-terrain';
import { report, sight, sightBareAndSoft, type Sighted, type Standing } from './sightlines';
import { measured } from '../../../../packages/fps-core/test/support/measured';

const HERE = dirname(fileURLToPath(import.meta.url));
/** What a sampling is computed from: this file, the measuring, and through them the map and the engine. */
const MEASURING = [fileURLToPath(import.meta.url), join(HERE, 'sightlines.ts')];

const before = performance.now();
export const map = buildZeroIsland();
export const mapSeconds = (performance.now() - before) / 1000;
const terrain = new Terrain(map.terrain!);
const GRID = 12;
export const AREA = 96;

let built: { world: World; nav: ReturnType<typeof islandNav> } | undefined;
/** The island's world and nav, built only when a sampling is taken. */
function island() {
  return (built ??= { world: createWorld(mapSolids(map), { terrain: map.terrain, concealment: mapConcealment(map) }), nav: islandNav(map) });
}

const standable = (x: number, z: number) => insidePolygon(map.playArea!, x, z) && !terrain.steepAt(x, z) && Math.hypot(x - SUMMIT.x, z - SUMMIT.z) > SUMMIT_RADIUS;

/** One standing point on a nav node per cell of a grid: everywhere a player or bot can stand, roofs and bridges included. */
function landPoints(): Standing[] {
  const cells = new Map<number, Standing>();
  for (const { position: [x, y, z], escape } of island().nav.nodes) {
    // A way out (ticket 75) is where a stranded body starts back, not a place to stand.
    if (escape) continue;
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

/** What the sampling is told: where a body can stand. */
const options = { standable };

/** Cover past its reach is Infinity, which JSON keeps as null. */
const revive = (key: string, value: unknown) => (key === 'cover' && value === null ? Infinity : value);

/** A person standing, seen standing: every land point and the shallows, and what the sampling took. */
export const standing = () =>
  measured(
    'duty-sightlines-standing',
    MEASURING,
    () => {
      const t0 = performance.now();
      const { world, nav } = island();
      const land: Sighted[] = landPoints().map((p) => sight(world, p, options));
      const sea: Sighted[] = seaPoints().map((p) => sight(world, p, options));
      return { land, sea, seconds: (performance.now() - t0) / 1000, nodes: nav.nodes.length, links: nav.packed.linkTo.length };
    },
    revive,
  );

/** A crouched body (head 1.1 m up) at every land point, seen through foliage (`bare`) and as a bot sees it (`soft`). */
export const crouched = () =>
  measured(
    'duty-sightlines-crouched',
    MEASURING,
    () => {
      const { world } = island();
      const both = landPoints().map((p) => sightBareAndSoft(world, p, { ...options, target: 1.1 }));
      return { bare: both.map((b) => b.bare), soft: both.map((b) => b.soft) };
    },
    revive,
  );

export const line = (name: string, points: readonly Sighted[]) => {
  const r = report(points, 15);
  return `${name.padEnd(16)} ${String(r.points).padStart(5)} points, cover median ${r.coverMedian.toFixed(1)} worst ${r.coverWorst.toFixed(1)}, within 15 m ${(r.covered * 100).toFixed(1)}%, view median ${r.viewMedian} p90 ${r.viewP90}, past 150 m ${(r.lanes * 100).toFixed(1)}%`;
};
