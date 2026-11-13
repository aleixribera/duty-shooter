// Probe (not a test of the suite): each match-map spawn's yaw and close view. Run: copy to apps/range/test/, then OUT=<file> npx vitest run apps/range/test/probe.test.ts --project fast
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createWorld, type SpawnPoint } from '@duty-shooter/fps-core';
import { buildMapById, mapSolids, MATCH_MAPS } from '../src/map/maps';
import * as sf from '../src/map/spawn-facing';

it('probe', () => {
  const lines: string[] = [];
  for (const id of MATCH_MAPS) {
    const map = buildMapById(id);
    const world = createWorld(mapSolids(map));
    const sets: [string, readonly SpawnPoint[]][] = [['ffa', map.spawns.ffa], ...(map.spawns.teams ?? []).map((s, i): [string, readonly SpawnPoint[]] => [`t${i + 1}`, s])];
    for (const [name, set] of sets) for (const s of set) {
      const v = (sf as any).closeView?.(world, s.position, s.yaw) ?? { fill: -1, nose: null };
      lines.push(`${id} ${name} ${s.position[0].toFixed(1)},${s.position[2].toFixed(1)} yaw ${((s.yaw * 180) / Math.PI).toFixed(0)} rad ${s.yaw.toFixed(4)} fill ${v.fill.toFixed(2)} nose ${v.nose} depth ${sf.viewDepth(world, s.position, s.yaw, map.playArea).toFixed(1)}`);
    }
  }
  writeFileSync(process.env.OUT ?? 'probe.txt', lines.join('\n') + '\n');
});
