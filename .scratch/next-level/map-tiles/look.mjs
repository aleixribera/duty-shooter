// Pass 65 (ticket 103): the picked map tile lit like the picked mode. Bot Match's setup at desktop and phone width,
// a hover on an unpicked tile, and the lit tile's computed edge and halo.
//   node .scratch/next-level/map-tiles/look.mjs <out dir>   (dev server on :5173, `preview_start range`)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: look.mjs <out dir>');
mkdirSync(out, { recursive: true });
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  const shot = async (name) => {
    const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    writeFileSync(`${out}/${name}.jpg`, Buffer.from(s.result.data, 'base64'));
  };
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate('http://localhost:5173/?nolock');
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(1500);
  if (!(await click('Bot Match'))) throw new Error('no Bot Match');
  await sleep(1200);
  await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) [data-act="map"][data-value="switchyard"]')?.click()`);
  await sleep(800);
  await shot('1-setup');
  const tile = await chrome.evaluate(`(() => { const b = document.querySelector('.ds-lobby:not([hidden]) [data-act="map"].on'); const s = getComputedStyle(b); const r = b.getBoundingClientRect(); return { name: b.innerText, border: s.borderTopColor + ' ' + s.borderTopWidth, shadow: s.boxShadow, label: getComputedStyle(b.querySelector('b')).color, rect: [r.x, r.y, r.width, r.height].map(Math.round) }; })()`);
  const other = await chrome.evaluate(`(() => { const b = document.querySelector('.ds-lobby:not([hidden]) [data-act="map"]:not(.on)'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: other[0], y: other[1] });
  await sleep(400);
  await shot('2-hover');
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 600 });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) [data-act="map"].on')?.scrollIntoView({ block: 'center' })`);
  await sleep(400);
  await shot('3-phone');
  // A guest's view of the host's pick: the picked tile disabled, as the lobby renders it for one who can't pick.
  await chrome.evaluate(`document.querySelector('.ds-lobby:not([hidden]) [data-act="map"].on').disabled = true`);
  await sleep(500);
  const locked = await chrome.evaluate(`(() => { const b = document.querySelector('.ds-lobby:not([hidden]) [data-act="map"].on'); const s = getComputedStyle(b); const r = { border: s.borderTopColor, filter: s.filter }; b.disabled = false; return r; })()`);
  console.log(JSON.stringify({ tile, locked, errors: chrome.errors.slice(0, 3) }));
} finally {
  await chrome.close();
}
