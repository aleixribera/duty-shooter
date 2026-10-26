import { fileURLToPath } from 'node:url';
import { optionsFromEnv, startServer } from './server';

// Next to the bundle in the container (/app/public); the range app's build output in the repo.
const defaultStatic = fileURLToPath(new URL(process.env['NODE_ENV'] === 'production' ? '../public' : '../../range/dist', import.meta.url));

let options;
try {
  options = optionsFromEnv(process.env, defaultStatic);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const server = await startServer(options);
console.log(`Duty Shooter server on http://${options.host}:${server.port} (${options.passphrase ? 'passphrase' : 'public lobby'}, max ${options.maxPlayers} players, serving ${options.staticDir})`);

const shutdown = () => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// LOG_STATS=1: CPU and memory every 10 s, for load testing.
if (process.env['LOG_STATS'] === '1') {
  let lastCpu = process.cpuUsage();
  let lastTime = performance.now();
  setInterval(() => {
    const cpu = process.cpuUsage(lastCpu);
    const now = performance.now();
    const percent = ((cpu.user + cpu.system) / 1000 / (now - lastTime)) * 100;
    lastCpu = process.cpuUsage();
    lastTime = now;
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    const m = process.memoryUsage();
    console.log(`stats cpu=${percent.toFixed(1)}% rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}MB players=${server.game.playerCount}`);
  }, 10_000).unref();
}
