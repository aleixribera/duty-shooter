import { defineConfig } from 'vite';

// Bundles the server (including the TypeScript-source workspace packages) into
// plain Node ESM files, so production runs `node dist/main.js`; `dist/report.js`
// prints the play report from the event log.
export default defineConfig({
  build: {
    ssr: true,
    rollupOptions: { input: { main: 'src/main.ts', report: 'src/report.ts' } },
    target: 'node24',
    outDir: 'dist',
    emptyOutDir: true,
  },
  ssr: {
    noExternal: [/^@duty-shooter\//],
  },
});
