import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The server bundles the maps (`@duty-shooter/range/maps`), and they reach
 * into `@duty-shooter/fps-client/surfaces`. That is fine only while nothing
 * on that path loads three.js, the DOM or audio. This follows the server's
 * runtime imports from its entry, across packages, and checks every file it
 * reaches. (`import type` is erased at build time, so it is not followed.)
 */
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKAGES: Record<string, string> = { 'fps-core': 'packages/fps-core', 'fps-client': 'packages/fps-client', range: 'apps/range', server: 'apps/server' };
const FORBIDDEN_MODULES = [/^three(\/|$)/];
const FORBIDDEN_GLOBALS = ['window', 'document', 'navigator', 'localStorage', 'requestAnimationFrame', 'HTMLElement', 'HTMLCanvasElement', 'AudioContext', 'OfflineAudioContext', 'AudioBuffer', 'GPUDevice'];

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The module specifiers a file loads at runtime. */
function runtimeImports(code: string): string[] {
  return [...code.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm), ...code.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]!);
}

/** A specifier as a file in the repo, or null for an outside package. */
function resolveImport(spec: string, from: string): string | null {
  const own = /^@duty-shooter\/([^/]+)(\/.*)?$/.exec(spec);
  if (own) {
    const dir = join(repo, PACKAGES[own[1]!]!);
    const exports = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, string> }).exports;
    const target = exports[`.${own[2] ?? ''}`];
    if (!target) throw new Error(`${spec} is not exported`);
    return join(dir, target);
  }
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(from), spec);
  const file = [base, `${base}.ts`, join(base, 'index.ts')].find((f) => /\.(ts|mjs|js)$/.test(f) && existsSync(f));
  if (!file) throw new Error(`cannot resolve ${spec} from ${from}`);
  return file;
}

/** Every repo file the server loads, and what each breaks of the headless rule. */
function serverGraph(): { files: number; report: string[] } {
  const seen = new Set<string>();
  const report: string[] = [];
  const queue = [join(repo, 'apps/server/src/main.ts')];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = stripComments(readFileSync(file, 'utf8'));
    const name = relative(repo, file).replace(/\\/g, '/');
    for (const spec of runtimeImports(code)) {
      const next = resolveImport(spec, file);
      if (next) queue.push(next);
      else if (FORBIDDEN_MODULES.some((re) => re.test(spec))) report.push(`${name}: imports ${spec}`);
    }
    // A global counts where it is used (`window.x`, `new AudioContext()`), not as a property name or a local like `const window`.
    for (const g of FORBIDDEN_GLOBALS) if (new RegExp(`(?<![\\w.$'"])${g}\\s*[.([]`).test(code)) report.push(`${name}: uses ${g}`);
  }
  return { files: seen.size, report };
}

describe('the server stays headless', () => {
  it('finds runtime imports, and skips type-only ones', () => {
    const code = ["import { a } from './a';", "import type { B } from 'three';", "import { c, type D } from 'three/webgpu';", "export { e } from '../e';", "const f = await import('./f');"].join('\n');
    expect(runtimeImports(code)).toEqual(['./a', 'three/webgpu', '../e', './f']);
  });

  it('loads no three.js, DOM or audio code, through the maps or anything else', () => {
    const { files, report } = serverGraph();
    // The maps and the surfaces code are on the path.
    expect(files).toBeGreaterThan(40);
    expect(report).toEqual([]);
  });
});
