// Proves a stall rather than assuming one. This process does nothing but sleep
// a millisecond at a time, so when it wakes late the machine, not any game
// code, held it up. Beside that it samples the CPU cap of its own cgroup and
// the kernel's CPU pressure once a second. Run it beside a server (the load
// test does, with CANARY=1) and read the two together by wall clock.
//
// Prints one JSON line a stall, `{"gap":{"at","ms"}}`, then on SIGTERM a
// summary line, `{"summary":{...}}`.
// Usage: node apps/server/scripts/stall-canary.mjs [late-ms=3]
import { readFileSync } from 'node:fs';

const lateMs = Number(process.argv[2] ?? 3);
const sleep = new Int32Array(new SharedArrayBuffer(4));

/** Every cgroup above this process that keeps cpu.stat: a cap on a parent slice stalls it just the same. */
function cgroups() {
  const path = readFileSync('/proc/self/cgroup', 'utf8').trim().split(':').at(-1);
  const parts = path.split('/').filter(Boolean);
  return parts.map((_, i) => `/sys/fs/cgroup/${parts.slice(0, i + 1).join('/')}`);
}

const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

const stat = (text, key) => Number(new RegExp(`^${key} (\\d+)`, 'm').exec(text)?.[1] ?? 0);

/** Time the cap held anything back, and processes waited for a CPU, in microseconds so far. */
function sample() {
  const stats = cgroups().map((dir) => read(`${dir}/cpu.stat`));
  return {
    throttled: Math.max(0, ...stats.map((s) => stat(s, 'throttled_usec'))),
    periods: Math.max(0, ...stats.map((s) => stat(s, 'nr_throttled'))),
    pressure: Number(/some .*total=(\d+)/.exec(read('/proc/pressure/cpu'))?.[1] ?? 0),
  };
}

const first = sample();
let last = first;
const started = performance.now();
const gaps = [];
let wakes = 0;
let throttledSeconds = 0;
let woke = performance.now();
let sampled = woke;
let stopping = false;
process.on('SIGTERM', () => (stopping = true));

// Atomics.wait holds up signal handlers too, so it gives way a moment every 200 ms.
const round = (n) => Math.round(n * 100) / 100;
function run() {
  const until = performance.now() + 200;
  while (performance.now() < until) {
    Atomics.wait(sleep, 0, 0, 1);
    const now = performance.now();
    const ms = now - woke;
    if (ms >= lateMs) {
      const gap = { at: Math.round(performance.timeOrigin + woke), ms: round(ms) };
      gaps.push(gap);
      console.log(JSON.stringify({ gap }));
    }
    woke = now;
    wakes += 1;
    if (now - sampled >= 1000) {
      sampled = now;
      const next = sample();
      if (next.throttled > last.throttled) throttledSeconds += 1;
      last = next;
    }
  }
  if (!stopping) {
    setImmediate(run);
    return;
  }
  const end = sample();
  const sorted = gaps.map((g) => g.ms).sort((a, b) => b - a);
  console.log(
    JSON.stringify({
      summary: {
        seconds: round((performance.now() - started) / 1000),
        wakes,
        stalls: gaps.length,
        worst: sorted[0] ?? 0,
        over8: sorted.filter((ms) => ms >= 8).length,
        over16: sorted.filter((ms) => ms >= 16.7).length,
        capThrottledMs: Math.round((end.throttled - first.throttled) / 1000),
        capPeriods: end.periods - first.periods,
        throttledSeconds,
        cpuPressureMs: Math.round((end.pressure - first.pressure) / 1000),
      },
    }),
  );
  process.exit(0);
}
run();
