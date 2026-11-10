import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THREE_PATCHES, patchThree } from '../three-patch/plugin.ts';

const build = (file: string) => readFileSync(join(dirname(createRequire(import.meta.url).resolve('three')), file), 'utf8');

// Next-level ticket 35: every fix finds its code in the three.js this repo installs.
describe('the three.js patch', () => {
  for (const file of ['three.webgpu.js', 'three.webgpu.nodes.js']) {
    it(`applies every fix to ${file}, once each`, () => {
      const out = patchThree(build(file));
      for (const [, replace] of THREE_PATCHES) expect(out).toContain(replace);
    });
  }

  it('fails loudly where three has changed, instead of shipping without the fix', () => {
    expect(() => patchThree('export const nothing = 1;')).toThrow(/three-patch/);
  });
});
