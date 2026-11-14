import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['.scratch/next-level/outposts-lock/*.soak.test.ts'], testTimeout: 3_600_000 } });
