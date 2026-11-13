import { it } from 'vitest';
import { STATS, TICK_SECONDS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { holding } from './support/arsenal';
import { SHOOTER, eventsOf, shotTime } from './support/combat';

/** Clicks at a human cadence (mean, sd in ms); how many fire, and how long the first three take. */
function trial(seed: number, mean: number, sd: number) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const presses: number[] = [];
  let t = 0;
  for (let i = 0; i < 10; i++) {
    presses.push(t);
    t += Math.max(0.06, (mean + sd * gauss()) / 1000);
  }
  const m = holding('pistol');
  const outputs = [];
  for (let tick = 0; tick < Math.ceil((t + 0.4) / TICK_SECONDS); tick++) {
    const t0 = tick * TICK_SECONDS;
    const inTick = presses.filter((p) => p >= t0 && p < t0 + TICK_SECONDS).map((p) => (p - t0) / TICK_SECONDS);
    outputs.push(m.step({ [SHOOTER]: usercmd({ firePresses: inTick }) }));
  }
  const shots = eventsOf(outputs, 'shot');
  const third = shotTime(shots[2]!) - shotTime(shots[0]!);
  const fourth = shotTime(shots[3]!) - shotTime(shots[0]!);
  return { fired: shots.length, third, fourth };
}

it('pistol clicks at a human cadence', () => {
  const buffer = STATS.weapon.pressBuffer as { value: number };
  const keep = buffer.value;
  const lines: string[] = [];
  for (const b of [0, keep]) {
    buffer.value = b;
    for (const [mean, sd] of [[130, 25], [150, 25], [170, 25]] as const) {
      let fired = 0;
      let third = 0;
      let fourth = 0;
      const n = 60;
      for (let i = 0; i < n; i++) {
        const r = trial(i + 1, mean, sd);
        fired += r.fired;
        third += r.third;
        fourth += r.fourth;
      }
      lines.push(`buffer ${b * 1000} ms, clicks every ${mean}±${sd} ms: ${((fired / (n * 10)) * 100).toFixed(0)} % of clicks fire, three shots take ${((third / n) * 1000).toFixed(0)} ms, four ${((fourth / n) * 1000).toFixed(0)} ms`);
    }
  }
  buffer.value = keep;
  console.log(lines.join('\n'));
});
