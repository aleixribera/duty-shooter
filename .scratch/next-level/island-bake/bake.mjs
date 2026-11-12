// Ticket 34: bakes one map through the build's baker (bake/plugin.ts), timing it: node .scratch/next-level/island-bake/bake.mjs [map]
import { resolve } from 'node:path';
import { runnerImport } from 'vite';
const root = resolve('apps/range');
const { module } = await runnerImport(resolve('apps/range/bake/plugin.ts'), { configFile: false, root, logLevel: 'silent' });
const t0 = performance.now();
const out = await module.bakeMap(process.argv[2] ?? 'zero-island', root, console.log);
console.log(`${out.length} bytes in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
