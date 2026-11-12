import { Baker, layoutSurfaces, linearRgb, writeBakeFile, type ProbeGrid, type SurfaceLayout } from '@duty-shooter/fps-client/surfaces';
import type { Vec3 } from '@duty-shooter/fps-core';
import { buildMapById, type MapDefinition, type MapId } from '../map/maps';
import { probeGrid, surfaceSpec } from './spec';

/**
 * The lighting bake for one map, as the build runs it (see bake/plugin.ts):
 * `describe` sizes it, `sun` and `indirect` run over texel ranges (in worker
 * threads, writing into shared buffers), `finish` encodes the result.
 */

/** Bumped whenever the bake's output changes for the same map, so cached bakes are redone. */
const BAKE_VERSION = 4;

interface Prepared {
  readonly map: MapDefinition;
  readonly layout: SurfaceLayout;
  readonly baker: Baker;
  readonly grid: ProbeGrid;
}

const prepared = new Map<MapId, Prepared>();

const NO_PROBES: ProbeGrid = { min: [0, 0, 0], step: 1, dims: [0, 0, 0] };

/** The ground's colour, for the light it gives back: the mean of its colours. */
function groundAlbedo(map: MapDefinition): Vec3 | undefined {
  const colours = map.terrainColors?.map(linearRgb);
  if (!colours?.length) return undefined;
  return [0, 1, 2].map((c) => colours.reduce((sum, v) => sum + v[c]!, 0) / colours.length) as unknown as Vec3;
}

function prepare(id: MapId): Prepared {
  let p = prepared.get(id);
  if (!p) {
    const map = buildMapById(id);
    const layout = layoutSurfaces(map.solids, surfaceSpec(map));
    const baker = new Baker({ solids: map.solids, faces: layout.faces, atlas: layout.atlas, albedo: layout.albedo, lighting: map.lighting, lamps: map.lamps, terrain: map.terrain ?? null, groundAlbedo: groundAlbedo(map) });
    // A map on terrain keeps its sky field for what moves (see sky-field.ts): no probes.
    p = { map, layout, baker, grid: map.terrain ? NO_PROBES : probeGrid(map) };
    prepared.set(id, p);
  }
  return p;
}

function fingerprint(p: Prepared): string {
  let h = 2166136261;
  const terrain = p.map.terrain;
  const text = JSON.stringify([BAKE_VERSION, p.map.lighting, p.map.lamps, p.layout.key, p.map.solids, p.layout.faces.map((f) => f.finish), p.layout.finishes, p.grid, p.map.terrainColors, terrain && [terrain.origin, terrain.cell, terrain.columns, terrain.rows]]);
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  // The ground's heights, to the centimetre.
  if (terrain) for (let i = 0; i < terrain.heights.length; i++) h = Math.imul(h ^ Math.round(terrain.heights[i]! * 100), 16777619) >>> 0;
  return h.toString(16);
}

export function describe(id: MapId): { texels: number; width: number; height: number; key: string; hash: string } {
  const p = prepare(id);
  return { texels: p.baker.texels, width: p.layout.atlas.width, height: p.layout.atlas.height, key: p.layout.key, hash: fingerprint(p) };
}

export function sun(id: MapId, from: number, to: number, out: Float32Array): void {
  prepare(id).baker.sun(from, to, out);
}

export function indirect(id: MapId, sunTerms: Float32Array, bounce: Float32Array | null, from: number, to: number, out: Float32Array): void {
  prepare(id).baker.indirect(sunTerms, bounce, from, to, out);
}

/** The bake file (see BakeFile), before compression. */
export function finish(id: MapId, sunTerms: Float32Array, light: Float32Array): Uint8Array {
  const p = prepare(id);
  return writeBakeFile({ key: p.layout.key, width: p.layout.atlas.width, height: p.layout.atlas.height, probes: p.grid, lightmap: p.baker.encode(sunTerms, light), probeData: p.baker.probes(p.grid, sunTerms, light) });
}
