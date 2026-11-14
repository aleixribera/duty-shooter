// PLAN item 7, the save code, in the real page: a Rank 9 Profile's code read off its Profile screen, the
// browser's storage wiped (a fresh browser), the code pasted and loaded, and the Profile back at Rank 9.
// Desktop and phone frames. Needs the dev server.
//
//   node .scratch/next-level/unlocks/save-look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/unlocks/save';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
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
const open = async () => {
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('Profile'))) throw new Error('no Profile on the main menu');
  await sleep(500);
};
const rank = `document.querySelector('.ds-prof .rank .n')?.innerText`;

try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(BASE);
  await chrome.evaluate(`localStorage.setItem('duty-shooter.profile.v1', JSON.stringify({ version: 1, xp: 21000, stats: { matches: 14, wins: 8, kills: 160, deaths: 90 }, weapons: { smg: { kills: 90, headshots: 12, longest: 31 } } }))`);
  await open();
  if (!(await click('Save code'))) throw new Error('no Save code button');
  await sleep(500);
  const code = await js(`document.querySelector('.ds-save textarea[readonly]')?.value`);
  log('before', { rank: await js(rank), code: code?.slice(0, 24) + '…', length: code?.length });
  await chrome.evaluate(`document.querySelector('.ds-save')?.scrollIntoView()`);
  await shot('1-code-desktop');
  // A fresh browser: nothing kept.
  await chrome.evaluate(`localStorage.clear()`);
  await open();
  log('fresh', { rank: await js(rank) });
  await click('Save code');
  await sleep(400);
  await chrome.evaluate(`(() => { const t = document.querySelectorAll('.ds-save textarea')[1]; t.value = 'DS1-not-a-code'; t.dispatchEvent(new Event('input')); })()`);
  await click('Load');
  await sleep(400);
  log('bad code', { rank: await js(rank), note: await js(`document.querySelector('.ds-save-note')?.innerText`) });
  await chrome.evaluate(`(() => { const t = document.querySelectorAll('.ds-save textarea')[1]; t.value = ${JSON.stringify(code)}; t.dispatchEvent(new Event('input')); })()`);
  await click('Load');
  await sleep(500);
  log('loaded', { rank: await js(rank), note: await js(`document.querySelector('.ds-save-note')?.innerText`), kept: await js(`JSON.parse(localStorage.getItem('duty-shooter.profile.v1') ?? 'null')?.xp`) });
  await chrome.evaluate(`document.querySelector('.ds-save')?.scrollIntoView()`);
  await shot('2-loaded-desktop');
  await chrome.evaluate(`document.querySelector('.ds-prof')?.scrollIntoView()`);
  await shot('3-profile-desktop');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await chrome.evaluate(`document.querySelector('.ds-save')?.scrollIntoView()`);
  await shot('4-loaded-phone');
} catch (error) {
  log('failed', { error: String(error) });
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await chrome.close();
}
