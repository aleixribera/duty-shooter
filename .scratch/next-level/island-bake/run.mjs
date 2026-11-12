// Runs a scratch TypeScript module's `run(...args)` through Vite's module runner, rooted at apps/range.
//   node .scratch/next-level/island-bake/run.mjs <file.ts> [args...]
import { resolve } from 'node:path';
import { runnerImport } from 'vite';
const [file, ...args] = process.argv.slice(2);
const { module } = await runnerImport(resolve(file), { configFile: false, root: resolve('apps/range'), logLevel: 'silent' });
console.log(JSON.stringify(await module.run(...args), null, 1));
