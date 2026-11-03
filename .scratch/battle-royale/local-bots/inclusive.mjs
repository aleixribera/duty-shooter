// Inclusive time per function in a .cpuprofile: node inclusive.mjs file.cpuprofile [filter]
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const time = new Map();
let total = 0;
p.samples.forEach((id, i) => {
  const d = p.timeDeltas[i] ?? 0;
  total += d;
  const seen = new Set();
  for (let at = id; at !== undefined; at = parent.get(at)) {
    const f = byId.get(at).callFrame;
    const key = `${f.functionName || '(anon)'}:${f.lineNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    time.set(key, (time.get(key) ?? 0) + d);
  }
});
const re = process.argv[3] ? new RegExp(process.argv[3]) : null;
console.log([...time].filter(([k]) => !re || re.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, v]) => `${(v / total * 100).toFixed(1).padStart(5)}% ${k}`).join('\n'));
