import { defineConfig } from 'vite';

// Bundles the server (including the TypeScript-source workspace packages) into
// one Node ESM file, so production runs plain `node dist/main.js`.
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
  },
  ssr: {
    noExternal: [/^@duty-shooter\//],
  },
});
