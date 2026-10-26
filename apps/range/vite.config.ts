import { defineConfig } from 'vite';

/** In dev, the game server (apps/server, port 3000) is reached through Vite's proxy, as it is same-origin in production. */
const SERVER = 'http://localhost:3000';

export default defineConfig({
  server: {
    proxy: {
      '/ws': { target: SERVER, ws: true },
      '/healthz': SERVER,
    },
  },
  build: {
    // Top-level await (renderer.init) and WebGPU need a modern target.
    target: 'es2022',
    // three/webgpu alone is ~800 kB minified; warn only well above that.
    chunkSizeWarningLimit: 1500,
  },
});
