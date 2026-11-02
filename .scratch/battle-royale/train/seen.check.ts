// Reads a train probe's frames.json (FRAMES=<path>) and counts the ending's frames in which at least one
// of the train's cars is on screen and not hidden behind the map's drawn solids, from the camera recorded.
import { appendFileSync, readFileSync } from 'node:fs';
import { it } from 'vitest';
import { createWorld, raycastWorld, type Vec3 } from '@duty-shooter/fps-core';
import { buildSwitchyard } from '../../../apps/range/src/map/switchyard';

it('counts frames with the train in sight', () => {
  const map = buildSwitchyard();
  const world = createWorld(map.solids);
  const train = map.train!;
  for (const file of process.env['FRAMES']!.split(',')) {
    const frames = JSON.parse(readFileSync(file, 'utf8')) as { phase: string; x: number | null; visible: boolean; camPos: Vec3; camDir: Vec3; camUp: Vec3; fov: number; aspect: number }[];
    const out: Record<string, { frames: number; seen: number }> = {};
    for (const f of frames) {
      if (!f.camDir || f.x === null) continue;
      const o = (out[f.phase] ??= { frames: 0, seen: 0 });
      o.frames++;
      if (!f.visible) continue;
      const fw = f.camDir, up = f.camUp;
      const r: Vec3 = [fw[1] * up[2] - fw[2] * up[1], fw[2] * up[0] - fw[0] * up[2], fw[0] * up[1] - fw[1] * up[0]];
      const tanV = Math.tan((f.fov / 2) * (Math.PI / 180));
      let n = 0;
      for (let along = 6; along < train.length; along += 12) {
        const p: Vec3 = [f.x + along, 2.5, train.z + 1.4];
        const d: Vec3 = [p[0] - f.camPos[0], p[1] - f.camPos[1], p[2] - f.camPos[2]];
        const z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
        if (z <= 0) continue;
        const x = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / z;
        const y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z;
        if (Math.abs(x) < tanV * f.aspect && Math.abs(y) < tanV && raycastWorld(world, f.camPos, p) === null) n++;
      }
      if (n > 0) o.seen++;
    }
    appendFileSync('.scratch/battle-royale/train/seen.txt', `${file} ${JSON.stringify(out)}
`);
  }
});
