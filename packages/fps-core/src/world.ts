import type { Vec3 } from './math';
import { SolidIndex } from './grid';

/**
 * Surface material carried by every solid. Drives impact effects, footstep
 * sounds and bullet penetration (see the stats file's penetration table).
 */
export type Material =
  | 'concrete'
  | 'metal'
  | 'wood'
  | 'dirt'
  | 'grass'
  | 'glass'
  | 'plaster'
  | 'brick'
  | 'asphalt'
  | 'gravel'
  | 'sand'
  | 'sheetMetal'
  | 'plastic';

/** Every material, for tables that must cover them all. */
export const MATERIALS: readonly Material[] = ['concrete', 'metal', 'wood', 'dirt', 'grass', 'glass', 'plaster', 'brick', 'asphalt', 'gravel', 'sand', 'sheetMetal', 'plastic'];

/**
 * What a solid stops. `both` is ordinary geometry; `players` is player clip
 * (invisible walls and the hidden steps under sloped roofs, which bullets fly
 * through); `bullets` is a bullet surface (sloped roof faces, scenery), which
 * players walk through.
 */
export type Blocks = 'both' | 'players' | 'bullets';

/** How a rotated solid sits in the world. */
export interface Orientation {
  readonly center: Vec3;
  /** Half extents along the solid's own x, y and z axes. */
  readonly half: Vec3;
  /** The solid's own x, y and z axes in world space, unit length. */
  readonly axes: readonly [Vec3, Vec3, Vec3];
  /** Euler angles, applied yaw (about Y), then pitch (about X), then roll (about Z), as Three.js order 'YXZ'. */
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

/**
 * One piece of world collision: an axis-aligned box, or a box rotated about
 * the vertical axis. Bullet surfaces may have any rotation.
 */
export interface Solid {
  /** World-space bounds. For an axis-aligned solid they are the solid itself. */
  readonly min: Vec3;
  readonly max: Vec3;
  readonly material: Material;
  readonly blocks: Blocks;
  /** Null for an axis-aligned solid. */
  readonly orientation: Orientation | null;
  /** A prop's id: bullets pass through it at full damage, and the hit is reported. Null for anything else. */
  readonly prop: string | null;
}

interface SolidOptions {
  readonly material: Material;
  readonly blocks?: Blocks;
  readonly prop?: string;
}

/** Builds an axis-aligned solid, normalising min/max so either corner order is accepted. Blocks both by default. */
export function box(spec: { min: Vec3; max: Vec3 } & SolidOptions): Solid {
  const [ax, ay, az] = spec.min;
  const [bx, by, bz] = spec.max;
  return {
    min: [Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)],
    max: [Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)],
    material: spec.material,
    blocks: spec.blocks ?? 'both',
    orientation: null,
    prop: spec.prop ?? null,
  };
}

/** A box `size` metres across its own axes, centred on `center`, turned `yaw` about the vertical axis (Three.js rotation.y). */
export function yawBox(spec: { center: Vec3; size: Vec3; yaw: number } & SolidOptions): Solid {
  return orientedBox({ ...spec, pitch: 0, roll: 0 });
}

/**
 * A box with any rotation (yaw, then pitch, then roll). Only bullet surfaces
 * may tilt: a solid that blocks players and is rotated about anything but
 * the vertical axis is rejected, so the movement sweep stays simple.
 */
export function orientedBox(spec: { center: Vec3; size: Vec3; yaw: number; pitch: number; roll: number } & SolidOptions): Solid {
  const blocks = spec.blocks ?? 'both';
  if (blocks !== 'bullets' && (spec.pitch !== 0 || spec.roll !== 0)) {
    throw new Error('Solids that block players may only rotate about the vertical axis');
  }
  const half: Vec3 = [Math.abs(spec.size[0]) / 2, Math.abs(spec.size[1]) / 2, Math.abs(spec.size[2]) / 2];
  const c = spec.center;
  if (spec.yaw === 0 && spec.pitch === 0 && spec.roll === 0) {
    return box({ min: [c[0] - half[0], c[1] - half[1], c[2] - half[2]], max: [c[0] + half[0], c[1] + half[1], c[2] + half[2]], ...options(spec) });
  }
  const axes = rotationAxes(spec.yaw, spec.pitch, spec.roll);
  const extent = (i: 0 | 1 | 2) => Math.abs(axes[0][i]) * half[0] + Math.abs(axes[1][i]) * half[1] + Math.abs(axes[2][i]) * half[2];
  const e: Vec3 = [extent(0), extent(1), extent(2)];
  return {
    min: [c[0] - e[0], c[1] - e[1], c[2] - e[2]],
    max: [c[0] + e[0], c[1] + e[1], c[2] + e[2]],
    material: spec.material,
    blocks,
    orientation: { center: c, half, axes, yaw: spec.yaw, pitch: spec.pitch, roll: spec.roll },
    prop: spec.prop ?? null,
  };
}

/** Player clip: blocks players, never bullets. Axis-aligned, or turned about the vertical axis. */
export function playerClip(spec: ({ min: Vec3; max: Vec3 } | { center: Vec3; size: Vec3; yaw: number }) & { material: Material }): Solid {
  return 'min' in spec ? box({ ...spec, blocks: 'players' }) : yawBox({ ...spec, blocks: 'players' });
}

function options(spec: SolidOptions): SolidOptions {
  return { material: spec.material, ...(spec.blocks ? { blocks: spec.blocks } : {}), ...(spec.prop ? { prop: spec.prop } : {}) };
}

/** The x, y and z axes of a rotation applied yaw (Y), then pitch (X), then roll (Z): R = Ry · Rx · Rz. */
function rotationAxes(yaw: number, pitch: number, roll: number): [Vec3, Vec3, Vec3] {
  const rotate = (v: Vec3): Vec3 => {
    // Rz, then Rx, then Ry.
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const x1 = v[0] * cr - v[1] * sr;
    const y1 = v[0] * sr + v[1] * cr;
    const z1 = v[2];
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
  };
  return [rotate([1, 0, 0]), rotate([0, 1, 0]), rotate([0, 0, 1])];
}

/** The static level geometry the simulation collides against, with a spatial index for movement and for bullets. */
export interface World {
  readonly solids: readonly Solid[];
  /** The solids that block players. */
  readonly movement: SolidIndex;
  /** The solids that block bullets. */
  readonly bullets: SolidIndex;
}

export interface WorldOptions {
  /**
   * Index solids in a uniform grid (the default). Off, every query scans
   * every solid: the results are identical, only slower. Tests compare the two.
   */
  readonly spatialIndex?: boolean;
}

/** Grid cell size (m), about the size of a room. */
const CELL_SIZE = 4;

export function createWorld(solids: readonly Solid[], options: WorldOptions = {}): World {
  const list = [...solids];
  const indexed = options.spatialIndex ?? true;
  const members = (keep: (s: Solid) => boolean) => list.flatMap((s, i) => (keep(s) ? [i] : []));
  return {
    solids: list,
    movement: new SolidIndex(list, members((s) => s.blocks !== 'bullets'), indexed ? CELL_SIZE : null),
    bullets: new SolidIndex(list, members((s) => s.blocks !== 'players'), indexed ? CELL_SIZE : null),
  };
}
