// Where a fresh page's Loadout open waits: long tasks, and when the still's image loads and decodes, after the click.
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const WAIT = Number(process.env.WAIT ?? 6000);
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`,
  });
  await chrome.navigate(`${BASE}?nolock&stats`);
  if (!(await chrome.waitFor(`!!globalThis.duty?.game && !!globalThis.duty?.sound`, 90_000))) throw new Error('page did not start');
  await sleep(WAIT);
  const out = await chrome.evaluate(`(async () => {
    const log = [];
    const t0 = performance.now();
    const at = (what) => log.push([Math.round(performance.now() - t0), what]);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.startTime > t0) log.push([Math.round(e.startTime - t0), 'long ' + Math.round(e.duration)]); }).observe({ type: 'longtask' });
    const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith('LOADOUT'));
    b.click();
    at('clicked');
    const img = () => document.querySelector('.ds-stage img');
    let seen = {};
    await new Promise((done) => {
      const tick = () => {
        const i = img();
        const s = document.querySelector('.ds-stage');
        if (i && !seen.img) { seen.img = 1; at('img in page, src ' + (i.getAttribute('src') ?? '').slice(-20)); }
        if (i?.complete && i.naturalWidth && !seen.loaded) { seen.loaded = 1; at('img loaded'); }
        if (s?.dataset.shown && !seen.shown) { seen.shown = 1; at('shown'); }
        if (s?.dataset.drawn && !seen.drawn) { seen.drawn = 1; at('drawn'); }
        if (seen.drawn || performance.now() - t0 > 30000) return done();
        setTimeout(tick, 5);
      };
      tick();
    });
    const res = performance.getEntriesByType('resource').filter((e) => e.name.includes('stills') || e.name.includes('.glb'));
    for (const e of res) log.push([Math.round(e.startTime - t0), 'fetch ' + e.name.split('/').pop().slice(0, 30) + ' took ' + Math.round(e.duration)]);
    return log.sort((a, b) => a[0] - b[0]);
  })()`);
  for (const l of out ?? []) console.log(l.join('  '));
} finally {
  await chrome.close();
}
