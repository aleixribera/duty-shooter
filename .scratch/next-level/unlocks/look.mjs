// PLAN item 7, unlocks, seen in the real page: a fresh Profile's Loadout screen (4 guns open, 5 locked with
// their Rank), a Rank 12 Profile's (all 9 open), and a Bot Match that crosses Rank 4 ending on its
// "Trident 5.56 Unlocked" line. Needs the dev server.
//
//   node .scratch/next-level/unlocks/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/unlocks/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const MATCH = Number(process.env.MATCH ?? 150);
const ONLY_MATCH = process.env.ONLY_MATCH === '1';
mkdirSync(OUT, { recursive: true });
// The Rank curve of profile/model.ts: the XP Rank `r` begins at.
const CURVE = Math.log(400_000 / 800) / Math.log(49);
const floor = (r) => (r === 1 ? 0 : Math.round((800 * (r - 1) ** CURVE) / 50) * 50);

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code, windowsVirtualKeyCode: code.startsWith('Key') ? code.charCodeAt(3) : 0 });
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button, clickCount: 1 });
const tiles = `[...document.querySelectorAll('.ds-kit:not(.ds-smith-tiles) .ds-mode')].slice(0, 9).map((b) => ({ name: b.querySelector('b')?.innerText, detail: b.querySelector('span')?.innerText, locked: b.classList.contains('locked') }))`;
const report = { steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
const withXp = async (xp, query = '') => {
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v1', JSON.stringify({ version: 1, xp: ${xp} }))`);
  await chrome.navigate(`${BASE}?nolock${query}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
};
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });

try {
  // Other sessions edit the source while this runs: this page takes no word from Vite's hot reload.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(BASE);
  for (const [label, xp] of ONLY_MATCH ? [] : [
    ['fresh', 0],
    ['rank12', floor(12)],
  ]) {
    await withXp(xp);
    if (!(await click('Loadout'))) throw new Error('no Loadout on the main menu');
    await sleep(800);
    const t = await js(tiles);
    log(`${label} loadout`, { open: t.filter((x) => !x.locked).map((x) => x.name), locked: t.filter((x) => x.locked).map((x) => `${x.name} (${x.detail})`) });
    await shot(`${label}-loadout-desktop`);
    // The locked Trident's card, hovered.
    await chrome.evaluate(`[...document.querySelectorAll('.ds-mode')].find((b) => b.innerText.toUpperCase().startsWith('TRIDENT'))?.dispatchEvent(new MouseEvent('mouseenter'))`);
    await sleep(300);
    log(`${label} trident card`, { card: await js(`document.querySelector('.ds-gun')?.innerText.split('\\n').slice(0, 4)`) });
    await shot(`${label}-trident-desktop`);
    await phone();
    await sleep(600);
    await shot(`${label}-loadout-phone`);
    await desktop();
  }

  // A Bot Match, a kill short of Rank 4, played by a scripted player who turns to the nearest enemy and fires.
  await withXp(floor(4) - 1, `&matchtime=${MATCH}`);
  for (const p of ['Bot Match', process.env.MAP ?? 'Switchyard', 'Free-for-all', 'Easy', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, process.env.MAP ?? 'Switchyard').catch((e) => log('no routes', { error: e.message }));
  log('loadout in the match', await js(`duty.driver?.scores ? duty.game.player?.loadout ?? null : null`));
  const STEER = steer({ range: 60 });
  const held = { walk: false, pressed: false, n: 0 };
  let ticks = 0;
  while ((await js(`duty.driver?.match?.phase ?? null`)) === 'playing') {
    const want = await js(STEER);
    if (ticks++ % 100 === 0) log('steer', { want, me: await js(`duty.driver.scores.find((s) => s.id === duty.driver.selfId)`) });
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      const press = want.fire && (want.dist < 12 || held.n++ % 6 < 4);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await mouse(press ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, pressed: press });
    }
    await sleep(100);
  }
  if (held.walk) await key('keyUp', 'KeyW');
  if (held.pressed) await mouse('mouseReleased');
  log('my score', await js(`duty.driver.scores.find((s) => s.id === duty.driver.selfId)`));
  await sleep(2500);
  log('the end', { text: await js(`document.querySelector('.ds-end .after, .unlocks')?.closest('div')?.innerText ?? null`), unlocks: await js(`[...document.querySelectorAll('.unlocks > div')].map((d) => d.innerText)`) });
  await shot('match-end-desktop');
  const equipped = await chrome.evaluate(`(() => { const b = document.querySelector('[data-equip]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(600);
  log('equip it', { pressed: equipped, loadout: await js(`JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? '{}').loadout ?? null`), shown: await js(`[...document.querySelectorAll('.unlocks > div')].map((d) => d.innerText)`) });
  await shot('match-end-equipped-desktop');
  await phone();
  await sleep(700);
  await shot('match-end-phone');
} catch (error) {
  log('failed', { error: String(error) });
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
