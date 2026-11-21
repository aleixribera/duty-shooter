import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorld, decodeLargeNav, encodeLargeNav, type LargeNav } from '@duty-shooter/fps-core';
import { mapSolids } from '../../src/map/maps';
import type { MapDefinition } from '../../src/map/definition';
import { buildZeroIslandNav } from '../../src/map/zero-island-nav';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../..');
const GENERATOR = join(HERE, '../../src/map/zero-island-nav.ts');
const DIR = join(HERE, '../../node_modules/.cache/duty-nav');

/** The workspace file an import names, or null for one outside the repo's packages (three, node:). */
function resolveImport(from: string, spec: string): string | null {
  if (spec.startsWith('.')) {
    const base = resolve(dirname(from), spec);
    for (const file of [base, `${base}.ts`, join(base, 'index.ts')]) if (file.endsWith('.ts') && existsSync(file)) return file;
    return null;
  }
  const scoped = /^@duty-shooter\/([^/]+)(\/.+)?$/.exec(spec);
  if (!scoped) return null;
  const pkg = join(REPO, 'packages', scoped[1]!);
  const exports = (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { exports: Record<string, string> }).exports;
  const target = exports[`.${scoped[2] ?? ''}`];
  return target ? join(pkg, target) : null;
}

/** Every source file the generator is built from: its imports, followed through the workspace's packages. */
function generatorSources(): string[] {
  const seen = new Set<string>([GENERATOR]);
  const queue = [GENERATOR];
  for (let file = queue.pop(); file; file = queue.pop()) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const next = resolveImport(file, spec!);
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen].sort();
}

/**
 * The island's nav for a test that plays on it, built once and kept: it takes a
 * minute and a half, and tests are the reason it would be built again. The file
 * is named for a hash of every source the generator imports (the map, the
 * terrain, the nav builder and all they use), so an edit to any of them builds a
 * new one, and decoding checks it against the map besides. What a test gets is
 * the decoded file, as a server does. CI keeps the folder between runs.
 */
export function islandNav(map: MapDefinition): LargeNav {
  const hash = createHash('sha256').update(process.versions.v8);
  for (const file of generatorSources()) hash.update(file.slice(REPO.length)).update(readFileSync(file));
  const name = `${hash.digest('hex').slice(0, 16)}.nav`;
  const file = join(DIR, name);
  const world = createWorld(mapSolids(map), { terrain: map.terrain });
  try {
    const bytes = readFileSync(file);
    return decodeLargeNav(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), world);
  } catch {
    // Not built yet, or built for another map.
  }
  const data = encodeLargeNav(buildZeroIslandNav(map));
  mkdirSync(DIR, { recursive: true });
  // Under a name of its own and then moved, as the other test files may be doing the same.
  const partial = `${file}.${process.pid}`;
  writeFileSync(partial, data);
  renameSync(partial, file);
  // Older builds (another version of the sources) are only ever stale.
  for (const old of readdirSync(DIR)) if (old !== name && old.endsWith('.nav')) rmSync(join(DIR, old), { force: true });
  return decodeLargeNav(data, world);
}
