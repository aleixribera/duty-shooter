// Review 2026-11-14b (16): a Bot Match's end said "Back to the lobby in 0:08", though Bot Match has no lobby.
// Plays a short Bot Match (?matchtime) with nobody at the controls, then shoots the end screen at desktop and
// phone width and the Bot Match page it goes back to, and records the countdown line. Needs the dev server.
//
//   node .scratch/next-level/bot-match-end/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/bot-match-end/after';
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
const desktop = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const phone = () => chrome.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
const next = `[...document.querySelectorAll('.ds-end .next')].map((e) => e.innerText)`;
const report = { lines: [], errors: chrome.errors };
try {
  // Other sessions edit the source while this runs: this page takes no word from Vite's hot reload.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await desktop();
  await chrome.navigate(`${BASE}?nolock&matchtime=15`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  for (const p of ['Bot Match', 'Switchyard', 'Team deathmatch', 'Easy', 'Start']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(400);
  }
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 120_000))) throw new Error('the match did not start');
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'vote'`, 90_000))) throw new Error('the scoreboard never came');
  await sleep(1500);
  report.lines.push({ at: 'desktop', next: await js(next) });
  await shot('1-end-desktop');
  await phone();
  await sleep(1200);
  report.lines.push({ at: 'phone', next: await js(next) });
  await shot('2-end-phone');
  await desktop();
  if (!(await chrome.waitFor(`(() => { const l = document.querySelector('.ds-lobby'); return !!l && l.getClientRects().length > 0; })()`, 30_000))) throw new Error('no Bot Match page after the scoreboard');
  await sleep(1500);
  report.title = await js(`document.querySelector('.ds-lobby h1')?.innerText ?? null`);
  await shot('3-bot-match-page');
} catch (e) {
  report.failure = String(e?.stack ?? e);
  console.error(e);
  await shot('failure').catch(() => {});
} finally {
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await chrome.close();
}
