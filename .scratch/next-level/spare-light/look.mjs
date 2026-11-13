// node look.mjs <out dir> <label>   The Practice Range kept ready behind the menu must not take the menu map's light or sky field.
// Zero Island behind the menu, the camera held at a reference spot (`?spot`), shot after 45 s: once with the spare range skipped (deviceMemory 2,
// the reference) and once as a player's PC builds it (deviceMemory 8). Before the fix the second lost the island's sky field.
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'spare-light';
const LABEL = process.argv[3] ?? 'run';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const W = 1280, H = 720;
const MAP = process.env.MAP ?? 'zero-island';
const SPOT = process.env.SPOT ?? 'the-dustlands';
for (const memory of (process.env.MEMORY ?? '2,8').split(',').map(Number)) {
  const chrome = await launchChrome();
  try {
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
    await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => ${memory} })` });
    await chrome.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    // A reference spot holds the camera; the menu is opened again so the range gets built behind it, then hidden for the shot.
    await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock&map=${MAP}&spot=${SPOT}`);
    if (!(await chrome.waitFor('globalThis.duty?.game', 180000))) throw new Error('page did not start');
    await chrome.evaluate(`duty.menu.show('main')`);
    await sleep(Number(process.env.WAIT ?? 45) * 1000);
    // The light the world's uniforms hold, read from the app's own copy of the module: the map's own sun, or the range's.
    const light = await chrome.evaluate(`(async () => {
      try {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('surface-materials'));
      if (!url) return { error: 'no module', some: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('fps-client')).slice(0, 5) };
      const m = await import(url);
      const r = (l) => l.sunDirection.map((v) => Math.round(v * 1000) / 1000).join(',');
      return { current: r(m.currentLighting()), shown: r(m.shownLighting()) };
      } catch (e) { return { error: String(e) }; }
    })()`);
    console.log(memory, JSON.stringify(light));
    await chrome.evaluate(`duty.menu.hide()`);
    await sleep(1500);
    const data = (await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data;
    writeFileSync(`${OUT}/${LABEL}-${MAP}-${SPOT}-mem${memory}.png`, Buffer.from(data, 'base64'));
    console.log(memory, JSON.stringify(chrome.errors.slice(0, 3)));
  } finally {
    await chrome.close();
  }
}
