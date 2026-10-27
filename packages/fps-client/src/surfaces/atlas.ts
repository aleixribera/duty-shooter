import type { Face } from './faces';
import type { Family } from './types';

/** Where one face's texels sit in the lightmap: `w` x `h` texels at (x, y), inside a border of ATLAS_BORDER texels. */
export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Atlas {
  readonly width: number;
  readonly height: number;
  /** Per face, in order; null for faces without a lightmap (glass). */
  readonly rects: readonly (AtlasRect | null)[];
  /** Total texels inside rects (the ones that are baked). */
  readonly texels: number;
}

export const ATLAS_WIDTH = 2048;
/** Texels of border round each face's rect, copies of its edge: enough for bicubic sampling to stay inside it. */
export const ATLAS_BORDER = 2;

// Not Math.hypot: engines round it differently in the last bit, and the bake (Node) and the client (a browser) must agree.
const length = (v: readonly number[]) => Math.sqrt(v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!);

/** Texels along an edge of `metres` at `t` metres a texel, ignoring float noise just past a whole count. */
const texelsAlong = (metres: number, t: number) => Math.ceil(metres / t - 1e-3) + 1;

/** Texel size (m) for a face: 20 cm everywhere people play, a metre on the desert round it. */
export function texelSize(face: Face, family: Family): number {
  const t = family === 'sand' ? 1 : 0.2;
  return Math.max(t, length(face.u) / 1000, length(face.v) / 1000);
}

/**
 * Packs every lit face into rows of a 2048-wide lightmap, tallest first.
 * Deterministic: the bake and the client build the same layout from the same faces.
 */
export function packAtlas(faces: readonly Face[], familyOf: (face: Face) => Family): Atlas {
  const sizes = faces.map((f) => {
    const family = familyOf(f);
    if (family === 'glass') return null;
    const t = texelSize(f, family);
    return { w: Math.max(2, texelsAlong(length(f.u), t)), h: Math.max(2, texelsAlong(length(f.v), t)) };
  });
  const order = sizes.flatMap((s, i) => (s ? [i] : [])).sort((a, b) => sizes[b]!.h - sizes[a]!.h || sizes[b]!.w - sizes[a]!.w || a - b);
  const rects: (AtlasRect | null)[] = faces.map(() => null);
  let x = 0;
  let y = 0;
  let row = 0;
  let texels = 0;
  for (const i of order) {
    const { w, h } = sizes[i]!;
    const B = ATLAS_BORDER;
    if (x + w + 2 * B > ATLAS_WIDTH) {
      x = 0;
      y += row;
      row = 0;
    }
    rects[i] = { x: x + B, y: y + B, w, h };
    x += w + 2 * B;
    row = Math.max(row, h + 2 * B);
    texels += w * h;
  }
  return { width: ATLAS_WIDTH, height: Math.max(4, Math.ceil((y + row) / 4) * 4), rects, texels };
}

/** The lightmap coordinate (0..1) of a point s, t (0..1 along u and v) on a face's rect: texel centres span the face exactly. */
export function atlasUv(atlas: Atlas, rect: AtlasRect, s: number, t: number): [number, number] {
  return [(rect.x + 0.5 + s * (rect.w - 1)) / atlas.width, (rect.y + 0.5 + t * (rect.h - 1)) / atlas.height];
}
