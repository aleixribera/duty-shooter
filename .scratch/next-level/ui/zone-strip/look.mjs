// The Outposts zones' and Charge's strips under the match bar (review 2026-11-13c, defect 3), at desktop, phone and a short screen.
//   node .scratch/next-level/ui/zone-strip/look.mjs <out dir>   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 86 });
  writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
// The bottom of the match bar and the top of the strip under it, in CSS px.
const measure = () =>
  chrome.evaluate(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return b.height ? [Math.round(b.top), Math.round(b.bottom)] : null; }; return JSON.stringify({ bar: r('.ds-match'), zones: r('.ds-zones'), charge: r('.ds-charge'), round: r('.ds-round') }); })()`);
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  for (const [W, H, mobile, map, mode] of [
    [1920, 1080, false, 'Survival Town', 'Outposts'],
    [390, 844, true, 'Survival Town', 'Outposts'],
    [900, 500, false, 'Survival Town', 'Outposts'],
    [1920, 1080, false, 'Switchyard', 'Charge'],
  ]) {
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
    await chrome.navigate('http://localhost:5173/?nolock');
    if (!(await chrome.waitFor(`globalThis.duty?.game && globalThis.duty?.menu?.open`, 180_000, 500))) throw new Error('menu did not open');
    await sleep(1500);
    for (const p of ['Bot Match', map, mode]) {
      if (!(await click(p))) throw new Error(`no "${p}" button`);
      await sleep(300);
    }
    if (!(await click('Start'))) throw new Error('no Start button');
    if (!(await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000, 500))) throw new Error('match did not start');
    const tag = `${mode.toLowerCase()}-${W}x${H}`;
    await sleep(800);
    console.log(tag, 'opening', await measure());
    await shot(`${tag}-opening`);
    await sleep(6000);
    console.log(tag, 'play', await measure());
    await shot(`${tag}-play`);
  }
} finally {
  console.log('errors', chrome.errors.slice(0, 3));
  await chrome.close();
}
