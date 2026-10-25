import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * fps-core runs on the server and inside the client's prediction loop, so it
 * must stay headless: no rendering, DOM or audio. (Its tsconfig also omits the
 * DOM lib, so DOM globals fail typecheck.)
 */
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_MODULES = [/^three(\/|$)/, /^@types\/three$/, /^@duty-shooter\/fps-client(\/|$)/, /^@duty-shooter\/(range|server)(\/|$)/];

const FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'HTMLElement',
  'HTMLCanvasElement',
  'AudioContext',
  'OfflineAudioContext',
  'webkitAudioContext',
  'AudioBuffer',
  'GPUDevice',
  'WebGL2RenderingContext',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function violations(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
  for (const spec of specifiers) {
    if (FORBIDDEN_MODULES.some((re) => re.test(spec))) found.push(`imports ${spec}`);
  }
  for (const name of FORBIDDEN_GLOBALS) {
    if (new RegExp(`(?<![\\w.$'"])${name}\\b`).test(code)) found.push(`uses ${name}`);
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('fps-core stays headless', () => {
  it('detects rendering, DOM and audio usage in a sample', () => {
    const sample = [
      "import * as THREE from 'three';",
      "import { WebGPURenderer } from 'three/webgpu';",
      'const ctx = new AudioContext();',
      'document.body.append(canvas);',
      '// window is fine inside a comment',
    ].join('\n');

    expect(violations(sample)).toEqual(['imports three', 'imports three/webgpu', 'uses document', 'uses AudioContext']);
  });

  it('has no rendering, DOM or audio imports in its source', () => {
    const files = sourceFiles(join(packageRoot, 'src'));
    expect(files.length).toBeGreaterThan(0);

    const report = files.flatMap((file) =>
      violations(readFileSync(file, 'utf8')).map((v) => `${relative(packageRoot, file)}: ${v}`),
    );
    expect(report).toEqual([]);
  });

  it('declares no rendering or presentation dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    const deps = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((field) =>
      Object.keys((pkg[field] as Record<string, string> | undefined) ?? {}),
    );

    expect(deps.filter((dep) => FORBIDDEN_MODULES.some((re) => re.test(dep)))).toEqual([]);
  });
});
