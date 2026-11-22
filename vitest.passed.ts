import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Reporter, TestModule, TestSpecification, Vitest } from 'vitest/node';

/**
 * `npm test`: the fast tier's files that could fail. A file that passed is not run again while everything it is
 * made from is byte for byte what it passed with: its whole import graph inside the workspace (test, support and
 * game code, through package barrels, so a change to fps-core reruns all that imports it), its snapshot, the
 * environment variables that graph reads, the test config, the lockfile and Node. A file whose graph reads files
 * also runs again when any non-code file under packages/, apps/ or tools/ changes (a model, a plan, a sound); one
 * that reads code by name, scans folders or starts processes, when any file there changes.
 * `npm test` and `npm run test:fast` record the files that pass; CI and every other run record nothing.
 *
 * vitest.passed: pure. Test support (`measured`) imports this file for its import graph; it reads only sources by name.
 */
const ROOT = dirname(fileURLToPath(import.meta.url));
const STORE = join(ROOT, 'node_modules/.cache/duty-tests/passed.json');
/** Set by this file for the vitest it starts: only those runs record what passed. */
const RECORD = 'DUTY_TESTS_RECORD';
const FAST = ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'];
const SOAK = /\.soak\.test\.ts$/;
const CODE = /\.(ts|mjs|js)$/;
const importing = (modules: string) => new RegExp(`(?:from|import|require)\\s*\\(?\\s*['"](?:node:)?(?:${modules})['"]`);
/** Reads files. */
const FILES = importing('fs|fs/promises');
/** Runs code its imports don't name: another process, a worker. */
const PROCESSES = importing('child_process|worker_threads');
/** Reads code or folders by name: a scan of a folder, or a file named `….ts`, `….mjs`, `….js`. */
const CODE_BY_NAME = /\b(?:readdirSync|readdir|globSync|glob)\(|['"`][^'"`\s]+\.(?:ts|mjs|js)['"`]/;
/** A file named beside the code (a worker's script, an asset): `new URL('./x', import.meta.url)`. */
const BESIDE = /new URL\(\s*['"`]([^'"`]+)['"`]\s*,\s*import\.meta\.url/g;
/** Any import, re-export or `import()` of a module: its name. */
const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
/** `import { a, b as c, type D } from 'x'`, or `import type { … }`. */
const NAMED_IMPORT = /\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3/g;
/** `export { a, b as c } from 'x'`, or `export type { … }`. */
const REEXPORT = /\bexport\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;
/** The values a `{ … }` list names, each as [name in the module, name here]; types (`type X`) left out. */
const namesIn = (list: string) =>
  list
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && !/^type\s/.test(item))
    .map((item) => {
      const [inner, outer] = item.split(/\s+as\s+/);
      return [inner!, outer ?? inner!] as const;
    });
/** An environment variable read by name: `process.env.X`, `process.env['X']`. */
const ENV = /process\.env(?:\.([A-Za-z_]\w*)|\[\s*['"]([A-Za-z_]\w*)['"]\s*\])/g;
/** A test that runs alone, so the rest of its file passes by being skipped. */
const ONLY = /\b(?:it|test|describe)\.only\s*\(/;
/**
 * A file that says so in a comment is as pure as its imports, whatever it reads: one that reads only what it is
 * handed (a server's static folder, a test's temp files), or files named for a hash of its own sources (the
 * island's nav, `measured`). Say why beside the marker.
 */
const PURE_MARK = 'vitest.passed: pure';

/** What a file reaches past its imports for: nothing, files that aren't code, or code too. */
type Reach = 0 | 1 | 2;
const PURE: Reach = 0;
const ASSETS: Reach = 1;
const ALL: Reach = 2;

const posix = (file: string) => relative(ROOT, file).replaceAll('\\', '/');
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `source` without its comments and type-only imports, which run nothing. */
const running = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import\s+type\b[^;]*;/gm, '');

function reachOf(source: string): Reach {
  if (source.includes(PURE_MARK)) return PURE;
  const code = running(source);
  if (PROCESSES.test(code)) return ALL;
  if (FILES.test(code)) return CODE_BY_NAME.test(code) ? ALL : ASSETS;
  // A file named beside the code that is not code (a model, a sound) is fetched or read at run time.
  return [...code.matchAll(BESIDE)].some(([, spec]) => !CODE.test(spec!)) ? ASSETS : PURE;
}

/** The workspace's sources as they stand now, read once each: what a file imports, reaches for and reads from the environment. */
class Sources {
  private readonly text = new Map<string, string>();
  private readonly exports = new Map<string, Record<string, string>>();
  private readonly imports = new Map<string, string[]>();
  private readonly barrels = new Map<string, Map<string, readonly [string, string]> | null>();

  /**
   * `narrow`: an import of named values from a barrel (a file that only re-exports, `export { a } from './a'`)
   * reaches only the files those names come from, and an import of types only reaches nothing, as nothing else of
   * it runs. Measurements use it (an edit to the engine's weapons doesn't take the island's sightlines again); a
   * test's key doesn't, as a test may lean on what loading a whole package does.
   */
  private readonly narrow: boolean;

  constructor(narrow = false) {
    this.narrow = narrow;
  }

  read(file: string): string {
    let t = this.text.get(file);
    if (t === undefined) this.text.set(file, (t = readFileSync(file, 'utf8')));
    return t;
  }

  private exportsOf(pkg: string): Record<string, string> {
    let e = this.exports.get(pkg);
    if (!e) this.exports.set(pkg, (e = (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { exports?: Record<string, string> }).exports ?? {}));
    return e;
  }

  /** The workspace file an import names, or null for one outside the repo's packages (three, node:). */
  private resolve(from: string, spec: string): string | null {
    if (spec.startsWith('.')) {
      const base = resolve(dirname(from), spec);
      for (const file of [base, `${base}.ts`, join(base, 'index.ts')]) if (CODE.test(file) && existsSync(file)) return file;
      return null;
    }
    const scoped = /^@duty-shooter\/([^/]+)(\/.+)?$/.exec(spec);
    if (!scoped) return null;
    for (const dir of ['packages', 'apps']) {
      const pkg = join(ROOT, dir, scoped[1]!);
      if (!existsSync(join(pkg, 'package.json'))) continue;
      const target = this.exportsOf(pkg)[`.${scoped[2] ?? ''}`];
      return target ? join(pkg, target) : null;
    }
    return null;
  }

  /** Each name a barrel exports: the file it comes from and its name there. Null for a file that does more than re-export. */
  private barrel(file: string): Map<string, readonly [string, string]> | null {
    if (this.barrels.has(file)) return this.barrels.get(file)!;
    const code = running(this.read(file));
    const names = new Map<string, readonly [string, string]>();
    for (const [, type, list, spec] of code.matchAll(REEXPORT)) {
      const from = this.resolve(file, spec!);
      if (from && !type) for (const [inner, exported] of namesIn(list!)) names.set(exported, [from, inner]);
    }
    const barrel = code.replace(REEXPORT, '').trim() ? null : names;
    this.barrels.set(file, barrel);
    return barrel;
  }

  /** The file a barrel's export `name` is made in, through barrels it re-exports from; null when it isn't found. */
  private origin(barrel: string, name: string): string | null {
    const found = this.barrel(barrel)?.get(name);
    if (!found) return null;
    const [from, inner] = found;
    return this.barrel(from) ? this.origin(from, inner) : from;
  }

  /** The files a file's imports of `spec`, barrel `target`, reach when `narrow`; null when they reach all of it. */
  private named(source: string, spec: string, target: string): string[] | null {
    if (!this.barrel(target)) return null;
    const imports = [...source.matchAll(IMPORT)].filter(([, s]) => s === spec).length;
    const named = [...source.matchAll(NAMED_IMPORT)].filter(([, , , , s]) => s === spec);
    // `import * as`, a default, a re-export or an `import()` of it: all of it.
    if (named.length !== imports) return null;
    // Not the barrels themselves, whose every re-export would lead on to the whole package.
    const files = new Set<string>();
    for (const [, type, list] of named) {
      if (type) continue;
      for (const [imported] of namesIn(list!)) {
        const from = this.origin(target, imported);
        if (!from) return null;
        files.add(from);
      }
    }
    return [...files];
  }

  private importsOf(file: string): string[] {
    let list = this.imports.get(file);
    if (!list) {
      list = [];
      const source = this.narrow ? running(this.read(file)) : this.read(file);
      for (const [, spec] of source.matchAll(IMPORT)) {
        const next = this.resolve(file, spec!);
        if (!next) continue;
        const named = this.narrow ? this.named(source, spec!, next) : null;
        list.push(...(named ?? [next]));
      }
      // A script named beside the code (a worker's) is part of it.
      for (const [, spec] of this.read(file).matchAll(BESIDE)) {
        const next = this.resolve(file, spec!.startsWith('.') ? spec! : `./${spec}`);
        if (next) list.push(next);
      }
      this.imports.set(file, list);
    }
    return list;
  }

  /** Every workspace file `entries` are built from, `entries` included, by their path from the repo. */
  closure(entries: readonly string[]): string[] {
    // One spelling of each path (vitest names files with forward slashes, Node with the platform's).
    const queue = entries.map((f) => resolve(f));
    const seen = new Set(queue);
    for (let file = queue.pop(); file; file = queue.pop()) for (const next of this.importsOf(file)) if (!seen.has(next)) seen.add(next), queue.push(next);
    return [...seen].sort((a, b) => byName(posix(a), posix(b)));
  }

  reach(files: readonly string[]): Reach {
    let reach = PURE;
    for (const file of files) if (reach < ALL) reach = Math.max(reach, reachOf(this.read(file))) as Reach;
    return reach;
  }

  /** The environment variables `files` read by name, with their values now. */
  env(files: readonly string[]): string {
    const names = new Set<string>();
    for (const file of files) for (const [, dot, quoted] of running(this.read(file)).matchAll(ENV)) names.add((dot ?? quoted)!);
    return [...names].sort(byName).map((n) => `${n}=${process.env[n] ?? ''}`).join('\n');
  }
}

/** Every workspace source `entries` are built from: their whole import graph inside the repo, `entries` included. */
export const sourcesOf = (entries: readonly string[], narrow = false): string[] => new Sources(narrow).closure(entries);

/** Each fast-tier file's key, by its path from the repo: a hash of all it is made from, as said above. */
export function testKeys(files: readonly string[]): Map<string, string> {
  const sources = new Sources();
  const shared = createHash('sha256').update(process.versions.node);
  for (const f of ['vitest.config.ts', 'vitest.passed.ts', 'package-lock.json', 'tsconfig.base.json']) shared.update(f).update(readFileSync(join(ROOT, f)));
  const base = shared.digest('hex');
  const trees: Partial<Record<Reach, string>> = {};
  const tree = (reach: Reach) => (trees[reach] ??= treeHash(reach === ALL));

  const keys = new Map<string, string>();
  for (const named of files) {
    const test = resolve(named);
    const closure = sources.closure([test]);
    const hash = createHash('sha256').update(base);
    for (const file of closure) hash.update(posix(file)).update(sources.read(file));
    hash.update(sources.env(closure));
    const snap = join(dirname(test), '__snapshots__', `${basename(test)}.snap`);
    if (existsSync(snap)) hash.update(readFileSync(snap));
    const reach = sources.reach(closure);
    if (reach !== PURE) hash.update(tree(reach));
    keys.set(posix(test), hash.digest('hex').slice(0, 24));
  }
  return keys;
}

/** The files under packages/, apps/ and tools/ as they stand (all, or only those that aren't code): git's record of the committed ones, and the contents of those changed or new. */
function treeHash(code: boolean): string {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const kept = (file: string) => code || !CODE.test(file);
  const hash = createHash('sha256');
  for (const line of git('ls-files', '-s', '--', 'packages', 'apps', 'tools').split('\n')) if (kept(line)) hash.update(line);
  const changed = git('ls-files', '-m', '-o', '--exclude-standard', '--', 'packages', 'apps', 'tools').split('\n').filter((f) => f && kept(f)).sort();
  for (const file of changed) {
    hash.update(file);
    if (existsSync(join(ROOT, file))) hash.update(readFileSync(join(ROOT, file)));
  }
  return hash.digest('hex');
}

function load(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(STORE, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Records each fast-tier file that passed whole, under the key of what it ran with. */
export default class Passed implements Reporter {
  private vitest!: Vitest;
  private before = new Map<string, string>();

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
  }

  private recording(): boolean {
    // A name filter runs part of each file: its pass says nothing about the rest.
    return process.env[RECORD] === '1' && !process.env.CI && !this.vitest.config.testNamePattern;
  }

  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    // The keys of what the files start running with: a file edited during the run is not recorded as passing.
    if (this.recording()) this.before = testKeys(specifications.filter((s) => s.project.name === 'fast').map((s) => s.moduleId));
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>, unhandledErrors: ReadonlyArray<unknown>, reason: 'passed' | 'interrupted' | 'failed'): void {
    if (!this.recording() || reason === 'interrupted') return;
    const fast = modules.filter((m) => m.project.name === 'fast');
    const store = load();
    for (const m of fast) if (m.state() === 'failed') delete store[posix(m.moduleId)];
    // An error outside any test may have come from any file.
    if (!unhandledErrors.length) {
      const whole = fast.filter((m) => (m.state() === 'passed' || m.state() === 'skipped') && !ONLY.test(readFileSync(m.moduleId, 'utf8')));
      const now = testKeys(whole.map((m) => m.moduleId));
      for (const [file, key] of now) if (this.before.get(file) === key) store[file] = key;
    }
    try {
      mkdirSync(dirname(STORE), { recursive: true });
      const partial = `${STORE}.${process.pid}`;
      writeFileSync(partial, JSON.stringify(store, null, 1));
      renameSync(partial, STORE);
    } catch (error) {
      console.warn(`vitest.passed: could not record the passes (${String(error)}); the next \`npm test\` runs those files again.`);
    }
  }
}

/** `npm test`: runs the fast-tier files not passed with what they are made of now; `--all`, every one; other arguments go to vitest as they are. */
if (import.meta.main) {
  const vitest = (args: string[], record: boolean) =>
    spawnSync(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', '--project', 'fast', ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: record ? { ...process.env, [RECORD]: '1' } : process.env,
    }).status ?? 1;
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--all') process.exit(vitest([], true));
  if (args.length) process.exit(vitest(args, false));
  const started = performance.now();
  const files = globSync(FAST, { cwd: ROOT }).map((f) => join(ROOT, f)).filter((f) => !SOAK.test(f));
  const keys = testKeys(files);
  const store = load();
  const stale = [...keys].filter(([file, key]) => store[file] !== key).map(([file]) => file).sort(byName);
  const took = ((performance.now() - started) / 1000).toFixed(1);
  if (!stale.length) {
    console.log(`All ${keys.size} fast-tier files passed with the code as it is now (checked in ${took} s); \`npm run test:fast\` runs them all.`);
    process.exit(0);
  }
  console.log(`${stale.length} of ${keys.size} fast-tier files changed since they last passed (checked in ${took} s).`);
  process.exit(vitest(stale.length === keys.size ? [] : stale, true));
}
