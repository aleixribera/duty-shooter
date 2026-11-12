// Ticket 84: solid count and the cost of 20k random shots through Survival Town.
import { it } from 'vitest';
import { createWorld, raycastWorld, type Vec3 } from '@duty-shooter/fps-core';
import { mapSolids } from '../../../apps/range/src/map/definition';
import { buildSurvivalTown } from '../../../apps/range/src/map/survival-town';
it('rays', () => {
  const solids = mapSolids(buildSurvivalTown());
  const world = createWorld(solids);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rays: [Vec3, Vec3][] = [];
  for (let i = 0; i < 20000; i++) rays.push([[r() * 60 - 30, 1 + r() * 4, r() * 80 - 40], [r() * 60 - 30, r() * 5, r() * 80 - 40]]);
  for (const [a, b] of rays.slice(0, 2000)) raycastWorld(world, a, b);
  const t = performance.now();
  let hits = 0;
  for (const [a, b] of rays) if (raycastWorld(world, a, b)) hits++;
  console.log(`solids ${solids.length} hits ${hits} ms ${(performance.now() - t).toFixed(1)}`);
});
