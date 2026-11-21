// Builds a large map's nav off the dev server's thread (see plugin.ts): loads
// the job through Vite's module runner, sends back the file and the sources it
// was built from, and exits. The file is kept under node_modules/.cache, named
// by a hash of every source it was built from (and the engine), so a build
// whose map and generator didn't change reads it back instead of spending
// minutes on it again (CI carries the folder from one build to the next).
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { runnerImport } from 'vite';

const { root, job: jobFile } = workerData;
const { module: job, dependencies } = await runnerImport(jobFile, { configFile: false, root, logLevel: 'silent' });

const hash = createHash('sha256').update(process.versions.v8);
for (const file of [jobFile, ...dependencies].map((f) => resolve(root, f)).sort()) {
  hash.update(file.slice(resolve(root).length)).update(readFileSync(file));
}
const dir = join(root, 'node_modules/.cache/duty-nav-build');
const cached = join(dir, `${hash.digest('hex').slice(0, 16)}.nav`);

let bytes;
try {
  bytes = new Uint8Array(readFileSync(cached));
} catch {
  bytes = job.zeroIslandNavFile();
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(dir)) rmSync(join(dir, name), { force: true });
  // Under a name of its own and then moved, as another build may be writing it too.
  writeFileSync(`${cached}.${process.pid}`, bytes);
  renameSync(`${cached}.${process.pid}`, cached);
}
parentPort.postMessage({ bytes, dependencies }, [bytes.buffer]);
