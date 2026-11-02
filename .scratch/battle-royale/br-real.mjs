// A real server playing Battle Royale over a real socket to its end.
// Usage: node .scratch/battle-royale/br-real.mjs <script|person> [squads=1] [timeLimit=180] [port=3995]
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { decodeSnapshot } from '../../packages/fps-core/src/net/codec.ts';

const who = process.argv[2] ?? 'script';
const squads = process.argv[3] ?? '1';
const limit = process.argv[4] ?? '180';
const port = process.argv[5] ?? '3995';
const server = spawn(process.execPath, ['apps/server/dist/main.js'], {
  env: { ...process.env, MODE: 'battle-royale', SQUADS: squads, TIME_LIMIT: limit, PORT: port, HOST: '127.0.0.1', STATIC_DIR: `${process.cwd()}/apps/range/dist` },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const base = `http://127.0.0.1:${port}`;
let health = null;
for (let i = 0; i < 120 && !health; i++) {
  health = await fetch(`${base}/healthz`).then((r) => r.json(), () => null);
  if (!health) await new Promise((r) => setTimeout(r, 500));
}
if (!health) throw new Error('no server');
const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
let seq = 0;
let phase = null;
let last = null;
let started = 0;
let scores = [];
const stop = (code) => {
  server.kill('SIGTERM');
  process.exit(code);
};
ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'join', name: 'walker', passphrase: '', protocol: health.protocol, script: who === 'script' }));
  setInterval(() => ws.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: ++seq, cmd: { buttons: 0, forward: 0, right: 0, yaw: 0, pitch: 0, firePresses: [] } }], seen: 0 })), 100);
  setTimeout(() => ws.send(JSON.stringify({ t: 'start' })), 1000);
});
ws.on('message', (data, binary) => {
  if (!binary) return;
  const s = decodeSnapshot(new Uint8Array(data.buffer, data.byteOffset, data.length));
  if (s.scores) scores = s.scores;
  const match = s.match;
  if (match) {
    if (match.phase !== phase) console.log(`phase ${match.phase}; mode ${match.mode}, map ${match.map}`);
    if (match.phase === 'playing' && phase !== 'playing') started = Date.now();
    phase = match.phase;
    const o = match.objective;
    if (o?.kind === 'battle-royale' && o.stage !== last) {
      last = o.stage;
      console.log(`${((Date.now() - started) / 1000).toFixed(0)} s: Stage ${o.stage}, ${o.alive} seats in ${o.squads} Squads, circle ${o.circle.radius.toFixed(0)} m to ${o.next.radius.toFixed(0)} m, ${o.damage} HP/s`);
    }
    if (match.result) {
      console.log(`${((Date.now() - started) / 1000).toFixed(0)} s: result ${JSON.stringify(match.result)}`);
      console.log(`seats on the scoreboard ${scores.length}; places: ${scores.slice(0, 5).map((r) => `${r.name} ${r.place ?? '-'} (${r.kills})`).join(', ')}`);
      stop(0);
    }
  }
});
setTimeout(() => {
  console.log('no result in time');
  stop(1);
}, (Number(limit) + 60) * 1000);
