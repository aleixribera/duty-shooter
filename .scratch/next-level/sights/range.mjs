// In the Practice Range (ticket 102): each gun given with an optic, aimed down the range at the targets; one frame each.
//   node .scratch/next-level/sights/range.mjs <out dir> [guns] [optics]   (dev server on :5173)
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const out = process.argv[2];
if (!out) throw new Error('usage: range.mjs <out dir> [guns] [optics]');
const GUNS = (process.argv[3] ?? 'm4a1,lmg').split(',');
const OPTICS = (process.argv[4] ?? 'none,reflex,prism').split(',');
mkdirSync(out, { recursive: true });
const chrome = await launchChrome();
try {
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate('http://localhost:5173/?explore=range&nolock');
  if (!(await chrome.waitFor(`globalThis.duty?.game?.player?.alive === true`, 240_000, 500))) throw new Error('range did not start');
  await sleep(4000);
  for (const gun of GUNS) {
    for (const optic of OPTICS) {
      const attachments = optic === 'none' ? {} : { primary: { optic } };
      await chrome.evaluate(`duty.game.driver.setLoadout(${JSON.stringify({ primary: gun, secondary: 'pistol', grenade: 'frag', attachments })})`);
      await sleep(3200);
      await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 960, y: 540, button: 'right', buttons: 2, clickCount: 1 });
      await sleep(1500);
      const s = await chrome.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
      writeFileSync(`${out}/range-${gun}-${optic}.jpg`, Buffer.from(s.result.data, 'base64'));
      await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 960, y: 540, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(500);
    }
  }
  console.log(JSON.stringify({ errors: chrome.errors.slice(0, 5) }));
} finally {
  await chrome.close();
}
