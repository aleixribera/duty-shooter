// Ticket 76: frame time with several snipers firing in view (fake shot events from SNIPERS shooters
// spread 30-90 m out, each firing across the view every 1.2 s), against the same seconds without.
//   remote-test --local "node .scratch/battle-royale/t76/bench.mjs"   (BASE, MAP, SNIPERS, SECS, QUERY)
import { launchChrome, sleep } from '../../../apps/range/scripts/chrome.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5191/';
const MAP = process.env.MAP ?? 'zero-island';
const N = Number(process.env.SNIPERS ?? 8);
const SECS = Number(process.env.SECS ?? 10);
const chrome = await launchChrome();
let failed = false;
try {
  await chrome.navigate(`${BASE}?explore=${MAP}&nolock${process.env.QUERY ? '&' + process.env.QUERY : ''}`);
  if (!(await chrome.waitFor('!!globalThis.duty?.game?.player?.alive', 240000, 500))) throw new Error('no player');
  await sleep(6000);
  await chrome.evaluate(`(() => {
    duty.game.input.setAngles(${Number(process.env.YAW ?? -0.65)}, 0);
    const d = duty.driver; const tick = d.tick.bind(d);
    globalThis.__snipe = false; let k = 0;
    d.tick = (cmd) => {
      const r = tick(cmd);
      if (!globalThis.__snipe) return r;
      k++;
      const me = duty.game.player; const yaw = duty.game.input.angles.yaw;
      const f = [-Math.sin(yaw), 0, -Math.cos(yaw)], rt = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const extra = [];
      for (let i = 0; i < ${N}; i++) {
        if ((k + i * 9) % 72 !== 0) continue; // every 1.2 s each, staggered
        const along = 30 + (i % 4) * 20, side = (i % 2 ? 1 : -1) * (25 + i * 3);
        const o = [me.position[0] + f[0] * along + rt[0] * side, me.position[1] + 5 + (i % 3) * 2, me.position[2] + f[2] * along + rt[2] * side];
        const dir = [-rt[0] * Math.sign(side) + f[0] * 0.3, -0.005, -rt[2] * Math.sign(side) + f[2] * 0.3];
        const l = Math.hypot(...dir);
        extra.push({ type: 'shot', shooter: 'sniper' + i, weapon: 'sniper', origin: o, direction: dir.map((v) => v / l), index: 0, fraction: 0 });
      }
      return extra.length ? { ...r, events: [...r.events, ...extra] } : r;
    };
    return 1;
  })()`);
  const measure = async (label) => {
    await chrome.evaluate(`(() => { const t = []; let last = performance.now(); let smoke = 0; globalThis.__ft = t; globalThis.__smokeMax = 0;
      const loop = (now) => { t.push(now - last); last = now; globalThis.__smokeMax = Math.max(globalThis.__smokeMax, duty.game.tracers.smoke); if (globalThis.__ft === t) requestAnimationFrame(loop); };
      requestAnimationFrame(loop); return 1; })()`);
    await sleep(SECS * 1000);
    const r = JSON.parse(await chrome.evaluate(`(() => { const t = globalThis.__ft.slice(5).sort((a, b) => a - b); globalThis.__ft = null;
      const mean = t.reduce((a, b) => a + b, 0) / t.length; return JSON.stringify({ frames: t.length, mean: +mean.toFixed(2), p50: +t[Math.floor(t.length * 0.5)].toFixed(2), p99: +t[Math.floor(t.length * 0.99)].toFixed(2), smokeMax: globalThis.__smokeMax, fired: duty.game.tracers.fired }); })()`));
    console.log(label, JSON.stringify(r));

  };
  for (let round = 0; round < 2; round++) {
    await chrome.evaluate('globalThis.__snipe = false, 1');
    await sleep(2500);
    await measure('quiet  ');
    await chrome.evaluate('globalThis.__snipe = true, 1');
    await sleep(2500);
    await measure(`${N} snipers`);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await chrome.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
