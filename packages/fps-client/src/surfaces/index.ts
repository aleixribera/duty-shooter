import type { Solid, Vec3 } from '@duty-shooter/fps-core';
import { packAtlas, type Atlas } from './atlas';
import { surfaceFaces, type Face } from './faces';
import { linearRgb } from './lighting';
import { DEFAULT_FINISHES, type Finish, type SurfaceSpec } from './types';

export { ATLAS_BORDER, ATLAS_WIDTH, atlasUv, packAtlas, texelSize } from './atlas';
export type { Atlas, AtlasRect } from './atlas';
export { Baker } from './bake';
export type { BakeInput, ProbeGrid } from './bake';
export { readBakeFile, writeBakeFile } from './file';
export type { BakeFile } from './file';
export { decorationErrors, decorationFrame, frameFaces, insideFrame, isClear, solidFrame, surfaceFaces, toFrame } from './faces';
export type { Face, Frame } from './faces';
export { INDIRECT_RANGE, LIGHTING, encodeLight, linearRgb, normalize, skyRadiance } from './lighting';
export type { Lamp, Lighting } from './lighting';
export { DECORATION_TOLERANCE, DEFAULT_FINISHES, defaultFinishKey } from './types';
export type { Decoration, EndingShot, Family, Finish, FreightTrain, Look, MapModels, ModelPlacement, SurfaceSpec } from './types';

/** A map's surfaces, laid out: what both the bake and the renderer start from. */
export interface SurfaceLayout {
  readonly faces: readonly Face[];
  readonly atlas: Atlas;
  readonly finishes: Readonly<Record<string, Finish>>;
  /** Linear albedo per face, for the bake's bounce light. */
  readonly albedo: readonly Vec3[];
  /** Fingerprint of the layout, so a lightmap baked for another layout is refused. */
  readonly key: string;
}

/** Looks up a face's finish: the map's, or a material default. */
export function finishTable(spec: SurfaceSpec): Record<string, Finish> {
  const table: Record<string, Finish> = {};
  for (const [material, finish] of Object.entries(DEFAULT_FINISHES)) table[`default:${material}`] = finish;
  return { ...table, ...spec.finishes };
}

export function layoutSurfaces(solids: readonly Solid[], spec: SurfaceSpec): SurfaceLayout {
  const finishes = finishTable(spec);
  const finishOf = (f: Face) => {
    const finish = finishes[f.finish];
    if (!finish) throw new Error(`Unknown finish "${f.finish}"`);
    return finish;
  };
  const faces = surfaceFaces(solids, spec);
  const atlas = packAtlas(faces, (f) => finishOf(f).family);
  const albedo = faces.map((f) => linearRgb(finishOf(f).color));
  let h = 2166136261;
  const mix = (n: number) => {
    h = Math.imul(h ^ Math.round(n * 1000), 16777619) >>> 0;
  };
  mix(faces.length);
  mix(atlas.height);
  for (const [i, f] of faces.entries()) {
    for (const v of [...f.origin, ...f.u, ...f.v]) mix(v);
    mix(f.finish.length);
    // Where its texels sit too, which the rounded coordinates above can't pin down.
    const r = atlas.rects[i];
    for (const v of r ? [r.x, r.y, r.w, r.h] : [-1]) mix(v);
  }
  return { faces, atlas, finishes, albedo, key: h.toString(16) };
}
