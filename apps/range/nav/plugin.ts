import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport, type Plugin } from 'vite';
import type * as Job from '../src/map/zero-island-nav.ts';

/**
 * Generates a large map's nav at build time and ships it as `nav/<map>.nav`,
 * since a server's start can't wait for it. The dev server does the same on
 * first request, so a map edit shows on reload.
 */

const JOB = join(dirname(fileURLToPath(import.meta.url)), '../src/map/zero-island-nav.ts');
const FILE = 'nav/zero-island.nav';

async function generate(root: string): Promise<Uint8Array> {
  const job = (await runnerImport<typeof Job>(JOB, { configFile: false, root, logLevel: 'silent' })).module;
  return job.zeroIslandNavFile();
}

export function largeMapNav(): Plugin {
  let root = process.cwd();
  return {
    name: 'duty-nav',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      let pending: Promise<Uint8Array> | null = null;
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== `/${FILE}`) return next();
        pending ??= generate(root).finally(() => (pending = null));
        pending.then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.end(bytes);
          },
          (error: unknown) => {
            server.config.logger.error(`nav failed: ${String(error)}`);
            res.statusCode = 500;
            res.end();
          },
        );
      });
    },
    async generateBundle() {
      const started = performance.now();
      const source = await generate(root);
      this.info(`nav: ${FILE}, ${(source.length / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s`);
      this.emitFile({ type: 'asset', fileName: FILE, source });
    },
  };
}
