import { defineConfig } from 'vite';
// Bundles serve.ts, the real server with a small control port, for the play-through.
export default defineConfig({
  root: new URL('../../../apps/server', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  build: {
    ssr: true,
    rollupOptions: { input: { serve: new URL('serve.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') } },
    target: 'node24',
    outDir: new URL('dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    emptyOutDir: true,
  },
  ssr: { noExternal: [/^@duty-shooter\//] },
});
