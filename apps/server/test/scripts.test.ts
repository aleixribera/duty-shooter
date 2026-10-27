import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The release workflow joins the built container with smoke.mjs before it publishes;
// a script left on an old protocol was rejected and the releases from v1.3.1 to v1.3.8
// never shipped. The scripts now join with the protocol /healthz reports, never a number of their own.
describe('server scripts', () => {
  for (const script of ['smoke.mjs', 'load-test.mjs']) {
    it(`${script} joins with the protocol the server reports, marked as a script player`, () => {
      const source = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/protocol: \d/);
      expect(source).toMatch(/\.protocol\b|\{ protocol \}/);
      expect(source).toMatch(/script: true/);
    });
  }
});
