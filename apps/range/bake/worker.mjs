// One bake worker thread (see plugin.ts): loads the bake job through Vite's
// module runner, then runs the texel ranges it is sent, writing into the
// shared buffers.
import { parentPort, workerData } from 'node:worker_threads';
import { runnerImport } from 'vite';

const { module: job } = await runnerImport(workerData.job, { configFile: false, root: workerData.root, logLevel: 'silent' });

parentPort.on('message', (m) => {
  const sun = new Float32Array(m.sun);
  if (m.pass === 'sun') job.sun(m.id, m.from, m.to, sun);
  else job.indirect(m.id, sun, m.bounce ? new Float32Array(m.bounce) : null, m.from, m.to, new Float32Array(m.light));
  parentPort.postMessage('done');
});
parentPort.postMessage('ready');
