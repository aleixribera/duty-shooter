import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Plugin } from 'vite';

/**
 * Generates a large map's nav at build time and ships it as `nav/<map>.nav`,
 * since a server's start can't wait for it. The dev server does the same on
 * first request and keeps the result until a file it was built from changes,
 * so a map edit shows on reload and every other reload is instant (a build
 * takes minutes on a busy PC). It builds in a worker thread, so the dev
 * server keeps answering meanwhile.
 */

const here = dirname(fileURLToPath(import.meta.url));
const JOB = join(here, '../src/map/zero-island-nav.ts');
const WORKER = join(here, 'worker.mjs');
const FILE = 'nav/zero-island.nav';

/** A path as the watcher and the module runner both name it (Windows paths compare case-blind). */
const key = (root: string, file: string) => {
  const path = resolve(root, file);
  return process.platform === 'win32' ? path.toLowerCase() : path;
};

function generate(root: string): Promise<{ bytes: Uint8Array; sources: string[] }> {
  return new Promise((done, fail) => {
    const worker = new Worker(WORKER, { workerData: { job: JOB, root } });
    worker.once('message', (m: { bytes: Uint8Array; dependencies: string[] }) => done({ bytes: m.bytes, sources: [JOB, ...m.dependencies].map((f) => resolve(root, f)) }));
    worker.once('error', fail);
    worker.once('exit', (code) => fail(new Error(`nav worker exited with ${code}`)));
  });
}

export function largeMapNav(): Plugin {
  let root = process.cwd();
  return {
    name: 'duty-nav',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      // The last build, kept while none of its sources changes; a failed one isn't kept. Its sources are
      // watched (the module runner adds none to the watcher; a page loading them would).
      type Build = Promise<{ bytes: Uint8Array; sources: Set<string> }>;
      let built: Build | null = null;
      const build = (): Build =>
        generate(root).then(({ bytes, sources }) => {
          server.watcher.add(sources);
          return { bytes, sources: new Set(sources.map((f) => key(root, f))) };
        });
      const stale = (file: string) => {
        if (!built) return;
        const was = built;
        was.then(
          ({ sources }) => sources.has(key(root, file)) && built === was && (built = null),
          () => {},
        );
      };
      server.watcher.on('change', stale);
      server.watcher.on('unlink', stale);
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${FILE}`) return next();
        const job = (built ??= build());
        job.then(
          ({ bytes }) => {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.end(bytes);
          },
          (error: unknown) => {
            if (built === job) built = null;
            server.config.logger.error(`nav failed: ${String(error)}`);
            res.statusCode = 500;
            res.end();
          },
        );
      });
    },
    async generateBundle() {
      const started = performance.now();
      const { bytes: source } = await generate(root);
      this.info(`nav: ${FILE}, ${(source.length / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s`);
      this.emitFile({ type: 'asset', fileName: FILE, source });
    },
  };
}
