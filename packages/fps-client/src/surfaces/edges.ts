import { createWorld, type Solid, type Vec3 } from '@duty-shooter/fps-core';
import { insideFrame, isClear, solidFrame, type Face } from './faces';

/** A corner of a face with no open edge near: past anything the weathering reads, and the same at every corner so nothing varies across the face. */
export const FAR = 30;

/** How far past an edge to look for more wall (m), how many points along it, and how many must find some. */
const STEP = 0.03;
const SAMPLES = 4;
const COVERED = 3;

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Whether `face` is a wall: its normal lies near level. */
const isWall = (face: Face) => Math.abs(face.normal[1]) < 0.2;

const plane = (face: Face) => `${Math.round(face.normal[0] * 100)},${Math.round(face.normal[2] * 100)},${Math.round(dot(face.normal, face.origin) * 200)}`;

/** Whether `p` lies on `face`, which it shares a plane with. */
function onFace(face: Face, p: Vec3): boolean {
  const d: Vec3 = [p[0] - face.origin[0], p[1] - face.origin[1], p[2] - face.origin[2]];
  const a = dot(d, face.u) / dot(face.u, face.u);
  const b = dot(d, face.v) / dot(face.v, face.v);
  return a > -1e-3 && a < 1 + 1e-3 && b > -1e-3 && b < 1 + 1e-3;
}

/**
 * Which edges of each wall face are open: bit 1 its -u edge, 2 its +u, 4 its
 * -v, 8 its +v. An edge is open where the wall stops there, at a corner or
 * round a window or door, and closed where more wall carries on in the same
 * plane (a wall is built in pieces, which shouldn't weather as if each were
 * its own). Faces that aren't walls have no open edges. It is what the
 * weathering wears from: plaster lets go where a wall ends, not where a
 * builder's box does.
 */
export function openEdges(faces: readonly Face[]): Uint8Array {
  const byPlane = new Map<string, Face[]>();
  for (const f of faces) {
    if (!isWall(f) || f.decoration >= 0) continue;
    const key = plane(f);
    const list = byPlane.get(key);
    if (list) list.push(f);
    else byPlane.set(key, [f]);
  }
  const out = new Uint8Array(faces.length);
  faces.forEach((f, i) => {
    if (!isWall(f) || f.decoration >= 0) return;
    const others = (byPlane.get(plane(f)) ?? []).filter((o) => o !== f);
    const lu = Math.hypot(...f.u);
    const lv = Math.hypot(...f.v);
    const carriesOn = (a0: number, b0: number, alongU: boolean) => {
      let found = 0;
      for (let k = 0; k < SAMPLES; k++) {
        const t = (k + 0.5) / SAMPLES;
        const a = alongU ? t : a0;
        const b = alongU ? b0 : t;
        const p: Vec3 = [f.origin[0] + f.u[0] * a + f.v[0] * b, f.origin[1] + f.u[1] * a + f.v[1] * b, f.origin[2] + f.u[2] * a + f.v[2] * b];
        if (others.some((o) => onFace(o, p))) found++;
      }
      return found >= COVERED;
    };
    if (!carriesOn(-STEP / lu, 0, false)) out[i]! |= 1;
    if (!carriesOn(1 + STEP / lu, 0, false)) out[i]! |= 2;
    if (!carriesOn(0, -STEP / lv, true)) out[i]! |= 4;
    if (!carriesOn(0, 1 + STEP / lv, true)) out[i]! |= 8;
  });
  return out;
}

function footOnGround(face: Face): boolean {
  return Math.min(face.origin[1], face.origin[1] + face.u[1], face.origin[1] + face.v[1]) < 0.05;
}

/**
 * At a face's corner (a, b, each 0 or 1 along u and v): the distance (m) to its
 * two ends, its foot and its head, FAR for an edge that isn't open. Laid on the
 * vertices these interpolate to the true distance at any point of the face.
 * A foot on the ground isn't an edge to wear from (the ground splash sees to it).
 */
export function cornerEdges(face: Face, open: number, a: number, b: number): readonly [number, number, number, number] {
  const lu = Math.hypot(...face.u);
  const lv = Math.hypot(...face.v);
  const edge = (bit: number, distance: number) => (open & bit ? distance : FAR);
  const u0 = edge(1, a * lu);
  const u1 = edge(2, (1 - a) * lu);
  const v0 = edge(4, b * lv);
  const v1 = edge(8, (1 - b) * lv);
  // Up the wall runs along whichever edge is closer to vertical.
  if (Math.abs(face.v[1]) >= Math.abs(face.u[1])) {
    const [foot, head] = face.v[1] > 0 ? [v0, v1] : [v1, v0];
    return [u0, u1, footOnGround(face) ? FAR : foot, head];
  }
  const [foot, head] = face.u[1] > 0 ? [u0, u1] : [u1, u0];
  return [v0, v1, footOnGround(face) ? FAR : foot, head];
}

/** How far in front of a face a crease looks for the surface that meets it (m), and how far in from an edge it follows one. */
const CREASE_LIFT = 0.05;
const CREASE_REACH = 0.6;
const CREASE_STEP = 0.02;

/**
 * Where each face meets another surface in a concave crease (a room's corner, a wall's foot on its floor, its head
 * under the ceiling), per edge in openEdges' order (-u, +u, -v, +v): how far in from that edge the crease runs (m;
 * 0 where the neighbour abuts the edge, more where it overlaps the face), or -1 where the edge has none. A crease is
 * found where the space just in front of the face, at or just past the edge, is inside another opaque solid. The
 * bake's 20 cm texels can't hold the darkening there, so the shader draws it from these (faceCreases).
 */
export function creaseEdges(faces: readonly Face[], solids: readonly Solid[]): Float32Array {
  const opaque = solids.map((s, i) => ({ s, i })).filter(({ s }) => !isClear(s) && s.prop === null);
  const world = createWorld(opaque.map(({ s }) => (s.blocks === 'players' ? { ...s, blocks: 'both' as const } : s)));
  const frames = opaque.map(({ s }) => solidFrame(s));
  const owner = opaque.map(({ i }) => i);
  const out = new Float32Array(faces.length * 4).fill(-1);
  const pad = CREASE_LIFT + STEP + 0.01;
  faces.forEach((f, i) => {
    if (f.decoration >= 0) return;
    // The solids that could meet this face: those round it, but itself. Most faces (on Zero Island nearly all) have none.
    const xs = [f.origin[0], f.origin[0] + f.u[0], f.origin[0] + f.v[0], f.origin[0] + f.u[0] + f.v[0]];
    const ys = [f.origin[1], f.origin[1] + f.u[1], f.origin[1] + f.v[1], f.origin[1] + f.u[1] + f.v[1]];
    const zs = [f.origin[2], f.origin[2] + f.u[2], f.origin[2] + f.v[2], f.origin[2] + f.u[2] + f.v[2]];
    const [y0, y1] = [Math.min(...ys) - pad, Math.max(...ys) + pad];
    const near = world.bullets
      .inRect(Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad)
      .filter((n) => owner[n] !== f.solid && opaque[n]!.s.max[1] > y0 && opaque[n]!.s.min[1] < y1);
    if (near.length === 0) return;
    const lu = Math.hypot(...f.u);
    const lv = Math.hypot(...f.v);
    // Edge k runs across u (k < 2) or v, at that coordinate's 0 (even k) or 1 (odd k).
    for (let k = 0; k < 4; k++) {
      const alongU = k < 2;
      const length = alongU ? lu : lv;
      const fixed = k % 2;
      const into = fixed === 0 ? 1 : -1;
      const reach = Math.min(CREASE_REACH, length / 2);
      /** `d` metres in from the edge (negative: past it), `t` of the way along it, and lifted off the face. */
      const { origin: o, u, v, normal: nn } = f;
      const point = (t: number, d: number): Vec3 => {
        const a = fixed + (into * d) / length;
        const x = alongU ? a : t;
        const y = alongU ? t : a;
        return [o[0] + u[0] * x + v[0] * y + nn[0] * CREASE_LIFT, o[1] + u[1] * x + v[1] * y + nn[1] * CREASE_LIFT, o[2] + u[2] * x + v[2] * y + nn[2] * CREASE_LIFT];
      };
      // Only the solids whose bounds reach the strip this edge's samples cover.
      const strip = [point(0, -STEP), point(1, -STEP), point(0, reach), point(1, reach)] as const;
      const lo = [0, 1, 2].map((j) => Math.min(strip[0][j]!, strip[1][j]!, strip[2][j]!, strip[3][j]!) - 0.01);
      const hi = [0, 1, 2].map((j) => Math.max(strip[0][j]!, strip[1][j]!, strip[2][j]!, strip[3][j]!) + 0.01);
      const here = near.filter((n) => {
        const { min, max } = opaque[n]!.s;
        for (let j = 0; j < 3; j++) if (max[j]! <= lo[j]! || min[j]! >= hi[j]!) return false;
        return true;
      });
      if (here.length === 0) continue;
      const solid = (p: Vec3) => here.some((n) => insideFrame(frames[n]!, p, 0.002));
      const depths: number[] = [];
      for (let m = 0; m < SAMPLES && m - depths.length <= SAMPLES - COVERED; m++) {
        const t = (m + 0.5) / SAMPLES;
        const at = (d: number) => point(t, d);
        if (!solid(at(0.005)) && !solid(at(-STEP))) continue;
        if (solid(at(reach))) continue;
        // Where the space in front comes clear, between 0 (buried) and `reach` (clear), to within CREASE_STEP.
        let [lo, hi] = [0, reach];
        if (!solid(at(0.005))) hi = 0;
        while (hi - lo > CREASE_STEP) {
          const mid = (lo + hi) / 2;
          if (solid(at(mid))) lo = mid;
          else hi = mid;
        }
        depths.push(hi);
      }
      if (depths.length >= COVERED) out[i * 4 + k] = Math.min(...depths);
    }
  });
  return out;
}

/** At a face's corner (a, b): the distance (m) to each of its creases, in creaseEdges' order, FAR where an edge has none. */
export function cornerCreases(face: Face, creases: Float32Array, index: number, a: number, b: number): readonly [number, number, number, number] {
  const lu = Math.hypot(...face.u);
  const lv = Math.hypot(...face.v);
  const at = (k: number, distance: number) => {
    const c = creases[index * 4 + k]!;
    return c < 0 ? FAR : distance - c;
  };
  return [at(0, a * lu), at(1, (1 - a) * lu), at(2, b * lv), at(3, (1 - b) * lv)];
}
