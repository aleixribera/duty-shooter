// The Loadout screen's stills (`packages/fps-client/src/viewmodel/assets/stills/<gun>.webp`): each gun side on in its
// stock build, drawn by the Loadout screen's own stage and saved as it draws it. The screen shows a gun's still the
// moment it asks for that gun, until the gun's model is drawn (seconds of shaders on a fresh page). Make them again
// after changing a gun's model or the stage's framing or light. Needs the dev server.
//
//   node apps/range/scripts/gun-stills.mjs [base url]      (default http://localhost:5173/)
//   GUNS=m4a1,smg to make only those
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const OUT = fileURLToPath(new URL('../../../packages/fps-client/src/viewmodel/assets/stills/', import.meta.url));
const GUNS = (process.env.GUNS ?? 'm4a1,smg,shotgun,sniper,pistol,lmg,dmr,burst,revolver').split(',');
mkdirSync(OUT, { recursive: true });

const chrome = await launchChrome();
try {
  // The stage as a 1080p desktop lays it out (420 css px) at twice the pixels: 840x472, sharp on a 4K screen or a phone.
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
  // Other sessions' edits must not reload the page mid-run.
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('!!globalThis.duty?.menu?.gunStage', 90_000))) throw new Error('page did not start');
  await chrome.evaluate(`globalThis.duty.menu.loadout('main')`);
  for (const id of GUNS) {
    await chrome.evaluate(`globalThis.duty.menu.gunStage.show(${JSON.stringify(id)}, undefined, null)`);
    if (!(await chrome.waitFor(`document.querySelector('.ds-stage')?.dataset.drawn === ${JSON.stringify(id)}`, 90_000, 100))) throw new Error(`${id} was never drawn`);
    await sleep(300);
    const size = await chrome.evaluate(`JSON.stringify([document.querySelector('.ds-stage canvas').width, document.querySelector('.ds-stage canvas').height])`);
    const url = await chrome.evaluate(`globalThis.duty.menu.gunStage.snapshot()`);
    if (typeof url !== 'string' || !url.startsWith('data:image/webp')) throw new Error(`${id}: no picture`);
    const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    writeFileSync(`${OUT}${id}.webp`, bytes);
    console.log(`${id}: ${size}, ${(bytes.length / 1024).toFixed(1)} KB`);
  }
} finally {
  await chrome.close();
}
