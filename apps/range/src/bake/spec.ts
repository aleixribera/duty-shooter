import type { ProbeGrid, SurfaceSpec } from '@duty-shooter/fps-client/surfaces';
import type { MapDefinition } from '../map/definition';

/** What the surface pipeline needs from a map. */
export function surfaceSpec(map: MapDefinition): SurfaceSpec {
  return { finishes: map.finishes, looks: map.looks, decorations: map.decorations, indoor: map.indoorZones, modelled: map.models?.placements.flatMap((p) => p.solids) ?? [] };
}

/** Light probes over the playable area (or the whole range), from just above the ground to above the roofs. */
export function probeGrid(map: MapDefinition): ProbeGrid {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  if (map.playArea) {
    for (const [x, z] of map.playArea) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  } else {
    for (const s of map.solids) {
      if (s.max[1] - s.min[1] > 50) continue;
      x0 = Math.min(x0, s.min[0]);
      x1 = Math.max(x1, s.max[0]);
      z0 = Math.min(z0, s.min[2]);
      z1 = Math.max(z1, s.max[2]);
    }
  }
  const step = map.playArea ? 1.5 : 2.5;
  x0 -= step;
  z0 -= step;
  x1 += step;
  z1 += step;
  return { min: [x0, 0.3, z0], step, dims: [Math.ceil((x1 - x0) / step) + 1, 6, Math.ceil((z1 - z0) / step) + 1] };
}
