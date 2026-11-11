import type { Solid, Vec3 } from '@duty-shooter/fps-core';
import type { Face } from './faces';
import type { Finish, MapModels, ModelPlacement } from './types';

/**
 * A map's ground scatter: rocks, stones, broken masonry and dry shrubs strewn
 * where nothing stands. All of it is visual only and lower than a crouching
 * player (tools/map/scatter.py holds them to that), so it can never pass for
 * cover, and it is the same on every machine that loads the map.
 */
export interface Scatter {
  /** The finishes it lies on: flat, open ground. */
  readonly on: readonly string[];
  /** The part of the map it lies in. */
  readonly within: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  /** How many lie on open ground, and how many gather along the foot of the walls, where the wind and the falling plaster leave them. */
  readonly open: number;
  readonly walls: number;
  readonly seed: number;
}

const SCATTER_FILE = 'models/scatter.glb';

/** What scatter wears: its own colours on every map, the dry end of the ground it lies on. */
export const SCATTER_FINISHES: Readonly<Record<string, Finish>> = {
  'scatter.stone': { family: 'paint', color: 0xb9a586, roughness: 0.95, metalness: 0 },
  'scatter.stoneDark': { family: 'paint', color: 0x7d6c58, roughness: 0.95, metalness: 0 },
  'scatter.masonry': { family: 'paint', color: 0x8f7a64, roughness: 0.95, metalness: 0 },
  'scatter.twig': { family: 'paint', color: 0x5f4a33, roughness: 0.95, metalness: 0 },
  'scatter.straw': { family: 'paint', color: 0xc09c5c, roughness: 0.95, metalness: 0 },
};

/** How far each asset spreads from its origin (m), so the whole of it keeps clear of solids. */
const REACH = {
  'rock-small': 0.11,
  'rock-medium': 0.2,
  'rock-large': 0.34,
  'stones-a': 0.42,
  'stones-b': 0.62,
  'masonry-a': 0.5,
  'masonry-b': 0.5,
  'shrub-a': 0.36,
  'shrub-b': 0.44,
  'shrub-c': 0.3,
} as const;
type Asset = keyof typeof REACH;

/** Which asset goes where, by share. */
const OPEN: readonly Asset[] = ['rock-small', 'rock-small', 'rock-medium', 'rock-large', 'stones-a', 'stones-a', 'stones-b', 'shrub-a', 'shrub-c'];
const WALL: readonly Asset[] = ['stones-a', 'stones-b', 'masonry-a', 'masonry-b', 'rock-small', 'rock-medium', 'shrub-a', 'shrub-b', 'shrub-c'];

/** How far out from a wall's foot its scatter lies (m), how low that foot must be, and how tall a wall must stand to count (a kerb doesn't). */
const WALL_REACH = 0.9;
const FOOT = 0.4;
const WALL_HEIGHT = 0.8;
/** How many tries a piece gets to find room. */
const TRIES = 40;

/** A seeded 0..1 stream (mulberry32). */
export function stream(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The face's span over the ground. */
const span = (f: Face) => {
  const [a, b] = [f.origin, [f.origin[0] + f.u[0] + f.v[0], 0, f.origin[2] + f.u[2] + f.v[2]] as Vec3];
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) };
};

/**
 * Finds open ground: the height at (x, z) if something `clear` wide can lie
 * there, where the topmost level face wears one of `on` and no solid stands on
 * it or hangs over it (a roof makes an indoors, whatever its floor wears).
 */
export function openGround(faces: readonly Face[], solids: readonly Solid[], scatter: Scatter): (x: number, z: number, clear: number) => number | null {
  const on = new Set(scatter.on);
  const level = faces.filter((f) => f.normal[1] > 0.99).map((f) => ({ ...span(f), y: f.origin[1], on: on.has(f.finish) }));
  const { x0, x1, z0, z1 } = scatter.within;
  return (x, z, clear) => {
    if (x < x0 || x > x1 || z < z0 || z > z1) return null;
    let top: (typeof level)[number] | null = null;
    for (const f of level) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && f.y < 1 && (!top || f.y > top.y)) top = f;
    if (!top?.on) return null;
    const y = top.y;
    const blocked = solids.some((s) => s.max[1] > y + 0.02 && x > s.min[0] - clear && x < s.max[0] + clear && z > s.min[2] - clear && z < s.max[2] + clear);
    return blocked ? null : y;
  };
}

/** The level way along a wall. */
export const along = (f: Face): Vec3 => (Math.abs(f.u[1]) < Math.abs(f.v[1]) ? f.u : f.v);

/** Where a map's scatter goes, from what it's built of: on open ground, and along the foot of the walls. */
export function scatterPlacements(faces: readonly Face[], solids: readonly Solid[], scatter: Scatter): ModelPlacement[] {
  const random = stream(scatter.seed);
  const groundAt = openGround(faces, solids, scatter);
  const { x0, x1, z0, z1 } = scatter.within;
  const out: ModelPlacement[] = [];
  const put = (asset: Asset, x: number, z: number): boolean => {
    const y = groundAt(x, z, REACH[asset]);
    if (y === null) return false;
    out.push({ asset, position: [x, y, z], yaw: random() * Math.PI * 2, solids: [], visualOnly: true });
    return true;
  };
  const pick = (assets: readonly Asset[]): Asset => assets[Math.floor(random() * assets.length)]!;
  for (let i = 0; i < scatter.open; i++) {
    const asset = pick(OPEN);
    for (let t = 0; t < TRIES && !put(asset, x0 + random() * (x1 - x0), z0 + random() * (z1 - z0)); t++);
  }
  // Walls by length, so a long wall gets its share.
  const feet = faces.filter((f) => {
    const ys = [f.origin[1], f.origin[1] + f.u[1], f.origin[1] + f.v[1], f.origin[1] + f.u[1] + f.v[1]];
    return Math.abs(f.normal[1]) < 0.2 && f.decoration < 0 && Math.min(...ys) < FOOT && Math.max(...ys) - Math.min(...ys) > WALL_HEIGHT;
  });
  const lengths = feet.map((f) => Math.hypot(...along(f)));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (let i = 0; i < scatter.walls; i++) {
      const asset = pick(WALL);
      for (let t = 0; t < TRIES; t++) {
        let distance = random() * total;
        let index = 0;
        while (index < feet.length - 1 && distance > lengths[index]!) distance -= lengths[index++]!;
        const f = feet[index]!;
        const a = along(f);
        const k = random();
        const off = REACH[asset] + 0.02 + random() * random() * WALL_REACH;
        if (put(asset, f.origin[0] + a[0] * k + f.normal[0] * off, f.origin[2] + a[2] * k + f.normal[2] * off)) break;
      }
    }
  }
  return out;
}

/** The model set scatter loads as, for a map's faces and solids. */
export function scatterModels(faces: readonly Face[], solids: readonly Solid[], scatter: Scatter): MapModels {
  return { url: SCATTER_FILE, placements: scatterPlacements(faces, solids, scatter) };
}
