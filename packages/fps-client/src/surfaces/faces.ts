import { createWorld, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { DECORATION_TOLERANCE, defaultFinishKey, type Decoration, type SurfaceSpec } from './types';

/** A box in world space: its centre, half extents and its own (unit) axes. */
export interface Frame {
  readonly center: Vec3;
  readonly half: Vec3;
  readonly axes: readonly [Vec3, Vec3, Vec3];
}

/**
 * One rectangle of a drawn box: `origin` is a corner, `u` and `v` its two
 * edges (u x v points along `normal`, so it faces outward when wound
 * origin, origin + u, origin + u + v).
 */
export interface Face {
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  readonly normal: Vec3;
  /** Key into the map's finishes. */
  readonly finish: string;
  /** The drawn solid it belongs to, or -1 for a decoration. */
  readonly solid: number;
  /** The decoration it belongs to, or -1. */
  readonly decoration: number;
  /** Which of its box's six faces: 2 x axis + (0 for -, 1 for +). */
  readonly side: number;
}

const IDENTITY: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function solidFrame(s: Solid): Frame {
  const o = s.orientation;
  if (o) return { center: o.center, half: o.half, axes: o.axes };
  return {
    center: [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2],
    half: [(s.max[0] - s.min[0]) / 2, (s.max[1] - s.min[1]) / 2, (s.max[2] - s.min[2]) / 2],
    axes: IDENTITY,
  };
}

export function decorationFrame(d: Decoration): Frame {
  const c = Math.cos(d.yaw);
  const s = Math.sin(d.yaw);
  return {
    center: d.center,
    half: [d.size[0] / 2, d.size[1] / 2, d.size[2] / 2],
    axes: [
      [c, 0, -s],
      [0, 1, 0],
      [s, 0, c],
    ],
  };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A point in a frame's own coordinates. */
export function toFrame(f: Frame, p: Vec3): Vec3 {
  const d: Vec3 = [p[0] - f.center[0], p[1] - f.center[1], p[2] - f.center[2]];
  return [dot(d, f.axes[0]), dot(d, f.axes[1]), dot(d, f.axes[2])];
}

/** Whether a point lies inside a frame, shrunk by `margin` on every side. */
export function insideFrame(f: Frame, p: Vec3, margin = 0): boolean {
  const l = toFrame(f, p);
  return Math.abs(l[0]) < f.half[0] - margin && Math.abs(l[1]) < f.half[1] - margin && Math.abs(l[2]) < f.half[2] - margin;
}

/** The six faces of a frame, outward-facing. */
export function frameFaces(f: Frame): { origin: Vec3; u: Vec3; v: Vec3; normal: Vec3; side: number }[] {
  const out: { origin: Vec3; u: Vec3; v: Vec3; normal: Vec3; side: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    for (const sign of [-1, 1]) {
      const normal = scale(f.axes[k]!, sign);
      let u = scale(f.axes[i]!, 2 * f.half[i]!);
      let v = scale(f.axes[j]!, 2 * f.half[j]!);
      if (dot(cross(u, v), normal) < 0) [u, v] = [v, u];
      const centre = add(f.center, scale(normal, f.half[k]!));
      const origin = add(centre, add(scale(u, -0.5), scale(v, -0.5)));
      out.push({ origin, u, v, normal, side: 2 * k + (sign > 0 ? 1 : 0) });
    }
  }
  return out;
}

/** Whether a solid is see-through (drawn, but casts no shadow and hides nothing). */
export function isClear(s: Solid): boolean {
  return s.material === 'glass';
}

/**
 * Every face that can be seen, with its finish: faces of drawn solids and of
 * decorations, less the ones buried in other solids (all of a face's sample
 * points inside an opaque neighbour) or lying below the ground (y <= 0).
 */
export function surfaceFaces(solids: readonly Solid[], spec: SurfaceSpec): Face[] {
  const opaque = solids.map((s, i) => ({ s, i })).filter(({ s }) => !isClear(s) && s.prop === null);
  const world = createWorld(opaque.map(({ s }) => s.blocks === 'players' ? { ...s, blocks: 'both' as const } : s));
  const frames = opaque.map(({ s }) => solidFrame(s));
  const owner = opaque.map(({ i }) => i);
  const covered = (self: number, origin: Vec3, u: Vec3, v: Vec3, normal: Vec3) => {
    const points: Vec3[] = [];
    for (const a of [0.02, 0.5, 0.98]) for (const b of [0.02, 0.5, 0.98]) points.push(add(add(origin, add(scale(u, a), scale(v, b))), scale(normal, 0.01)));
    return points.every((p) => {
      const near = world.bullets.inRect(p[0] - 0.01, p[2] - 0.01, p[0] + 0.01, p[2] + 0.01);
      return near.some((n) => owner[n] !== self && insideFrame(frames[n]!, p, 0.002));
    });
  };
  const indoorAt = (p: Vec3) => spec.indoor.some((z) => p[0] > z.min[0] && p[0] < z.max[0] && p[1] > z.min[1] && p[1] < z.max[1] && p[2] > z.min[2] && p[2] < z.max[2]);
  const finishOf = (look: SurfaceSpec['looks'][number], fallback: string, frame: Frame, f: { origin: Vec3; u: Vec3; v: Vec3; normal: Vec3; side: number }) => {
    if (!look) return fallback;
    const { origin, u, v, normal } = f;
    const probe = add(add(origin, add(scale(u, 0.5), scale(v, 0.5))), scale(normal, 0.3));
    const inside = indoorAt(probe) ? look.inside : undefined;
    if (normal[1] > 0.7) return look.top ?? inside ?? look.side;
    if (normal[1] < -0.7) return look.bottom ?? inside ?? look.side;
    // A narrow end: the solid is longer across this face's axis than along the other horizontal one.
    const k = Math.floor(f.side / 2);
    if (look.edge && k !== 1 && frame.half[k]! > frame.half[2 - k]!) return look.edge;
    return inside ?? look.side;
  };
  const below = (origin: Vec3, u: Vec3, v: Vec3) => Math.max(origin[1], origin[1] + u[1], origin[1] + v[1], origin[1] + u[1] + v[1]) <= 0.0005;

  const out: Face[] = [];
  solids.forEach((s, index) => {
    const frame = solidFrame(s);
    for (const f of frameFaces(frame)) {
      if (below(f.origin, f.u, f.v) && f.normal[1] < 0.7) continue;
      if (covered(index, f.origin, f.u, f.v, f.normal)) continue;
      out.push({ ...f, finish: finishOf(spec.looks[index] ?? null, defaultFinishKey(s.material), frame, f), solid: index, decoration: -1 });
    }
  });
  spec.decorations.forEach((d, index) => {
    for (const f of frameFaces(decorationFrame(d))) {
      if (covered(-1, f.origin, f.u, f.v, f.normal)) continue;
      out.push({ ...f, finish: d.finish, solid: -1, decoration: index });
    }
  });
  return out;
}

/**
 * The decorations that stand more than DECORATION_TOLERANCE proud of the
 * solid they decorate (any corner outside its box grown by the tolerance),
 * by index. Decoration is visual only, so it must never show where a bullet
 * or player would not stop.
 */
export function decorationErrors(solids: readonly Solid[], decorations: readonly Decoration[]): number[] {
  const out: number[] = [];
  decorations.forEach((d, index) => {
    const solid = solids[d.solid];
    if (!solid) {
      out.push(index);
      return;
    }
    const frame = solidFrame(solid);
    const deco = decorationFrame(d);
    const [a0, a1, a2] = deco.axes;
    const outside = [-1, 1].some((sx) =>
      [-1, 1].some((sy) =>
        [-1, 1].some((sz) => {
          const corner = add(deco.center, add(scale(a0, sx * deco.half[0]), add(scale(a1, sy * deco.half[1]), scale(a2, sz * deco.half[2]))));
          const l = toFrame(frame, corner);
          return l.some((v, k) => Math.abs(v) > frame.half[k]! + DECORATION_TOLERANCE);
        }),
      ),
    );
    if (outside) out.push(index);
  });
  return out;
}
