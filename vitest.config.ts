import { defineConfig } from 'vitest/config';

/** Every test file in the workspaces; `*.soak.test.ts` are the soak tier. */
const ALL = ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'];
const SOAK = ['packages/*/test/**/*.soak.test.ts', 'apps/*/test/**/*.soak.test.ts'];

export default defineConfig({
  test: {
    // A test fails for what the game does, never for how busy the machine is: this PC and CI's runner both run other work beside the suite.
    testTimeout: 30_000,
    projects: [
      // What a change is checked against before it ships: every rule the game keeps, in a few minutes.
      { extends: true, test: { name: 'fast', include: ALL, exclude: SOAK } },
      // Whole matches played out by bots, minutes of simulated play: run for the map, mode or bots a change touches, and on CI.
      { extends: true, test: { name: 'soak', include: SOAK } },
    ],
  },
});
