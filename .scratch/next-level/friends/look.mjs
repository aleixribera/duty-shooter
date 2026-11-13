// A whole match with friends (request 5): the host makes a private lobby, two friends join by its link (Node
// sockets that send 'loaded' and keep talking so they stay), the host starts; Marta's connection drops 20 s in and she
// takes her seat back 10 s later; plays the match to its end, and then the frames follow
// what everyone meets after: the end screen, the scoreboard, the lobby again, and a second match started from it.
//   node .scratch/next-level/friends/look.mjs <out dir> [base url = http://localhost:5173/]
// Needs the dev server and a game server on 3000 started with TIME_LIMIT (e.g. 60) so the match ends soon.
import { mkdirSync, writeFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
import { steer } from '../../../apps/range/scripts/trailer/shots.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const ME = `(() => { const d = duty.driver, s = d?.scores?.find((x) => x.id === d.selfId); return { kills: s?.kills ?? 0, deaths: s?.deaths ?? 0, phase: d?.match?.phase ?? null, left: d?.match?.phaseEnds != null ? Math.round(d.match.phaseEnds - d.serverTime) : null }; })()`;
const FEED = `[...document.querySelectorAll('*')].filter((e) => /(joined|left|is back)$/.test(e.textContent?.trim() ?? '') && e.children.length <= 1).map((e) => e.textContent.trim()).slice(0, 6)`;
const TEXT = `(document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 600)`;

const h = await fetch(`${BASE}healthz`).then((r) => r.json());
const chrome = await launchChrome();
const summary = { events: [] };
const note = (what, extra = {}) => {
  summary.events.push({ at: new Date().toISOString().slice(11, 19), what, ...extra });
  log(what, JSON.stringify(extra).slice(0, 300));
};
const js = (e) => chrome.evaluate(e);
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  });
  return r.result?.result?.value === true;
};
const key = (type, code, k = code.startsWith('Key') ? code.slice(3).toLowerCase() : code, vk = code.startsWith('Key') ? code.charCodeAt(3) : ({ Space: 32, Tab: 9, ShiftLeft: 16 }[code] ?? 0)) =>
  chrome.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk });
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button, clickCount: 1 });

const friends = [];
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&stats&online`);
  if (!(await chrome.waitFor(`!!globalThis.duty?.game`, 90_000))) throw new Error('page did not start');
  await sleep(1500);
  await js(`(() => { const i = [...document.querySelectorAll('input')].find((i) => i.getClientRects().length && i.type !== 'password'); if (i) { i.value = 'Aleix'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  if (!(await click('Play Online'))) throw new Error('no Play Online');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 500))) throw new Error('no lobby');
  if (!(await click('New private lobby'))) throw new Error('no New private lobby');
  if (!(await chrome.waitFor(`/[?&]lobby=/.test(location.search) && !!document.querySelector('.ds-lobby:not([hidden])')`, 90_000, 500))) throw new Error('no private lobby');
  const code = await js(`new URLSearchParams(location.search).get('lobby')`);
  const friend = (name, resume) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}ws?lobby=${code}`);
    const f = { ws, name, id: null, token: null, rejected: null, closed: null };
    const alive = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ t: 'cmds', cmds: [] })), 3000);
    ws.on('close', () => clearInterval(alive));
    ws.on('error', (e) => (f.rejected ??= `error: ${e.message}`));
    ws.on('close', (c) => (f.closed = c));
    ws.on('message', (data, binary) => {
      if (binary) return;
      let m = null;
      try {
        m = JSON.parse(String(data));
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        f.id = m.id;
        f.token = m.token;
        ws.send(JSON.stringify({ t: 'loaded' }));
      }
      if (m.t === 'reject') f.rejected = m.reason;
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, passphrase: '', protocol: h.protocol, ...(resume ? { resume } : {}) })));
    return f;
  };
  friends.push(friend('Marta'), friend('Pol'));
  await sleep(3000);
  note('lobby', { code, text: await js(`document.querySelector('.ds-lobby:not([hidden])')?.innerText.replace(/\\s+/g, ' ').slice(0, 500)`) });
  await shot('01-lobby');

  for (let round = 1; round <= 2; round++) {
    if (!(await click('Start'))) note('no Start button', { text: await js(TEXT) });
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 90_000, 500))) throw new Error(`match ${round} did not start`);
    await js(CAMERA_LIB);
    await sleep(1500);
    await shot(`${round}0-start`);
    note(`match ${round} started`, { map: await js(`duty.driver?.match?.map ?? null`), mode: await js(`duty.driver?.match?.mode ?? null`) });
    if (round === 2) break;
    const STEER = steer({ range: 40 });
    const held = { walk: false, pressed: false };
    const t0 = Date.now();
    let me = await js(ME);
    let boarded = false;
    let dropped = false;
    let back = false;
    while (Date.now() - t0 < 240_000) {
      const want = await js(STEER);
      if (want) {
        if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
        const press = !!want.fire;
        if (press !== held.pressed) await mouse(press ? 'mousePressed' : 'mouseReleased');
        Object.assign(held, { walk: want.walk, pressed: press });
      }
      me = await js(ME);
      if (!boarded && Date.now() - t0 > 25_000) {
        boarded = true;
        await key('keyDown', 'Tab');
        await sleep(400);
        await shot('11-scoreboard');
        note('scoreboard', { text: await js(TEXT) });
        await key('keyUp', 'Tab');
      }
      if (!dropped && Date.now() - t0 > 20_000) {
        dropped = true;
        friends[0].ws.close();
        await sleep(400);
        await shot('12-marta-left');
        note('marta dropped', { feed: await js(FEED) });
      }
      if (!back && Date.now() - t0 > 30_000) {
        back = true;
        friends[0] = friend('Marta', friends[0].token);
        await sleep(1200);
        await shot('13-marta-back');
        note('marta back', { feed: await js(FEED), rejected: friends[0].rejected });
      }
      if (me.phase !== 'playing') break;
      await sleep(60);
    }
    if (held.walk) await key('keyUp', 'KeyW');
    if (held.pressed) await mouse('mouseReleased');
    note('match ended', { ...me, teams: await js(`JSON.stringify(duty.driver?.match?.teamScores ?? null)`) });
    // After the match: a frame every 3 s until the lobby is back (or 60 s).
    const t1 = Date.now();
    let n = 0;
    while (Date.now() - t1 < 60_000) {
      const m = await js(ME);
      await shot(`2${n}-after-${m.phase}-${Math.round((Date.now() - t1) / 1000)}s`);
      if (n % 2 === 0) note(`after ${Math.round((Date.now() - t1) / 1000)} s`, { phase: m.phase, left: m.left, text: await js(TEXT) });
      n++;
      if (m.phase === 'lobby') break;
      await sleep(3000);
    }
    await sleep(1500);
    await shot('30-lobby-again');
    note('lobby again', { text: await js(`document.querySelector('.ds-lobby:not([hidden])')?.innerText.replace(/\\s+/g, ' ').slice(0, 600) ?? null`) });
    note('friends', { friends: friends.map((f) => ({ name: f.name, id: f.id, rejected: f.rejected, closed: f.closed })) });
  }
  summary.errors = chrome.errors.slice(0, 5);
} catch (e) {
  note('failed', { message: e.message });
  await shot('failed').catch(() => {});
} finally {
  for (const f of friends) f.ws.close();
  writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 2));
  await chrome.close();
}
