// Plays scripted clients through a proxy that behaves like a real bad link, and
// reports what a player would feel: how old the snapshots are when they land,
// how long a usercmd takes to come back, how smooth the stream is, and how many
// connections the server ended.
//
// Each scenario gets its own server. The link applies to both directions:
//   delay   one-way latency (ms)
//   jitter  random extra delay (ms), in order, as TCP delivers
//   kbit    bandwidth down to the client (kbit/s), queueing what doesn't fit
//   stalls  [every, length] (s): everything stops for `length` seconds, then
//           arrives at once, as after a Wi-Fi roam or a retransmission timeout
//
// Usage: node apps/server/scripts/bad-link.mjs [clients=4] [seconds=30] [scenario,...]
// `npm run build -w @duty-shooter/server` first.
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const SCENARIOS = {
  clean: { delay: 0, jitter: 0, kbit: 0 },
  home: { delay: 20, jitter: 5, kbit: 0 },
  mobile: { delay: 40, jitter: 30, kbit: 0 },
  slow: { delay: 30, jitter: 5, kbit: 256 },
  narrow: { delay: 30, jitter: 5, kbit: 120 },
  stalling: { delay: 20, jitter: 5, kbit: 0, stalls: [8, 2.5] },
};

const clients = Number(process.argv[2] ?? 4);
const seconds = Number(process.argv[3] ?? 30);
const names = process.argv[4]?.split(',') ?? Object.keys(SCENARIOS);
const basePort = Number(process.env.BAD_LINK_PORT ?? 3700);
/** Usercmds in each message: one as the game sends over TCP, 8 as it used to. */
const resend = Number(process.env.RESEND ?? 1);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** A TCP proxy with the link's delay, jitter, bandwidth and stalls. */
function badLink(listen, target, link) {
  const open = new Set();
  const start = performance.now();
  const stalledUntil = (now) => {
    if (!link.stalls) return 0;
    const [every, length] = link.stalls;
    const t = (now - start) / 1000;
    const phase = t % every;
    return t > every && phase < length ? now + (length - phase) * 1000 : 0;
  };
  const pipe = (from, to, limit) => {
    const queue = [];
    let free = 0;
    let last = 0;
    const drain = () => {
      const now = performance.now();
      const until = stalledUntil(now);
      if (until > now) return void setTimeout(drain, until - now);
      while (queue.length && queue[0].at <= now) {
        const { data } = queue.shift();
        if (!to.destroyed) to.write(data);
      }
      if (queue.length) setTimeout(drain, Math.max(1, queue[0].at - now));
    };
    from.on('data', (data) => {
      const now = performance.now();
      // Bandwidth: bytes leave one after another; what doesn't fit waits, as in a router's queue.
      const leave = limit ? Math.max(free, now) + (data.length * 8) / limit : now;
      free = leave;
      const at = Math.max(last, leave + link.delay + Math.random() * link.jitter);
      last = at;
      queue.push({ at, data });
      if (queue.length === 1) setTimeout(drain, Math.max(0, at - now));
    });
  };
  const proxy = createServer((front) => {
    const back = connect(target, '127.0.0.1');
    open.add(front).add(back);
    pipe(front, back, 0);
    pipe(back, front, link.kbit);
    const end = () => {
      front.destroy();
      back.destroy();
    };
    for (const s of [front, back]) {
      s.on('close', end);
      s.on('error', end);
    }
  });
  return new Promise((done) => proxy.listen(listen, '127.0.0.1', () => done({ close: () => (proxy.close(), open.forEach((s) => s.destroy())) })));
}

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

const quantile = (list, q) => (list.length ? list[Math.min(list.length - 1, Math.floor(q * list.length))] : null);

async function run(name, link, index) {
  const port = basePort + index * 2;
  const server = spawn(process.execPath, [process.env.SERVER_MAIN ?? fileURLToPath(new URL('../dist/main.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', STATIC_DIR: fileURLToPath(new URL('.', import.meta.url)), NODE_ENV: 'development', EVENT_LOG: '' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let health = null;
  for (let i = 0; i < 120 && !health; i++) {
    health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json(), () => null);
    if (!health) await sleep(500);
  }
  const proxy = await badLink(port + 1, port, link);
  const seats = [];
  let measuring = false;
  let closes = [];
  let started = false;
  for (let i = 0; i < clients; i++) {
    // The first client is the one on the bad link; the rest are on a clean one, to show what it does to them.
    const through = i === 0 ? port + 1 : port;
    const ws = new WebSocket(`ws://127.0.0.1:${through}/ws`, { perMessageDeflate: true });
    const seat = { ws, i, snaps: 0, bytes: 0, age: [], gaps: [], rtts: [], last: null, sent: new Map(), offset: Infinity, join: 0 };
    let seq = 0;
    let yaw = i;
    const pending = [];
    ws.on('message', (data) => {
      const now = performance.now();
      const message = JSON.parse(String(data));
      if (message.t === 'welcome') {
        seat.joined = true;
        seat.id = message.id;
        seat.tick = message.tick;
      } else if (message.t === 'snap') {
        if (i === 0 && !started && message.match?.phase === 'lobby') {
          started = true;
          ws.send(JSON.stringify({ t: 'start' }));
        }
        seat.seen = message.tick;
        if (!measuring) return;
        seat.snaps += 1;
        seat.bytes += data.length;
        // Age: how far behind the snapshot's own clock this arrives, past the best seen (the link's floor).
        const stamp = now - (message.tick * 1000) / 60;
        seat.offset = Math.min(seat.offset, stamp);
        seat.age.push(stamp - seat.offset);
        if (seat.last !== null) seat.gaps.push(now - seat.last);
        seat.last = now;
        const at = seat.sent.get(message.ack);
        if (at !== undefined) {
          seat.rtts.push(now - at);
          for (const s of seat.sent.keys()) if (s <= message.ack) seat.sent.delete(s);
        }
      }
    });
    ws.on('close', (code, reason) => measuring && closes.push(`${i}:${code} ${reason}`.trim()));
    ws.on('error', () => undefined);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', name: `link${i}`, passphrase: '', protocol: health.protocol, script: true }));
      const timer = every60Hz(() => {
        seq += 1;
        yaw += 0.01;
        pending.push({ seq, cmd: { buttons: 0, forward: 1, right: Math.sin(seq / 40), yaw, pitch: 0, firePresses: [] } });
        if (pending.length > resend) pending.shift();
        seat.sent.set(seq, performance.now());
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'cmds', cmds: pending, ...(seat.seen ? { seen: seat.seen } : {}) }));
      });
      ws.on('close', () => timer.stop());
    });
    seats.push(seat);
  }
  for (let i = 0; i < 100 && !seats.every((s) => s.joined); i++) await sleep(100);
  await sleep(1000);
  measuring = true;
  await sleep(seconds * 1000);
  measuring = false;
  const report = (s) => {
    const age = s.age.slice().sort((a, b) => a - b);
    const rtts = s.rtts.slice().sort((a, b) => a - b);
    const gaps = s.gaps.slice().sort((a, b) => a - b);
    const ms = (v) => (v === null ? '-' : Math.round(v));
    return {
      snapsPerSecond: Math.round((s.snaps / seconds) * 10) / 10,
      kbPerSecond: Math.round(s.bytes / 1024 / seconds),
      ageP50: ms(quantile(age, 0.5)),
      ageP99: ms(quantile(age, 0.99)),
      ageMax: ms(quantile(age, 1)),
      ackP50: ms(quantile(rtts, 0.5)),
      ackP99: ms(quantile(rtts, 0.99)),
      ackMax: ms(quantile(rtts, 1)),
      gapP99: ms(quantile(gaps, 0.99)),
      gapMax: ms(quantile(gaps, 1)),
      open: s.ws.readyState === s.ws.OPEN,
    };
  };
  const result = { name, link, bad: report(seats[0]), clean: seats.length > 1 ? report(seats[1]) : null, closes };
  for (const s of seats) s.ws.terminate();
  proxy.close();
  server.kill('SIGTERM');
  await sleep(300);
  return result;
}

const results = [];
for (const [index, name] of names.entries()) {
  const link = SCENARIOS[name];
  if (!link) throw new Error(`No scenario ${name}`);
  const result = await run(name, link, index);
  results.push(result);
  console.log(JSON.stringify(result));
}
process.exit(0);
