// Plays Play Online in a browser through a link with real ping and TCP loss (PLAN item 3), and logs what a
// player meets: the prediction's corrections on their own view, how far others jump between frames, the ping,
// and frames along the way.
//
//   node .scratch/next-level/ping/look.mjs <out dir> [rtt ms = 150] [loss = 0.02]
//
// Starts its own game server (port 3010, `npm run build -w @duty-shooter/server` first), a proxy on 3811 that
// delays every chunk by half the round trip each way and, for a lost one, a round trip and 50 ms more with
// everything behind it waiting (TCP's fast retransmit), and a dev server on 5181 whose /ws goes through it.
// One headless Chrome (launchChrome), closed at the end; everything it started is stopped.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/ping/after';
const rtt = Number(process.argv[3] ?? 150);
const loss = Number(process.argv[4] ?? 0.02);
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const GAME = 3010;
const LINK = 3811;
const DEV = 5181;
const PLAY_MS = Number(process.env.PLAY_MS ?? 40_000);
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const children = [];
/** The dev server runs under npm and a shell: on Windows only the whole tree goes. */
const stopAll = () => {
  for (const c of children.splice(0)) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else c.kill();
  }
};
process.on('exit', stopAll);

/** The link: each direction in order, a lost chunk late by a round trip and 50 ms, holding back what follows. */
function lagProxy() {
  let lost = 0;
  let chunks = 0;
  /** One direction, in order through one queue; when `from` closes, `to` closes too, once what was on its way has landed. */
  const pipe = (from, to) => {
    const queue = [];
    let last = 0;
    let closing = false;
    const drain = () => {
      const now = performance.now();
      while (queue.length && queue[0].at <= now) {
        const { data } = queue.shift();
        if (!to.destroyed) to.write(data);
      }
      if (queue.length) setTimeout(drain, Math.max(1, queue[0].at - now));
      else if (closing) to.destroy();
    };
    from.on('data', (data) => {
      chunks++;
      const now = performance.now();
      const late = Math.random() < loss;
      if (late) lost++;
      const at = Math.max(last, now + rtt / 2 + Math.random() * 5 + (late ? rtt + 50 : 0));
      last = at;
      queue.push({ at, data });
      if (queue.length === 1) setTimeout(drain, Math.max(0, at - now));
    });
    const end = () => {
      closing = true;
      if (!queue.length) to.destroy();
    };
    from.on('close', end).on('error', end);
  };
  const server = createServer((front) => {
    const back = connect(GAME, '127.0.0.1');
    front.setNoDelay(true);
    back.setNoDelay(true);
    pipe(front, back);
    pipe(back, front);
  });
  return new Promise((done) => server.listen(LINK, '127.0.0.1', () => done({ server, stats: () => ({ chunks, lost }) })));
}

const up = async (url) => {
  for (let i = 0; i < 240; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) return true;
    await sleep(500);
  }
  return false;
};

log(`link: ${rtt} ms round trip, ${loss * 100}% loss`);
children.push(spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: REPO, env: { ...process.env, PORT: String(GAME), HOST: '127.0.0.1', PASSPHRASE: '', NODE_ENV: 'development', EVENT_LOG: '' }, stdio: 'ignore' }));
if (!(await up(`http://127.0.0.1:${GAME}/healthz`))) throw new Error('game server did not start');
const link = await lagProxy();
children.push(spawn(`npm run dev -w @duty-shooter/range -- --port ${DEV} --strictPort`, { cwd: REPO, shell: true, env: { ...process.env, DUTY_SERVER: `http://127.0.0.1:${LINK}` }, stdio: ['ignore', openSync(`${out}/dev.log`, 'w'), openSync(`${out}/dev.log`, 'a')] }));
if (!(await up(`http://localhost:${DEV}/`))) throw new Error('dev server did not start');

const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// Every drawn frame: your own view's correction, and how far each other soldier moved since the last frame.
const TRACE = `(() => {
  const t = (globalThis.__trace = { on: false, frames: 0, corr: [], big: [], steps: [], dts: [], pings: [] });
  let before = new Map(), last = 0;
  const raf = requestAnimationFrame.bind(window);
  const tick = (now) => {
    const d = globalThis.duty?.driver;
    if (t.on && d && d.match?.phase === 'playing') {
      const dt = last ? (now - last) / 1000 : 0;
      t.frames++;
      t.dts.push(dt);
      const self = d.client?.self;
      const others = d.others(0);
      if (self?.alive) {
        const c = Math.hypot(...d.correction);
        t.corr.push(c);
        if (c > 0.3 && t.big.length < 40) {
          const near = Math.min(...others.filter((p) => p.alive).map((p) => Math.hypot(p.position[0] - self.position[0], p.position[2] - self.position[2])));
          const m = d.match;
          t.big.push({ s: +(now / 1000).toFixed(2), c: +c.toFixed(2), near: +near.toFixed(2), countdown: m?.countdownEnds == null ? null : +(m.countdownEnds - d.serverTime).toFixed(2) });
        }
      }
      const seen = new Map();
      for (const p of others) {
        if (!p.alive || p.kind === 'dummy') continue;
        seen.set(p.id, p.position);
        const b = before.get(p.id);
        if (b && dt > 0) t.steps.push([Math.hypot(p.position[0] - b[0], p.position[2] - b[2]), dt]);
      }
      before = seen;
      if (t.frames % 30 === 0) t.pings.push(d.ping);
    }
    last = now;
    raf(tick);
  };
  raf(tick);
})()`;

const chrome = await launchChrome();
const result = { rtt, loss };
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: TRACE });
  const js = (e) => chrome.evaluate(e);
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    if (s.result?.data) writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = async (text) => {
    const r = await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` });
    return r.result?.result?.value === true;
  };
  const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : { ShiftLeft: 16, Tab: 9 }[code] ?? 0 });

  await chrome.navigate(`http://localhost:${DEV}/?nolock&online`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 120_000))) throw new Error('page did not start');
  await sleep(2000);
  await js(`(() => { const i = [...document.querySelectorAll('input')].find((i) => i.getClientRects().length && i.type !== 'password'); if (i) { i.value = 'Pinged'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  if (!(await click('Play Online'))) throw new Error('no Play Online button');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])') || duty.driver?.match?.phase === 'playing'`, 90_000))) throw new Error('no lobby');
  await sleep(1500);
  await shot('01-lobby');
  result.started = await click('Start');
  const t0 = Date.now();
  result.playing = !!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 90_000));
  result.startMs = Date.now() - t0;
  if (!result.playing) throw new Error('match did not start');
  await sleep(3000);
  await js('__trace.on = true');
  // Walk forward the whole time, strafing left and right, sprinting every other stretch.
  await key('keyDown', 'KeyW');
  const end = Date.now() + PLAY_MS;
  for (let i = 0; Date.now() < end; i++) {
    const side = i % 2 ? 'KeyA' : 'KeyD';
    await key('keyDown', side);
    if (i % 4 < 2) await key('keyDown', 'ShiftLeft');
    await sleep(1500);
    await key('keyUp', side);
    await key('keyUp', 'ShiftLeft');
    if (i % 5 === 2) await shot(`02-play-${String(i).padStart(2, '0')}`);
  }
  await key('keyUp', 'KeyW');
  await key('keyDown', 'Tab');
  await sleep(600);
  await shot('03-scoreboard');
  await key('keyUp', 'Tab');
  const trace = await js(`(() => { const t = __trace; t.on = false; return t; })()`);
  const corr = trace.corr.slice().sort((a, b) => a - b);
  const sprintPerS = 6.22 * 1.1;
  // A drawn step over what a sprint covers in that frame, twice over, is a jump.
  const jumps = trace.steps.filter(([s, dt]) => s > sprintPerS * dt * 2);
  const steps = trace.steps.map(([s]) => s).sort((a, b) => a - b);
  result.trace = {
    frames: trace.frames,
    meanFrameMs: Math.round((trace.dts.reduce((a, b) => a + b, 0) / trace.dts.length) * 1000),
    worstCorrectionM: corr.at(-1) ?? 0,
    framesCorrectedOver5cm: corr.filter((c) => c > 0.05).length,
    othersSteps: steps.length,
    othersWorstStepM: steps.at(-1) ?? 0,
    othersJumps: jumps.length,
    othersJumpShare: jumps.length / Math.max(1, steps.length),
    big: trace.big,
    pingMs: trace.pings.filter((p) => p != null).map((p) => Math.round(p * 1000)),
  };
  result.link = link.stats();
  result.status = await js(`duty.driver?.client?.status ?? null`);
  result.errors = chrome.errors.slice(0, 5);
} catch (e) {
  result.failed = e.message;
  log('failed:', e.message);
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }).catch(() => null);
  if (s?.result?.data) writeFileSync(`${out}/failed.jpg`, Buffer.from(s.result.data, 'base64'));
  result.text = await chrome.evaluate(`document.body.innerText.replace(/\s+/g, ' ').slice(0, 400)`).catch(() => null);
} finally {
  await chrome.close();
  link.server.close();
  stopAll();
}
writeFileSync(`${out}/summary.json`, JSON.stringify(result, null, 2));
log(JSON.stringify(result));
process.exit(0);
