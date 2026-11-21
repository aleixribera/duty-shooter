import { constants, cpus, setPriority } from 'node:os';
import { defineConfig } from 'vitest/config';

// On this PC the suite gives way: the run and its workers (which inherit it) take idle priority, and at most a third
// of the cores, so a game played beside a run keeps its frames. CI's runner has nothing else to serve and runs flat out.
// The shared test laptop (`remote-test`) keeps the local settings: flat out beside other sessions' jobs, the busiest
// match tests ran past their 30 s timeout.
const local = !process.env.CI;
if (local) {
  try {
    setPriority(constants.priority.PRIORITY_LOW);
  } catch {
    // Not allowed here; the worker cap still holds.
  }
}

/** Every test file in the workspaces; `*.soak.test.ts` are the soak tier. */
const ALL = ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'];
const SOAK = ['packages/*/test/**/*.soak.test.ts', 'apps/*/test/**/*.soak.test.ts'];

export default defineConfig({
  test: {
    // A test fails for what the game does, never for how busy the machine is: this PC and CI's runner both run other work beside the suite.
    testTimeout: 30_000,
    // Dots, then each failure in full and the summary: a passing run is a few lines, not one per file.
    // vitest.budget.ts warns when a tier runs over its budget or a fast test over 10 s (AGENTS.md, "Test time budget").
    reporters: ['dot', './vitest.budget.ts'],
    // What a test prints (the sightline and balance reports) shows only when it fails; `--silent=false` shows it all.
    silent: 'passed-only',
    maxWorkers: local ? Math.max(2, Math.floor(cpus().length / 3)) : undefined,
    projects: [
      // What a change is checked against before it ships: every rule the game keeps, in a few minutes.
      { extends: true, test: { name: 'fast', include: ALL, exclude: SOAK } },
      // Whole matches played out by bots, minutes of simulated play: run for the map, mode or bots a change touches, and on CI.
      { extends: true, test: { name: 'soak', include: SOAK } },
    ],
  },
});
