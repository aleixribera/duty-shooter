// Where a first Loadout open's seconds go: on a page left to settle (the menu's match ready, the stage warm), a fresh
// stage is made and asked for a gun, timing its renderer, then the gun drawn. WAIT=<ms> on the menu first (default
// 25000); GUNS=m4a1,dmr; WEBGL=1 for the WebGL2 backend. Needs the dev server.
//   node .scratch/next-level/loadout-open/stage-probe.mjs [base url]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const WAIT = Number(process.env.WAIT ?? 25000);
const GUNS = (process.env.GUNS ?? 'm4a1,dmr').split(',');
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 90_000))) throw new Error('page did not start');
  await sleep(WAIT);
  for (const gun of GUNS) {
    const r = await chrome.evaluate(`(async () => {
      const Stage = globalThis.duty.menu.gunStage.constructor;
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:450px;z-index:99';
      document.body.append(box);
      const t0 = performance.now();
      const a = await navigator.gpu.requestAdapter();
      const d = await a.requestDevice();
      const device = performance.now() - t0;
      d.destroy();
      const s = new Stage({ forceWebGL: ${process.env.WEBGL === '1'} });
      box.append(s.element);
      const t1 = performance.now();
      s.show(${JSON.stringify(gun)}, undefined);
      let shown = null;
      while (performance.now() - t1 < 40000) {
        if (shown === null && s.element.dataset.shown) shown = performance.now() - t1;
        if (s.element.dataset.drawn) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      const drawn = performance.now() - t1;
      s.stop();
      box.remove();
      return JSON.stringify({ gun: ${JSON.stringify(gun)}, device: Math.round(device), shown: Math.round(shown ?? -1), drawn: Math.round(drawn) });
    })()`);
    console.log(r);
  }
  console.log('errors', JSON.stringify(chrome.errors.slice(0, 5)));
} finally {
  await chrome.close();
}
