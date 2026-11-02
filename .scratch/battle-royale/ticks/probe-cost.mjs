// What the tick profiler costs a fast tick: start, seven phases, 58 bots thinking, end.
import { TickProfiler, noFacts } from '../../../packages/fps-core/src/net/tick-profile.ts';
const p = new TickProfiler({ now: () => performance.now(), cpu: () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; }, slowMs: 1e9, onSlow: () => {} });
const facts = noFacts(); const phases = ['input', 'plan', 'think', 'sim', 'mode', 'events', 'send'];
const ids = Array.from({ length: 58 }, (_, i) => `p${i}`);
const tick = () => { p.start(); p.phase('input'); p.phase('plan'); for (const id of ids) p.thought(id, 'roam'); for (const ph of phases.slice(3)) p.phase(ph); p.end(facts); p.flush(); };
for (let i = 0; i < 20000; i++) tick();
const n = 50000; const t = performance.now(); for (let i = 0; i < n; i++) tick();
console.log(`${(((performance.now() - t) / n) * 1000).toFixed(1)} us a tick with 58 bots`);
