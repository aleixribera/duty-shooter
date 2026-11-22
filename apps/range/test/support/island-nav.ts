import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, decodeLargeNav, encodeLargeNav, type LargeNav } from '@duty-shooter/fps-core';
import { mapSolids } from '../../src/map/definition';
import type { MapDefinition } from '../../src/map/definition';
import { buildZeroIslandNav } from '../../src/map/zero-island-nav';
import { builtOnce, sourcesHash } from '../../../../packages/fps-core/test/support/measured';
// vitest.passed: pure. What it reads is named for a hash of the sources it is built from.

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR = join(HERE, '../../src/map/zero-island-nav.ts');
const DIR = join(HERE, '../../node_modules/.cache/duty-nav');

/**
 * The island's nav for a test that plays on it, built once and kept: it takes a
 * minute and a half, and tests are the reason it would be built again. The file
 * is named for a hash of every source the generator imports (the map, the
 * terrain, the nav builder and all they use), so an edit to any of them builds a
 * new one, and decoding checks it against the map besides. The island's test
 * files wait for one build rather than each building it. What a test gets is
 * the decoded file, as a server does. CI keeps the folder between runs.
 */
export function islandNav(map: MapDefinition): LargeNav {
  const name = `${sourcesHash([GENERATOR])}.nav`;
  const file = join(DIR, name);
  const world = createWorld(mapSolids(map), { terrain: map.terrain });
  const build = () => encodeLargeNav(buildZeroIslandNav(map));
  let bytes = builtOnce(file, build);
  let nav: LargeNav;
  try {
    nav = decodeLargeNav(bytes, world);
  } catch {
    // Built for another map: build it again.
    rmSync(file, { force: true });
    bytes = builtOnce(file, build);
    nav = decodeLargeNav(bytes, world);
  }
  // Older builds (another version of the sources) are only ever stale, as is what a run stopped halfway left behind.
  for (const old of readdirSync(DIR)) if (!old.startsWith(name) && /\.nav(\.\d+|\.lock)?$/.test(old)) rmSync(join(DIR, old), { force: true });
  return nav;
}
