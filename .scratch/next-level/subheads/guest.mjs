// The lobby seen by a guest (pass 64): a friend holds the public lobby, this page joins it.
// moving one to the other side and kicking the other. Against the dev server (`preview_start range`); starts a
// local game server on port 3000 (built first) when none answers.
//   node .scratch/next-level/lobbies/look.mjs <out dir>
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/subheads/after-guest';
const BASE = 'http://localhost:5173/';
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const health = () => fetch(`${BASE}healthz`).then((r) => (r.ok ? r.json() : null), () => null);
let server = null;
process.on('exit', () => server?.kill());
let h = await health();
if (!h?.protocol) {
  log('building and starting a local server on port 3000');
  spawnSync('npm run build -w @duty-shooter/server', { cwd: REPO, shell: true, stdio: 'ignore' });
  server = spawn(process.execPath, ['apps/server/dist/main.js'], { cwd: REPO, env: { ...process.env, PORT: '3000', HOST: '127.0.0.1', PASSPHRASE: '', NODE_ENV: 'development' }, stdio: 'ignore' });
  for (let i = 0; i < 120 && !h?.protocol; i++) {
    await sleep(500);
    h = await health();
  }
}
if (!h?.protocol) throw new Error('no server');

/** A friend: a plain socket on the lobby's link, joined, keeping what it was told. */
function friend(code, name) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}ws${code ? `?lobby=${code}` : ""}`);
  const f = { ws, id: null, rejected: null };
  ws.on('error', () => {});
  ws.on('message', (data, binary) => {
    if (binary) return;
    const m = JSON.parse(String(data));
    if (m.t === 'welcome') f.id = m.id;
    if (m.t === 'reject') f.rejected = m.reason;
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, passphrase: '', protocol: h.protocol })));
  return f;
}

const chrome = await launchChrome();
const result = {};
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const phone = (on) => chrome.send('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const host = friend(null, 'Marta');
try {
  await sleep(1500);
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(2500);
  await chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length && b.innerText.trim().toUpperCase().startsWith('PLAY ONLINE')); b?.click(); })()`);
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 500))) throw new Error('no public lobby');
  await sleep(1500);
  await shot('01-guest');
  result.button = await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) footer .big')?.innerText ?? null`);
  result.state = await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) header .ds-state')?.innerText ?? null`);
  await phone(true);
  await sleep(1200);
  await shot('02-guest-phone');
  await phone(false);
} finally {
  host.ws.close();
  result.errors = chrome.errors.slice(0, 5);
  await chrome.close();
  server?.kill();
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  log(JSON.stringify(result));
  process.exit(0);
}
