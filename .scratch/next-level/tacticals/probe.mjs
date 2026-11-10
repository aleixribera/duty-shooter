// Ticket 20: the grenades and the clock a page sees while a smoke stands. Headless, muted; needs the dev server.
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const chrome = await launchChrome();
const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: 69 });
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&nolock&at=0,0,-1.57');
  if (!(await chrome.waitFor('globalThis.duty?.game?.player', 120_000))) throw new Error('page did not start');
  await sleep(3000);
  await key('keyDown', 'KeyE');
  await sleep(300);
  await key('keyUp', 'KeyE');
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    { const r = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 60, clip: { x: 560, y: 240, width: 800, height: 500, scale: 0.6 } }); writeFileSync(new URL(`./probe-${i}.jpg`, import.meta.url), Buffer.from(r.result.data, 'base64')); }
    console.log(i, await chrome.evaluate(`JSON.stringify({ m: globalThis.__cloudDebug?.mesh, t: globalThis.__cloudDebug?.time })`)); console.log(await chrome.evaluate(`JSON.stringify({ t: duty.driver.serverTime, g: duty.driver.grenades().map((g) => ({ id: g.id, kind: g.kind, popped: g.popped, at: g.position.map((v) => +v.toFixed(1)), rest: g.resting })) })`));
  }
  console.log('errors', chrome.errors.slice(0, 10));
} finally {
  await chrome.close();
}
