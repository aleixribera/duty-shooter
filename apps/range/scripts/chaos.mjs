// Plays online through a proxy that keeps breaking the connection, and reports
// what the player saw: cuts survived, time back in the seat, sessions lost.
// Cuts close the sockets; every third one instead stalls them without closing
// (a half-open connection, a sleeping router) until the client notices.
//
//   npm run build && remote-test --local "node apps/range/scripts/chaos.mjs [cuts=12]"
//
// Serves apps/range/dist with the real server on CHAOS_PORT (default 3191),
// behind the proxy on the next port up.
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { launchChrome, sleep } from './chrome.mjs';

const cuts = Number(process.argv[2] ?? 12);
const port = Number(process.env.CHAOS_PORT ?? 3191);
const proxyPort = port + 1;

/** A TCP proxy to the server; `cut` closes everything open, `stall` stops passing bytes on what's open until it dies. */
const pairs = new Set();
const proxy = createServer((front) => {
  const back = connect(port, '127.0.0.1');
  const pair = { front, back, stalled: false };
  pairs.add(pair);
  const end = () => {
    pairs.delete(pair);
    front.destroy();
    back.destroy();
  };
  front.on('data', (d) => pair.stalled || back.write(d));
  back.on('data', (d) => pair.stalled || front.write(d));
  for (const s of [front, back]) {
    s.on('close', end);
    s.on('error', end);
  }
});
const cut = () => {
  for (const p of [...pairs]) {
    p.front.destroy();
    p.back.destroy();
  }
};
const stall = () => {
  for (const p of pairs) p.stalled = true;
};

const PROBES = `(() => {
  let locked = null;
  Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
  Element.prototype.requestPointerLock = function () { locked = this; document.dispatchEvent(new Event('pointerlockchange')); return Promise.resolve(); };
  Document.prototype.exitPointerLock = function () { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
  globalThis.__find = (text) => [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  globalThis.__state = () => {
    const menu = document.querySelector('.ds-menu');
    const lobby = document.querySelector('.ds-lobby');
    if (menu && !menu.hidden) return 'menu: ' + menu.textContent.slice(0, 80);
    if (lobby && !lobby.hidden) return 'lobby';
    return document.body.textContent.includes('Reconnecting') ? 'reconnecting' : 'playing';
  };
})()`;

const server = spawn(process.execPath, ['apps/server/dist/main.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'development' }, stdio: 'ignore' });
await new Promise((done) => proxy.listen(proxyPort, '127.0.0.1', done));
const status = () => fetch(`http://127.0.0.1:${port}/status`).then((r) => r.json());
const base = `http://127.0.0.1:${proxyPort}/`;
let failed = false;
const report = { cuts: 0, stalls: 0, survived: 0, lost: 0, backMs: [] };
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break;
    } catch {
      await sleep(200);
    }
  }
  const chrome = await launchChrome();
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
    await chrome.navigate(base);
    await chrome.waitFor(`!!globalThis.__find?.('Play Online')`, 60_000, 50);
    // A public lobby joins from the tile, under the name above it; with no name the tile only focuses the field.
    await chrome.evaluate(`document.querySelector('.ds-menu input').value = 'Chaos'; __find('Play Online').click()`);
    await chrome.waitFor(`!!__find('Join') || !!__find('Start')`, 20_000, 50);
    await chrome.evaluate(`if (__find('Join')) { document.querySelector('.ds-field input').value = 'Chaos'; __find('Join').click(); }`);
    await chrome.waitFor(`__state() === 'lobby' && !!__find('Start')`, 90_000, 50);
    await chrome.evaluate(`__find('Start').click()`);
    if (!(await chrome.waitFor(`__state() === 'playing'`, 30_000, 50))) throw new Error(`Not in the match: ${await chrome.evaluate('__state()')}`);
    await sleep(2000);
    for (let i = 0; i < cuts; i++) {
      const stalled = i % 3 === 2;
      if (stalled) {
        stall();
        report.stalls += 1;
      } else {
        cut();
        report.cuts += 1;
      }
      const start = Date.now();
      // The client's own view: the message up, then gone again with the same seat in the server's count.
      await chrome.waitFor(`__state() !== 'playing'`, 6000, 10);
      const back = await chrome.waitFor(`__state() === 'playing'`, 15_000, 10);
      const ms = Date.now() - start;
      const state = await chrome.evaluate('__state()');
      const lobby = await status();
      if (back && lobby.players === 1) {
        report.survived += 1;
        report.backMs.push(ms);
      } else {
        report.lost += 1;
        console.error(`lost at cut ${i}: ${state}; server: ${JSON.stringify(lobby)}`);
      }
      await sleep(1000);
    }
    report.errors = chrome.errors.slice(0, 5);
  } finally {
    await chrome.close();
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  server.kill();
  proxy.close();
  cut();
}
const sorted = [...report.backMs].sort((a, b) => a - b);
console.log(JSON.stringify({ ...report, backMs: undefined, backP50: sorted[sorted.length >> 1], backMax: sorted.at(-1) }));
process.exit(failed || report.lost > 0 ? 1 : 0);
