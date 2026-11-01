import type { Solid, Vec3 } from '@duty-shooter/fps-core';
import { cornerEdges, FAR, openEdges } from './edges';
import { solidFrame, toFrame, type Face } from './faces';
import { along, openGround, stream, type Scatter } from './scatter';
import type { Family, Finish } from './types';

/**
 * A map's weathering marks, laid over its walls and ground where water and
 * time would leave them: streaks running down from a wall's top or a sill, damp
 * rising from its foot, cracks, and stains on open ground. They are placed from
 * what the map is built of, so a map that has scatter needs say nothing more,
 * and only outdoors: the marks are the weather's.
 */
export interface GrimeQuad {
  /** Its lower corner, and the sides from there (m), across and up. */
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  /** Which of the picture's marks it wears. */
  readonly mark: GrimeMark;
  /** Its colour (linear) and how strongly it lands. */
  readonly tint: readonly [number, number, number, number];
}

/** In the picture's order, left to right (tools/textures/tiles.mjs). */
export const GRIME_MARKS = ['streak', 'damp', 'crack', 'stain'] as const;
export type GrimeMark = (typeof GRIME_MARKS)[number];

/** How many of each a map gets, at most: all of it one draw, however many. */
const STREAKS = 150;
const DAMP = 60;
const CRACKS = 50;
const STAINS = 40;
export const MOST_GRIME = STREAKS + DAMP + CRACKS + STAINS;

/** What takes marks: masonry and old boards, not glass or paint. */
const WEATHERED: ReadonlySet<Family> = new Set<Family>(['concrete', 'plaster', 'wornPlaster', 'brick', 'siding']);
/** How tall a wall must stand to take any, and how long. */
const LOWEST_WALL = 0.8;
const SHORTEST_WALL = 1;
/** How far out from the wall "outdoors" is judged (m): past the eaves, which keep the rain off nothing much. */
const CLEAR = 0.8;
/** How far a mark stands off what it lies on (m): the polygon offset does the rest. */
const OFF_WALL = 0.006;
const OFF_GROUND = 0.012;
const TRIES = 30;

const DIRT = [0.045, 0.036, 0.028] as const;
const RUST = [0.11, 0.045, 0.02] as const;
const SOOT = [0.018, 0.016, 0.015] as const;

/** A wall as a face: where its lower corner is, the level way along it and the way up it. */
interface Wall {
  readonly face: Face;
  readonly low: Vec3;
  readonly level: Vec3;
  readonly length: number;
  readonly height: number;
  readonly headOpen: boolean;
  readonly onGround: boolean;
}

function wallOf(face: Face, open: number): Wall {
  const level = along(face);
  const rise = level === face.u ? face.v : face.u;
  const low: Vec3 = rise[1] > 0 ? face.origin : [face.origin[0] + rise[0], face.origin[1] + rise[1], face.origin[2] + rise[2]];
  // The head of a piece is open if either end of it says so.
  const head = Math.min(cornerEdges(face, open, 0, 0)[3], cornerEdges(face, open, 1, 1)[3]);
  return { face, low, level, length: Math.hypot(...level), height: Math.abs(rise[1]), headOpen: head < FAR, onGround: low[1] < 0.5 };
}

/** Picks from `items` in proportion to each one's length. */
function byLength(items: readonly Wall[], random: () => number): Wall {
  let distance = random() * items.reduce((sum, w) => sum + w.length, 0);
  for (const w of items) {
    distance -= w.length;
    if (distance <= 0) return w;
  }
  return items[items.length - 1]!;
}

/** Where a map's marks go. Pure and seeded: the same on every machine, like its scatter. */
export function grimeQuads(faces: readonly Face[], solids: readonly Solid[], finishes: Readonly<Record<string, Finish>>, scatter: Scatter): GrimeQuad[] {
  const random = stream(scatter.seed ^ 0x51ed);
  const between = (a: number, b: number) => a + random() * (b - a);
  const { x0, x1, z0, z1 } = scatter.within;
  const open = openEdges(faces);
  const frames = solids.map(solidFrame);
  /** Whether a solid stands at `p` or hangs over it, the wall's own apart. */
  const covered = (p: Vec3, wall: number) =>
    frames.some((f, i) => {
      if (i === wall) return false;
      const [x, y, z] = toFrame(f, p);
      return Math.abs(x) < f.half[0] && Math.abs(z) < f.half[2] && y < f.half[1];
    });
  const walls: Wall[] = [];
  faces.forEach((f, i) => {
    const family = finishes[f.finish]?.family;
    if (!family || !WEATHERED.has(family) || f.decoration >= 0 || Math.abs(f.normal[1]) > 0.2) return;
    if (f.solid >= 0 && solids[f.solid]!.prop !== null) return;
    const wall = wallOf(f, open[i]!);
    if (wall.height >= LOWEST_WALL && wall.length >= SHORTEST_WALL) walls.push(wall);
  });
  const out: GrimeQuad[] = [];
  /** Lays a mark on a wall, from `bottom` above its foot, if all of it stays on the wall and outdoors. */
  const onWall = (wall: Wall, width: number, height: number, bottom: number, mark: GrimeMark, tint: GrimeQuad['tint']): boolean => {
    const { low, level, length, face } = wall;
    if (width > length) return false;
    const k = (width / 2 + random() * (length - width)) / length;
    const [nx, , nz] = face.normal;
    const point = (a: number, y: number): Vec3 => [low[0] + level[0] * a + nx * OFF_WALL, low[1] + y, low[2] + level[2] * a + nz * OFF_WALL];
    for (const a of [k - width / length / 2, k + width / length / 2]) {
      const p = point(a, bottom);
      if (p[0] < x0 || p[0] > x1 || p[2] < z0 || p[2] > z1 || covered([p[0] + nx * CLEAR, p[1], p[2] + nz * CLEAR], face.solid)) return false;
    }
    // Wound to face out: the wall's far side never sees it.
    const across = (width / length) * (level[0] * nz - level[2] * nx >= 0 ? 1 : -1);
    const origin = point(k - across / 2, bottom);
    out.push({ origin, u: [level[0] * across, 0, level[2] * across], v: [0, height, 0], mark, tint });
    return true;
  };
  const place = (count: number, from: readonly Wall[], lay: (wall: Wall) => boolean) => {
    if (from.length === 0) return;
    for (let i = 0; i < count; i++) for (let t = 0; t < TRIES && !lay(byLength(from, random)); t++);
  };
  place(STREAKS, walls.filter((w) => w.headOpen), (w) => {
    const height = between(0.7, Math.min(3.2, w.height));
    return onWall(w, between(0.35, 0.9), height, w.height - height, 'streak', random() < 0.2 ? [...RUST, 0.6] : [...DIRT, 0.62]);
  });
  place(DAMP, walls.filter((w) => w.onGround), (w) => onWall(w, between(1.5, 4), between(0.5, Math.min(1.3, w.height)), 0, 'damp', [...DIRT, 0.55]));
  place(CRACKS, walls, (w) => {
    const size = between(0.7, 1.5);
    if (size > w.height) return false;
    return onWall(w, size, size, random() * (w.height - size), 'crack', [...SOOT, 0.8]);
  });
  const groundAt = openGround(faces, solids, scatter);
  for (let i = 0; i < STAINS; i++) {
    for (let t = 0; t < TRIES; t++) {
      const size = between(1.2, 3.4);
      const [x, z] = [between(x0, x1), between(z0, z1)];
      const y = groundAt(x, z, size * 0.7);
      if (y === null) continue;
      out.push({ origin: [x - size / 2, y + OFF_GROUND, z + size / 2], u: [size, 0, 0], v: [0, 0, -size], mark: 'stain', tint: [...DIRT, 0.42] });
      break;
    }
  }
  return out;
}
