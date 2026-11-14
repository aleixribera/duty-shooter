// The match clock without "T-" (PLAN item 9a): a Survival Town TDM Bot Match with 70 s on the clock, frames of the
// clock in each act (the match, its last minute, its last ten seconds) at desktop and phone width, with the clock's
// text, width and the bar's place logged for each.
//   node .scratch/next-level/clock/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir> [base url]');
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const click = async (text) => {
  const r = await chrome.send('Runtime.evaluate', {
    userGesture: true,
    returnByValue: true,
    expression: `(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`,
  });
  if (r.result?.result?.value !== true) throw new Error(`no "${text}" button`);
  await sleep(300);
};
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${name}.png`, Buffer.from(s.result.data, 'base64'));
};
const DESK = { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 844, height: 390, deviceScaleFactor: 2, mobile: true };
const probe = `(() => { const c = document.querySelector('.ds-match .clock'); const b = document.querySelector('.ds-match'); if (!c || !b) return null; const r = c.getBoundingClientRect(), q = b.getBoundingClientRect(); return { text: c.textContent, cls: c.className, clockW: Math.round(r.width * 10) / 10, barLeft: Math.round(q.left * 10) / 10, barW: Math.round(q.width * 10) / 10 }; })()`;
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', DESK);
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(`${BASE}?nolock&matchtime=70`);
  if (!(await chrome.waitFor('!!globalThis.duty?.game && !!globalThis.duty?.sound', 90_000))) throw new Error('page did not start');
  await sleep(2000);
  for (const t of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Start']) await click(t);
  if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000))) throw new Error('match did not start');
  const t0 = Date.now();
  const frames = [
    { at: 3, name: 'desk-match', m: DESK }, { at: 6, name: 'phone-match', m: PHONE },
    { at: 30, name: 'desk-minute', m: DESK }, { at: 33, name: 'phone-minute', m: PHONE },
    { at: 66.5, name: 'desk-ten', m: DESK }, { at: 69, name: 'phone-ten', m: PHONE },
  ];
  // The bar's width and place sampled through the last minute and its last ten seconds, at desktop width.
  for (const f of frames) {
    if (f.m) await chrome.send('Emulation.setDeviceMetricsOverride', f.m);
    while (Date.now() - t0 < f.at * 1000) await sleep(100);
    console.log(JSON.stringify({ frame: f.name, ...(await chrome.evaluate(probe)) }));
    await shot(f.name);
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
