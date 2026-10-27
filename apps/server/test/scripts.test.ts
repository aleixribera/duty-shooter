import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '@duty-shooter/fps-core';

// The release workflow joins the built container with smoke.mjs before it publishes;
// a script left on an old protocol is rejected and the release never ships.
describe('server scripts', () => {
  for (const script of ['smoke.mjs', 'load-test.mjs']) {
    it(`${script} joins with the current protocol`, () => {
      const source = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
      const sent = [...source.matchAll(/protocol: (\d+)/g)].map((m) => Number(m[1]));
      expect(sent.length).toBeGreaterThan(0);
      expect(sent).toEqual(sent.map(() => PROTOCOL_VERSION));
    });
  }
});
