// Ticket 35: what the main thread does in its long stretches without a break (the hitches), from a
// .cpuprofile: each run of samples with no idle longer than `min` ms, and the functions taking most of
// those runs, inclusive.
//   node hitches.mjs <file.cpuprofile> [min ms = 150]
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const min = Number(process.argv[3] ?? 150);
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\/(src|deps)\//, '$1/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
const idle = (id) => ['(idle)', '(program)', '(garbage collector)'].includes(byId.get(id).callFrame.functionName) && byId.get(id).callFrame.functionName === '(idle)';

const runs = [];
let start = -1;
let t = 0;
let span = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = (profile.timeDeltas[i] ?? 0) / 1000;
  t += dt;
  if (idle(profile.samples[i])) {
    if (start >= 0 && span >= min) runs.push([start, i, span]);
    start = -1;
    span = 0;
  } else {
    if (start < 0) start = i;
    span += dt;
  }
}
console.log(`${runs.length} runs over ${min} ms: ${runs.map((r) => r[2].toFixed(0)).join(', ')}`);
const incl = new Map();
let total = 0;
for (const [a, b] of runs) {
  for (let i = a; i < b; i++) {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    total += dt;
    const seen = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const k = name(byId.get(id));
      if (seen.has(k)) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + dt);
    }
  }
}
for (const [k, ms] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(`${((ms / total) * 100).toFixed(1).padStart(5)}%  ${ms.toFixed(0).padStart(6)} ms  ${k}`);
