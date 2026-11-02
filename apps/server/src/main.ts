import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WIDE_SCALE } from '@duty-shooter/fps-core';
import { serveParent } from './royale-child';
import { RoyaleProcess } from './royale-process';
import { optionsFromEnv, royaleAvailable, startServer, type ServerOptions } from './server';

// Next to the bundle in the container (/app/public); the range app's build output in the repo.
const defaultStatic = fileURLToPath(new URL(process.env['NODE_ENV'] === 'production' ? '../public' : '../../range/dist', import.meta.url));

/**
 * Three ways to run (ADR 0009). The server for the public address plays the
 * team modes and starts Battle Royale's own process when one is wanted, with
 * ROYALE_PROCESS=1, as a child of this same file. MODE=battle-royale on its
 * own is a Battle Royale server alone, for the load test.
 */
const isRoyaleProcess = process.env['ROYALE_PROCESS'] === '1' && typeof process.send === 'function';
/** The Battle Royale process's environment: the server's own, with the island and its 60 seats. */
const royaleEnv = { ...process.env, ROYALE_PROCESS: '1', MODE: 'battle-royale', MAP: 'zero-island', MAX_PLAYERS: String(WIDE_SCALE.seats), HOST: '127.0.0.1', PORT: '0' };

let options: ServerOptions;
try {
  options = optionsFromEnv(process.env, defaultStatic);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const royale =
  !isRoyaleProcess && options.mode !== 'battle-royale'
    ? new RoyaleProcess({
        available: royaleAvailable(options),
        start: () => fork(fileURLToPath(import.meta.url), process.argv.slice(2), { env: royaleEnv, execArgv: process.execArgv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }),
      })
    : null;
const server = await startServer({ ...options, ...(royale ? { royale } : {}), ...(isRoyaleProcess ? { handedSockets: true } : {}) });
if (isRoyaleProcess) {
  // Gone with the server that started it: nobody could reach it any more.
  serveParent(server, process as Parameters<typeof serveParent>[1], () => void server.close().then(() => process.exit(0)));
  console.log(`Battle Royale process ${options.version} (${server.warmedSeats} seats warmed up)`);
} else console.log(`Duty Shooter ${options.version} on http://${options.host}:${server.port} (${options.passphrase ? 'passphrase' : 'public lobby'}, ${options.map}, ${options.mode}, max ${options.maxPlayers} players, serving ${options.staticDir}${royale ? `, Battle Royale ${royaleAvailable(options) ? 'on demand' : 'unavailable'}` : ''})`);

const shutdown = () => {
  void Promise.all([server.close(), royale?.close()]).then(() => process.exit(0));
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
    const loop = server.takeLoopStats();
    console.log(`${isRoyaleProcess ? 'royale ' : ''}stats cpu=${percent.toFixed(1)}% rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}MB players=${server.game.playerCount} tick=${loop.average.toFixed(2)}ms p50=${loop.p50.toFixed(2)}ms p99=${loop.p99.toFixed(2)}ms slowest=${loop.slowest.toFixed(1)}ms late=${loop.late} lag=${loop.lag.toFixed(1)}ms causes=${JSON.stringify(loop.causes)} window=${JSON.stringify(loop)}`);
  }, 10_000).unref();
}
