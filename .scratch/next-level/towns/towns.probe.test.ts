import { appendFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { planRing, playGround, stageAt, type BattleRoyale } from '@duty-shooter/fps-core/modes';
import { island, playRoyale } from './support/royale';
import { CORES, REGION_IDS } from '../src/map/zero-island-terrain';

/**
 * Request 3's measure (pass 25): where Battle Royale's last circle closes and
 * where its kills happen, against Zero Island's Cores (its towns).
 * `TOWNS_OUT=<file> TOWNS_SEEDS=1-6 npx vitest run apps/range/test/towns.probe.test.ts`
 */
const OUT = process.env['TOWNS_OUT'] ?? 'towns.txt';
const [lo, hi] = (process.env['TOWNS_SEEDS'] ?? '1-6').split('-').map(Number) as [number, number];
const EDGE = 15;
const seededRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const towns = REGION_IDS.map((id) => ({ x: CORES[id].x, z: CORES[id].z, radius: CORES[id].radius }));
const inTown = (x: number, z: number, edge = 0) => towns.some((t) => Math.hypot(x - t.x, z - t.z) <= t.radius + edge);
const say = (line: string) => {
  console.log(line);
  appendFileSync(OUT, line + '\n');
};

it('final circles and kills against the towns', () => {
  writeFileSync(OUT, '');
  const isle = island();
  // Before request 3 the ground had no towns and planRing ignored the extra argument; after, the ground carries them.
  const ground = playGround(isle.nav, isle.world, towns);
  // The Ring alone, over many seeds: where the last circle closes, and where Stage 4's circle stands.
  let finals = 0;
  let s4 = 0;
  const N = 400;
  for (let seed = 1; seed <= N; seed++) {
    const plan = (planRing as (...a: unknown[]) => ReturnType<typeof planRing>)(ground, seededRandom(seed), 600, towns);
    const last = plan.at(-1)!.to;
    if (inTown(last.x, last.z)) finals += 1;
    const four = plan[3]!.to;
    if (towns.some((t) => Math.hypot(four.x - t.x, four.z - t.z) <= four.radius)) s4 += 1;
  }
  say(`RING over ${N} plans: last circle closes in a town ${((100 * finals) / N).toFixed(0)}%, Stage 4's circle holds a town's middle ${((100 * s4) / N).toFixed(0)}%`);
  const total = { kills: 0, town: 0, late: 0, lateTown: 0, finalsInTown: 0, matches: 0, ring: 0 };
  for (const size of [1, 2, 3] as const) {
    for (let seed = lo; seed <= hi; seed++) {
      let plan: BattleRoyale['ring'] = [];
      const run = playRoyale(isle, { size, seed, each: (m) => { if (plan.length === 0) plan = (m.server.mode as BattleRoyale).ring; } });
      const kills = run.deaths.filter((d) => d.cause !== 'ring' && d.cause !== 'bleedOut' && d.cause !== 'wipe' && d.cause !== 'fall');
      const town = kills.filter((d) => inTown(d.at[0], d.at[1], EDGE));
      const late = kills.filter((d) => stageAt(plan, d.time) >= 3);
      const lateTown = late.filter((d) => inTown(d.at[0], d.at[1], EDGE));
      const last = plan.at(-1)!.to;
      const fin = inTown(last.x, last.z);
      total.kills += kills.length;
      total.town += town.length;
      total.late += late.length;
      total.lateTown += lateTown.length;
      total.finalsInTown += fin ? 1 : 0;
      total.matches += 1;
      total.ring += run.deaths.filter((d) => d.cause === 'ring').length;
      say(`size ${size} seed ${seed}: ${run.length.toFixed(0)} s, ${run.result?.reason}; final circle ${fin ? 'IN' : 'out of'} a town (${last.x.toFixed(0)},${last.z.toFixed(0)}); kills ${kills.length}, in towns ${town.length}; Stage 4 on ${late.length}, in towns ${lateTown.length}; ring deaths ${run.deaths.filter((d) => d.cause === 'ring').length}; stuck ${run.stuck.seconds.toFixed(0)} s (${run.stuck.who})`);
    }
  }
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;
  say(`TOTAL ${total.matches} matches: final circle in a town ${pct(total.finalsInTown, total.matches)}; kills in towns ${total.town}/${total.kills} (${pct(total.town, total.kills)}); from Stage 4 on ${total.lateTown}/${total.late} (${pct(total.lateTown, total.late)}); ring deaths ${total.ring}`);
}, 3_600_000);
