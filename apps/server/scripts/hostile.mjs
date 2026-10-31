// Sends a server what a broken or hostile client might, and reports whether it
// survives each one. It starts its own server; never point it at the live lobby.
// Usage: node apps/server/scripts/hostile.mjs   (`npm run build -w @duty-shooter/server` first)
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const port = Number(process.env.HOSTILE_PORT ?? 3760);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const server = spawn(process.execPath, [process.env.SERVER_MAIN ?? fileURLToPath(new URL('../dist/main.js', import.meta.url))], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATIC_DIR: fileURLToPath(new URL('.', import.meta.url)), NODE_ENV: 'development', EVENT_LOG: '' },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let died = null;
let stderr = '';
server.stderr.on('data', (d) => (stderr += d));
server.on('exit', (code) => (died = code ?? 'signal'));
const up = () => fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json(), () => null);
let health = null;
for (let i = 0; i < 120 && !health; i++) {
  health = await up();
  if (!health) await sleep(500);
}
const raw = (text, then) =>
  new Promise((done) => {
    const s = connect(port, '127.0.0.1', () => {
      s.write(text);
      then?.(s);
      setTimeout(() => (s.destroy(), done()), 300);
    });
    s.on('error', () => done());
  });
const upgrade = (path, extra = '') => `GET ${path} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n${extra}\r\n`;
const socket = () =>
  new Promise((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('open', () => done(ws));
    ws.on('error', () => done(null));
  });
const join = (name, extra = {}) => JSON.stringify({ t: 'join', name, passphrase: '', protocol: health.protocol, ...extra });
const status = () => fetch(`http://127.0.0.1:${port}/status`).then((r) => r.json());

const cases = {
  'upgrade with a bad url': () => raw(upgrade('//')),
  'upgrade to the wrong path, then reset': () => raw(upgrade('/nope'), (s) => s.resetAndDestroy()),
  'upgrade refused for origin, then reset': () => raw(upgrade('/ws', 'Origin: http://evil.example\r\n'), (s) => s.resetAndDestroy()),
  'bad percent in a path': () => fetch(`http://127.0.0.1:${port}/%E0%A4%A`).catch(() => undefined),
  'garbage http': () => raw('NOT HTTP\r\n\r\n'),
  'binary frame': async () => {
    const ws = await socket();
    ws.send(Buffer.from([1, 2, 3]));
    await sleep(100);
    ws.terminate();
  },
  'oversized frame': async () => {
    const ws = await socket();
    ws.on('error', () => undefined);
    ws.send('x'.repeat(100_000));
    await sleep(100);
    ws.terminate();
  },
  'join, loadout and leave in one burst': async () => {
    const ws = await socket();
    ws.send(join('burst', { script: true }));
    for (let i = 0; i < 300; i++) ws.send(JSON.stringify({ t: 'loadout', loadout: { primary: 'smg' } }));
    await sleep(200);
    ws.terminate();
  },
  'cmds with extreme numbers': async () => {
    const ws = await socket();
    ws.on('message', () => undefined);
    ws.send(join('extreme', { script: true }));
    await sleep(100);
    for (const n of [1e308, -1e308, 2 ** 53]) ws.send(JSON.stringify({ t: 'cmds', cmds: [{ seq: 2 ** 53, cmd: { buttons: 0xffffffff, forward: n, right: n, yaw: n, pitch: n, firePresses: [0.5], viewTick: n } }] }));
    await sleep(300);
    ws.terminate();
  },
};

const results = {};
for (const [name, attack] of Object.entries(cases)) {
  if (died !== null) {
    results[name] = 'not run: the server is down';
    continue;
  }
  await attack();
  await sleep(250);
  results[name] = died === null && (await up()) ? 'survived' : `KILLED THE SERVER: ${stderr.trim().split('\n').slice(0, 2).join(' | ').slice(0, 160)}`;
}

// A join sent again straight after a rejection, before the socket has closed, must not leave a ghost in the match.
// Earlier attacks dropped without leaving, and their seats are rightly held: count from here.
const held = died === null ? (await status()).away : 0;
if (died === null) {
  const ws = await socket();
  ws.on('error', () => undefined);
  ws.send(JSON.stringify({ t: 'join', name: 'old', passphrase: '', protocol: -1 }));
  ws.send(join('ghost'));
  await sleep(400);
  ws.terminate();
  await sleep(300);
  const s = await status();
  results['join after a rejection leaves nobody seated'] = s.players === 0 && s.away === held ? 'ok' : `GHOST: ${JSON.stringify(s)}`;
}
// Leaving on purpose gives the seat up: nobody should be held for five minutes.
if (died === null) {
  const ws = await socket();
  ws.send(join('leaver'));
  await sleep(200);
  ws.close(1000, 'client left');
  await sleep(300);
  const s = await status();
  results['leaving gives the seat up'] = s.away === held ? 'ok' : `HELD: away ${s.away}`;
}
// A socket that never joins must not sit open forever.
if (died === null) {
  const ws = await socket();
  const closed = await new Promise((done) => {
    ws.on('close', () => done(true));
    setTimeout(() => done(false), 20_000);
  });
  results['silent socket is let go'] = closed ? 'ok' : 'STILL OPEN after 20 s';
  ws.terminate();
}

console.log(JSON.stringify(results, null, 1));
server.kill('SIGTERM');
process.exit(Object.values(results).some((r) => r !== 'survived' && r !== 'ok') ? 1 : 0);
