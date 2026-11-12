// Ticket 34: how many lightmap texels each of Zero Island's surface blocks lays out to.
import { layoutSurfaces } from '@duty-shooter/fps-client/surfaces';
import { surfaceBlocks } from '../../../packages/fps-client/src/surface-blocks';
import { buildMapById } from '../../../apps/range/src/map/maps';
import { surfaceSpec } from '../../../apps/range/src/bake/spec';

export function run(): unknown {
  const map = buildMapById('zero-island');
  const t0 = performance.now();
  const layout = layoutSurfaces(map.solids, surfaceSpec(map));
  const blocks = surfaceBlocks(layout, map.solids);
  const rows = blocks.map((b) => {
    let texels = 0;
    for (const i of b.near) { const r = layout.atlas.rects[i]; if (r) texels += r.w * r.h; }
    return { at: `${b.x0},${b.z0}`, faces: b.near.length, texels };
  });
  return { ms: Math.round(performance.now() - t0), solids: map.solids.length, faces: layout.faces.length, total: layout.atlas.texels, blocks: rows.sort((a, b) => b.texels - a.texels) };
}
