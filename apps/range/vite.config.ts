import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Top-level await (renderer.init) and WebGPU need a modern target.
    target: 'es2022',
    // three/webgpu alone is ~800 kB minified; warn only well above that.
    chunkSizeWarningLimit: 1500,
  },
});
