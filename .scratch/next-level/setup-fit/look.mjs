// Ticket 88: the Bot Match setup at the sizes a player has, and whether every pick fits above the footer.
//   node .scratch/next-level/setup-fit/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2] ?? '.scratch/next-level/setup-fit/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const SIZES = [[1904, 929, 1, false], [1920, 1080, 1, false], [1366, 657, 1, false], [390, 844, 2, true]];

const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(2500);
  for (const p of ['Bot Match', 'Survival Town', 'Team deathmatch', 'Mixed teams']) {
    if (!(await click(p))) throw new Error(`no "${p}" button`);
    await sleep(300);
  }
  for (const [width, height, deviceScaleFactor, mobile] of SIZES) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
    await sleep(1200);
    const m = await chrome.evaluate(`(() => { const b = document.querySelector('.ds-lobby .ds-page > .body'); const f = document.querySelector('.ds-lobby .ds-page > footer').getBoundingClientRect().top; const s = [...document.querySelectorAll('[data-act=skill]')].map((e) => e.getBoundingClientRect().bottom); return JSON.stringify({ scroll: b.scrollHeight - b.clientHeight, footerTop: Math.round(f), skillBottom: Math.round(Math.max(...s)) }); })()`);
    console.log(`${width}x${height}`, m);
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
    writeFileSync(`${out}/setup-${width}x${height}.jpg`, Buffer.from(s.result.data, 'base64'));
  }
} finally {
  await chrome.close();
}
