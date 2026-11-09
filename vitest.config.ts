import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // A test fails for what the game does, never for how busy the machine is: this PC and CI's runner both run other work beside the suite.
    testTimeout: 30_000,
  },
});
