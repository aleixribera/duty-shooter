import type { Material, Vec3 } from '@duty-shooter/fps-core';
import type { Face, Family, Finish } from './surfaces';

/**
 * What a shot looks and sounds like it hit: the finish of the face it struck, where that says more than the solid's
 * material. A house's outer wall is one `wood` solid with plaster on its inside face, so by the solid alone a shot into a
 * room's wall threw wood splinters and a tan crater out of what is drawn as plaster. Penetration and damage stay with the
 * solid; only the impact's dust, chips, hole and sound follow the face.
 */
const FAMILY_MATERIAL: Partial<Record<Family, Material>> = {
  plaster: 'plaster',
  wornPlaster: 'plaster',
  tile: 'plaster',
  brick: 'brick',
  concrete: 'concrete',
  siding: 'wood',
  floor: 'wood',
  fence: 'wood',
  louvre: 'wood',
  shingles: 'wood',
  sheetMetal: 'sheetMetal',
};

/** The grid cell (m) faces are filed under, how far off a face's plane (m) a hit may lie and still be on it, and how far past its edges (m). */
const CELL = 4;
const ON_PLANE = 0.03;
const PAST_EDGE = 0.01;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class SurfaceHits {
  readonly #faces: readonly Face[];
  readonly #finishes: Readonly<Record<string, Finish>>;
  readonly #cells = new Map<string, number[]>();

  constructor(faces: readonly Face[], finishes: Readonly<Record<string, Finish>>) {
    this.#faces = faces;
    this.#finishes = finishes;
    faces.forEach((f, i) => {
      if (f.solid < 0) return; // Trim stands off the wall it decorates: a shot lands on the wall.
      const xs = [f.origin[0], f.origin[0] + f.u[0], f.origin[0] + f.v[0], f.origin[0] + f.u[0] + f.v[0]];
      const zs = [f.origin[2], f.origin[2] + f.u[2], f.origin[2] + f.v[2], f.origin[2] + f.u[2] + f.v[2]];
      for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++)
        for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
          const key = `${cx},${cz}`;
          const list = this.#cells.get(key);
          if (list) list.push(i);
          else this.#cells.set(key, [i]);
        }
    });
  }

  /** The material a hit at `point` on a surface facing `normal` shows: its face's, or `fallback` (the solid's) where the face says nothing more. */
  materialAt(point: Vec3, normal: Vec3, fallback: Material): Material {
    const list = this.#cells.get(`${Math.floor(point[0] / CELL)},${Math.floor(point[2] / CELL)}`);
    if (!list) return fallback;
    // The face that holds the point wins over one it lies just past the edge of (a seam between two finishes), then the nearer plane.
    let best: Face | null = null;
    let bestPast = PAST_EDGE;
    let bestOff = ON_PLANE;
    for (const i of list) {
      const f = this.#faces[i]!;
      if (dot(f.normal, normal) < 0.9) continue;
      const d: Vec3 = [point[0] - f.origin[0], point[1] - f.origin[1], point[2] - f.origin[2]];
      const off = Math.abs(dot(d, f.normal));
      if (off > ON_PLANE) continue;
      const lu = Math.sqrt(dot(f.u, f.u));
      const lv = Math.sqrt(dot(f.v, f.v));
      const su = dot(d, f.u) / lu;
      const sv = dot(d, f.v) / lv;
      const past = Math.max(0, -su, su - lu) + Math.max(0, -sv, sv - lv);
      if (past > bestPast || (past === bestPast && off >= bestOff)) continue;
      best = f;
      bestPast = past;
      bestOff = off;
    }
    const family = best ? this.#finishes[best.finish]?.family : undefined;
    return (family && FAMILY_MATERIAL[family]) ?? fallback;
  }
}
