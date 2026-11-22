import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourcesOf } from '../../../../vitest.passed';
// vitest.passed: pure. What it reads is named for a hash of the sources it measures.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../../..');
/** Where tests keep what they measured. */
const CACHE = join(REPO, 'node_modules/.cache/duty-tests');

/**
 * A hash of every source `entries` run (their import graph inside the workspace, through a package barrel only to
 * the files whose values they import) and of the engine running them: what is built or measured from them comes out
 * the same while it does. CI hashes their whole import graph, every file of a package they import from, so the
 * island nav it keeps between runs is built again for any change to the engine.
 */
export function sourcesHash(entries: readonly string[]): string {
  const hash = createHash('sha256').update(process.versions.v8);
  for (const file of sourcesOf(entries, !process.env.CI)) hash.update(relative(REPO, file).replaceAll('\\', '/')).update(readFileSync(file));
  return hash.digest('hex').slice(0, 16);
}

const nap = new Int32Array(new SharedArrayBuffer(4));
/** Whether the process that wrote `lock` (its pid inside) is still running, and the lock is younger than a build could take. */
function held(lock: string): boolean {
  try {
    if (Date.now() - statSync(lock).mtimeMs > 15 * 60_000) return false;
    const pid = readFileSync(lock, 'utf8');
    // Made a moment ago, its pid not written yet.
    if (!pid) return true;
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    // EPERM: the process runs, as another user. Anything else: no lock, or its writer is gone.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * The bytes at `file`, built by `build` and written there when missing. Test files on other workers that need the
 * same file meanwhile wait for the one build instead of each running it: four island test files building the nav
 * side by side cost four workers several minutes. A writer that died leaves its lock to the next file.
 */
export function builtOnce(file: string, build: () => Uint8Array): Uint8Array {
  const lock = `${file}.lock`;
  mkdirSync(dirname(file), { recursive: true });
  for (;;) {
    try {
      return readFileSync(file);
    } catch {
      // Not built yet.
    }
    let mine = false;
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx' });
      mine = true;
    } catch {
      if (!held(lock)) rmSync(lock, { force: true });
    }
    if (mine) {
      try {
        // Built by another file between the read above and the lock.
        if (existsSync(file)) continue;
        const data = build();
        const partial = `${file}.${process.pid}`;
        writeFileSync(partial, data);
        renameSync(partial, file);
        return data;
      } finally {
        rmSync(lock, { force: true });
      }
    }
    Atomics.wait(nap, 0, 0, 250);
  }
}

/**
 * What `compute` returns, kept in `node_modules/.cache/duty-tests/<dir>` under a hash of every source the measuring files import (and the
 * lockfile, for three and the other packages): a deterministic measurement taken again only when something it depends
 * on changed. CI never reads it and always measures afresh, so a dependency the hash missed still fails there.
 * A kept measurement is returned as it was taken, timings included.
 */
export function measured<T>(dir: string, entries: readonly string[], compute: () => T, revive?: (key: string, value: unknown) => unknown): T {
  const name = `${createHash('sha256').update(sourcesHash(entries)).update(readFileSync(join(REPO, 'package-lock.json'))).digest('hex').slice(0, 16)}.json`;
  const folder = join(CACHE, dir);
  const file = join(folder, name);
  if (!process.env.CI) {
    try {
      return JSON.parse(readFileSync(file, 'utf8'), revive) as T;
    } catch {
      // Not measured for these sources yet.
    }
  }
  const value = compute();
  // Under a name of its own and then moved, as another test file may be writing it too; if that one wins, or the
  // folder can't be written, the measurement is simply taken again next time.
  const partial = `${file}.${process.pid}`;
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(partial, JSON.stringify(value));
    renameSync(partial, file);
    // Older measurements, and what a run stopped halfway left behind.
    for (const old of readdirSync(folder)) if (old !== name && /\.json(\.\d+)?$/.test(old) && !old.startsWith(`${name}.`)) rmSync(join(folder, old), { force: true });
  } catch {
    rmSync(partial, { force: true });
  }
  return value;
}
