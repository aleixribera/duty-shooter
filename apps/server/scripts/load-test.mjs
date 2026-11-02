// Connects N simulated clients that move, turn and fire at 60 Hz like real
// players, starts a match, and reports what each client got: snapshots,
// bytes, the gap between snapshots and the round trip from a usercmd to the
// snapshot that acknowledges it.
//
// By default it starts the built server itself with LOG_STATS=1 and prints
// the server's CPU and memory lines (`npm run load-test` builds it first).
// TARGET=http://host:port loads a running server instead (the live lobby
// through an SSH tunnel, say), where the host's own tools watch its CPU.
// BOTS=n asks for n bots a side on top of the clients. The clients take
// WebSocket compression when the server offers it, as browsers do
// (DEFLATE=0 refuses it, to compare). NET=wide plays with the kilometre-wide
// map's snapshot rate and relevance, on a local server. PORT moves that local
// server off 3999, and it holds the sockets under its load test allowance
// (LOAD_TEST_SOCKETS), which only the machine itself gets. WARMUP=s plays that
// long before measuring; the tick costs are reported whole windows at a time,
// so measure in tens of seconds.
// SETTLE=s waits that long in the lobby first and prints the windows from the start on: the
// opening of a match on a server that has been up a while. Without it the opening
// lands in V8's first seconds, whose collections run to 45 ms whatever the tick does.
// STATIC_DIR serves a built app, for a map whose nav comes from the build (MAP=zero-island).
// Usage: node apps/server/scripts/load-test.mjs [clients=8] [seconds=40]
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { decodeSnapshot } from '../../../packages/fps-core/src/net/codec.ts';
import { TickCosts } from '../src/tick-costs.ts';

/** The server's next message: a snapshot comes as a binary frame. */
const read = (data, isBinary) => (isBinary ? decodeSnapshot(new Uint8Array(data.buffer, data.byteOffset, data.length)) : JSON.parse(String(data)));

/**
 * A snapshot's tick and ack alone, from its header (see `decodeSnapshot`). Only
 * the host decodes every frame: under remote-test the players and the server
 * share one CPU cap, and 60 clients decoding everything run into it, which
 * stalls the server's tick for tens of milliseconds that are no fault of its own.
 */
function peek(bytes) {
  let at = 1;
  const varuint = () => {
    let value = 0;
    let scale = 1;
    let byte;
    do {
      byte = bytes[at++];
      value += (byte & 0x7f) * scale;
      scale *= 128;
    } while (byte & 0x80);
    return value;
  };
  const tick = varuint();
  return { t: 'snap', tick, ack: varuint() };
}

const clients = Number(process.argv[2] ?? 8);
const seconds = Number(process.argv[3] ?? 40);
const bots = process.env.BOTS === undefined ? undefined : Number(process.env.BOTS);
const target = process.env.TARGET ?? null;
/** Usercmds in each message: one, as the game sends over TCP. */
const resend = Number(process.env.RESEND ?? 1);
const port = Number(process.env.PORT ?? 3999);
/** Seconds of match played before measuring starts. */
const warmup = Number(process.env.WARMUP ?? 0);
/** Seconds in the lobby before the match starts. */
const settle = Number(process.env.SETTLE ?? 0);
const base = target ?? `http://127.0.0.1:${port}`;
const passphrase = target ? (process.env.PASSPHRASE ?? '') : 'load-test';

/** Runs `step` at exactly the game's rate. setInterval rounds 16.67 ms down to 16, faster than any player, and the surplus would queue as input delay. */
function every60Hz(step) {
  let next = performance.now();
  let timer = null;
  const run = () => {
    next += 1000 / 60;
    step();
    timer = setTimeout(run, Math.max(0, next - performance.now()));
  };
  run();
  return { stop: () => clearTimeout(timer) };
}

let measuring = false;
let opening = false;
const server = target
  ? null
  : spawn(process.execPath, [...(process.env.SERVER_FLAGS?.split(' ') ?? []), process.env.SERVER_MAIN ?? fileURLToPath(new URL('../dist/main.js', import.meta.url))], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PASSPHRASE: passphrase, MAX_PLAYERS: String(Math.max(clients, 2 * (bots ?? 0), 12)), ...(clients > 12 ? { LOAD_TEST_SOCKETS: String(clients) } : {}), ...(bots > 6 ? { MAX_BOTS_PER_TEAM: String(bots) } : {}), LOG_STATS: '1', STATIC_DIR: process.env.STATIC_DIR ?? fileURLToPath(new URL('.', import.meta.url)) },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
/** The server's LOG_STATS lines since measuring started. */
const windows = [];
server?.stdout.on('data', (d) => {
  for (const line of String(d).split('\n').filter(Boolean)) {
    const stats = /^stats cpu=([\d.]+)% rss=([\d.]+)MB.* window=(.+)$/.exec(line);
    if (!stats) {
      console.log(`[server] ${line}`);
      continue;
    }
    console.log(`[server] ${line.replace(/ window=.*/, '')}`);
    if (opening) {
      const { p99, slowest, late } = JSON.parse(stats[3]);
      console.log(`window: p99 ${p99.toFixed(2)}, worst ${slowest.toFixed(1)}; ${late} late`);
    }
    if (measuring) windows.push({ cpu: Number(stats[1]), rss: Number(stats[2]), loop: JSON.parse(stats[3]) });
  }
});
const stop = (code) => {
  if (!server) process.exit(code);
  // Its last log lines still need the pipe: exit once it has.
  server.on('exit', () => process.exit(code));
  server.kill('SIGTERM');
};
// The server builds every lobby map's nav graph before it listens: wait for it to answer.
let health = null;
for (let i = 0; i < 120 && !health; i++) {
  health = await fetch(`${base}/healthz`).then((r) => r.json(), () => null);
  if (!health) await new Promise((r) => setTimeout(r, 500));
}
if (!health) throw new Error('The server did not start in 60 s');
// The protocol the server speaks, so this script never goes stale when it changes.
const { protocol } = health;

const sockets = [];
let host = null;
let joined = 0;
let phase = null;
let shots = 0;
/** The match left play while measuring, so the numbers are partly of a lobby. */
let ended = false;
let wireStart = [];
for (let i = 0; i < clients; i++) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`, { perMessageDeflate: process.env.DEFLATE !== '0' });
  let seq = 0;
  let yaw = Math.random() * 6;
  const pending = [];
  const sent = new Map();
  let newest = 0;
  const stats = { snaps: 0, bytes: 0, gaps: [], rtts: [], last: null };
  ws.on('message', (data, isBinary) => {
    const now = performance.now();
    const message = isBinary && ws !== host && host !== null ? peek(data) : read(data, isBinary);
    if (message.t === 'welcome') {
      joined += 1;
      host ??= ws;
    } else if (message.t === 'snap') {
      newest = message.tick;
      if (ws === host) {
        phase = message.match?.phase ?? phase;
        if (measuring && phase !== 'playing') ended = true;
        shots += message.events.filter(({ event }) => event.type === 'shot').length;
      }
      if (!measuring) return;
      stats.snaps += 1;
      stats.bytes += data.length;
      if (stats.last !== null) stats.gaps.push(now - stats.last);
      stats.last = now;
      const at = sent.get(message.ack);
      if (at !== undefined) {
        stats.rtts.push(now - at);
        for (const s of sent.keys()) if (s <= message.ack) sent.delete(s);
      }
    } else if (message.t === 'reject') {
      console.error(`client rejected: ${message.reason}`);
    }
  });
  ws.on('open', () => {
    const lobby = i === 0 && bots !== undefined ? { bots } : {};
    ws.send(JSON.stringify({ t: 'join', name: `load${i}`, passphrase, protocol, script: true, ...lobby }));
    const timer = every60Hz(() => {
      seq += 1;
      yaw += (Math.random() - 0.5) * 0.1;
      const fire = Math.random() < 0.5;
      pending.push({ seq, cmd: { buttons: fire ? 1 : 0, forward: 1, right: Math.sin(seq / 40), yaw, pitch: 0, firePresses: fire && seq % 8 === 0 ? [0.3] : [] } });
      if (pending.length > resend) pending.shift();
      sent.set(seq, performance.now());
      ws.send(JSON.stringify({ t: 'cmds', cmds: pending, seen: newest }));
    });
    ws.on('close', () => timer.stop());
  });
  sockets.push({ ws, stats });
}

const waitFor = async (predicate, timeout) => {
  const end = Date.now() + timeout;
  while (!predicate() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 100));
  return predicate();
};
if (!(await waitFor(() => joined === clients, 30_000))) {
  console.error(`Only ${joined}/${clients} clients joined`);
  stop(1);
}
await new Promise((resolve) => setTimeout(resolve, settle * 1000));
opening = settle > 0;
// The server's host is the lowest seat, which needn't be the first welcome read here: only its start counts.
for (const { ws } of sockets) ws.send(JSON.stringify({ t: 'start' }));
if (!(await waitFor(() => phase === 'playing', 30_000))) {
  console.error(`Match did not start (phase: ${phase})`);
  stop(1);
}
console.log(`match started: ${joined} clients${bots === undefined ? '' : `, ${bots} bots a side asked for`}; compression: ${host.extensions || 'none'}`);
await new Promise((resolve) => setTimeout(resolve, warmup * 1000));
wireStart = sockets.map((s) => s.ws._socket.bytesRead);
measuring = true;
setTimeout(() => {
  const all = (key) => sockets.flatMap((s) => s.stats[key]).sort((a, b) => a - b);
  const at = (list, q) => (list.length ? list[Math.min(list.length - 1, Math.floor(q * list.length))].toFixed(1) : '-');
  const gaps = all('gaps');
  const rtts = all('rtts');
  const kb = sockets.map((s, i) => (s.ws._socket.bytesRead - wireStart[i]) / 1024 / seconds);
  const decoded = sockets.map((s) => s.stats.bytes / 1024 / seconds);
  console.log(`snapshots per client per second: ${sockets.map((s) => (s.stats.snaps / seconds).toFixed(1)).join(', ')}; shots observed: ${shots}`);
  const sum = (list) => list.reduce((a, b) => a + b, 0);
  console.log(`download per client: ${(sum(kb) / clients).toFixed(1)} KB/s on the wire, ${(sum(decoded) / clients).toFixed(1)} KB/s before compression, ${((sum(kb) / clients / Math.max(1, sum(sockets.map((s) => s.stats.snaps)) / clients / seconds)) * 1024).toFixed(0)} B a snapshot on the wire, ${((sum(decoded) / clients / Math.max(1, sum(sockets.map((s) => s.stats.snaps)) / clients / seconds)) * 1024).toFixed(0)} B raw (${((sum(kb) * 8) / 1024).toFixed(2)} Mbit/s out of the server for all ${clients})`);
  console.log(`snapshot gap ms: p50 ${at(gaps, 0.5)}, p99 ${at(gaps, 0.99)}, max ${at(gaps, 1)}`);
  console.log(`usercmd to ack ms: p50 ${at(rtts, 0.5)}, p95 ${at(rtts, 0.95)}, p99 ${at(rtts, 0.99)}, max ${at(rtts, 1)}`);
  const own = (s) => s.stats.rtts.slice().sort((a, b) => a - b);
  console.log(`each client's ack p50 / max ms: ${sockets.map((s) => `${at(own(s), 0.5)}/${at(own(s), 1)}`).join(', ')}`);
  // The window that was running when measuring began holds the match's start with WARMUP=0, and idle lobby ticks before it.
  const whole = windows.slice(1);
  if (windows[0]) console.log(`first window, not counted below: p99 ${windows[0].loop.p99.toFixed(2)}, worst ${windows[0].loop.slowest.toFixed(1)}; ${windows[0].loop.late} late`);
  if (whole.length > 0) {
    const tick = TickCosts.merge(whole.map((w) => w.loop));
    const cpus = whole.map((w) => w.cpu);
    console.log(`tick ms over ${tick.ticks} ticks: mean ${tick.average.toFixed(2)}, p50 ${tick.p50.toFixed(2)}, p99 ${tick.p99.toFixed(2)}, worst ${tick.slowest.toFixed(1)}; ${tick.late} late`);
    console.log(`server: cpu ${(sum(cpus) / cpus.length).toFixed(0)}% of a core on average, ${Math.max(...cpus).toFixed(0)}% at most; rss ${Math.max(...whole.map((w) => w.rss)).toFixed(0)} MB at most`);
  }
  for (const s of sockets) s.ws.close();
  if (ended) console.error('The match ended while measuring: these numbers are not of play');
  stop(shots > 0 && !ended ? 0 : 1);
}, seconds * 1000);
