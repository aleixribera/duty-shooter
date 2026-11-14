// PLAN item 9d pass 2 (ticket 119): the death screen's new-gun plate. A Profile at Rank 6 (the Trident and the Marshal
// open, in no loadout), a Team deathmatch Bot Match on Switchyard: dead, "New: Trident 5.56" stands over the plates;
// passed once (respawned without it), it is still there on the next death; 4 takes it into the lit loadout and the
// Marshal's plate follows; the next life carries the Trident; then the Marshal's plate at phone width, upright and on
// its side. Needs the dev server.
//
//   node .scratch/next-level/new-gun/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/new-gun/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
let W = 1920;
let H = 1080;

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const vk = (code) => (code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? code.charCodeAt(5) : 0);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code, windowsVirtualKeyCode: vk(code) });
const press = async (code) => {
  await key('keyDown', code);
  await sleep(60);
  await key('keyUp', code);
};
const mouseAt = async (x, y) => {
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
const facts = `(() => {
  const box = (e) => { if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const kits = document.querySelector('.ds-kits');
  const freshEl = document.querySelector('.ds-kits .fresh');
  const plates = [...document.querySelectorAll('.ds-kits .kit')].map((b) => ({ box: box(b), lit: b.classList.contains('is-lit'), text: b.innerText.replace(/\\s+/g, ' ') }));
  const p = duty.game.player;
  const toast = document.querySelector('.ds-toast');
  return {
    alive: p?.alive ?? null,
    primary: p?.loadout?.primary ?? null,
    weapon: p?.weapon?.id ?? null,
    kitsShown: box(kits) !== null && !kits.classList.contains('leaving'),
    leaving: kits?.classList.contains('leaving') ?? null,
    plates,
    fresh: freshEl ? { box: box(freshEl), text: freshEl.innerText.replace(/\\s+/g, ' ') } : null,
    secondary: p?.loadout?.secondary ?? null,
    passes: localStorage.getItem('duty-shooter.new-guns.v1'),
    toastBox: box(toast), hint: box(document.querySelector('.ds-hintline')),
    center: box(document.querySelector('.ds-center')), centerText: document.querySelector('.ds-center')?.innerText ?? null,
    spec: box(document.querySelector('.ds-spec')),
    ammo: box(document.querySelector('.ds-ammo')),
    prompt: box(document.querySelector('.ds-prompt')),
    toast: toast && getComputedStyle(toast).opacity === '1' ? toast.innerText : null,
    menuPage: !!document.querySelector('.ds-menu:not([hidden]) .ds-page'),
  };
})()`;
const report = { steps: [], errors: chrome.errors };
const log = async (step) => {
  const f = await js(facts);
  report.steps.push({ step, ...f });
  console.log(step, JSON.stringify({ alive: f.alive, primary: f.primary, secondary: f.secondary, fresh: f.fresh, passes: f.passes, toast: f.toast, toastBox: f.toastBox, center: f.center, plates: f.plates.map((p) => `${p.lit ? '*' : ''}${p.text}@${p.box}`) }));
  return f;
};
const fightUntilDead = async () => {
  const STEER = steer({ range: 60, chase: 1 });
  const held = { walk: false, pressed: false };
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000 && (await js(`duty.game.player?.alive ?? true`))) {
    const want = await js(STEER);
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.fire !== held.pressed) await mouse(want.fire ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, pressed: want.fire });
    }
    await sleep(40);
  }
  if (held.walk) await key('keyUp', 'KeyW');
  if (held.pressed) await mouse('mouseReleased');
};
const untilAlive = async () => {
  for (let i = 0; i < 400 && !(await js(`duty.game.player?.alive === true`)); i++) await sleep(20);
};
const metrics = (w, h, mobile) => {
  W = w;
  H = h;
  return chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
};

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await metrics(1920, 1080, false);
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  // Rank 6 (10,450 XP; Rank 8 is at 17,900): the Trident (4) and the Marshal (6) open; nothing passed yet.
  await chrome.evaluate(`(() => { const k = 'duty-shooter.profile.v2'; const p = JSON.parse(localStorage.getItem(k) || '{}'); p.version = 1; p.xp = 12000; localStorage.setItem(k, JSON.stringify(p)); localStorage.removeItem('duty-shooter.new-guns.v1'); })()`);
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start again');
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Team deathmatch', 'Hard', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.game.player?.alive === true`, 120_000))) throw new Error('the match did not start');
  await sleep(6000);
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, 'Switchyard').catch((e) => console.log('no routes', e.message));
  await log('0 alive, before');
  await fightUntilDead();
  await sleep(250);
  await log('1 dead, the Trident offered');
  await shot('1-dead-new');
  await untilAlive();
  await sleep(800);
  await log('2 respawned without it: passed once');
  await fightUntilDead();
  await sleep(250);
  await log('3 dead again: still offered');
  await press('Digit4');
  await sleep(300);
  await log('4 pressed 4: taken, the Marshal next');
  await shot('2-took-4');
  await untilAlive();
  await sleep(1000);
  await log('5 next life carries the Trident');
  await fightUntilDead();
  await sleep(250);
  await log('6 dead: the Marshal offered');
  await metrics(1280, 720, false);
  await sleep(600);
  await log('7 1280');
  await shot('3-1280');
  await metrics(390, 844, true);
  await sleep(700);
  await log('8 phone upright');
  await shot('4-phone');
  await metrics(844, 390, true);
  await sleep(700);
  await log('9 phone on its side');
  await shot('5-phone-side');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
