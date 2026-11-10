import { defineConfig } from 'vite';
import { bakeLighting } from './bake/plugin.ts';
import { largeMapNav } from './nav/plugin.ts';
import { threePatch } from './three-patch/plugin.ts';

/** In dev, the game server (apps/server, port 3000, or DUTY_SERVER) is reached through Vite's proxy, as it is same-origin in production. */
const SERVER = process.env['DUTY_SERVER'] ?? 'http://localhost:3000';

export default defineConfig({
  // Each map's lighting, baked on the CPU at build time (served as bake/<map>.bin).
  // three.js's instanced meshes, patched to upload and copy their matrices only when they move (three-patch/plugin.ts).
  plugins: [threePatch(), bakeLighting(['survival-town', 'switchyard', 'station-nine', 'range']), largeMapNav()],
  // The dev server bundles three ahead of the page, outside the plugins above: the patch goes there too.
  optimizeDeps: { rolldownOptions: { plugins: [threePatch()] } },
  server: {
    proxy: {
      '/ws': { target: SERVER, ws: true },
      '/healthz': SERVER,
      '/status': SERVER,
      // Battle Royale's process, behind the same server (ADR 0009).
      '/royale': { target: SERVER, ws: true },
    },
  },
  // Relative asset paths: the same build works at the server's root and under GitHub Pages' /duty-shooter/.
  base: './',
  build: {
    // Top-level await (renderer.init) and WebGPU need a modern target.
    target: 'es2022',
    // three/webgpu alone is ~800 kB minified; warn only well above that.
    chunkSizeWarningLimit: 1500,
  },
});
