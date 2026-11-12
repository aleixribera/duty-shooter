// Ticket 34: what Zero Island's drawn surfaces are, by finish, and what lights the rest.
import { layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { buildMapById } from '../../../apps/range/src/map/maps';
import { surfaceSpec } from '../../../apps/range/src/bake/spec';

export function run(): unknown {
  const map = buildMapById('zero-island');
  const layout = layoutSurfaces(map.solids, surfaceSpec(map));
  const by: Record<string, { faces: number; texels: number; family: string; area: number }> = {};
  layout.faces.forEach((f, i) => {
    const r = layout.atlas.rects[i];
    const e = (by[f.finish] ??= { faces: 0, texels: 0, family: layout.finishes[f.finish]!.family, area: 0 });
    e.faces++;
    e.texels += r ? r.w * r.h : 0;
    e.area += Math.round(Math.hypot(...f.u) * Math.hypot(...f.v));
  });
  const kinds: Record<string, number> = {};
  for (const s of map.solids) { const k = `${s.blocks}/${s.prop === null ? '' : 'prop'}`; kinds[k] = (kinds[k] ?? 0) + 1; }
  return { by, modelled: surfaceSpec(map).modelled.length, models: map.models?.placements.length, plants: map.plants?.modelled.length, kinds, atlas: [layout.atlas.width, layout.atlas.height] };
}
