// Ticket 35: what one thing costs the GPU, measured in one page by switching it off and on every
// `period` ms and adding up each pass's GPU time by the state it was drawn in. Doing both in the same
// page keeps the GPU's clocks and the PC's other load out of the difference, which separate runs do not.
//   node .scratch/next-level/one-picture/gpu-toggle.mjs <what> [map] [spot] [dpr=2] [cycles=8] [period=2500]
// what: `sky` (the scene's background drawn or not), `lights` (the point lights shown or not).
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173/';
const what = process.argv[2] ?? 'sky';
const map = process.argv[3] ?? 'survival-town';
const spot = process.argv[4] ?? 'cul-de-sac';
const dpr = Number(process.argv[5] ?? 2);
const cycles = Number(process.argv[6] ?? 8);
const period = Number(process.argv[7] ?? 2500);
const HMR_SHIELD = `(() => { const Real = WebSocket; const hmr = (p) => p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')); globalThis.WebSocket = new Proxy(Real, { construct(target, args) { if (hmr(args[1])) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new target(...args); } }); })()`;

const chrome = await launchChrome();
try {
  if (dpr !== 1) await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: dpr, mobile: false });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HMR_SHIELD });
  await chrome.navigate(new URL(`?map=${map}&spot=${encodeURIComponent(spot)}&stats&hz=1000`, BASE).toString());
  if (!(await chrome.waitFor('globalThis.duty?.game', 180_000))) throw new Error('no game');
  await chrome.waitFor('document.body.dataset.bake', 180_000);
  await sleep(8000);
  const out = await chrome.evaluate(`new Promise((done) => {
    const r = duty.renderer;
    const backend = r.backend;
    let world = null;
    const realDirect = r._renderObjectDirect;
    r._renderObjectDirect = function (object) {
      let o = object; while (o.parent) o = o.parent;
      if (o.isScene && o.children.length >= 10) { world = o; r._renderObjectDirect = realDirect; }
      return realDirect.apply(this, arguments);
    };
    let on = true;
    let counting = false;
    let sky = null;
    const set = (v) => {
      on = v;
      if (!world) return;
      if ('${what}' === 'sky') { sky ??= world.backgroundNode; world.backgroundNode = v ? sky : null; }
      if ('${what}' === 'lights') world.traverse((x) => { if (x.isPointLight) x.visible = v; });
    };
    const names = new Map();
    const stateOf = new Map();
    const realBegin = backend.beginRender;
    backend.beginRender = function (ctx) {
      const t = ctx.renderTarget;
      const name = t ? (t.texture?.name || 'rt') + ' ' + t.width + 'x' + t.height + (t.samples > 1 ? ' x' + t.samples : '') : 'screen';
      const result = realBegin.apply(this, arguments);
      const uid = backend.get(ctx).timestampUID;
      if (uid) { names.set(uid.split(':f')[0], name); stateOf.set(uid, counting ? (on ? 'on' : 'off') : 'skip'); }
      return result;
    };
    const sums = { on: new Map(), off: new Map() };
    const frames = { on: new Set(), off: new Set() };
    const pool = backend.timestampQueryPool.render;
    const realResolve = pool._resolveQueries.bind(pool);
    pool._resolveQueries = async function () {
      const total = await realResolve();
      for (const [uid, ms] of pool.timestamps) {
        const state = stateOf.get(uid); stateOf.delete(uid);
        if (state !== 'on' && state !== 'off') continue;
        const [, id, frame] = uid.match(/^(.*):f(\\d+)$/);
        const key = names.get(id) ?? ('ctx ' + id);
        sums[state].set(key, (sums[state].get(key) ?? 0) + ms);
        frames[state].add(frame);
      }
      return total;
    };
    // Switch a while first so both states' shaders exist, then count, skipping the frames around each switch.
    let step = 0;
    const tick = () => {
      step++;
      counting = false;
      set(!on);
      if (step > 2 * ${cycles} + 2) {
        backend.beginRender = realBegin;
        const keys = [...new Set([...sums.on.keys(), ...sums.off.keys()])];
        const per = (s, k) => (sums[s].get(k) ?? 0) / Math.max(1, frames[s].size);
        const rows = keys.map((k) => [k, per('on', k), per('off', k)]).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([k, a, b]) => a.toFixed(3).padStart(7) + ' on ' + b.toFixed(3).padStart(7) + ' off ' + (a - b).toFixed(3).padStart(7) + ' diff  ' + k);
        const total = (s) => [...sums[s].values()].reduce((a, b) => a + b, 0) / Math.max(1, frames[s].size);
        done(JSON.stringify({ frames: [frames.on.size, frames.off.size], onMs: total('on').toFixed(3), offMs: total('off').toFixed(3), rows }, null, 1));
        return;
      }
      setTimeout(() => { if (step > 2) counting = true; }, 400);
      setTimeout(tick, ${period});
    };
    setTimeout(tick, 500);
  })`);
  console.log(`${what} ${map} ${spot}`, out);
} finally {
  await chrome.close();
}
