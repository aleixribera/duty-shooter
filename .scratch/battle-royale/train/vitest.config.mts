import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['.scratch/battle-royale/train/*.check.ts'] } });
