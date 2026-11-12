// The call paths leading to a function in a .cpuprofile, by inclusive time.
//   node callers.mjs <file.cpuprofile> <name regex> [depth]
import { readFileSync } from 'node:fs';

const p = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const target = new RegExp(process.argv[3]);
const depth = Number(process.argv[4] ?? 8);
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\/(src|deps)\//, '$1/').replace(/\?.*$/, '')}:${n.callFrame.lineNumber + 1}`;
const self = new Map();
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000);
const incl = new Map();
// Iterative post-order: deep stacks overflow a recursive walk.
const order = [];
const stack = [p.nodes[0].id];
while (stack.length) {
  const id = stack.pop();
  order.push(id);
  for (const c of byId.get(id).children ?? []) stack.push(c);
}
for (let i = order.length - 1; i >= 0; i--) {
  const n = byId.get(order[i]);
  let s = self.get(n.id) ?? 0;
  for (const c of n.children ?? []) s += incl.get(c) ?? 0;
  incl.set(n.id, s);
}
const paths = new Map();
for (const n of p.nodes) {
  if (!target.test(name(n))) continue;
  let a = parent.get(n.id);
  let nested = false;
  while (a !== undefined) {
    if (target.test(name(byId.get(a)))) { nested = true; break; }
    a = parent.get(a);
  }
  if (nested) continue;
  const chain = [];
  let x = parent.get(n.id);
  while (x !== undefined && chain.length < depth) { chain.push(name(byId.get(x))); x = parent.get(x); }
  const k = chain.join('\n   <- ');
  paths.set(k, (paths.get(k) ?? 0) + incl.get(n.id));
}
for (const [k, ms] of [...paths].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`${ms.toFixed(0)} ms:\n   <- ${k}\n`);
