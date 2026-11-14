// Ticket 115 online: a private lobby whose host is a plain socket that asks for a random next match
// at the end; this page is a friend who joined by the link. Does the friend see that the host chose
// it, and land in the new match (another map and mode) with no lobby between? Starts its own game
// server on port 3000 (built: npm run build -w @duty-shooter/server) with 20 s matches; needs the dev server.
//
//   node .scratch/next-level/random-next/online.mjs <out dir> [base url]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import WebSocket from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/random-next/online';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const REPO = new URL('../../../', import.meta.url);
mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: REPO, env: { ...process.env, PORT: '3000', HOST: '::', PASSPHRASE: '', NODE_ENV: 'development', TIME_LIMIT: '20' }, stdio: 'ignore' });
const report = { steps: [] };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
let chrome = null;
let host = null;
let asking = null;
try {
  let health = null;
  for (let i = 0; i < 60 && !health?.protocol; i++) {
    await sleep(500);
    health = await fetch('http://127.0.0.1:3000/healthz').then((r) => (r.ok ? r.json() : null), () => null);
  }
  if (!health?.protocol) throw new Error('no game server');
  const code = 'RANDOM115';
  // The host: a plain socket, first into the lobby, so it is the host.
  host = new WebSocket(`ws://127.0.0.1:3000/ws?lobby=${code}`);
  const hostState = { id: null, rejected: null };
  host.on('message', (data, binary) => {
    if (binary) return;
    try {
      const m = JSON.parse(String(data));
      if (m.t === 'welcome') hostState.id = m.id;
      if (m.t === 'reject') hostState.rejected = m.reason;
    } catch {}
  });
  await new Promise((done, fail) => (host.once('open', done), host.once('error', fail)));
  host.send(JSON.stringify({ t: 'join', name: 'Host', passphrase: '', protocol: health.protocol }));
  await sleep(1000);
  log('host joined', hostState);

  chrome = await launchChrome();
  const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` }).then((x) => x.result?.result?.value === true);
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock&online&lobby=${code}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(2000);
  if (!(await click('Play Online'))) await click('Join');
  if (!(await chrome.waitFor(`!!duty.driver?.match?.lobby`, 90_000))) throw new Error('the friend did not join');
  await sleep(1500);
  const status = `(() => { const d = duty.driver, m = d?.match ?? null; const lobby = document.querySelector('.ds-lobby'); return { self: d?.selfId ?? null, phase: m?.phase ?? null, map: m?.map ?? null, mode: m?.mode ?? null, host: m?.lobby?.host ?? null, random: m?.lobby?.random ?? false, setup: !!lobby && !lobby.hidden && lobby.getClientRects().length > 0, end: document.querySelector('.ds-end .after')?.innerText ?? '', teams: Object.fromEntries((d?.scores ?? []).filter((s) => !s.bot).map((s) => [s.name, s.team])), hud: duty.game.hud.visible, paused: duty.game.paused, overview: duty.game.overviewOnly, locked: duty.game.input.locked, menu: duty.menu?.open ?? null }; })()`;
  log('friend in the lobby', await js(status));
  host.send(JSON.stringify({ t: 'start' }));
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 60_000))) throw new Error('the match did not start');
  await sleep(1500);
  log('join the match clicked', { ok: await click('Join the match') });
  await sleep(2000);
  const first = await js(status);
  log('first match', first);
  // The host asks as soon as the match ends (asked every half second; the server takes it only then).
  asking = setInterval(() => host.readyState === WebSocket.OPEN && host.send(JSON.stringify({ t: 'random', on: true })), 500);
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'nuke'`, 90_000))) throw new Error('the match did not end');
  await sleep(1500);
  log('its end, the friend', await js(status));
  await shot('1-friend-end-nuke');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'vote'`, 20_000))) throw new Error('no scoreboard');
  await sleep(1200);
  log('scoreboard, the friend', await js(status));
  await shot('2-friend-end-scoreboard');
  clearInterval(asking);
  let setupSeen = false;
  let s = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    s = await js(status);
    if (s.setup) setupSeen = true;
    if (s.phase === 'playing' && s.map !== first.map) break;
    await sleep(150);
  }
  log('next match', { ...s, setupSeen, seconds: (Date.now() - t0) / 1000 });
  await sleep(3000);
  log('next match, settled', await js(status));
  await shot('3-friend-next-match');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  const f = await chrome?.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }).catch(() => null);
  if (f?.result?.data) writeFileSync(`${OUT}/failure.jpg`, Buffer.from(f.result.data, 'base64'));
  report.page = await chrome?.evaluate(`document.body.innerText.slice(0, 600)`).catch(() => null);
} finally {
  clearInterval(asking);
  report.errors = chrome?.errors ?? [];
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  host?.close();
  await chrome?.close();
  server.kill();
}
