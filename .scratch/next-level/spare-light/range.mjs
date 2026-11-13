// node range.mjs <out dir> <label>   The Practice Range kept ready behind the menu, taken over after another map was built:
// Survival Town behind the menu until the range is ready, then Switchyard picked in Bot Match (the backdrop follows it),
// back out and into Practice Range. Prints the light the world's uniforms hold there (the range's own sun is -0.553,0.623,0.553).
import { launchChrome, sleep } from 'file:///C:/Users/Aleix/Documents/CLAUDE/duty-shooter/apps/range/scripts/chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? '.';
const LABEL = process.argv[3] ?? 'run';
mkdirSync(OUT, { recursive: true });
const NO_HMR = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const click = (chrome, label) => chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(label.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
const LIGHT = `(async () => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('surface-materials'));
  const m = await import(url);
  const r = (l) => l.sunDirection.map((v) => Math.round(v * 1000) / 1000).join(',');
  return { map: duty.map.name ?? duty.map.id, current: r(m.currentLighting()), shown: r(m.shownLighting()) };
})()`;
const chrome = await launchChrome();
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: NO_HMR });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await chrome.navigate(`http://localhost:${process.env.PORT ?? 5173}/?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 180000))) throw new Error('page did not start');
  await sleep(30000);
  console.log('menu', JSON.stringify(await chrome.evaluate(LIGHT)));
  for (const p of ['Bot Match', 'Switchyard']) if (!(await click(chrome, p))) throw new Error(`no "${p}" button`);
  await sleep(20000);
  console.log('switchyard picked', JSON.stringify(await chrome.evaluate(LIGHT)));
  await chrome.evaluate(`duty.menu.show('main')`);
  await sleep(1000);
  if (!(await click(chrome, 'Practice Range'))) throw new Error('no "Practice Range" button');
  await sleep(15000);
  console.log('range', JSON.stringify(await chrome.evaluate(LIGHT)));
  const data = (await chrome.send('Page.captureScreenshot', { format: 'png' })).result.data;
  writeFileSync(`${OUT}/${LABEL}-range.png`, Buffer.from(data, 'base64'));
  console.log(JSON.stringify(chrome.errors.slice(0, 3)));
} finally {
  await chrome.close();
}
