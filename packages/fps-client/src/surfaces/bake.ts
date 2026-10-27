import { createWorld, raycastWorld, type Solid, type Vec3, type World } from '@duty-shooter/fps-core';
import { ATLAS_BORDER, type Atlas } from './atlas';
import { insideFrame, isClear, solidFrame, type Face, type Frame } from './faces';
import { LIGHTING, encodeLight, skyRadiance, type Lamp, type Lighting } from './lighting';

/**
 * The lighting bake: for every lightmap texel, how much sun reaches it
 * (soft-edged shadows) and how much light arrives from the sky, from the
 * map's lamps and from lit surfaces nearby (ambient occlusion and a bounce).
 * Runs on the CPU
 * at build time; the output ships with the build.
 *
 * Passes can be split over texel ranges so the build can spread them over
 * worker threads: run `sun` over every range, then `indirect` twice (it
 * reads the sun pass where its rays land, and the first indirect pass too
 * the second time, for a second bounce), then `encode`.
 */

const SUN_RAYS = 4;
const SKY_RAYS = 32;
const SKY_REACH = 30;
const SUN_REACH = 160;
/** How far a sample point is lifted off its surface before rays leave it (m). */
const LIFT = 0.02;
/** How far sample points stay in from a face's edges (m), so rays don't start inside a neighbour. */
const INSET = 0.03;

/** Light probes for moving objects: a grid of points, each with the ambient light and sun visibility there. */
export interface ProbeGrid {
  readonly min: Vec3;
  readonly step: number;
  readonly dims: readonly [number, number, number];
}

export interface BakeInput {
  readonly solids: readonly Solid[];
  readonly faces: readonly Face[];
  readonly atlas: Atlas;
  /** Linear albedo per face. */
  readonly albedo: readonly Vec3[];
  /** The map's sun and sky (the afternoon if not given). */
  readonly lighting?: Lighting;
  /** Lamps lighting the map (none if not given). */
  readonly lamps?: readonly Lamp[];
}

const ZERO: Vec3 = [0, 0, 0];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len2 = (a: Vec3) => dot(a, a);

/** A small integer hash (deterministic noise for ray rotations). */
function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** An orthonormal pair perpendicular to `n`. */
function tangents(n: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t: Vec3 = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const l = Math.hypot(t[0], t[1], t[2]);
  const t1: Vec3 = [t[0] / l, t[1] / l, t[2] / l];
  return [t1, [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]]];
}

/** Cosine-weighted directions around +Z (Hammersley points), rotated per texel. */
const HEMISPHERE: readonly [number, number, number][] = Array.from({ length: SKY_RAYS }, (_, i) => {
  let bits = i;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  const u = (i + 0.5) / SKY_RAYS;
  const v = bits / 4294967296;
  const r = Math.sqrt(u);
  const phi = 2 * Math.PI * v;
  return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(1 - u)];
});

export class Baker {
  readonly #input: BakeInput;
  readonly #light: Lighting;
  readonly #lamps: readonly Lamp[];
  readonly #world: World;
  /** Occluder index -> drawn solid index. */
  readonly #solidOf: number[];
  readonly #frames: Frame[];
  /** Drawn solid x 6 + side -> face index. */
  readonly #faceOf = new Map<number, number>();
  /** First texel of each face (-1 without a lightmap). */
  readonly #first: Int32Array;
  readonly #texFace: Int32Array;
  readonly #texI: Int32Array;
  readonly #texJ: Int32Array;
  readonly texels: number;

  constructor(input: BakeInput) {
    this.#input = input;
    this.#light = input.lighting ?? LIGHTING;
    this.#lamps = input.lamps ?? [];
    const occluders = input.solids.map((s, i) => ({ s, i })).filter(({ s }) => !isClear(s) && s.prop === null);
    this.#solidOf = occluders.map(({ i }) => i);
    this.#world = createWorld(occluders.map(({ s }) => (s.blocks === 'players' ? { ...s, blocks: 'both' as const } : s)));
    this.#frames = occluders.map(({ s }) => solidFrame(s));
    input.faces.forEach((f, i) => {
      if (f.solid >= 0) this.#faceOf.set(f.solid * 6 + f.side, i);
    });
    this.#first = new Int32Array(input.faces.length).fill(-1);
    let n = 0;
    input.faces.forEach((_, i) => {
      const r = input.atlas.rects[i];
      if (!r) return;
      this.#first[i] = n;
      n += r.w * r.h;
    });
    this.texels = n;
    this.#texFace = new Int32Array(n);
    this.#texI = new Int32Array(n);
    this.#texJ = new Int32Array(n);
    input.faces.forEach((_, i) => {
      const r = input.atlas.rects[i];
      if (!r) return;
      let k = this.#first[i]!;
      for (let j = 0; j < r.h; j++)
        for (let x = 0; x < r.w; x++, k++) {
          this.#texFace[k] = i;
          this.#texI[k] = x;
          this.#texJ[k] = j;
        }
    });
  }

  /** The world point a texel samples, lifted off its surface. */
  #point(k: number): { p: Vec3; n: Vec3; face: number } {
    const fi = this.#texFace[k]!;
    const f = this.#input.faces[fi]!;
    const r = this.#input.atlas.rects[fi]!;
    const lu = Math.sqrt(len2(f.u));
    const lv = Math.sqrt(len2(f.v));
    const s = Math.min(Math.max(this.#texI[k]! / (r.w - 1), INSET / lu), 1 - INSET / lu);
    const t = Math.min(Math.max(this.#texJ[k]! / (r.h - 1), INSET / lv), 1 - INSET / lv);
    const n = f.normal;
    return {
      p: [f.origin[0] + f.u[0] * s + f.v[0] * t + n[0] * LIFT, f.origin[1] + f.u[1] * s + f.v[1] * t + n[1] * LIFT, f.origin[2] + f.u[2] * s + f.v[2] * t + n[2] * LIFT],
      n,
      face: fi,
    };
  }

  /** Whether a point is buried in an opaque solid other than `self` (drawn solid index). */
  #buried(p: Vec3, self: number): boolean {
    for (const i of this.#world.bullets.inRect(p[0] - 0.01, p[2] - 0.01, p[0] + 0.01, p[2] + 0.01)) {
      if (this.#solidOf[i] !== self && insideFrame(this.#frames[i]!, p, 0.001)) return true;
    }
    return false;
  }

  #sunVisibility(p: Vec3, seed: number): number {
    const L = this.#light.sunDirection;
    const [t1, t2] = tangents(L);
    let lit = 0;
    for (let r = 0; r < SUN_RAYS; r++) {
      const a = 2 * Math.PI * ((r + hash(seed)) / SUN_RAYS);
      const s = this.#light.sunSpread * Math.sqrt((r + 0.5) / SUN_RAYS);
      const d: Vec3 = [L[0] + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * s, L[1] + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * s, L[2] + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * s];
      if (!raycastWorld(this.#world, p, [p[0] + d[0] * SUN_REACH, p[1] + d[1] * SUN_REACH, p[2] + d[2] * SUN_REACH])) lit++;
    }
    return lit / SUN_RAYS;
  }

  /**
   * Sun pass over texels [from, to): n.L times sun visibility, or -1 for a
   * texel buried in another solid (filled from its neighbours later).
   */
  sun(from: number, to: number, out: Float32Array): void {
    const L = this.#light.sunDirection;
    for (let k = from; k < to; k++) {
      const { p, n, face } = this.#point(k);
      const f = this.#input.faces[face]!;
      if (this.#buried(p, f.solid)) {
        out[k] = -1;
        continue;
      }
      const cos = dot(n, L);
      out[k] = cos <= 0 ? 0 : cos * this.#sunVisibility(p, k * 7 + 1);
    }
  }

  /** The texel nearest where a ray landed on a drawn solid's face, or null if that face has no texels. */
  #texelAt(solid: number, point: Vec3, normal: Vec3): { face: number; texel: number } | null {
    const frame = solidFrame(this.#input.solids[solid]!);
    let side = -1;
    let best = 0.5;
    for (let k = 0; k < 3; k++) {
      const d = dot(normal, frame.axes[k]!);
      if (Math.abs(d) > best) {
        best = Math.abs(d);
        side = 2 * k + (d > 0 ? 1 : 0);
      }
    }
    const fi = this.#faceOf.get(solid * 6 + side);
    if (fi === undefined) return null;
    const r = this.#input.atlas.rects[fi];
    if (!r) return null;
    const f = this.#input.faces[fi]!;
    const d: Vec3 = [point[0] - f.origin[0], point[1] - f.origin[1], point[2] - f.origin[2]];
    const s = Math.min(1, Math.max(0, dot(d, f.u) / len2(f.u)));
    const t = Math.min(1, Math.max(0, dot(d, f.v) / len2(f.v)));
    return { face: fi, texel: this.#first[fi]! + Math.round(t * (r.h - 1)) * r.w + Math.round(s * (r.w - 1)) };
  }

  /**
   * Light arriving along `d` from `p`: the sky, or the surface the ray lands
   * on, lit by the sun and by `bounce` (an earlier indirect pass) where given,
   * else roughly by the sky.
   */
  #radiance(p: Vec3, d: Vec3, sun: Float32Array, bounce: Float32Array | null): Vec3 {
    const hit = raycastWorld(this.#world, p, [p[0] + d[0] * SKY_REACH, p[1] + d[1] * SKY_REACH, p[2] + d[2] * SKY_REACH]);
    if (!hit) return skyRadiance(d, this.#light);
    if (dot(hit.normal, d) > 0) return [0, 0, 0];
    const at = this.#texelAt(this.#solidOf[hit.solid]!, hit.point, hit.normal);
    if (!at) return [0, 0, 0];
    const a = this.#input.albedo[at.face]!;
    const c = this.#light.sunColor;
    const sunlit = this.#light.sunIntensity * Math.max(0, sun[at.texel]!);
    // Without an earlier pass, the surface's own skylight, roughly: half the open sky's.
    const sky = 0.5 * this.#light.skyIntensity * 0.6;
    const k = 3 * at.texel;
    const [ir, ig, ib] = bounce && sun[at.texel]! >= 0 ? [bounce[k]!, bounce[k + 1]!, bounce[k + 2]!] : [sky, sky, sky];
    return [a[0] * (sunlit * c[0] + ir), a[1] * (sunlit * c[1] + ig), a[2] * (sunlit * c[2] + ib)];
  }

  /**
   * Light reaching `p` straight from the lamps, on a surface facing `n` (or,
   * with no `n`, the mean over every facing, for a probe). Each lamp fades
   * with the square of distance and smoothly to nothing at its range, and a
   * ray to it must get through: the lamp's own head (the last 30 cm) never
   * blocks it.
   */
  #lampLight(p: Vec3, n: Vec3 | null): Vec3 {
    const out: [number, number, number] = [0, 0, 0];
    for (const lamp of this.#lamps) {
      const d: Vec3 = [lamp.position[0] - p[0], lamp.position[1] - p[1], lamp.position[2] - p[2]];
      const dist = Math.sqrt(len2(d));
      if (dist >= lamp.range || dist < 1e-3) continue;
      const cos = n ? dot(n, d) / dist : 0.25;
      if (cos <= 0) continue;
      const k = 1 - Math.min(0.3, dist) / dist;
      if (raycastWorld(this.#world, p, [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k])) continue;
      const fade = (1 - (dist / lamp.range) ** 4) ** 2;
      const e = (lamp.intensity * cos * fade) / Math.max(1, dist * dist);
      out[0] += lamp.color[0] * e;
      out[1] += lamp.color[1] * e;
      out[2] += lamp.color[2] * e;
    }
    return out;
  }

  /**
   * Indirect pass over texels [from, to): mean incoming light over the
   * hemisphere (cosine-weighted), plus the lamps' light, RGB per texel.
   * `bounce` is the previous indirect pass, or null on the first.
   */
  indirect(sun: Float32Array, bounce: Float32Array | null, from: number, to: number, out: Float32Array): void {
    for (let k = from; k < to; k++) {
      if (sun[k]! < 0) continue;
      const { p, n } = this.#point(k);
      const [t1, t2] = tangents(n);
      const rot = 2 * Math.PI * hash(k * 13 + 5);
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [hx, hy, hz] of HEMISPHERE) {
        const x = hx * cr - hy * sr;
        const y = hx * sr + hy * cr;
        const d: Vec3 = [t1[0] * x + t2[0] * y + n[0] * hz, t1[1] * x + t2[1] * y + n[1] * hz, t1[2] * x + t2[2] * y + n[2] * hz];
        const l = this.#radiance(p, d, sun, bounce);
        r += l[0];
        g += l[1];
        b += l[2];
      }
      const lamps = this.#lamps.length ? this.#lampLight(p, n) : ZERO;
      out[3 * k] = r / SKY_RAYS + lamps[0];
      out[3 * k + 1] = g / SKY_RAYS + lamps[1];
      out[3 * k + 2] = b / SKY_RAYS + lamps[2];
    }
  }

  /**
   * The lightmap as RGBA bytes: RGB the indirect light (square-root encoded,
   * lightly blurred against bake noise), A the sun term. Buried texels and
   * the borders take their neighbours' values.
   */
  encode(sun: Float32Array, indirect: Float32Array): Uint8Array {
    const { atlas, faces } = this.#input;
    const out = new Uint8Array(atlas.width * atlas.height * 4);
    faces.forEach((_, fi) => {
      const r = atlas.rects[fi];
      if (!r) return;
      const first = this.#first[fi]!;
      const valid = (i: number, j: number) => i >= 0 && j >= 0 && i < r.w && j < r.h && sun[first + j * r.w + i]! >= 0;
      const value = new Float32Array(r.w * r.h * 4);
      const ok = new Uint8Array(r.w * r.h);
      for (let j = 0; j < r.h; j++)
        for (let i = 0; i < r.w; i++) {
          if (!valid(i, j)) continue;
          let n = 0;
          let cr = 0;
          let cg = 0;
          let cb = 0;
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              if (!valid(i + di, j + dj)) continue;
              const k = first + (j + dj) * r.w + (i + di);
              const w = di === 0 && dj === 0 ? 2 : 1;
              cr += indirect[3 * k]! * w;
              cg += indirect[3 * k + 1]! * w;
              cb += indirect[3 * k + 2]! * w;
              n += w;
            }
          const o = (j * r.w + i) * 4;
          value[o] = cr / n;
          value[o + 1] = cg / n;
          value[o + 2] = cb / n;
          value[o + 3] = sun[first + j * r.w + i]!;
          ok[j * r.w + i] = 1;
        }
      // Fill buried texels from valid neighbours, growing outward.
      for (let pass = 0; pass < Math.max(r.w, r.h); pass++) {
        let missing = 0;
        const next = ok.slice();
        for (let j = 0; j < r.h; j++)
          for (let i = 0; i < r.w; i++) {
            if (ok[j * r.w + i]) continue;
            let n = 0;
            const acc = [0, 0, 0, 0];
            for (let dj = -1; dj <= 1; dj++)
              for (let di = -1; di <= 1; di++) {
                const ii = i + di;
                const jj = j + dj;
                if (ii < 0 || jj < 0 || ii >= r.w || jj >= r.h || !ok[jj * r.w + ii]) continue;
                for (let c = 0; c < 4; c++) acc[c]! += value[(jj * r.w + ii) * 4 + c]!;
                n++;
              }
            if (n === 0) {
              missing++;
              continue;
            }
            for (let c = 0; c < 4; c++) value[(j * r.w + i) * 4 + c] = acc[c]! / n;
            next[j * r.w + i] = 1;
          }
        ok.set(next);
        if (missing === 0) break;
      }
      // Write the rect and its border (clamped copies of the edge texels).
      for (let j = -ATLAS_BORDER; j < r.h + ATLAS_BORDER; j++)
        for (let i = -ATLAS_BORDER; i < r.w + ATLAS_BORDER; i++) {
          const ci = Math.min(r.w - 1, Math.max(0, i));
          const cj = Math.min(r.h - 1, Math.max(0, j));
          const src = (cj * r.w + ci) * 4;
          const dst = ((r.y + j) * atlas.width + (r.x + i)) * 4;
          const has = ok[cj * r.w + ci];
          out[dst] = has ? encodeLight(value[src]!) : encodeLight(0.4);
          out[dst + 1] = has ? encodeLight(value[src + 1]!) : encodeLight(0.4);
          out[dst + 2] = has ? encodeLight(value[src + 2]!) : encodeLight(0.4);
          out[dst + 3] = has ? Math.round(Math.min(1, Math.max(0, value[src + 3]!)) * 255) : 0;
        }
    });
    return out;
  }

  /**
   * Bakes the light probes: per probe, the mean light arriving from every
   * direction (RGB, encoded like the lightmap) and how much of the sun it
   * sees (A), from the sun pass and the last indirect pass. Probes buried in
   * solids copy their neighbours.
   */
  probes(grid: ProbeGrid, sun: Float32Array, indirect: Float32Array): Uint8Array {
    const [nx, ny, nz] = grid.dims;
    const count = nx * ny * nz;
    const value = new Float32Array(count * 4);
    const ok = new Uint8Array(count);
    const dirs: Vec3[] = Array.from({ length: 32 }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / 32;
      const r = Math.sqrt(1 - y * y);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      return [r * Math.cos(phi), y, r * Math.sin(phi)];
    });
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          const k = x + y * nx + z * nx * ny;
          const p: Vec3 = [grid.min[0] + x * grid.step, grid.min[1] + y * grid.step, grid.min[2] + z * grid.step];
          if (this.#buried(p, -1)) continue;
          let r = 0;
          let g = 0;
          let b = 0;
          for (const d of dirs) {
            const l = this.#radiance(p, d, sun, indirect);
            r += l[0];
            g += l[1];
            b += l[2];
          }
          const lamps = this.#lamps.length ? this.#lampLight(p, null) : ZERO;
          value[4 * k] = r / dirs.length + lamps[0];
          value[4 * k + 1] = g / dirs.length + lamps[1];
          value[4 * k + 2] = b / dirs.length + lamps[2];
          value[4 * k + 3] = this.#sunVisibility(p, k * 3 + 11);
          ok[k] = 1;
        }
    for (let pass = 0; pass < 8; pass++) {
      const next = ok.slice();
      for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            const k = x + y * nx + z * nx * ny;
            if (ok[k]) continue;
            let n = 0;
            const acc = [0, 0, 0, 0];
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
              const xx = x + dx;
              const yy = y + dy;
              const zz = z + dz;
              if (xx < 0 || yy < 0 || zz < 0 || xx >= nx || yy >= ny || zz >= nz) continue;
              const kk = xx + yy * nx + zz * nx * ny;
              if (!ok[kk]) continue;
              for (let c = 0; c < 4; c++) acc[c]! += value[4 * kk + c]!;
              n++;
            }
            if (!n) continue;
            for (let c = 0; c < 4; c++) value[4 * k + c] = acc[c]! / n;
            next[k] = 1;
          }
      ok.set(next);
    }
    const out = new Uint8Array(count * 4);
    for (let k = 0; k < count; k++) {
      out[4 * k] = encodeLight(value[4 * k]!);
      out[4 * k + 1] = encodeLight(value[4 * k + 1]!);
      out[4 * k + 2] = encodeLight(value[4 * k + 2]!);
      out[4 * k + 3] = Math.round(Math.min(1, value[4 * k + 3]!) * 255);
    }
    return out;
  }
}
