// PLAN item 7, the results: a Bot Match played by a scripted player from a Profile a kill short of Rank 4
// and of the M4A1's Mastery 1, ending on the end screen with the Rank bar, each gun's Mastery (lit where a
// level is reached, with the slot it opened), the Trident's Equip it and Play again; then P starts the
// same match at once with no setup page between. Desktop and phone. Needs the dev server.
//
//   node .scratch/next-level/results/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { loadNav, steer } from '../../../apps/range/scripts/trailer/shots.mjs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/results/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const MATCH = Number(process.env.MATCH ?? 150);
const MAP = process.env.MAP ?? 'Switchyard';
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
const tap = async (code) => {
  await key('keyDown', code);
  await key('keyUp', code);
};
const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 640, y: 360, button, clickCount: 1 });
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
const status = `(() => { const m = duty.driver?.match ?? null; const lobby = document.querySelector('.ds-lobby'); return { phase: m?.phase ?? null, map: m?.map ?? null, mode: m?.mode ?? null, setup: !!lobby && lobby.getClientRects().length > 0 }; })()`;
const endText = `({ mine: document.querySelector('.ds-end .mine')?.innerText ?? null, buttons: [...document.querySelectorAll('.ds-end .random button')].map((b) => b.innerText) })`;
const report = { match: MATCH, map: MAP, steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};

try {
  // Other sessions edit the source while this runs: this page takes no word from Vite's hot reload.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(BASE);
  // A kill short of Rank 4 (the Trident) and of the M4A1's Mastery 1 (its Optic slot); the Warden 9 well short of its.
  const weapons = { m4a1: { kills: 24, headshots: 0, longest: 0 }, pistol: { kills: 10, headshots: 0, longest: 0 } };
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v1', JSON.stringify({ version: 1, xp: ${floor(4) - 1}, weapons: ${JSON.stringify(weapons)} }))`);
  await chrome.navigate(`${BASE}?nolock&matchtime=${MATCH}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', MAP, 'Team deathmatch', 'Easy', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  log('first match', await js(status));
  await chrome.evaluate(CAMERA_LIB);
  await loadNav({ js: (e) => chrome.evaluate(e) }, MAP).catch((e) => log('no routes', { error: e.message }));
  const STEER = steer({ range: Number(process.env.RANGE ?? 40) });
  const held = { walk: false, pressed: false, ads: false, n: 0 };
  let ticks = 0;
  while ((await js(`duty.driver?.match?.phase ?? null`)) === 'playing') {
    const want = await js(STEER);
    if (ticks++ % 60 === 0) log('steer', { want, me: await js(`(() => { const p = duty.game.player; return p && { alive: p.alive, pos: p.position.map(Math.round), ammo: p.ammo ?? null, weapon: p.weapon ?? null }; })()`) });
    if (want) {
      if (want.walk !== held.walk) await key(want.walk ? 'keyDown' : 'keyUp', 'KeyW');
      if (want.ads !== held.ads) await mouse(want.ads ? 'mousePressed' : 'mouseReleased', 'right');
      if (want.reload) await tap('KeyR');
      const press = want.fire && (want.dist < 12 || held.n++ % 6 < 4);
      if (!want.fire) held.n = 0;
      if (press !== held.pressed) await mouse(press ? 'mousePressed' : 'mouseReleased');
      Object.assign(held, { walk: want.walk, ads: want.ads, pressed: press });
    }
    await sleep(40);
  }
  if (held.walk) await key('keyUp', 'KeyW');
  if (held.ads) await mouse('mouseReleased', 'right');
  if (held.pressed) await mouse('mouseReleased');
  log('my score', await js(`duty.driver.scores.find((s) => s.id === duty.driver.selfId)`));
  await sleep(2600);
  log('the end', await js(endText));
  await shot('1-end-desktop');
  // E equips the Trident.
  await tap('KeyE');
  await sleep(600);
  log('E pressed', { ...(await js(endText)), loadout: await js(`JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? '{}').loadout ?? null`) });
  await shot('2-equipped-desktop');
  await phone();
  await sleep(800);
  await shot('3-end-phone');
  await desktop();
  await sleep(400);
  // P: the same match again at once, never through the setup page.
  const before = await js(status);
  await tap('KeyP');
  let setupSeen = false;
  let s = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 120_000) {
    s = await js(status);
    if (s.setup) setupSeen = true;
    if (s.phase === 'playing') break;
    await sleep(150);
  }
  log('play again', { before, after: s, setupSeen, seconds: (Date.now() - t0) / 1000, profile: await js(`JSON.parse(localStorage.getItem('duty-shooter.profile.v1')).xp`) });
  await sleep(3000);
  await shot('4-played-again-desktop');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
