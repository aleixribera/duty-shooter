// Probe (not a test of the suite): how soon after the countdown the first kill lands, and how many enemy pairs see each other at T0.
// Run: copy to apps/range/test/first-blood.probe.test.ts, then MAPS=station,switchyard,town MODES=ffa,gungame SEEDS=48 SEED0=101 PER=3 npx vitest run apps/range/test/first-blood.probe.test.ts --project fast --disableConsoleIntercept
import { it } from 'vitest';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { sightBlocked, type ModeId } from '@duty-shooter/fps-core';
import { botMap } from './support/bots';
import { BOUNDARY as SN, buildStationNine } from '../src/map/station-nine';
import { BOUNDARY as SY, buildSwitchyard } from '../src/map/switchyard';
import { BOUNDARY as ST, buildSurvivalTown } from '../src/map/survival-town';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const maps = (process.env.MAPS ?? 'station,switchyard,town').split(',');
const modes = (process.env.MODES ?? 'ffa,gungame').split(',') as ModeId[];
const SEEDS = Number(process.env.SEEDS ?? 8);
const PER = Number(process.env.PER ?? 3);

it('first blood', () => {
  const all = { station: () => botMap(buildStationNine(), SN), switchyard: () => botMap(buildSwitchyard(), SY), town: () => botMap(buildSurvivalTown(), ST) } as const;
  for (const name of maps) {
    const b = all[name as keyof typeof all]();
    for (const mode of modes) {
      const firsts: string[] = [];
      let seen0 = 0;
      for (let s = 1; s <= SEEDS; s++) {
        const random = rng(s * 7919 + Number(process.env.SEED0 ?? 0));
        const m = createNetworkedMatch({
          solids: b.solids,
          ladders: b.map.ladders ?? [],
          spawns: process.env.UNION ? [...b.map.spawns.ffa, ...b.map.spawns.teams!.flat()] : b.map.spawns.ffa,
          teamSpawns: b.map.spawns.teams!,
          zones: b.map.zones,
          sites: b.map.sites,
          mode,
          countdown: 5,
          modes: { tdm: { random }, ffa: { random }, outposts: { random }, charge: { random } },
          maxPlayers: PER * 2,
          bots: { nav: b.nav, perTeam: PER, maxPerTeam: PER, alwaysOn: true },
        });
        let first = '';
        let startT: number | null = null;
        for (let i = 0; i < 30 * 60 && !first; i++) {
          const out = m.step();
          const sim = m.server.simulation;
          const counting = (m.server as unknown as { snapshotInfo?: unknown }) && false;
          void counting;
          if (startT === null && i === 0) startT = sim.time + 5;
          if (i === 5 * 60 - 2) {
            // At the countdown's end: pairs of enemies that see each other.
            const ps = out.players.filter((p) => p.alive && p.kind === 'player');
            for (let a = 0; a < ps.length; a++)
              for (let c = a + 1; c < ps.length; c++) {
                const A = ps[a]!, C = ps[c]!;
                if (mode !== 'ffa' && mode !== 'gungame' && A.team === C.team) continue;
                const ea: [number, number, number] = [A.position[0], A.position[1] + A.eyeHeight, A.position[2]];
                const ec: [number, number, number] = [C.position[0], C.position[1] + C.eyeHeight, C.position[2]];
                if (!sightBlocked(m.server.simulation.world, ea, ec)) seen0 += 1;
              }
          }
          for (const e of m.server.modeEvents) {
            if (e.type === 'killFeed' && !first) {
              const k = out.players.find((p) => p.id === e.killer);
              const v = out.players.find((p) => p.id === e.victim);
              first = `${(sim.time - startT!).toFixed(1)}s ${k ? k.position.map((x) => x.toFixed(0)).join(',') : '-'} > ${v ? v.position.map((x) => x.toFixed(0)).join(',') : '-'}`;
            }
          }
        }
        firsts.push(first || '>25s');
      }
      const t = firsts.map((f) => (f.startsWith('>') ? 25 : parseFloat(f))).sort((a, b) => a - b);
      console.log(`${name} ${mode} x${PER * 2}: in sight at T0 ${seen0}/${SEEDS} runs; first kill median ${t[t.length >> 1]!.toFixed(1)} s, under 2 s ${t.filter((x) => x < 2).length}, under 3 s ${t.filter((x) => x < 3).length}`);
    }
  }
}, 600_000);
