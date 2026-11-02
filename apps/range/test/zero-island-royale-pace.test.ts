import { describe, it } from 'vitest';
import { coverOf, nearestNode } from '@duty-shooter/fps-core';
import { ringAt, type BattleRoyale } from '@duty-shooter/fps-core/modes';
import { island, playRoyale, type RoyaleRun } from './support/royale';

/** `ROYALE_PACE=1:1,2:1,3:1` plays those size:seed matches in full and prints what they came to. A whole match takes about 20 s, so nothing runs without it. */
const WANTED = process.env['ROYALE_PACE'];
const SLICE = 30;

describe.skipIf(!WANTED)('Battle Royale pace', () => {
  it('prints what whole matches came to', () => {
    const isle = island();
    const runs: RoyaleRun[] = [];
    for (const pair of WANTED!.split(',')) {
      const [size, seed] = pair.split(':').map(Number) as [1 | 2 | 3, number];
      const slices: { alive: number; squads: number; outside: number; acts: Record<string, number>; nearest: number }[] = [];
      const t0 = performance.now();
      const rest = { cover: 0, open: 0 };
      const seen: Record<string, number> = {};
      const spread: number[] = [];
      const run = playRoyale(isle, {
        size,
        seed,
        good: process.env['ROYALE_GOOD'] === '1',
        each: (m, out, t) => {
          if (Math.round(t * 60) % 60 === 0) {
            const standing = out.players.filter((p) => p.alive && !p.downed);
            for (const p of standing) {
              const a = m.server.bots.get(p.id)?.bot.activity ?? 'person';
              seen[a] = (seen[a] ?? 0) + 1;
              if (Math.hypot(p.velocity[0], p.velocity[2]) < 0.5 && a !== 'fight' && a !== 'throw' && a !== 'use') {
                const bits = coverOf(isle.nav, nearestNode(isle.nav, isle.world, p.position));
                if (bits.low !== 0) rest.cover += 1;
                else rest.open += 1;
              }
            }
            const teams = new Map<number, typeof standing>();
            for (const p of standing) teams.set(p.team, [...(teams.get(p.team) ?? []), p]);
            for (const list of teams.values()) for (const p of list.slice(1)) spread.push(Math.hypot(p.position[0] - list[0]!.position[0], p.position[2] - list[0]!.position[2]));
          }
          if (Math.round(t * 60) % (SLICE * 60) !== 0) return;
          const living = out.players.filter((p) => p.alive);
          const ring = ringAt((m.server.mode as BattleRoyale).ring, t);
          const acts: Record<string, number> = {};
          let sum = 0;
          for (const p of living) {
            const a = m.server.bots.get(p.id)?.bot.activity ?? 'person';
            acts[a] = (acts[a] ?? 0) + 1;
            let near = Infinity;
            for (const q of living) if (q.team !== p.team) near = Math.min(near, Math.hypot(p.position[0] - q.position[0], p.position[2] - q.position[2]));
            if (near < Infinity) sum += near;
          }
          slices.push({
            alive: living.length,
            squads: new Set(living.map((p) => p.team)).size,
            outside: living.filter((p) => Math.hypot(p.position[0] - ring.x, p.position[2] - ring.z) > ring.radius).length,
            acts,
            nearest: Math.round(sum / Math.max(1, living.length)),
          });
        },
      });
      runs.push(run);
      const byCause: Record<string, number> = {};
      for (const d of run.deaths) byCause[d.cause] = (byCause[d.cause] ?? 0) + 1;
      console.log(`PACE size ${size} seed ${seed}: ${run.length.toFixed(0)} s, Stage ${run.stage}, ${run.result?.reason}, ${run.deaths.length} deaths ${JSON.stringify(byCause)}, ${run.downs} downs, ${run.revives} revives, tick p99 ${run.tick.p99.toFixed(2)} worst ${run.tick.worst.toFixed(1)} ms, wall ${((performance.now() - t0) / 1000).toFixed(0)} s`);
      for (const [i, s] of slices.entries()) console.log(`  ${String(i * SLICE).padStart(3)} s: ${String(s.alive).padStart(2)} seats ${String(s.squads).padStart(2)} squads, ${s.outside} outside, nearest enemy ${s.nearest} m, ${JSON.stringify(s.acts)}`);
      const first = run.deaths[0];
      spread.sort((a, b) => a - b);
      console.log(`  first death ${first?.time.toFixed(0)} s; at rest ${rest.cover} in cover, ${rest.open} in the open (${((100 * rest.open) / Math.max(1, rest.cover + rest.open)).toFixed(0)}%); Squad spread median ${spread[Math.floor(spread.length / 2)]?.toFixed(0)} p90 ${spread[Math.floor(spread.length * 0.9)]?.toFixed(0)} m; seat-seconds ${JSON.stringify(seen)}`);
    }
    const proxies = runs.flatMap((r) => (r.good ? [r.good] : []));
    if (proxies.length > 0) console.log(`GOOD-PLAYER PROXY won ${proxies.filter((g) => g.won).length} of ${proxies.length}; mean place ${(proxies.reduce((n, g) => n + (g.place ?? 0), 0) / proxies.length).toFixed(1)}, mean kills ${(proxies.reduce((n, g) => n + g.kills, 0) / proxies.length).toFixed(1)}`);
    console.log('| Size | Seed | Length (s) | Stage | Ended | Deaths | To the Ring | Downs | Revives | Tick p99 | Worst |');
    for (const r of runs) console.log(`| ${r.size} | ${r.seed} | ${r.length.toFixed(0)} | ${r.stage} | ${r.result?.reason} | ${r.deaths.length} | ${r.deaths.filter((d) => d.cause === 'ring').length} | ${r.downs} | ${r.revives} | ${r.tick.p99.toFixed(2)} | ${r.tick.worst.toFixed(1)} |`);
  }, 3_600_000);
});
