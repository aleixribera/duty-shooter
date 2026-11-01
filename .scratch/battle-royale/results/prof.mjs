// Reads a .cpuprofile from the load target: self time overall, then inclusive
// time inside the slowest ticks.
// Usage: node prof.mjs <dir with .cpuprofile files> [slowTickMs=12]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const slowMs = Number(process.argv[3] ?? 12);
const files = readdirSync(dir).filter((f) => f.endsWith('.cpuprofile')).map((f) => join(dir, f));
const file = files.sort((a, b) => statSync(b).size - statSync(a).size).find((f) => readFileSync(f, 'utf8').includes('"tick"'));
const prof = JSON.parse(readFileSync(file, 'utf8'));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const label = (n) => `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`;
const stacks = new Map();
const stackOf = (id) => {
  let s = stacks.get(id);
  if (s) return s;
  s = [];
  for (let at = id; at !== undefined; at = parent.get(at)) s.unshift(byId.get(at));
  stacks.set(id, s);
  return s;
};
const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
const self = new Map();
let total = 0;
const ticks = [];
let current = null;
for (let i = 0; i < prof.samples.length; i++) {
  const ms = (prof.timeDeltas[i] ?? 0) / 1000;
  const stack = stackOf(prof.samples[i]);
  const leaf = stack[stack.length - 1];
  add(self, label(leaf), ms);
  total += ms;
  const at = stack.findIndex((n) => n.callFrame.functionName === 'tick' && /GameServer|tick/.test(n.callFrame.functionName));
  if (at < 0 && !/garbage collector/.test(leaf.callFrame.functionName)) {
    current = null;
    continue;
  }
  current ??= (ticks.push({ ms: 0, frames: [] }), ticks[ticks.length - 1]);
  current.ms += ms;
  current.frames.push({ ms, stack: at < 0 ? stack : stack.slice(at + 1) });
}
const top = (m, n, of) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(7)} ms ${((v / of) * 100).toFixed(1).padStart(5)}%  ${k}`).join('\n');
console.log(`${file}: ${total.toFixed(0)} ms sampled, ${ticks.length} ticks`);
console.log(`\nself time\n${top(self, 30, total)}`);
const inclusive = (list) => {
  const inc = new Map();
  const selfIn = new Map();
  for (const t of list)
    for (const f of t.frames) {
      for (const k of new Set(f.stack.map(label))) add(inc, k, f.ms);
      if (f.stack.length) add(selfIn, label(f.stack[f.stack.length - 1]), f.ms);
    }
  return { inc, selfIn };
};
const all = inclusive(ticks);
const inTicks = ticks.reduce((s, t) => s + t.ms, 0);
console.log(`\ninclusive in all ticks (${inTicks.toFixed(0)} ms)\n${top(all.inc, 40, inTicks)}`);
const slow = ticks.filter((t) => t.ms >= slowMs);
const inSlow = slow.reduce((s, t) => s + t.ms, 0);
const s = inclusive(slow);
console.log(`\n${slow.length} ticks over ${slowMs} ms, worst ${Math.max(...ticks.map((t) => t.ms)).toFixed(1)}; inclusive (${inSlow.toFixed(0)} ms)\n${top(s.inc, 40, inSlow)}`);

// The slowest ticks one by one, split by the frames that matter.
const names = ['#aim', '#perceive', '#plan', '#follow', '#pickGoal', '#roam', '#planBots', '#watchGrenades', '#considerThrow', '#hear', '#listen', '#stepPlayer', '#broadcast', 'step', '(garbage collector)'];
const worst = [...ticks].sort((a, b) => b.ms - a.ms).slice(0, 15);
for (const t of worst) {
  const parts = new Map();
  for (const f of t.frames) {
    const hit = f.stack.length ? names.find((n) => f.stack.some((x) => x.callFrame.functionName === n)) : '(garbage collector)';
    add(parts, hit ?? 'other', f.ms);
  }
  console.log(`${t.ms.toFixed(1).padStart(6)} ms: ${[...parts].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
}
const sorted = ticks.map((t) => t.ms).sort((a, b) => a - b);
console.log(`profiled tick p50 ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}, p99 ${sorted[Math.floor(sorted.length * 0.99)]?.toFixed(1)}`);
