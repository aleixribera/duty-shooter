// PLAN item 9d (ticket 119): the loadout plates beside the spectator's panel, which only Charge shows with them (out
// until the next round). A Charge Bot Match on Switchyard: walks at the enemy until killed, waits for the panel, then
// takes the death screen at 1920 x 1080, 1280 x 720, an upright phone and a phone on its side, logging any overlap of
// a plate with the panel's words, the watched player's ammo plate or a touch button. Needs the dev server.
//
//   node .scratch/next-level/kit-plates/charge.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/kit-plates/charge';
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
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
const facts = `(() => {
  const box = (e) => { if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; };
  const meet = (a, b) => !!a && !!b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const plates = [...document.querySelectorAll('.ds-kits .kit')].map(box).filter(Boolean);
  const words = [...document.querySelectorAll('.ds-spec > *, .ds-ammo, .ds-center, .ds-toast, .ds-hintline, .ds-caption')].filter((e) => getComputedStyle(e).opacity !== '0').map((e) => ({ c: String(e.className).split(' ')[0], b: box(e) })).filter((w) => w.b);
  const buttons = [...document.querySelectorAll('.ds-tc .tb')].map((e) => ({ c: String(e.className), b: box(e) })).filter((w) => w.b);
  return {
    alive: duty.game.player?.alive ?? null,
    spec: box(document.querySelector('.ds-spec')),
    plates,
    hits: [...words, ...buttons].filter((w) => plates.some((p) => meet(p, w.b))).map((w) => w.c + '@' + w.b),
  };
})()`;
const report = { steps: [], errors: chrome.errors };
const log = async (step) => {
  const f = await js(facts);
  report.steps.push({ step, ...f });
  console.log(step, JSON.stringify(f));
  return f;
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
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Charge', 'Hard', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing' && duty.driver?.match?.objective?.phase === 'live'`, 120_000))) throw new Error('the round did not go live');
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, 'Switchyard').catch((e) => console.log('no routes', e.message));
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
  await sleep(3800);
  await log('1920');
  await shot('1-1920');
  await metrics(1280, 720, false);
  await sleep(700);
  await log('1280');
  await shot('2-1280');
  await metrics(1024, 768, false);
  await sleep(700);
  await log('1024');
  await shot('3-1024');
  // A phone: the touch controls come with a finger on the glass.
  await chrome.evaluate(`document.documentElement.classList.add('ds-touch')`);
  await metrics(390, 844, true);
  await chrome.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 120 }] });
  await chrome.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(900);
  await log('phone');
  await shot('4-phone');
  await metrics(844, 390, true);
  await sleep(900);
  await log('phone on its side');
  await shot('5-phone-side');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
