import { it } from 'vitest';
import { sightBlocked, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { mapSolids } from '../src/map/definition';
import { buildStationNine } from '../src/map/station-nine';
import { buildSwitchyard } from '../src/map/switchyard';
import { buildSurvivalTown } from '../src/map/survival-town';
it('meets', () => {
  for (const [name, map] of [['town', buildSurvivalTown()], ['station', buildStationNine()], ['yard', buildSwitchyard()]] as const) {
    const world = createWorld(mapSolids(map), { ladders: map.ladders ?? [] });
    const spots = map.spawns.ffa;
    const H = 1.6;
    const strideAll = (s: (typeof spots)[number], dirs: number[]) => {
      const f: Vec3 = [s.position[0], H, s.position[2]];
      const out: Vec3[] = [f];
      for (const a of dirs) { const t: Vec3 = [f[0] + Math.cos(a) * 5, H, f[2] + Math.sin(a) * 5]; if (!sightBlocked(world, f, t)) out.push(t); }
      return out;
    };
    for (const mode of ['all', 'facing'] as const) {
      const st = spots.map((s) => strideAll(s, mode === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k * Math.PI) / 4) : [-0.6, 0, 0.6].map((d) => { const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw); return Math.atan2(fz, fx) + d; })));
      let sees = 0, meets = 0, pairs = 0;
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        pairs++;
        if (!sightBlocked(world, st[i]![0]!, st[j]![0]!)) sees++;
        if (st[i]!.some((a) => st[j]!.some((b) => !sightBlocked(world, a, b)))) meets++;
      }
      console.log(name, mode, spots.length, 'pairs', pairs, 'sees', sees, 'meets', meets);
    }
    const fmt = (s: (typeof spots)[number]) => `${s.position[0].toFixed(1)},${s.position[2].toFixed(1)} yaw ${s.yaw.toFixed(2)}`;
    if (name === 'town') console.log(spots.map(fmt).join(' | '));
  }
});
