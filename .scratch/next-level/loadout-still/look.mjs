// Review 2026-11-14b's defect 4: Loadout from the menu on a fresh page and Profile, as the review's capture opens it
// (6 s on the menu, then Loadout), timed to a gun on the screen (`data-shown`: its still or its model) and to its
// model drawn (`data-drawn`); frames at desktop and phone width, and one after a drag across the stage.
//
//   node .scratch/next-level/loadout-still/look.mjs <out dir> [base url]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const OUT = process.argv[2] ?? '.scratch/next-level/loadout-still/after';
const BASE = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const chrome = await launchChrome();
const shot = async (name) => {
  const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
  if (s.result?.data) writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
};
const click = (text) =>
  chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const stage = (key) => chrome.evaluate(`document.querySelector('.ds-stage')?.dataset.${key} ?? null`);
const r = {};
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock&stats`);
  if (!(await chrome.waitFor(`!!globalThis.duty?.game && !!globalThis.duty?.sound`, 90_000))) throw new Error('page did not start');
  await sleep(6000);
  if (!(await click('Loadout'))) throw new Error('no Loadout button');
  const t0 = Date.now();
  while (Date.now() - t0 < 45_000 && !(r.msToShown && r.msToDrawn)) {
    if (!r.msToShown && (await stage('shown'))) {
      r.msToShown = Date.now() - t0;
      await shot('1-shown-desktop');
    }
    if (!r.msToDrawn && (await stage('drawn'))) r.msToDrawn = Date.now() - t0;
    await sleep(25);
  }
  r.chip = await chrome.evaluate(`document.querySelector('.ds-chip')?.innerText ?? null`);
  await sleep(1500);
  await shot('2-drawn-desktop');
  await sleep(6000);
  await shot('3-swayed-desktop');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1500);
  await chrome.evaluate(`document.querySelector('.ds-page-body, .ds-body')?.scrollTo?.(0, 0)`);
  await shot('5-phone');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  await shot('6-1280');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const box = JSON.parse(await chrome.evaluate(`JSON.stringify(document.querySelector('.ds-stage').getBoundingClientRect())`));
  const y = box.y + box.height / 2;
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x + 60, y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + 60 + i * 14, y, button: 'left', buttons: 1 });
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 200, y, button: 'left', clickCount: 1 });
  await sleep(200);
  await shot('4-dragged-desktop');
  await sleep(5000);
  await shot('7-returned-desktop');
} finally {
  writeFileSync(`${OUT}/result.json`, JSON.stringify({ ...r, errors: chrome.errors }, null, 2));
  console.log(JSON.stringify({ ...r, errors: chrome.errors.length }));
  await chrome.close();
}
