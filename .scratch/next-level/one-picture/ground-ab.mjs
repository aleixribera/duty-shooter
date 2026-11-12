// Ticket 35: the ground's shader against another build of it, in one page: a screenshot of each at a spot, and their difference.
// Needs the temporary `__groundMat`/`__gv` hooks (see the ticket's comments); GV picks the other build.
//   GV=old node .scratch/next-level/one-picture/ground-ab.mjs [spot] [out dir]
import { writeFileSync } from 'node:fs';
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const spot = process.argv[2] ?? 'ground-zero';
const out = process.argv[3] ?? '.';
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const chrome = await launchChrome();
try {
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=zero-island&spot=${encodeURIComponent(spot)}`, BASE).toString());
  await chrome.waitFor('globalThis.duty?.game', 180_000);
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(9000);
  const shot = async (name) => {
    const r = await chrome.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${out}/${name}`, Buffer.from(r.result.data, 'base64'));
    return r.result.data;
  };
  await shot(`ab-${spot}-new.png`);
  await chrome.evaluate(`(() => {
    globalThis.__gv = ${JSON.stringify(process.env.GV ?? 'old')};
    const alt = globalThis.__groundMat();
    globalThis.__gv = '';
    let n = 0;
    duty.game.scene.traverse((x) => { if (x.name === 'ground') { x.material = alt; n++; } });
    return n;
  })()`);
  await sleep(6000);
  await shot(`ab-${spot}-old.png`);
  console.log('errors', chrome.errors.slice(0, 5));
} finally {
  await chrome.close();
}
