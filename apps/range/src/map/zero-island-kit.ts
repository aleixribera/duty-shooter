import type { Terrain } from '@duty-shooter/fps-core';
import { PLANT_STRIDE, type PlantKind } from '@duty-shooter/fps-client/surfaces';
import type { Builder } from './builder';
import { PIECE_SOLIDS } from './kit-solids';
import { fittedSolids, type Dress, type DressedPiece } from './zero-island-plants';
import { placeBox, type BuiltPiece, type KitDress, type Pad, type Placed } from './zero-island-region';
import type { RegionId } from './zero-island-terrain';

/**
 * A Region's kit on the map (step 3 of `zero-island-region.ts`): its built
 * pieces stood on their pads as solids, the cover pass's pieces there dressed
 * with its models, and both drawn as instanced kinds with the plants.
 */

/** A Region's kit as the map needs it: the GLB, its pieces and where they stand, and how it dresses the cover pass. */
export interface RegionKit {
  readonly region: RegionId;
  readonly url: string;
  readonly pieces: Readonly<Record<string, BuiltPiece>>;
  readonly pads: readonly Pad[];
  readonly placed: readonly Placed[];
  readonly dress: Readonly<Record<string, KitDress>>;
  /** Extra stretched pieces of its own (a ring of barriers), by kit kind and box. */
  readonly extra?: readonly { readonly kind: string; readonly x: number; readonly z: number; readonly width: number; readonly depth: number; readonly height: number; readonly yaw: number }[];
}

/** Where a pad's floor is once the terrain has levelled it. */
export const padFloor = (terrain: Terrain, pad: Pad) => terrain.heightAt(pad.x, pad.z);

/**
 * The kit kind a cover piece wears: a pylon's low base is its footing, a
 * wreck as tall as a lorry is a truck, a container is one high or a stack
 * of two, and containers and cars come in one of two liveries by where they
 * stand (a kit without the `-b` one dresses both alike).
 */
export function dressKind(p: { kind: string; top: number; ground: number; x: number; z: number }): string {
  const tall = p.top - p.ground;
  const b = (Math.floor(p.x / 7) + Math.floor(p.z / 7)) & 1 ? '-b' : '';
  if (p.kind === 'pylon' && tall < 3) return 'pylon-base';
  if (p.kind === 'wreck' && tall > 2.2) return 'truck';
  if (p.kind === 'wreck') return `wreck${b}`;
  if (p.kind === 'container') return `${tall > 4 ? 'stack' : 'container'}${b}`;
  return p.kind;
}

/** How a kit dresses a cover piece: its own kind's model, or failing that the plain kind's. */
const dressOf = (kit: RegionKit | undefined, p: { kind: string; top: number; ground: number; x: number; z: number }): KitDress | undefined =>
  kit?.dress[dressKind(p)] ?? kit?.dress[p.kind];

const WHITE = 0xffffff;
/** A slightly lighter or darker grey per instance, so a row of the same wall doesn't read as copies. */
const shade = (k: number) => {
  const v = Math.round(255 * Math.min(1, 0.9 + 0.1 * k));
  return (v << 16) | (v << 8) | v;
};

export class KitKinds {
  readonly #lists = new Map<string, { kind: Omit<PlantKind, 'instances'>; values: number[] }>();

  add(kind: Omit<PlantKind, 'instances'>, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, color: number): void {
    let list = this.#lists.get(kind.asset);
    if (!list) this.#lists.set(kind.asset, (list = { kind, values: [] }));
    list.values.push(x, y, z, yaw, sx, sy, sz, color, 0);
  }

  done(): PlantKind[] {
    return [...this.#lists.values()].map(({ kind, values }) => ({ ...kind, instances: new Float32Array(values) }));
  }
}

const kindOf = (url: string, asset: string, near: number, far: number): Omit<PlantKind, 'instances'> => ({ asset, lod: `${asset}-lod`, near, far, thin: false, sway: 0, url, built: true });

/** Stands the kit's pieces on their pads: their boxes become solids (wearing the Region's built look), each piece one instance of its model. */
export function standPieces(b: Builder, terrain: Terrain, kit: RegionKit): { readonly kits: KitKinds; readonly modelled: number[] } {
  const kits = new KitKinds();
  const modelled: number[] = [];
  for (const p of kit.placed) {
    const piece = kit.pieces[p.asset];
    const pad = kit.pads[p.pad];
    if (!piece || !pad) throw new Error(`${kit.region}: no piece "${p.asset}" or pad ${p.pad}`);
    const floor = padFloor(terrain, pad);
    // Its boxes as fitted inside its model (ticket 63), where its model doesn't fill the plan's.
    for (const box of PIECE_SOLIDS[p.asset] ?? piece.boxes) {
      const { center, size, yaw } = placeBox(box, p.x, floor, p.z, p.yaw);
      modelled.push(b.solids.length);
      b.turned(center, size, yaw, box.material ?? 'concrete', `built-${kit.region}`);
    }
    kits.add(kindOf(kit.url, p.asset, piece.near, 2000), p.x, floor, p.z, p.yaw, 1, 1, 1, WHITE);
  }
  for (const e of kit.extra ?? []) {
    // Sunk past its lowest corner, as the cover pass sinks its pieces; a `stand` model stands on its lowest corner's ground.
    const low = Math.min(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => terrain.heightAt(e.x + (sx * e.width) / 2, e.z + (sz * e.depth) / 2))));
    const dress = dressOf(kit, { kind: e.kind, top: low + e.height, ground: low, x: e.x, z: e.z });
    if (!dress) throw new Error(`${kit.region}: nothing dresses "${e.kind}"`);
    const bottom = dress.fit === 'stand' ? low : low - 0.6;
    const top = dress.fit === 'stand' ? bottom + e.height : low + e.height;
    // The boxes fitted inside its model, as the cover pass's pieces have them.
    for (const box of fittedSolids({ asset: dress.asset, yaw: e.yaw }, e.x, bottom, e.z, e.width, top - bottom, e.depth)) {
      modelled.push(b.solids.length);
      b.turned(box.center, box.size, box.yaw, 'concrete', `cover-${kit.region}`);
    }
    kits.add(kindOf(kit.url, dress.asset, dress.near, dress.far), e.x, bottom, e.z, e.yaw, e.width, top - bottom, e.depth, shade(Math.sin(e.x * 1.7 + e.z)));
  }
  return { modelled, kits };
}

/**
 * The model a cover piece in a kit's Region wears, if the kit dresses its
 * kind, and the span it is scaled to: a `stretch` model fills the solid from
 * its foot, a `stand` one stands on the ground (`standing`).
 * The piece's solids are the boxes fitted inside that (`fittedSolids`).
 */
export function kitWear(
  kits: readonly RegionKit[],
  terrain: Terrain,
  p: { readonly kind: string; readonly region: string; readonly x: number; readonly z: number; readonly yaw: number; readonly bottom: number; readonly top: number; readonly ground: number },
): { readonly dress: Dress; readonly foot: number; readonly height: number } | null {
  const dress = dressOf(kits.find((k) => k.region === p.region), p);
  if (!dress) return null;
  if (dress.fit === 'stretch') return { dress: { asset: dress.asset, yaw: p.yaw }, foot: p.bottom, height: p.top - p.bottom };
  return { dress: { asset: dress.asset, yaw: p.yaw }, ...standing(terrain, p) };
}

/**
 * Where a `stand` model (a wreck, a wagon) stands: on the lowest ground under
 * it, so on a slope its downhill wheels touch and the uphill ones sink rather
 * than its body hanging in the air, and as tall as it'd stand at its middle.
 */
function standing(terrain: Terrain, p: { readonly x: number; readonly z: number; readonly top: number; readonly ground: number }): { readonly foot: number; readonly height: number } {
  const middle = terrain.heightAt(p.x, p.z);
  return { foot: p.ground, height: p.top - middle };
}

/**
 * Dresses the cover pass's pieces in the kit's Region with its models: a
 * `stretch` model fills its solid, a `stand` one stands on the ground under
 * it (`standing`). Rocks and trunks stay the plants'.
 */
export function dressCover(terrain: Terrain, kit: RegionKit, kits: KitKinds, dressed: readonly DressedPiece[], modelled: number[]): void {
  for (const p of dressed) {
    if (p.region !== kit.region) continue;
    const dress = dressOf(kit, p);
    if (!dress) continue;
    const tint = shade(Math.sin(p.x * 1.7 + p.z * 0.9));
    if (dress.fit === 'stretch') {
      kits.add(kindOf(kit.url, dress.asset, dress.near, dress.far), p.x, p.bottom, p.z, p.yaw, p.width, p.top - p.bottom, p.depth, tint);
    } else {
      const { foot, height } = standing(terrain, p);
      kits.add(kindOf(kit.url, dress.asset, dress.near, dress.far), p.x, foot, p.z, p.yaw, p.width, height, p.depth, tint);
    }
    modelled.push(...p.solids);
  }
}

/** Every instance's numbers, for tests: x, y, z, yaw, scale, as `PLANT_STRIDE` lays them. */
export function instancesOf(kind: PlantKind): { x: number; y: number; z: number; yaw: number; sx: number; sy: number; sz: number }[] {
  const out = [];
  for (let o = 0; o < kind.instances.length; o += PLANT_STRIDE) {
    const v = kind.instances;
    out.push({ x: v[o]!, y: v[o + 1]!, z: v[o + 2]!, yaw: v[o + 3]!, sx: v[o + 4]!, sy: v[o + 5]!, sz: v[o + 6]! });
  }
  return out;
}

