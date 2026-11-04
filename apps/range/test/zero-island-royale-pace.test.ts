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
      const drops = { announced: 0, landed: 0, opened: 0, at: [] as number[] };
      const reboot = { cards: 0, taken: 0, started: 0, done: 0, back: 0, expired: 0, voided: 0, at: [] as number[] };
      const run = playRoyale(isle, {
        size,
        seed,
        good: process.env['ROYALE_GOOD'] === '1',
        each: (m, out, t) => {
          for (const e of m.server.modeEvents) {
            if (e.type === 'card') {
              if (e.action === 'drop') reboot.cards += 1;
              if (e.action === 'take') reboot.taken += 1;
              if (e.action === 'expire') reboot.expired += 1;
              if (e.action === 'void') reboot.voided += 1;
            }
            if (e.type === 'reboot') {
              if (e.action === 'start') reboot.started += 1;
              if (e.action === 'done') {
                reboot.done += 1;
                reboot.back += e.seats.length;
                reboot.at.push(Math.round(t));
              }
            }
            if (e.type !== 'drop') continue;
            if (e.action === 'announce') drops.announced += 1;
            if (e.action === 'land') drops.landed += 1;
            if (e.action === 'open') {
              drops.opened += 1;
              drops.at.push(Math.round(t));
            }
          }
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
      console.log(`PACE size ${size} seed ${seed}: ${run.length.toFixed(0)} s, Stage ${run.stage}, ${run.result?.reason}, ${run.deaths.length} deaths ${JSON.stringify(byCause)}, ${run.downs} downs, ${run.revives} revives, tick p99 ${run.tick.p99.toFixed(2)} worst ${run.tick.worst.toFixed(1)} ms, wall ${((performance.now() - t0) / 1000).toFixed(0)} s${run.good ? `; proxy ${run.good.won ? 'WON' : `place ${run.good.place}`}, ${run.good.kills} kills` : ''}`);
      console.log(`  Reboot: ${reboot.cards} Cards dropped, ${reboot.taken} taken, ${reboot.expired} ran out, ${reboot.voided} void; ${reboot.started} begun, ${reboot.done} done (${reboot.back} seats back) at ${JSON.stringify(reboot.at)} s`);
      console.log(`  Supply Drops: ${drops.announced} announced, ${drops.landed} landed, ${drops.opened} opened (by bots) at ${JSON.stringify(drops.at)} s`);
      for (const [i, s] of slices.entries()) console.log(`  ${String(i * SLICE).padStart(3)} s: ${String(s.alive).padStart(2)} seats ${String(s.squads).padStart(2)} squads, ${s.outside} outside, nearest enemy ${s.nearest} m, ${JSON.stringify(s.acts)}`);
      const first = run.deaths[0];
      spread.sort((a, b) => a - b);
      console.log(`  first death ${first?.time.toFixed(0)} s; at rest ${rest.cover} in cover, ${rest.open} in the open (${((100 * rest.open) / Math.max(1, rest.cover + rest.open)).toFixed(0)}%); Squad spread median ${spread[Math.floor(spread.length / 2)]?.toFixed(0)} p90 ${spread[Math.floor(spread.length * 0.9)]?.toFixed(0)} m; seat-seconds ${JSON.stringify(seen)}`);
    }
    const proxies = runs.flatMap((r) => (r.good ? [r.good] : []));
    if (proxies.length > 0) console.log(`GOOD-PLAYER PROXY won ${proxies.filter((g) => g.won).length} of ${proxies.length}; mean place ${(proxies.reduce((n, g) => n + (g.place ?? 0), 0) / proxies.length).toFixed(1)}, mean kills ${(proxies.reduce((n, g) => n + g.kills, 0) / proxies.length).toFixed(1)}`);
    const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
    console.log('| Size | Matches | Mean length (s) | Downs | Revived | Finished | Down to Finish median (s) | Finished within 1 s |');
    for (const size of [...new Set(runs.map((r) => r.size))]) {
      const of = runs.filter((r) => r.size === size);
      const downs = of.reduce((n, r) => n + r.downs, 0);
      const revives = of.reduce((n, r) => n + r.revives, 0);
      const finishes = of.flatMap((r) => r.finishes);
      const pct = (n: number) => `${((100 * n) / Math.max(1, downs)).toFixed(0)}%`;
      console.log(`| ${size} | ${of.length} | ${(of.reduce((n, r) => n + r.length, 0) / of.length).toFixed(0)} | ${downs} | ${pct(revives)} | ${pct(finishes.length)} | ${median(finishes).toFixed(2)} | ${finishes.filter((s) => s < 1).length} |`);
    }
    console.log('| Size | Seed | Length (s) | Stage | Ended | Deaths | To the Ring | Downs | Revives | Tick mean | p99 | Worst | Late | Longest stuck (s) |');
    for (const r of runs) console.log(`| ${r.size} | ${r.seed} | ${r.length.toFixed(0)} | ${r.stage} | ${r.result?.reason} | ${r.deaths.length} | ${r.deaths.filter((d) => d.cause === 'ring').length} | ${r.downs} | ${r.revives} | ${r.tick.mean.toFixed(2)} | ${r.tick.p99.toFixed(2)} | ${r.tick.worst.toFixed(1)} | ${r.tick.late} | ${r.stuck.seconds.toFixed(1)} (${r.stuck.who}) |`);
    // Ticket 64's measures, per Squad size over its seeds.
    const quart = (xs: readonly number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? NaN;
    console.log('| Size | Matches | Length mean (min-max) | Ring deaths | Squads out at 25/50/75% (s) | Downs | Revive share | Revives started | Enemy sight / known enemy sight at start | Interrupted | Down to start median (s) | Tick mean | p99 | Late ticks | Longest stuck (s) |');
    for (const size of [...new Set(runs.map((r) => r.size))]) {
      const of = runs.filter((r) => r.size === size);
      const lengths = of.map((r) => r.length);
      const starts = of.flatMap((r) => r.reviveStarts);
      const downs = of.reduce((n, r) => n + r.downs, 0);
      const out = of.map((r) => r.squadsOut);
      const at = (q: number) => (out.reduce((n, o) => n + quart(o, q), 0) / out.length).toFixed(0);
      const pct = (n: number, of: number) => `${n} (${((100 * n) / Math.max(1, of)).toFixed(0)}%)`;
      console.log(
        `| ${size} | ${of.length} | ${(lengths.reduce((a, b) => a + b, 0) / of.length).toFixed(0)} (${Math.min(...lengths).toFixed(0)}-${Math.max(...lengths).toFixed(0)}) | ${of.reduce((n, r) => n + r.deaths.filter((d) => d.cause === 'ring').length, 0)} | ${at(0.25)}/${at(0.5)}/${at(0.75)} | ${downs} | ${pct(of.reduce((n, r) => n + r.revives, 0), downs)} | ${starts.length} | ${pct(starts.filter((s) => s.anySight).length, starts.length)} / ${pct(starts.filter((s) => s.knownSight).length, starts.length)} | ${pct(starts.filter((s) => s.ended === 'interrupted').length, starts.length)} | ${median(starts.map((s) => s.afterDown)).toFixed(1)} | ${(of.reduce((n, r) => n + r.tick.mean, 0) / of.length).toFixed(2)} | ${Math.max(...of.map((r) => r.tick.p99)).toFixed(2)} | ${of.reduce((n, r) => n + r.tick.late, 0)} | ${Math.max(...of.map((r) => r.stuck.seconds)).toFixed(1)} |`,
      );
    }
  }, 3_600_000);
});
