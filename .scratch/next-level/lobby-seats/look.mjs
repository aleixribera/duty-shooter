// The private lobby's seats (pass 53, ticket 41/103): the host makes a private lobby, Marta joins by its link and
// reports her round trip as a real client does (a 'cmds' message with `ping`, each second), Pol joins and has not
// measured his yet. Frames: Team deathmatch with bots (the seats bots fill), Free-for-all (bot-filled and open seats
// in one list), and the phone. Against the dev server (`preview_start range`); starts a local game server on port
// 3000 (built first) when none answers.
//   node .scratch/next-level/lobby-seats/look.mjs <out dir>
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/lobby-seats/after';
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
function friend(code, name, ping = null) {
  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}ws?lobby=${code}`);
  const f = { ws, id: null, rejected: null };
  ws.on('error', () => {});
  ws.on('message', (data, binary) => {
    if (binary) return;
    const m = JSON.parse(String(data));
    if (m.t === 'welcome') f.id = m.id;
    if (m.t === 'reject') f.rejected = m.reason;
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, passphrase: '', protocol: h.protocol })));
  if (ping !== null) f.timer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'cmds', cmds: [], ping })), 1000);
  return f;
}

const chrome = await launchChrome();
const result = {};
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (selector) => chrome.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.click(); return true; })()`);
const clickText = async (text) => {
  const r = await chrome.send('Runtime.evaluate', { userGesture: true, returnByValue: true, expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()` });
  return r.result?.result?.value === true;
};
const ROWS = `[...document.querySelectorAll('.ds-lobby:not([hidden]) .seat')].map((s) => s.className.replace('seat', '').trim() + ': ' + s.innerText.replace(/\\s+/g, ' ').trim())`;
const phone = (on) => chrome.send('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const friends = [];
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(2500);
  await chrome.evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((i) => i.getClientRects().length && i.type !== 'password'); if (i) { i.value = 'Aleix'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  if (!(await clickText('Play Online'))) throw new Error('no Play Online');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 500))) throw new Error('no public lobby');
  await sleep(1500);
  if (!(await clickText('New private lobby'))) throw new Error('no New private lobby');
  if (!(await chrome.waitFor(`/[?&]lobby=/.test(location.search) && document.querySelector('.ds-lobby:not([hidden]) h1')?.innerText.toUpperCase() === 'PRIVATE LOBBY'`, 90_000, 500))) throw new Error('no private lobby');
  const code = await chrome.evaluate(`new URLSearchParams(location.search).get('lobby')`);
  friends.push(friend(code, 'Marta', 38), friend(code, 'Pol'));
  await sleep(3500);
  result.pings = await chrome.evaluate(`JSON.stringify(duty.driver.pings)`);
  result.tdm = await chrome.evaluate(ROWS);
  await shot('01-tdm');
  await click('[data-act="mode"][data-value="ffa"]');
  await sleep(1500);
  result.ffa = await chrome.evaluate(ROWS);
  await shot('02-ffa');
  // Humans vs bots brings its bots on top of the people: those seats stay the bots'.
  await click('[data-act="mode"][data-value="tdm"]');
  await sleep(1000);
  await click('[data-act="hvb"][data-value="on"]');
  await sleep(1500);
  result.hvb = await chrome.evaluate(ROWS);
  await shot('05-hvb');
  await click('[data-act="hvb"][data-value="off"]');
  await click('[data-act="mode"][data-value="ffa"]');
  await sleep(1000);
  await phone(true);
  await sleep(1200);
  await shot('03-phone');
  await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) .seats')?.scrollIntoView({ block: 'start' })`);
  await sleep(500);
  await shot('04-phone-seats');
  await phone(false);
  result.errors = chrome.errors.slice(0, 5);
} catch (e) {
  result.failed = e.message;
  await shot('failed').catch(() => {});
} finally {
  for (const f of friends) {
    clearInterval(f.timer);
    f.ws.close();
  }
  await chrome.close();
  server?.kill();
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  log(JSON.stringify(result));
  process.exit(0);
}
