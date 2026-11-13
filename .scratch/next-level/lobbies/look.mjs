// Ticket 97's frames: a private lobby made from the public one, two friends joining by its link, the host
// moving one to the other side and kicking the other. Against the dev server (`preview_start range`); starts a
// local game server on port 3000 (built first) when none answers.
//   node .scratch/next-level/lobbies/look.mjs <out dir>
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/lobbies/after';
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
  return f;
}

const chrome = await launchChrome();
const result = {};
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = async (selectorOrText) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const q = ${JSON.stringify(selectorOrText)}; const b = q.startsWith('[') ? document.querySelector(q) : [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(q.toUpperCase())); if (!b) return false; b.click(); return true; })()`,
  });
  return r.result?.result?.value === true;
};
const phone = (on) => chrome.send('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const friends = [];
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(2500);
  await chrome.evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((i) => i.getClientRects().length && i.type !== 'password'); if (i) { i.value = 'Aleix'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  if (!(await click('Play Online'))) throw new Error('no Play Online');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 500))) throw new Error('no public lobby');
  await sleep(1500);
  await shot('01-public-lobby');
  result.publicHasPrivateButton = await chrome.evaluate(`!!document.querySelector('[data-act="private"]')`);

  // A private lobby of your own, from the public one.
  if (!(await click('New private lobby'))) throw new Error('no New private lobby');
  if (!(await chrome.waitFor(`/[?&]lobby=/.test(location.search) && document.querySelector('.ds-lobby:not([hidden]) h1')?.innerText.toUpperCase() === 'PRIVATE LOBBY'`, 90_000, 500))) throw new Error('no private lobby');
  const code = await chrome.evaluate(`new URLSearchParams(location.search).get('lobby')`);
  result.code = code;
  result.invite = await chrome.evaluate(`document.querySelector('.invite input')?.value ?? null`);
  log('private lobby', code, result.invite);

  // Two friends by its link.
  friends.push(friend(code, 'Marta'), friend(code, 'Pol'));
  await sleep(3000);
  result.friendsIn = friends.map((f) => f.id);
  await shot('02-private-three');
  result.sidesBefore = await chrome.evaluate(`JSON.stringify(duty.driver.match.lobby.sides)`);

  // The host moves Marta to the other side, then kicks Pol.
  const [marta, pol] = friends;
  result.moved = await click(`[data-act="side"][data-id="${marta.id}"]`);
  await sleep(1500);
  await shot('03-moved');
  result.kicked = await click(`[data-act="kick"][data-id="${pol.id}"]`);
  await sleep(1500);
  result.polRejected = pol.rejected;
  result.sidesAfter = await chrome.evaluate(`JSON.stringify(duty.driver.match.lobby.sides)`);
  result.players = await chrome.evaluate(`duty.driver.match.lobby.players.length`);
  await shot('04-kicked');
  await phone(true);
  await sleep(1200);
  await shot('05-phone');
  await chrome.evaluate(`document.querySelector('.ds-lobby .body').scrollTo(0, 9999)`);
  await sleep(500);
  await shot('06-phone-sides');
  await phone(false);
  await sleep(800);

  // Start: the match plays on the sides the host set.
  result.started = await click('Start match');
  result.playing = !!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 60_000, 500));
  await sleep(3000);
  await shot('07-playing');
  result.errors = chrome.errors.slice(0, 5);
} catch (e) {
  result.failed = e.message;
  await shot('failed').catch(() => {});
} finally {
  for (const f of friends) f.ws.close();
  await chrome.close();
  server?.kill();
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  log(JSON.stringify(result));
  process.exit(0);
}
