// Inclusive time of each function (by name and line) in a .cpuprofile, the top ones.
//   node inclusive.mjs <file.cpuprofile> [filter regex]
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\/(src|deps)\//, '$1/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
const incl = new Map();
let total = 0;
for (let i = 0; i < profile.samples.length; i++) {
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
const rows = [...incl.entries()].filter(([k]) => !filter || filter.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 70);
for (const [k, ms] of rows) console.log(`${((ms / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
