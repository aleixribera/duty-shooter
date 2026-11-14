// Review 2026-11-14c's "scoreboard order": a free-for-all ranked by kills under a bold Score column. Plays a short
// free-for-all Bot Match (MODE, MAP; ?matchtime) standing still, then frames the board after the end at desktop
// and phone width and logs its rows. Needs the dev server.
//
//   node .scratch/next-level/board-order/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/board-order/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
const MODE = process.env.MODE ?? 'Free-for-all';
const MAP = process.env.MAP ?? 'Station Nine';
const TIME = Number(process.env.TIME ?? 75);
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
const js = async (expression) => JSON.parse((await chrome.evaluate(`JSON.stringify(${expression})`)) ?? 'null');
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const rows = `[...document.querySelectorAll('.ds-board tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t)`;
const report = { mode: MODE, map: MAP };
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock&matchtime=${TIME}`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', MAP, MODE, 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase !== 'playing'`, (TIME + 60) * 1000))) throw new Error('the match did not end');
  await sleep(7000);
  report.rows = await js(rows);
  report.scores = await js(`duty.driver.scores.map((s) => [s.name, s.kills, s.deaths, s.score])`);
  console.log(JSON.stringify(report, null, 1));
  await shot('board-desktop');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  await shot('board-phone');
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ ...report, errors: chrome.errors }, null, 1));
} finally {
  await chrome.close();
}
