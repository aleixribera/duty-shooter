import type { Vec3 } from '@duty-shooter/fps-core';
import type { Face } from './faces';

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
