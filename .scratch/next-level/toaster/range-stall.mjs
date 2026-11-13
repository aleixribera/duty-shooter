// Ticket 99: the Practice Range's multi-second stall in the 2026-11-13a capture. Enters the range through the menu
// as `reviews/capture.mjs` does, walks, aims and fires, and logs every frame over 100 ms and every shader three
// builds, with the second (from the click) each happened and the step the script was on.
//   node .scratch/next-level/toaster/range-stall.mjs [rate=1]
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const rate = Number(process.argv[2] ?? 1);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;
const HOOK = `(() => {
  const log = (globalThis.__log = []);
  globalThis.__t0 = null;
  globalThis.__step = 'load';
  const at = () => globalThis.__t0 === null ? null : +((performance.now() - globalThis.__t0) / 1000).toFixed(2);
  const name = (o) => { let x = o; const parts = []; for (let i = 0; i < 4 && x; i++, x = x.parent) if (x.name) parts.push(x.name); return parts.join('<') || o.type; };
  let last = performance.now();
  const tick = (t) => { const dt = t - last; last = t; if (dt > 100 && globalThis.__t0 !== null) log.push({ at: at(), step: globalThis.__step, play: !!globalThis.duty?.driver, frame: Math.round(dt) }); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const tryHook = () => {
    const nodes = globalThis.duty?.renderer?._nodes;
    if (!nodes) return setTimeout(tryHook, 20);
    const real = nodes._createNodeBuilder;
    nodes._createNodeBuilder = function (ro, material) {
      const b = real.apply(this, arguments);
      const build = b.build;
      b.build = function () {
        const t = performance.now();
        const r = build.apply(this, arguments);
        const ms = performance.now() - t;
        if (globalThis.__t0 !== null) log.push({ at: at(), step: globalThis.__step, play: !!globalThis.duty?.driver, build: name(ro.object) + ' / ' + material.type + (ro.camera.isOrthographicCamera ? ' (ortho)' : '') + ' #' + material.id, ms: +ms.toFixed(1) });
        return r;
      };
      return b;
    };
  };
  tryHook();
})()`;

const chrome = await launchChrome({ uncapped: rate > 1 });
try {
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const step = (s) => chrome.evaluate(`globalThis.__step = ${JSON.stringify(s)}`);
  const click = (text) =>
    chrome.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.innerText.trim().toUpperCase().startsWith(${JSON.stringify(text.toUpperCase())})); if (!b) return false; b.click(); return true; })()`);
  const key = (type, code) => chrome.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: code.charCodeAt(3) });
  const mouse = (type, button = 'left') => chrome.send('Input.dispatchMouseEvent', { type, x: 960, y: 540, button, clickCount: 1 });
  await chrome.navigate(`${BASE}?nolock`);
  if (!(await chrome.waitFor('globalThis.duty?.game', 60_000))) throw new Error('page did not start');
  await sleep(1500);
  if (rate > 1) await chrome.send('Emulation.setCPUThrottlingRate', { rate });
  await chrome.evaluate('globalThis.__t0 = performance.now(); globalThis.__step = "enter"');
  if (!(await click('Practice Range'))) throw new Error('no Practice Range button');
  await sleep(8000);
  await step('walk');
  await key('keyDown', 'KeyW');
  await sleep(1500);
  await key('keyUp', 'KeyW');
  await step('ads');
  await mouse('mousePressed', 'right');
  await sleep(1000);
  await step('fire');
  for (let i = 0; i < 6; i++) {
    await mouse('mousePressed');
    await sleep(150);
    await mouse('mouseReleased');
    await sleep(250);
  }
  await mouse('mouseReleased', 'right');
  await step('after');
  await sleep(3000);
  const log = JSON.parse(await chrome.evaluate('JSON.stringify(globalThis.__log)'));
  const builds = log.filter((e) => e.build);
  const frames = log.filter((e) => e.frame);
  const byStep = {};
  for (const b of builds) (byStep[b.step] ??= { n: 0, ms: 0 }), byStep[b.step].n++, (byStep[b.step].ms += b.ms);
  console.log('long frames:', JSON.stringify(frames));
  console.log('builds by step:', JSON.stringify(byStep, (k, v) => (typeof v === 'number' ? Math.round(v) : v)));
  for (const b of builds.filter((b) => b.play)) console.log(`  ${b.at}s ${b.step} ${b.ms} ms ${b.build}`);
  console.log('builds before play:', builds.filter((b) => !b.play).length, 'after:', builds.filter((b) => b.play).length);
  console.log('errors:', chrome.errors?.slice?.(0, 3));
} finally {
  await chrome.close();
}
