// Export the collision-authored level for the Blender scene generator.
// Run: node tools/map/crash-layout.mjs .scratch/crash/layout.json
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply an output JSON path');
const server = await createServer({ root: resolve('apps/range'), configFile: false, server: { middlewareMode: true } });
try {
  const { buildCrash } = await server.ssrLoadModule('/src/map/crash.ts');
  const map = buildCrash();
  await writeFile(output, JSON.stringify({solids:map.solids, looks:map.looks, finishes:map.finishes, decorations:map.decorations, models:map.models, spawns:map.spawns, zones:map.zones, sites:map.sites, fires:map.fires ?? []}));
} finally { await server.close(); }
