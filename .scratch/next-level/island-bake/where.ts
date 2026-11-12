// Ticket 34: where Zero Island's drawn (box) surfaces stand, and its reference spots.
import { layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../../../apps/range/src/map/maps';
import { surfaceSpec } from '../../../apps/range/src/bake/spec';

export function run(): unknown {
  const map = buildMapById('zero-island');
  const layout = layoutSurfaces(map.solids, surfaceSpec(map));
  const solids = new Map<number, string>();
  for (const f of layout.faces) if (f.solid >= 0) solids.set(f.solid, f.finish);
  const list = [...solids].map(([i, finish]) => { const s = map.solids[i]!; return `${finish} ${s.min.map(Math.round)} .. ${s.max.map(Math.round)}`; });
  return { boxes: list.filter((l) => l.startsWith('block')).slice(0, 40), sea: list.filter((l) => !l.startsWith('block')).slice(0, 5), spots: map.referenceSpots?.map((s) => `${s.name} ${s.position.map(Math.round)} yaw ${s.yaw}`) };
}
