// Pass 73: a camouflaged soldier under the M4A1's fire in a Bot Match (Station Nine, free-for-all). The review's
// scripted player (`steer`) turns to the nearest foe and fires; a frame is taken each time the trigger has been held
// 0.2 s or more, up to eight.
//   node .scratch/next-level/hit-flash/match.mjs <out dir>   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { CAMERA_LIB } from '../../../apps/range/scripts/trailer/camera-lib.mjs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';
import { steer } from '../../../apps/range/scripts/trailer/shots.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: match.mjs <out dir>');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
const click = (text) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && !b.disabled && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const mouse = (type) => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?nolock&matchtime=120');
  await chrome.waitFor(`!!globalThis.duty?.game`, 120_000);
  await sleep(2000);
  for (const p of ['Bot Match', 'Station Nine', 'Free-for-all', 'Start']) (await click(p)) || console.log('no button', p), await sleep(300);
  await chrome.waitFor(`duty.driver?.match?.phase === 'playing'`, 180_000);
  await chrome.evaluate(CAMERA_LIB);
  const STEER = steer({ range: 40 });
  let held = false, since = 0, n = 0;
  const end = Date.now() + 90_000;
  while (n < 8 && Date.now() < end) {
    const r = await chrome.send('Runtime.evaluate', { expression: STEER, returnByValue: true });
    const want = r.result?.result?.value ?? {};
    if (!!want.fire !== held) {
      held = !!want.fire;
      await mouse(held ? 'mousePressed' : 'mouseReleased');
      since = Date.now();
    }
    if (held && Date.now() - since > 200) {
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      writeFileSync(`${out}/fire-${n++}.jpg`, Buffer.from(s.result.data, 'base64'));
      since = Date.now() + 300;
    }
    await sleep(30);
  }
  if (held) await mouse('mouseReleased');
  console.log(JSON.stringify({ frames: n, errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
