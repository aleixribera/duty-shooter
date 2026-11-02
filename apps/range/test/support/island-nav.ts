import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, decodeLargeNav, encodeLargeNav, type LargeNav } from '@duty-shooter/fps-core';
import { mapSolids } from '../../src/map/maps';
import type { MapDefinition } from '../../src/map/definition';
import { buildZeroIslandNav } from '../../src/map/zero-island-nav';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATOR = [join(HERE, '../../../../packages/fps-core/src/bots/large-nav.ts'), join(HERE, '../../src/map/zero-island-nav.ts')];

/**
 * The island's nav for a test that plays on it, built once and kept: it takes a
 * minute and a half, and tests are the reason it would be built again. The file
 * is named for the generator's source, and decoding checks it against the map,
 * so an edit to either builds a new one. What a test gets is the decoded file,
 * as a server does. `zero-island-nav.test.ts` always builds its own.
 */
export function islandNav(map: MapDefinition): LargeNav {
  const hash = createHash('sha256');
  for (const file of GENERATOR) hash.update(readFileSync(file));
  const file = join(HERE, `../../node_modules/.cache/duty-nav/${hash.digest('hex').slice(0, 16)}.nav`);
  const world = createWorld(mapSolids(map), { terrain: map.terrain });
  try {
    const bytes = readFileSync(file);
    return decodeLargeNav(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), world);
  } catch {
    // Not built yet, or built for another map.
  }
  const data = encodeLargeNav(buildZeroIslandNav(map));
  mkdirSync(dirname(file), { recursive: true });
  // Under a name of its own and then moved, as the other test files may be doing the same.
  const partial = `${file}.${process.pid}`;
  writeFileSync(partial, data);
  renameSync(partial, file);
  return decodeLargeNav(data, world);
}
