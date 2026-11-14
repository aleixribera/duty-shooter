// Ticket 19: the loadout screen's gunsmith, at desktop and phone width.
// A Profile with 160 kills on the M4A1 (Mastery 3: optic, muzzle and magazine open; the grip locked) and 30 on the pistol.
//   node .scratch/next-level/attachments/gunsmith.mjs [desktop|phone|landscape]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const which = process.argv[2] ?? 'desktop';
const view = { desktop: { width: 1920, height: 1080, dpr: 1, mobile: false }, phone: { width: 390, height: 844, dpr: 2, mobile: true }, landscape: { width: 844, height: 390, dpr: 2, mobile: true } }[which];
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const profile = {
  version: 1,
  xp: 4000,
  stats: { matches: 20, wins: 9, kills: 190, deaths: 120, headshots: 30, assists: 12, score: 9000, seconds: 7200, bestStreak: 7, royaleWins: 0, royaleBest: null, modes: {} },
  weapons: { m4a1: { kills: 160, headshots: 20, longest: 61 }, pistol: { kills: 30, headshots: 4, longest: 22 } },
  daily: { date: '', progress: {} },
  courseBest: null,
};
const settings = { builds: { m4a1: { optic: 'reflex', magazine: 'extended' } }, loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null, attachments: { primary: { optic: 'reflex', magazine: 'extended' } } } };
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const SEED = `(() => { localStorage.setItem('duty-shooter.profile.v2', ${JSON.stringify(JSON.stringify(profile))}); const K = 'duty-shooter.settings.v1'; let had = {}; try { had = JSON.parse(localStorage.getItem(K) ?? '{}'); } catch {} localStorage.setItem(K, JSON.stringify({ ...had, ...${JSON.stringify(settings)} })); })()`;

const chrome = await launchChrome();
const shot = async (name) => {
  const r = await chrome.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + name, Buffer.from(r.result.data, 'base64'));
  console.log('shot', OUT + name);
};
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
  if (view.mobile) await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await chrome.navigate(new URL('?nolock&hz=60', BASE).toString());
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 120_000))) throw new Error('page did not start');
  await sleep(1500);
  await chrome.evaluate(`duty.menu.loadout('lobby')`);
  await sleep(600);
  const rows = await chrome.evaluate(`[...document.querySelectorAll('.ds-smith-row')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())`);
  console.log(which, 'gunsmith rows', rows);
  // The extended magazine's card: hover its tile.
  await chrome.evaluate(`(() => { const t = [...document.querySelectorAll('.ds-smith .ds-mode')].find((b) => b.innerText.toUpperCase().startsWith('SUPPRESSOR')); t.scrollIntoView({ block: 'center' }); t.dispatchEvent(new MouseEvent('mouseenter')); })()`);
  await sleep(300);
  await shot(`gunsmith-${which}.png`);
  const card = await chrome.evaluate(`document.querySelector('.ds-gun')?.innerText.replace(/\\s+/g, ' ')`);
  console.log(which, 'card', card);
  // A locked tile: its card says what it waits for, and a click does nothing.
  const locked = await chrome.evaluate(`(() => { const t = document.querySelector('.ds-smith .ds-mode.locked'); t.dispatchEvent(new MouseEvent('mouseenter')); t.click(); return { card: document.querySelector('.ds-gun').innerText.replace(/\\s+/g, ' '), on: t.classList.contains('on') }; })()`);
  console.log(which, 'locked', locked);
  // Fit the suppressor: the setting and the loadout both carry it.
  await chrome.evaluate(`[...document.querySelectorAll('.ds-smith .ds-mode')].find((b) => b.innerText.toUpperCase().startsWith('SUPPRESSOR')).click()`);
  await sleep(200);
  console.log(which, 'saved', await chrome.evaluate(`JSON.stringify((({ builds, loadout }) => ({ builds, attachments: loadout.attachments }))(JSON.parse(localStorage.getItem('duty-shooter.settings.v1'))))`));
  // Another primary, and back: the M4A1 keeps its build.
  await chrome.evaluate(`[...document.querySelectorAll('.ds-kit:not(.ds-smith-tiles) .ds-mode')].find((b) => b.innerText.toUpperCase().startsWith('WASP')).click()`);
  await sleep(200);
  console.log(which, 'smg rows', await chrome.evaluate(`[...document.querySelectorAll('.ds-smith')][0].innerText.replace(/\\s+/g, ' ')`), 'attachments', await chrome.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('duty-shooter.settings.v1')).loadout.attachments ?? null)`));
  await chrome.evaluate(`[...document.querySelectorAll('.ds-kit:not(.ds-smith-tiles) .ds-mode')].find((b) => b.innerText.toUpperCase().startsWith('M4A1')).click()`);
  await sleep(200);
  console.log(which, 'back on the M4A1', await chrome.evaluate(`JSON.stringify(JSON.parse(localStorage.getItem('duty-shooter.settings.v1')).loadout.attachments ?? null)`));
  await chrome.evaluate(`document.querySelector('.ds-smith').scrollIntoView({ block: 'start' })`);
  await sleep(200);
  await shot(`gunsmith-${which}-rows.png`);
} finally {
  await chrome.close();
}
