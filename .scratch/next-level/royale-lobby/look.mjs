// Aleix's request 1 (2026-11-13), the Battle Royale lobby: a friend opening the invite link lands in the
// inviter's Squad; the host moves people in and out of their Squad and kicks one; a friend whose connection
// drops keeps their seat ("Coming back") and takes it back; the Preparation offers the guns' attachments.
// Against the dev server (`preview_start range`); starts a local game server on port 3000 (built first) when none answers.
//   node .scratch/next-level/royale-lobby/look.mjs <out dir>
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/royale-lobby/after';
const BASE = 'http://localhost:5173/';
const REPO = fileURLToPath(new URL('../../../', import.meta.url));
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// 80 kills with the M4A1 open its optic and muzzle; the magazine waits.
const PROFILE = JSON.stringify({ version: 1, xp: 0, stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, assists: 0, score: 0, seconds: 0, bestStreak: 0, royaleWins: 0, royaleBest: null, modes: {} }, weapons: { m4a1: { kills: 80, headshots: 0, longest: 0 } }, daily: { date: '', progress: {} }, courseBest: null });

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

/** A friend on a plain socket in the server's Battle Royale lobby, keeping what it was told. */
function friend(name, resume = null) {
  // Straight to the game server: a close through the dev server's proxy can lose its reason, and a "left" friend would be held.
  const ws = new WebSocket('ws://127.0.0.1:3000/royale/ws');
  const f = { ws, name, id: null, token: null, rejected: null, closed: false };
  ws.on('error', () => {});
  ws.on('close', () => (f.closed = true));
  ws.on('message', (data, binary) => {
    if (binary) return;
    const m = JSON.parse(String(data));
    if (m.t === 'welcome') {
      f.id = m.id;
      f.token = m.token;
    }
    if (m.t === 'reject') f.rejected = m.reason;
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, passphrase: '', protocol: h.protocol, mode: 'battle-royale', ...(resume ? { resume } : {}) })));
  f.send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  // A word now and then, or the server lets a silent seat go as idle (and holds it).
  const beat = setInterval(() => f.send({ t: 'cmds', cmds: [] }), 1000);
  ws.on('close', () => clearInterval(beat));
  return f;
}
const joined = async (f) => {
  for (let i = 0; i < 60 && !f.id && !f.rejected; i++) await sleep(250);
  if (!f.id) throw new Error(`${f.name} didn't join (${f.rejected})`);
  return f;
};

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
const lobby = () => chrome.evaluate(`JSON.stringify({ self: duty.driver?.selfId ?? null, lobby: duty.driver?.match?.lobby ?? null })`).then((t) => JSON.parse(t ?? 'null'));
/** Into the Battle Royale screen from the main menu (or straight from an invite link), named and joined. */
const joinRoyale = async (name, squads) => {
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-royale:not([hidden]) input[name="name"]')`, 60_000, 500))) {
    if (!(await click('Battle Royale'))) throw new Error('no Battle Royale');
    if (!(await chrome.waitFor(`!!document.querySelector('.ds-royale:not([hidden]) input[name="name"]')`, 60_000, 500))) throw new Error('no Battle Royale screen');
  }
  if (squads) await click(`[data-act="squads"][data-value="${squads}"]`);
  await chrome.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name="name"]'); i.value = ${JSON.stringify(name)}; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  if (!(await click('Join server'))) throw new Error('no Join server');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-royale:not([hidden]) [data-key="invite"]')`, 180_000, 1000))) throw new Error('no lobby');
  await sleep(1500);
};
const friends = [];
const emptyLobby = async () => {
  for (const f of friends.splice(0)) f.ws.close(1000, 'client left');
  for (let i = 0; i < 40; i++) {
    const s = await fetch(`${BASE}royale/status`).then((r) => r.json(), () => null);
    if (s && s.players + (s.away ?? 0) === 0) return;
    await sleep(500);
  }
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('duty-shooter.profile.v1', ${JSON.stringify(PROFILE)}); } catch {}` });
  await emptyLobby();

  // 1. The invite link: a stranger opens the lobby (Trios), Pau joins and takes Squad 5; the page opens Pau's link
  //    and lands in Squad 5, not beside the stranger in Squad 1.
  const zed = await joined(friend('Zed'));
  friends.push(zed);
  zed.send({ t: 'lobby', squads: 3 });
  await sleep(500);
  const pau = await joined(friend('Pau'));
  friends.push(pau);
  pau.send({ t: 'squad', squad: 5 });
  await sleep(800);
  await chrome.navigate(`${BASE}?nolock&online&royale=${pau.id}`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  result.inviteOpensRoyale = !!(await chrome.waitFor(`!!document.querySelector('.ds-royale:not([hidden]) input[name="name"]')`, 30_000, 500));
  result.inviteLeftAddressBar = await chrome.evaluate(`!location.search.includes('royale=')`);
  await joinRoyale('Aleix');
  await sleep(1500);
  {
    const l = await lobby();
    result.invitedSquad = l.lobby.squads[l.self];
    result.pauSquad = l.lobby.squads[pau.id];
    result.zedSquad = l.lobby.squads[zed.id];
  }
  await shot('01-invited-into-pau');
  log('invite', result.invitedSquad, result.pauSquad, result.zedSquad);

  // 2. The host's hand: the page opens an empty lobby as host (Trios); Bob and Carol join beside it, Dave in another.
  await chrome.evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().endsWith('LEAVE'))?.click()`);
  await sleep(1000);
  await emptyLobby();
  await chrome.navigate(`${BASE}?nolock&online`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 90_000))) throw new Error('page did not restart');
  await sleep(2000);
  await joinRoyale('Aleix', 3);
  const [bob, carol, dave] = [friend('Bob'), friend('Carol'), friend('Dave')];
  friends.push(bob, carol, dave);
  for (const f of [bob, carol, dave]) await joined(f);
  await sleep(1500);
  result.invite = await chrome.evaluate(`document.querySelector('.ds-royale [data-key="invite"]')?.value ?? null`);
  await shot('02-host-three-friends');
  let l = await lobby();
  result.before = { self: l.lobby.squads[l.self], bob: l.lobby.squads[bob.id], carol: l.lobby.squads[carol.id], dave: l.lobby.squads[dave.id] };
  // Carol out to a Squad of her own, Dave into the host's.
  result.movedOut = await click(`[data-act="move"][data-id="${carol.id}"]`);
  await sleep(1200);
  result.movedIn = await click(`[data-act="move"][data-id="${dave.id}"]`);
  await sleep(1200);
  l = await lobby();
  result.afterMove = { self: l.lobby.squads[l.self], bob: l.lobby.squads[bob.id], carol: l.lobby.squads[carol.id], dave: l.lobby.squads[dave.id] };
  await shot('03-moved');
  result.kicked = await click(`[data-act="kick"][data-id="${bob.id}"]`);
  await sleep(1500);
  result.bobRejected = bob.rejected;
  l = await lobby();
  result.playersAfterKick = l.lobby.players.length;
  await shot('04-kicked');

  // 3. Dave's connection drops: his seat stays in the host's Squad, then he takes it back.
  const daveToken = dave.token;
  dave.ws.terminate();
  await sleep(2500);
  l = await lobby();
  result.held = l.lobby.held ?? null;
  result.heldSquad = l.lobby.squads[dave.id];
  await shot('05-coming-back');
  await phone(true);
  await sleep(1200);
  await shot('06-phone');
  await phone(false);
  const dave2 = await joined(friend('Dave', daveToken));
  friends.push(dave2);
  await sleep(1500);
  l = await lobby();
  result.daveBack = { id: dave2.id, sameSeat: dave2.id === dave.id, squad: l.lobby.squads[dave2.id], hostSquad: l.lobby.squads[l.self], held: l.lobby.held ?? null };

  // 4. The Preparation: the M4A1's open attachments under it, one fitted there.
  result.started = await click('Start match');
  result.preparation = !!(await chrome.waitFor(`!!document.querySelector('.ds-prep:not([hidden]) .smith')`, 120_000, 1000));
  await sleep(1500);
  result.smithRows = await chrome.evaluate(`[...document.querySelectorAll('.ds-prep .smith-row > span, .ds-prep .smith .shut')].map((e) => e.innerText)`);
  result.fitted = await click(`[data-act="fit"][data-gun="m4a1"][data-slot="optic"][data-value="reflex"]`);
  await sleep(800);
  result.loadoutAfterFit = await chrome.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? localStorage.getItem('duty-shooter.settings') ?? '{}').loadout ?? null)`);
  await shot('07-preparation');
  await phone(true);
  await sleep(1200);
  await shot('08-preparation-phone');
  await phone(false);
  result.errors = chrome.errors.slice(0, 5);
} catch (e) {
  result.failed = e.message;
  await shot('failed').catch(() => {});
} finally {
  for (const f of friends) f.ws.close(1000, 'client left');
  await chrome.close();
  server?.kill();
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  log(JSON.stringify(result));
}
