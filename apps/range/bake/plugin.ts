import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import { runnerImport, type Plugin } from 'vite';
import type * as Job from '../src/bake/job.ts';
import type { MapId } from '../src/map/definition.ts';

/**
 * Bakes each map's lighting at build time and serves it as `bake/<map>.bin`
 * (deflated; see BakeFile). The sun and indirect passes are spread over
 * worker threads; results are cached under node_modules/.cache by a hash of
 * everything that goes into them, so an unchanged map is not baked again.
 * The dev server bakes on first request.
 */

const here = dirname(fileURLToPath(import.meta.url));
const JOB = join(here, '../src/bake/job.ts');
const WORKER = join(here, 'worker.mjs');
const CHUNK = 4096;

type JobModule = typeof Job;

async function loadJob(root: string): Promise<JobModule> {
  return (await runnerImport<JobModule>(JOB, { configFile: false, root, logLevel: 'silent' })).module;
}

/** Runs one pass over every texel, CHUNK texels at a time, on whichever worker is free. */
async function runPass(workers: readonly Worker[], texels: number, message: (from: number, to: number) => object): Promise<void> {
  let next = 0;
  await Promise.all(
    workers.map(async (w) => {
      while (next < texels) {
        const from = next;
        const to = Math.min(texels, from + CHUNK);
        next = to;
        await new Promise<void>((resolve, reject) => {
          w.once('message', () => resolve());
          w.once('error', reject);
          w.postMessage(message(from, to));
        });
        w.removeAllListeners('error');
      }
    }),
  );
}

async function startWorkers(root: string, count: number): Promise<Worker[]> {
  return Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<Worker>((resolve, reject) => {
          const w = new Worker(WORKER, { workerData: { job: JOB, root } });
          w.once('message', () => resolve(w));
          w.once('error', reject);
        }),
    ),
  );
}

/** The deflated bake for one map: from the cache, or baked now. */
export async function bakeMap(id: MapId, root: string, log: (text: string) => void = () => {}): Promise<Uint8Array> {
  const job = await loadJob(root);
  const { texels, hash } = job.describe(id);
  const cache = join(root, 'node_modules/.cache/duty-bake', `${id}-${hash}.bin`);
  if (existsSync(cache)) return new Uint8Array(await readFile(cache));
  const started = performance.now();
  const sun = new SharedArrayBuffer(texels * 4);
  const first = new SharedArrayBuffer(texels * 12);
  const light = new SharedArrayBuffer(texels * 12);
  const workers = await startWorkers(root, Math.max(1, Math.min(16, availableParallelism() - 1)));
  try {
    await runPass(workers, texels, (from, to) => ({ pass: 'sun', id, from, to, sun }));
    // Two bounces: the second reads the first where its rays land.
    await runPass(workers, texels, (from, to) => ({ pass: 'indirect', id, from, to, sun, bounce: null, light: first }));
    await runPass(workers, texels, (from, to) => ({ pass: 'indirect', id, from, to, sun, bounce: first, light }));
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  const raw = job.finish(id, new Float32Array(sun), new Float32Array(light));
  const out = new Uint8Array(deflateSync(raw, { level: 9 }));
  await mkdir(dirname(cache), { recursive: true });
  // Earlier bakes of this map are stale now.
  for (const name of await readdir(dirname(cache))) if (name.startsWith(`${id}-`) && name !== basename(cache)) await rm(join(dirname(cache), name), { force: true });
  await writeFile(cache, out);
  log(`baked ${id}: ${texels} texels on ${workers.length} threads in ${((performance.now() - started) / 1000).toFixed(1)} s, ${(out.length / 1024).toFixed(0)} kB`);
  return out;
}

export function bakeLighting(maps: readonly MapId[]): Plugin {
  let root = process.cwd();
  return {
    name: 'duty-bake',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const pending = new Map<MapId, Promise<Uint8Array>>();
      server.middlewares.use((req, res, next) => {
        const match = /^\/bake\/([a-z-]+)\.bin$/.exec(req.url?.split('?')[0] ?? '');
        const id = match?.[1] as MapId | undefined;
        if (!id || !maps.includes(id)) return next();
        // Baked again (or read from the cache) on every load, so map edits show on reload.
        let bake = pending.get(id);
        if (!bake) {
          bake = bakeMap(id, root, (t) => server.config.logger.info(t)).finally(() => pending.delete(id));
          pending.set(id, bake);
        }
        bake.then(
          (bytes) => {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.end(bytes);
          },
          (error: unknown) => {
            server.config.logger.error(`bake ${id} failed: ${String(error)}`);
            res.statusCode = 500;
            res.end();
          },
        );
      });
    },
    async generateBundle() {
      for (const id of maps) {
        const source = await bakeMap(id, root, (t) => this.info(t));
        this.emitFile({ type: 'asset', fileName: `bake/${id}.bin`, source });
      }
    },
  };
}
