// Ticket 116, in the real page: a browser holding a Rank 10 Profile under the old key, with a name, a
// changed setting and a camo picked, loads at Rank 1 with four guns open, its name and setting kept and
// the camo gone; a save code made before the reset is refused with its own line. Desktop and phone frames.
// Needs the dev server.
//
//   node .scratch/next-level/reset/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/reset/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const OLD = { version: 1, xp: 60000, stats: { matches: 60, wins: 30, kills: 900, deaths: 500 }, weapons: { m4a1: { kills: 400, headshots: 90, longest: 120 } } };
const OLD_CODE = 'DS1-' + Buffer.from(JSON.stringify(OLD)).toString('base64url');
const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const report = { steps: [], errors: chrome.errors };
const log = (step, detail) => {
  report.steps.push({ step, ...detail });
  console.log(step, JSON.stringify(detail));
};
const settings = `JSON.parse(localStorage.getItem('duty-shooter.settings.v1') ?? '{}')`;

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  // An old browser: the settings as a player left them, and a Rank 10 Profile under the old key.
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await chrome.evaluate(`(() => { const s = ${settings}; s.name = 'Kept Name'; s.fov = 97; s.camos = { m4a1: 'sand' }; localStorage.setItem('duty-shooter.settings.v1', JSON.stringify(s)); localStorage.removeItem('duty-shooter.profile.v2'); localStorage.setItem('duty-shooter.profile.v1', ${JSON.stringify(JSON.stringify(OLD))}); })()`);
  log('seeded', { old: await js(`!!localStorage.getItem('duty-shooter.profile.v1')`), settings: await js(`(({ name, fov, camos }) => ({ name, fov, camos }))(${settings})`) });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('Profile'))) throw new Error('no Profile on the main menu');
  await sleep(600);
  log('after load', {
    rank: await js(`document.querySelector('.ds-prof .rank .n')?.innerText`),
    shutGuns: await js(`document.querySelectorAll('.ds-prof .gun.shut').length`),
    oldKey: await js(`localStorage.getItem('duty-shooter.profile.v1')`),
    newKey: await js(`localStorage.getItem('duty-shooter.profile.v2')`),
    settings: await js(`(({ name, fov, camos }) => ({ name, fov, camos }))(${settings})`),
  });
  await shot('1-profile-desktop');
  if (!(await click('Save code'))) throw new Error('no Save code button');
  await sleep(400);
  await chrome.evaluate(`(() => { const t = document.querySelectorAll('.ds-save textarea')[1]; t.value = ${JSON.stringify(OLD_CODE)}; t.dispatchEvent(new Event('input')); })()`);
  await click('Load');
  await sleep(400);
  log('old code', { rank: await js(`document.querySelector('.ds-prof .rank .n')?.innerText`), note: await js(`document.querySelector('.ds-save-note')?.innerText`), code: await js(`document.querySelector('.ds-save textarea[readonly]')?.value.slice(0, 4)`) });
  await chrome.evaluate(`document.querySelector('.ds-save')?.scrollIntoView()`);
  await shot('2-old-code-desktop');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await chrome.evaluate(`document.querySelector('.ds-save-note')?.scrollIntoView({ block: 'center' })`);
  await shot('3-old-code-phone');
  await chrome.evaluate(`document.querySelector('.ds-prof')?.scrollIntoView()`);
  await shot('4-profile-phone');
} catch (error) {
  log('failed', { error: String(error) });
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
