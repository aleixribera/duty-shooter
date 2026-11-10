// Ticket 35: Settings > Video with the one picture, and the canvas drawn at the screen's own pixels.
//   node .scratch/next-level/one-picture/video.mjs [desktop|phone|retina]
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const which = process.argv[2] ?? 'desktop';
const view = { desktop: { width: 1920, height: 1080, dpr: 1, mobile: false }, retina: { width: 1440, height: 900, dpr: 2, mobile: false }, phone: { width: 390, height: 844, dpr: 3, mobile: true } }[which];
const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
// An old save from the days of tiers: Low, with dynamic resolution on.
const SEED = `localStorage.setItem('duty-shooter.settings.v1', JSON.stringify({ defaultsVersion: 2, quality: 'low', autoTier: 'low', autoAdapter: 'x', dynamicResolution: true }))`;

const chrome = await launchChrome();
const shot = async (name) => {
  const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(OUT + name, Buffer.from(r.result.data, 'base64'));
  console.log('shot', OUT + name);
};
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button, [role=tab]')].find((e) => e.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())} && e.offsetParent); if (!b) return false; b.click(); return true; })()`);
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: view.dpr, mobile: view.mobile });
  if (view.mobile) await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  await chrome.navigate(new URL('?nolock&hz=60', BASE).toString());
  if (!(await chrome.waitFor('globalThis.duty?.game && globalThis.duty?.menu', 120_000))) throw new Error('page did not start');
  await sleep(4000);
  const size = await chrome.evaluate(`JSON.stringify({ canvas: [duty.renderer.domElement.width, duty.renderer.domElement.height], css: [innerWidth, innerHeight], dpr: devicePixelRatio, ratio: duty.renderer.getPixelRatio() })`);
  console.log('size', size);
  console.log('open settings', await click('Settings'));
  await sleep(600);
  console.log('video tab', await click('Video'));
  await sleep(600);
  await shot(`video-${which}.png`);
  console.log('preview', await chrome.evaluate(`document.querySelector('.ds-preview')?.innerText`));
  console.log('errors', JSON.stringify(chrome.errors));
} finally {
  await chrome.close();
}
