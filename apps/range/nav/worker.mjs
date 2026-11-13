// Builds a large map's nav off the dev server's thread (see plugin.ts): loads
// the job through Vite's module runner, sends back the file and the sources it
// was built from, and exits.
import { parentPort, workerData } from 'node:worker_threads';
import { runnerImport } from 'vite';

const { module: job, dependencies } = await runnerImport(workerData.job, { configFile: false, root: workerData.root, logLevel: 'silent' });
const bytes = job.zeroIslandNavFile();
parentPort.postMessage({ bytes, dependencies }, [bytes.buffer]);
