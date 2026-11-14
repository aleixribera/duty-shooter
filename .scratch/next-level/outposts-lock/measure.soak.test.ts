// Does Survival Town's Outposts lock out? Bot Match size (4 a side), full 10-minute matches, several spawn draws.
// Per match: the points each team made, its captures, the share of the match one team held both zones, the
// longest such stretch, and captures made by the team behind. Run:
//   npx vitest run --config .scratch/next-level/outposts-lock/vitest.config.ts
// MATCHES=<n> SECONDS=<s> MAP=survival-town|switchyard|station-nine
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { botMap } from '../../../apps/range/test/support/bots';
import { BOUNDARY as TOWN, buildSurvivalTown } from '../../../apps/range/src/map/survival-town';
import { BOUNDARY as YARD, buildSwitchyard } from '../../../apps/range/src/map/switchyard';
import { BOUNDARY as STATION, buildStationNine } from '../../../apps/range/src/map/station-nine';

const MATCHES = Number(process.env.MATCHES ?? 8);
const SECONDS = Number(process.env.SECONDS ?? 600);
const PER_TEAM = Number(process.env.PER_TEAM ?? 4);
const OUT = process.env.OUT ?? '.scratch/next-level/outposts-lock/result.json';

it('measures Outposts lock-outs', () => {
  const MAP = process.env.MAP ?? 'survival-town';
  const town = MAP === 'switchyard' ? botMap(buildSwitchyard(), YARD) : MAP === 'station-nine' ? botMap(buildStationNine(), STATION) : botMap(buildSurvivalTown(), TOWN);
  const rows = [];
  for (let k = 0; k < MATCHES; k++) {
    const draw = (k + 0.5) / MATCHES;
    let seed = 1 + k * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const m = createNetworkedMatch({ solids: town.solids, spawns: town.map.spawns.ffa, teamSpawns: town.map.spawns.teams!, zones: town.map.zones, mode: 'outposts', modes: { outposts: { scoreLimit: null, timeLimit: SECONDS, random: () => (draw + rnd() * 0.0001) % 1 } }, bots: { nav: town.nav, perTeam: PER_TEAM, alwaysOn: true } });
    const owner = new Map<string, number>();
    const points = [0, 0, 0];
    const caps = [0, 0, 0];
    let both = 0, run = 0, longest = 0, behindCaps = 0, contested = 0, capturing = 0;
    let ended = false;
    for (let i = 0; i < (SECONDS + 1) * 60 && !ended; i++) {
      m.step();
      for (const e of m.server.modeEvents) {
        if (e.type === 'capture') {
          const behind = points[e.team]! < points[3 - e.team]! - 5;
          if (behind) behindCaps++;
          caps[e.team]!++;
          owner.set(e.zone, e.team);
        }
        if (e.type === 'matchEnd') ended = true;
      }
      for (const t of owner.values()) points[t]! += 1 / 60;
      const obj = m.server.mode.objective();
      if (obj?.kind === 'outposts') for (const z of obj.zones) if (z.contested) contested++; else if (z.capturing) capturing++;
      const owners = [...owner.values()];
      const one = owners.length === (town.map.zones ?? []).length && owners.every((o) => o === owners[0]);
      if (one) { both++; run++; longest = Math.max(longest, run); } else run = 0;
    }
    const row = { draw, points: [Math.floor(points[1]!), Math.floor(points[2]!)], caps: [caps[1], caps[2]], bothHeldPct: Math.round((both / (SECONDS * 60)) * 100), longestBothS: Math.round(longest / 60), behindCaps, contestedS: Math.round(contested / 60), capturingS: Math.round(capturing / 60), kills: [1, 2].map((t) => m.server.mode.scores().filter((x) => x.team === t).reduce((a, x) => a + x.kills, 0)) };
    console.log(JSON.stringify(row));
    rows.push(row);
  }
  const margin = rows.map((r) => Math.abs(r.points[0]! - r.points[1]!));
  const summary = {
    matches: rows.length,
    medianMargin: margin.sort((a, b) => a - b)[Math.floor(margin.length / 2)],
    shutouts: rows.filter((r) => r.caps[0] === 0 || r.caps[1] === 0).length,
    meanBothHeldPct: Math.round(rows.reduce((s, r) => s + r.bothHeldPct, 0) / rows.length),
    worstLongestBothS: Math.max(...rows.map((r) => r.longestBothS)),
    capturesPerMatch: rows.reduce((s, r) => s + r.caps[0]! + r.caps[1]!, 0) / rows.length,
    behindCapsPerMatch: rows.reduce((s, r) => s + r.behindCaps, 0) / rows.length,
  };
  console.log(JSON.stringify(summary));
  writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
}, 3_600_000);
