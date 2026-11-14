// PLAN item 7, Battle Royale on loadouts (ticket 117): a Local bots Battle Royale with `?drops=resupply`.
// A Rank 12 Profile picks the Ridgeline .308 in the Preparation and drops with it; at Stage 2 the Supply Drop
// is called in as a resupply; the match state says so, and no weapon lies on the ground while it plays.
// Against the dev server (`preview_start range`).
//   node .scratch/next-level/royale-loadouts/look.mjs <out dir> [query]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/royale-loadouts/after';
const QUERY = process.argv[3] ?? 'nolock&drops=resupply&seed=7';
const BASE = 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// Rank 12 and past: every gun open.
const PROFILE = JSON.stringify({ version: 1, xp: 2_000_000, stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, assists: 0, score: 0, seconds: 0, bestStreak: 0, royaleWins: 0, royaleBest: null, modes: {} }, weapons: {}, daily: { date: '', progress: {} }, courseBest: null });

const chrome = await launchChrome();
const result = {};
const shot = async (file) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${out}/${file}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = async (q) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const q = ${JSON.stringify(q)}; const b = q.startsWith('[') ? document.querySelector(q) : [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(q.toUpperCase())); if (!b) return false; b.click(); return true; })()`,
  });
  return r.result?.result?.value === true;
};
const phone = (on) => chrome.send('Emulation.setDeviceMetricsOverride', on ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const royale = () => chrome.evaluate(`JSON.stringify((() => { const d = duty.game?.driver; const o = d?.match?.objective; const me = duty.game?.player ?? null; return { phase: d?.match?.phase ?? null, holds: o?.holds ?? null, stage: o?.stage ?? null, drops: o?.drops ?? null, loose: o?.loose ?? null, alive: o?.alive ?? null, time: d?.serverTime ?? null, me: me ? { alive: me.alive, primary: me.loadout?.primary, weapon: me.weapon?.id, grenades: me.grenades } : null }; })())`).then((t) => JSON.parse(t ?? 'null'));
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('duty-shooter.profile.v1', ${JSON.stringify(PROFILE)}); } catch {}` });
  await chrome.navigate(`${BASE}?${QUERY}`);
  if (!(await chrome.waitFor(`location.protocol.startsWith('http') && !!globalThis.duty?.game`, 120_000))) throw new Error('page did not start');
  await sleep(2000);
  if (!(await click('Battle Royale'))) throw new Error('no Battle Royale button');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-royale [data-key="source-local"]')`, 30_000, 200))) throw new Error('no Local bots choice');
  await chrome.evaluate(`document.querySelector('.ds-royale [data-key="source-local"]').click()`);
  await sleep(500);
  await chrome.evaluate(`(() => { const i = document.querySelector('.ds-royale input[name="name"]'); if (i) i.value = 'Aleix'; document.querySelector('.ds-royale [data-key="go"]')?.click(); })()`);
  log('waiting for the local lobby (island and nav)');
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-royale [data-act="start"]')`, 600_000, 1000))) throw new Error('no lobby in 10 min');
  await chrome.evaluate(`document.querySelector('.ds-royale [data-act="start"]').click()`);
  if (!(await chrome.waitFor(`!!document.querySelector('.ds-prep:not([hidden])')`, 120_000, 500))) throw new Error('no Preparation');
  await sleep(1500);
  result.primaries = await chrome.evaluate(`[...document.querySelectorAll('.ds-prep [data-act="pick"][data-slot="primary"]')].map((b) => b.dataset.value)`);
  result.pickedSniper = await click(`[data-act="pick"][data-slot="primary"][data-value="sniper"]`);
  await sleep(1000);
  result.preparationPick = await chrome.evaluate(`document.querySelector('.ds-prep [data-act="pick"][data-slot="primary"].on')?.dataset.value ?? null`);
  await shot('01-preparation-ridgeline');
  await phone(true);
  await sleep(1200);
  await shot('02-preparation-phone');
  await phone(false);
  // `PREP_ONLY=1`: the Preparation's frames alone.
  if (process.env.PREP_ONLY) throw new Error('PREP_ONLY: stopped after the Preparation');
  await sleep(800);
  await click('Ready');
  if (!(await chrome.waitFor(`!document.querySelector('.ds-prep:not([hidden])')`, 90_000, 500))) throw new Error('the drop did not start');
  await sleep(12_000);
  result.landed = await royale();
  await shot('03-dropped-with-ridgeline');
  log('dropped', JSON.stringify(result.landed.me), 'holds', result.landed.holds);
  // Stage 2 opens with the crate: watch the state until it lands and a while after, noting anything on the ground.
  result.looseSeen = [];
  let announced = false;
  let landedShot = false;
  for (let i = 0; i < 260; i++) {
    const s = await royale();
    if (s.loose?.length) result.looseSeen.push(s.loose);
    if (!announced && s.drops?.length) {
      announced = true;
      result.announced = s;
      await sleep(600);
      await shot('04-drop-called-in');
      result.toast = await chrome.evaluate(`[...document.querySelectorAll('*')].map((e) => e.childElementCount === 0 ? e.textContent : '').find((t) => t && t.includes('Supply Drop incoming')) ?? null`);
      log('announced', result.toast);
    }
    if (announced && !landedShot && s.drops?.[0] && s.time > s.drops[0].lands + 1) {
      landedShot = true;
      result.landedDrop = s;
      await shot('05-drop-landed');
    }
    if (s.drops?.some((d) => d.opened)) {
      result.opened = s;
      result.feed = await chrome.evaluate(`[...document.querySelectorAll('*')].map((e) => e.childElementCount === 0 ? e.textContent : '').filter((t) => t && t.includes('Supply Drop')).slice(0, 4)`);
      await shot('06-drop-opened');
      log('opened', JSON.stringify(s.drops));
      break;
    }
    if (s.phase !== 'playing') break;
    await sleep(1000);
  }
  result.last = await royale();
  result.errors = chrome.errors.slice(0, 5);
} catch (e) {
  result.failed = e.message;
  await shot('failed').catch(() => {});
} finally {
  await chrome.close();
  writeFileSync(`${out}/result.json`, JSON.stringify(result, null, 2));
  log(JSON.stringify(result).slice(0, 1500));
}
