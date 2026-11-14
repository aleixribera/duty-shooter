// Review 2026-11-14c's close-behind lines: "Settings" alone on the phone menu's last line, the line beside the
// free-for-all board's title, and Outposts' faint "46 m" over a pale wall. Frames the phone menu, an Outposts
// Bot Match on Survival Town a few seconds in, and a short free-for-all's board after its end; logs where each
// menu button sits and the board header's text. Needs the dev server.
//
//   node .scratch/next-level/subheads/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/subheads/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });

const HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const metrics = (width, height, scale, mobile) => chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
const report = {};
const match = async (map, mode, time, params = '') => {
  await chrome.navigate(`${BASE}?nolock&matchtime=${time}${params}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', map, mode, 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR });
  // 1. The phone menu, 390 wide as the review's 02.
  await metrics(390, 844, 2, true);
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(2500);
  report.more = await js(`[...document.querySelectorAll('.ds-more button')].map((b) => { const r = b.getBoundingClientRect(); return [b.innerText, Math.round(r.left), Math.round(r.top), Math.round(r.right)]; })`);
  await shot('1-menu-phone');
  await metrics(320, 640, 2, true);
  await sleep(800);
  report.more320 = await js(`[...document.querySelectorAll('.ds-more button')].map((b) => { const r = b.getBoundingClientRect(); return [b.innerText, Math.round(r.left), Math.round(r.top), Math.round(r.right)]; })`);
  await shot('1-menu-320');
  // 2. Outposts on Survival Town: the zone markers' distances.
  await metrics(1920, 1080, 1, false);
  await match('Survival Town', 'Outposts', 60);
  await sleep(5000);
  report.markers = await js(`[...document.querySelectorAll('.ds-marker small')].map((s) => { const c = getComputedStyle(s); return [s.innerText, c.color, c.backgroundColor]; })`);
  await shot('2-outposts');
  // 3. A short free-for-all's board after its end.
  await match('Station Nine', 'Free-for-all', 40);
  if (!(await chrome.waitFor(`duty.driver?.match?.phase !== 'playing'`, 100_000))) throw new Error('the match did not end');
  await sleep(7000);
  report.header = await js(`[...document.querySelectorAll('.ds-board > header')].map((h) => h.innerText.replace(/\\s+/g, ' '))`);
  await shot('3-board-desktop');
  await metrics(844, 390, 2, true);
  await sleep(1200);
  await shot('3-board-phone');
  console.log(JSON.stringify(report, null, 1));
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ ...report, errors: chrome.errors }, null, 1));
} finally {
  await chrome.close();
}
