/**
 * Small procedural-mesh toolkit shared by the viewmodel gun and arms.
 *
 * Everything is built as indexed triangle "parts" carrying position, normal
 * and a `surf` vec3 attribute (x = tint/colour variant, y = edge wear,
 * z = ambient occlusion). Parts are transformed and appended into a
 * {@link GeoBuilder}, one builder per material / movable piece, so each
 * builder becomes exactly one draw call.
 */
import { BufferAttribute, BufferGeometry, Matrix3, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { attribute, dFdx, dFdy, normalView, positionView } from 'three/tsl';

export type V2 = readonly [number, number];
/** Polygon corner: x, y and an optional fillet radius. */
export type Corner = readonly [number, number, number?];

/** A closed 2D contour with per-point edge-wear and sharpness flags. */
export interface Ring {
  readonly p: V2[];
  readonly w: number[];
  readonly sharp: boolean[];
  tint: number;
}

// ---------------------------------------------------------------------------
// Part: an indexed triangle list in its own local space.
// ---------------------------------------------------------------------------

export class Part {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly srf: number[] = [];
  readonly idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, tint = 1, wear = 0, ao = 1): number {
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.srf.push(tint, wear, ao);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  clone(): Part {
    const p = new Part();
    for (let i = 0; i < this.pos.length; i++) {
      p.pos.push(this.pos[i]!);
      p.nrm.push(this.nrm[i]!);
      p.srf.push(this.srf[i]!);
    }
    for (const i of this.idx) p.idx.push(i);
    return p;
  }

  /** Applies a matrix in place (flipping winding for mirroring matrices). */
  transform(m: Matrix4): this {
    const nm = new Matrix3().getNormalMatrix(m);
    const v = new Vector3();
    for (let i = 0; i < this.pos.length; i += 3) {
      v.set(this.pos[i]!, this.pos[i + 1]!, this.pos[i + 2]!).applyMatrix4(m);
      this.pos[i] = v.x;
      this.pos[i + 1] = v.y;
      this.pos[i + 2] = v.z;
      v.set(this.nrm[i]!, this.nrm[i + 1]!, this.nrm[i + 2]!).applyMatrix3(nm).normalize();
      this.nrm[i] = v.x;
      this.nrm[i + 1] = v.y;
      this.nrm[i + 2] = v.z;
    }
    if (m.determinant() < 0) {
      for (let i = 0; i < this.idx.length; i += 3) {
        const t = this.idx[i + 1]!;
        this.idx[i + 1] = this.idx[i + 2]!;
        this.idx[i + 2] = t;
      }
    }
    return this;
  }

  /** Multiplies the surf attribute channels. */
  surf(tint = 1, wear = 1, ao = 1): this {
    for (let i = 0; i < this.srf.length; i += 3) {
      this.srf[i] = this.srf[i]! * tint;
      this.srf[i + 1] = this.srf[i + 1]! * wear;
      this.srf[i + 2] = this.srf[i + 2]! * ao;
    }
    return this;
  }

  /** Overrides the surf attribute per vertex from its (local) position. */
  surfBy(fn: (p: Vector3, s: [number, number, number]) => void): this {
    const v = new Vector3();
    const s: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.pos.length; i += 3) {
      v.set(this.pos[i]!, this.pos[i + 1]!, this.pos[i + 2]!);
      s[0] = this.srf[i]!;
      s[1] = this.srf[i + 1]!;
      s[2] = this.srf[i + 2]!;
      fn(v, s);
      this.srf[i] = s[0];
      this.srf[i + 1] = s[1];
      this.srf[i + 2] = s[2];
    }
    return this;
  }
}

/** Matrix from a position and a rotation given as an Euler-free basis. */
export function basis(x: Vector3, y: Vector3, z: Vector3, p: Vector3 = new Vector3()): Matrix4 {
  return new Matrix4().makeBasis(x, y, z).setPosition(p);
}

export function mat(px = 0, py = 0, pz = 0, q: Quaternion = new Quaternion(), s = 1): Matrix4 {
  return new Matrix4().compose(new Vector3(px, py, pz), q, new Vector3(s, s, s));
}

export const X = new Vector3(1, 0, 0);
export const Y = new Vector3(0, 1, 0);
export const Z = new Vector3(0, 0, 1);
export const NX = new Vector3(-1, 0, 0);
export const NY = new Vector3(0, -1, 0);
export const NZ = new Vector3(0, 0, -1);

/** Rotation that maps local -Z onto `dir`. */
export function aim(dir: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(NZ, dir.clone().normalize());
}

export function qAxis(axis: Vector3, angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, angle);
}

// ---------------------------------------------------------------------------
// GeoBuilder: accumulates parts into one BufferGeometry.
// ---------------------------------------------------------------------------

export interface SkinRef {
  /** Up to two bone indices and weights (weights should sum to 1). */
  readonly i0: number;
  readonly i1: number;
  readonly w1: number;
}

export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly srf: number[] = [];
  private readonly idx: number[] = [];
  private readonly skI: number[] = [];
  private readonly skW: number[] = [];
  private readonly groups: { start: number; count: number; mat: number }[] = [];
  private skinned = false;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  /**
   * Appends a part. The part is not modified (it is copied). `skin` is
   * evaluated on the part's local positions, before `m` is applied; bone
   * indices are offset by `boneOffset`.
   */
  add(part: Part, m?: Matrix4, skin?: (p: Vector3) => SkinRef, boneOffset = 0): this {
    if (skin) {
      this.skinned = true;
      const v = new Vector3();
      for (let i = 0; i < part.pos.length; i += 3) {
        v.set(part.pos[i]!, part.pos[i + 1]!, part.pos[i + 2]!);
        const s = skin(v);
        if (s.w1 <= 0.0001 || s.i0 === s.i1) {
          this.skI.push(s.i0 + boneOffset, 0, 0, 0);
          this.skW.push(1, 0, 0, 0);
        } else if (s.w1 >= 0.9999) {
          this.skI.push(s.i1 + boneOffset, 0, 0, 0);
          this.skW.push(1, 0, 0, 0);
        } else {
          this.skI.push(s.i0 + boneOffset, s.i1 + boneOffset, 0, 0);
          this.skW.push(1 - s.w1, s.w1, 0, 0);
        }
      }
    }
    const src = m ? part.clone().transform(m) : part;
    const base = this.pos.length / 3;
    for (let i = 0; i < src.pos.length; i++) {
      this.pos.push(src.pos[i]!);
      this.nrm.push(src.nrm[i]!);
      this.srf.push(src.srf[i]!);
    }
    for (const i of src.idx) this.idx.push(i + base);
    return this;
  }

  /** Starts a material group (for multi-material meshes). Call before adding its parts. */
  group(materialIndex: number): this {
    const last = this.groups[this.groups.length - 1];
    if (last) last.count = this.idx.length - last.start;
    this.groups.push({ start: this.idx.length, count: 0, mat: materialIndex });
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('surf', new BufferAttribute(new Float32Array(this.srf), 3));
    if (this.skinned) {
      g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.skI), 4));
      g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.skW), 4));
    }
    const vc = this.pos.length / 3;
    g.setIndex(new BufferAttribute(vc > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    const last = this.groups[this.groups.length - 1];
    if (last) last.count = this.idx.length - last.start;
    for (const gr of this.groups) if (gr.count > 0) g.addGroup(gr.start, gr.count, gr.mat);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// 2D contours
// ---------------------------------------------------------------------------

function signedArea(p: readonly V2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]!;
    const [x1, y1] = p[(i + 1) % p.length]!;
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Polygon with filleted corners. Arc interior points carry wear = 1 (edges
 * get worn), arc ends wear = 0 so flat faces stay clean. Corners without a
 * radius are sharp (shading crease) and unworn.
 */
export function polyRound(corners: readonly Corner[], segDeg = 15, tint = 1): Ring {
  const p: V2[] = [];
  const w: number[] = [];
  const sharp: boolean[] = [];
  const n = corners.length;
  const push = (x: number, y: number, wear: number, s: boolean): void => {
    const last = p[p.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y) < 1e-7) return;
    p.push([x, y]);
    w.push(wear);
    sharp.push(s);
  };
  for (let i = 0; i < n; i++) {
    const [px, py, r = 0] = corners[i]!;
    const [ax, ay] = corners[(i + n - 1) % n]!;
    const [bx, by] = corners[(i + 1) % n]!;
    if (r < 0) {
      // Smooth pass-through point (no fillet, no crease).
      push(px, py, 0, false);
      continue;
    }
    if (r === 0) {
      push(px, py, 0, true);
      continue;
    }
    let d1x = ax - px;
    let d1y = ay - py;
    let d2x = bx - px;
    let d2y = by - py;
    const l1 = Math.hypot(d1x, d1y);
    const l2 = Math.hypot(d2x, d2y);
    d1x /= l1;
    d1y /= l1;
    d2x /= l2;
    d2y /= l2;
    const cosA = Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y));
    const full = Math.acos(cosA); // interior angle
    if (full > Math.PI - 1e-3) {
      push(px, py, 0, false);
      continue;
    }
    const half = full / 2;
    let rr = r;
    let t = rr / Math.tan(half);
    const tMax = Math.min(l1, l2) * 0.5;
    if (t > tMax) {
      t = tMax;
      rr = t * Math.tan(half);
    }
    const t1x = px + d1x * t;
    const t1y = py + d1y * t;
    const t2x = px + d2x * t;
    const t2y = py + d2y * t;
    let bxv = d1x + d2x;
    let byv = d1y + d2y;
    const bl = Math.hypot(bxv, byv);
    bxv /= bl;
    byv /= bl;
    const cd = rr / Math.sin(half);
    const cx = px + bxv * cd;
    const cy = py + byv * cd;
    const a1 = Math.atan2(t1y - cy, t1x - cx);
    let a2 = Math.atan2(t2y - cy, t2x - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    a2 = a1 + da;
    const segs = Math.max(2, Math.ceil(Math.abs(da) / ((segDeg * Math.PI) / 180)));
    for (let k = 0; k <= segs; k++) {
      const a = a1 + (da * k) / segs;
      push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, k === 0 || k === segs ? 0 : 1, false);
    }
  }
  // Remove a duplicate closing point.
  const first = p[0];
  const last = p[p.length - 1];
  if (first && last && p.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-7) {
    p.pop();
    w.pop();
    sharp.pop();
  }
  return { p, w, sharp, tint };
}

export function circleRing(cx: number, cy: number, r: number, segs: number, tint = 1, wear = 0): Ring {
  const p: V2[] = [];
  const w: number[] = [];
  const sharp: boolean[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    w.push(wear);
    sharp.push(false);
  }
  return { p, w, sharp, tint };
}

export function rectRing(x0: number, y0: number, x1: number, y1: number, r: number, segDeg = 15, tint = 1): Ring {
  return polyRound(
    [
      [x0, y0, r],
      [x1, y0, r],
      [x1, y1, r],
      [x0, y1, r],
    ],
    segDeg,
    tint,
  );
}

function orient(ring: Ring, ccw: boolean): Ring {
  const a = signedArea(ring.p);
  if (a > 0 === ccw) return ring;
  return {
    p: [...ring.p].reverse(),
    w: [...ring.w].reverse(),
    sharp: [...ring.sharp].reverse(),
    tint: ring.tint,
  };
}

// ---------------------------------------------------------------------------
// Loft: a 2D contour (with holes) swept along local +Z through stations.
// ---------------------------------------------------------------------------

export interface Station {
  readonly z: number;
  /** Inward offset of the contour at this station. */
  readonly inset: number;
  /** Normal tilt toward +Z (radians); -PI/2..PI/2. */
  readonly phi: number;
  readonly wear: number;
}

/** Stations for a prism from z0 to z1 with rounded bevels at both ends. */
export function bevelStations(z0: number, z1: number, bevel: number, segs = 3, front = true, back = true): Station[] {
  const st: Station[] = [];
  const b = Math.min(bevel, (z1 - z0) / 2 - 1e-6);
  if (back && b > 0) {
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const psi = (t * Math.PI) / 2;
      st.push({ z: z0 + b - b * Math.cos(psi), inset: b - b * Math.sin(psi), phi: -(Math.PI / 2) * (1 - t), wear: k === 0 || k === segs ? 0 : 1 });
    }
  } else {
    st.push({ z: z0, inset: 0, phi: 0, wear: 0 });
  }
  if (front && b > 0) {
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const psi = (t * Math.PI) / 2;
      st.push({ z: z1 - b + b * Math.sin(psi), inset: b - b * Math.cos(psi), phi: (Math.PI / 2) * t, wear: k === 0 || k === segs ? 0 : 1 });
    }
  } else {
    st.push({ z: z1, inset: 0, phi: 0, wear: 0 });
  }
  return st;
}

interface PointInfo {
  /** Miter offset direction (outward), scaled so an inset of d moves the edges by d. */
  mx: number;
  my: number;
  n1x: number;
  n1y: number;
  n2x: number;
  n2y: number;
  /** Largest positive inset before a convex rounded corner folds over. */
  limIn: number;
  /** Largest negative inset (growth) before a concave rounded corner folds. */
  limOut: number;
}

function pointInfo(ring: Ring): PointInfo[] {
  const p = ring.p;
  const n = p.length;
  const out: PointInfo[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = p[i]!;
    const [ax, ay] = p[(i + n - 1) % n]!;
    const [bx, by] = p[(i + 1) % n]!;
    let e1x = px - ax;
    let e1y = py - ay;
    let e2x = bx - px;
    let e2y = by - py;
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1;
    e1y /= l1;
    e2x /= l2;
    e2y /= l2;
    const n1x = e1y;
    const n1y = -e1x;
    const n2x = e2y;
    const n2y = -e2x;
    const d = 1 + n1x * n2x + n1y * n2y;
    let mx = d > 1e-4 ? (n1x + n2x) / d : n1x;
    let my = d > 1e-4 ? (n1y + n2y) / d : n1y;
    const ml = Math.hypot(mx, my);
    if (ml > 3) {
      mx *= 3 / ml;
      my *= 3 / ml;
    }
    let limIn = Infinity;
    let limOut = Infinity;
    if (!ring.sharp[i]) {
      const turn = Math.acos(Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y)));
      if (turn > 1e-4) {
        const rLocal = Math.min(l1, l2) / turn;
        const convex = e1x * e2y - e1y * e2x > 0;
        if (convex) limIn = rLocal * 0.92;
        else limOut = rLocal * 0.92;
      }
    }
    out.push({ mx, my, n1x, n1y, n2x, n2y, limIn, limOut });
  }
  return out;
}

function clampInset(info: PointInfo, inset: number): number {
  return inset > 0 ? Math.min(inset, info.limIn) : Math.max(inset, -info.limOut);
}

interface Column {
  pt: number;
  nx: number;
  ny: number;
  wear: number;
}

function columns(ring: Ring, info: readonly PointInfo[]): Column[] {
  const cols: Column[] = [];
  for (let i = 0; i < ring.p.length; i++) {
    const pi = info[i]!;
    const wear = ring.w[i]!;
    const angle = Math.acos(Math.max(-1, Math.min(1, pi.n1x * pi.n2x + pi.n1y * pi.n2y)));
    if (ring.sharp[i] && angle > 0.35) {
      cols.push({ pt: i, nx: pi.n1x, ny: pi.n1y, wear });
      cols.push({ pt: i, nx: pi.n2x, ny: pi.n2y, wear });
    } else {
      let ax2 = pi.n1x + pi.n2x;
      let ay2 = pi.n1y + pi.n2y;
      const al = Math.hypot(ax2, ay2) || 1;
      ax2 /= al;
      ay2 /= al;
      cols.push({ pt: i, nx: ax2, ny: ay2, wear });
    }
  }
  return cols;
}

export interface LoftOptions {
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
  readonly ao?: number;
}

export function loft(outerIn: Ring, holesIn: readonly Ring[], stations: readonly Station[], opts: LoftOptions = {}): Part {
  const part = new Part();
  const outer = orient(outerIn, true);
  const holes = holesIn.map((h) => orient(h, false));
  const ao = opts.ao ?? 1;
  const rings = [outer, ...holes];
  const infos = rings.map((r) => pointInfo(r));
  rings.forEach((ring, ri) => {
    const info = infos[ri]!;
    const cols = columns(ring, info);
    const nc = cols.length;
    const ids: number[][] = [];
    for (const st of stations) {
      const row: number[] = [];
      const c = Math.cos(st.phi);
      const s = Math.sin(st.phi);
      for (const col of cols) {
        const [px, py] = ring.p[col.pt]!;
        const pi = info[col.pt]!;
        const ins = clampInset(pi, st.inset);
        row.push(part.vert(px - pi.mx * ins, py - pi.my * ins, st.z, col.nx * c, col.ny * c, s, ring.tint, Math.max(st.wear, col.wear), ao));
      }
      ids.push(row);
    }
    for (let si = 0; si + 1 < stations.length; si++) {
      const r0 = ids[si]!;
      const r1 = ids[si + 1]!;
      for (let k = 0; k < nc; k++) {
        const k1 = (k + 1) % nc;
        if (cols[k]!.pt === cols[k1]!.pt) continue;
        const a = r0[k]!;
        const b = r0[k1]!;
        const c2 = r1[k1]!;
        const d = r1[k]!;
        part.tri(a, b, c2);
        part.tri(a, c2, d);
      }
    }
  });
  const offsetRing = (ring: Ring, info: readonly PointInfo[], inset: number): Vector2[] =>
    ring.p.map(([x, y], i) => {
      const pi = info[i]!;
      const ins = clampInset(pi, inset);
      return new Vector2(x - pi.mx * ins, y - pi.my * ins);
    });
  // Triangulate the un-inset contour once. Its topology is clean, while a bevel
  // inset can fold tiny loops at tight fillets and make earcut drop triangles.
  // The inset ring has the same vertices in the same order, so the indices carry over.
  const rawContour = outer.p.map(([x, y]) => new Vector2(x, y));
  const rawHoles = holes.map((h) => h.p.map(([x, y]) => new Vector2(x, y)));
  const rawAll = [rawContour, ...rawHoles].flat();
  const rawFaces = ShapeUtils.triangulateShape(rawContour, rawHoles);
  const cap = (st: Station, dir: 1 | -1): void => {
    const contour = offsetRing(outer, infos[0]!, st.inset);
    const holePts = holes.map((h, i) => offsetRing(h, infos[i + 1]!, st.inset));
    const insetFaces = ShapeUtils.triangulateShape(contour, holePts);
    const useRaw = insetFaces.length < rawFaces.length;
    const faces = useRaw ? rawFaces : insetFaces;
    const all = [contour, ...holePts].flat();
    const ref = useRaw ? rawAll : all;
    const base = part.vertexCount;
    for (const v of all) part.vert(v.x, v.y, st.z, 0, 0, dir, outer.tint, 0, ao);
    for (const f of faces) {
      const [a, b, c] = f as [number, number, number];
      const pa = ref[a]!;
      const pb = ref[b]!;
      const pc = ref[c]!;
      const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
      if (area > 0 === dir > 0) part.tri(base + a, base + b, base + c);
      else part.tri(base + a, base + c, base + b);
    }
  };
  const s0 = stations[0];
  const s1 = stations[stations.length - 1];
  if (s0 && opts.capStart !== false) cap(s0, -1);
  if (s1 && opts.capEnd !== false) cap(s1, 1);
  return part;
}

// ---------------------------------------------------------------------------
// Planar faces
// ---------------------------------------------------------------------------

/** A flat polygon (with holes) at local z facing +Z (dir 1) or -Z (dir -1). Ring wear is kept per vertex. */
export function capFace(outerIn: Ring, holesIn: readonly Ring[], z: number, dir: 1 | -1, ao = 1): Part {
  const part = new Part();
  const outer = orient(outerIn, true);
  const holes = holesIn.map((h) => orient(h, false));
  const contour = outer.p.map(([x, y]) => new Vector2(x, y));
  const holePts = holes.map((h) => h.p.map(([x, y]) => new Vector2(x, y)));
  const wears = [outer.w, ...holes.map((h) => h.w)].flat();
  const faces = ShapeUtils.triangulateShape(contour, holePts);
  const all = [contour, ...holePts].flat();
  all.forEach((v, i) => part.vert(v.x, v.y, z, 0, 0, dir, outer.tint, wears[i] ?? 0, ao));
  for (const f of faces) {
    const [a, b, c] = f as [number, number, number];
    const pa = all[a]!;
    const pb = all[b]!;
    const pc = all[c]!;
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y);
    if (area > 0 === dir > 0) part.tri(a, b, c);
    else part.tri(a, c, b);
  }
  return part;
}

/** Smooth arc points (no fillet) for use inside polyRound corner lists. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, n: number): Corner[] {
  const out: Corner[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, -1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Grid surfaces (radial lathes, tubes, organic shapes)
// ---------------------------------------------------------------------------

export interface GridSample {
  x: number;
  y: number;
  z: number;
  tint: number;
  wear: number;
  ao: number;
}

/**
 * Builds an (ni x nj) grid surface; j wraps when `closedJ`. Normals come from
 * central differences: n = d/di x d/dj (flip to invert).
 */
export function grid(
  ni: number,
  nj: number,
  fn: (i: number, j: number, out: GridSample) => void,
  opts: { closedI?: boolean; closedJ?: boolean; flip?: boolean } = {},
): Part {
  const closedJ = opts.closedJ ?? true;
  const closedI = opts.closedI ?? false;
  const P: GridSample[] = [];
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const s: GridSample = { x: 0, y: 0, z: 0, tint: 1, wear: 0, ao: 1 };
      fn(i, j, s);
      P.push(s);
    }
  }
  const at = (i: number, j: number): GridSample => P[i * nj + j]!;
  const part = new Part();
  const di = new Vector3();
  const dj = new Vector3();
  const n = new Vector3();
  const centre = (i: number): Vector3 => {
    const c = new Vector3();
    for (let j = 0; j < nj; j++) {
      const s = at(i, j);
      c.x += s.x;
      c.y += s.y;
      c.z += s.z;
    }
    return c.multiplyScalar(1 / nj);
  };
  for (let i = 0; i < ni; i++) {
    for (let j = 0; j < nj; j++) {
      const ip = closedI ? (i + 1) % ni : Math.min(ni - 1, i + 1);
      const im = closedI ? (i + ni - 1) % ni : Math.max(0, i - 1);
      const jp = closedJ ? (j + 1) % nj : Math.min(nj - 1, j + 1);
      const jm = closedJ ? (j + nj - 1) % nj : Math.max(0, j - 1);
      const a = at(ip, j);
      const b = at(im, j);
      const c = at(i, jp);
      const d = at(i, jm);
      di.set(a.x - b.x, a.y - b.y, a.z - b.z);
      dj.set(c.x - d.x, c.y - d.y, c.z - d.z);
      n.crossVectors(di, dj);
      if (n.lengthSq() < 1e-18) {
        // Degenerate (a pole): point away from the neighbouring ring centre.
        const here = centre(i);
        const other = centre(i === 0 ? Math.min(1, ni - 1) : i - 1);
        n.subVectors(here, other);
        if (n.lengthSq() < 1e-18) n.set(0, 0, 1);
      }
      n.normalize();
      if (opts.flip) n.negate();
      const s = at(i, j);
      part.vert(s.x, s.y, s.z, n.x, n.y, n.z, s.tint, s.wear, s.ao);
    }
  }
  const iMax = closedI ? ni : ni - 1;
  const jMax = closedJ ? nj : nj - 1;
  for (let i = 0; i < iMax; i++) {
    for (let j = 0; j < jMax; j++) {
      const i1 = (i + 1) % ni;
      const j1 = (j + 1) % nj;
      const a = i * nj + j;
      const b = i1 * nj + j;
      const c = i1 * nj + j1;
      const d = i * nj + j1;
      if (opts.flip) {
        part.tri(a, c, b);
        part.tri(a, d, c);
      } else {
        part.tri(a, b, c);
        part.tri(a, c, d);
      }
    }
  }
  return part;
}

/** Profile point for radial (lathe) surfaces around local Z. */
export interface RP {
  readonly z: number;
  readonly r: number;
  /** Start a new smoothing band here (hard edge). */
  readonly hard?: boolean;
  readonly wear?: number;
  readonly tint?: number;
  readonly ao?: number;
}

export type RadialMod = (theta: number, z: number, s: GridSample) => void;

/**
 * Lathe surface around local Z. List the profile from the rear (+Z) toward
 * the front (-Z) along the outside so normals face outward; going inward
 * across a front face and back down a bore keeps them facing out of the solid.
 */
export function radial(profile: readonly RP[], segs: number, mod?: RadialMod, maxStep = 0): Part {
  const pts = maxStep > 0 ? subdivide(profile, maxStep) : [...profile];
  const bands: RP[][] = [];
  let cur: RP[] = [];
  for (const p of pts) {
    cur.push(p);
    if (p.hard && cur.length > 1) {
      bands.push(cur);
      cur = [p];
    }
  }
  if (cur.length > 1) bands.push(cur);
  const out = new Part();
  for (const band of bands) {
    const part = grid(band.length, segs, (i, j, s) => {
      const p = band[i]!;
      const th = (j / segs) * Math.PI * 2;
      s.tint = p.tint ?? 1;
      s.wear = p.wear ?? 0;
      s.ao = p.ao ?? 1;
      s.z = p.z;
      s.x = p.r; // radius stored temporarily in x
      if (mod) mod(th, p.z, s);
      const r = s.x;
      s.x = Math.cos(th) * r;
      s.y = Math.sin(th) * r;
    });
    appendPart(out, part);
  }
  return out;
}

function subdivide(profile: readonly RP[], maxStep: number): RP[] {
  const out: RP[] = [];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    out.push(a);
    const b = profile[i + 1];
    if (!b) break;
    const len = Math.hypot(b.z - a.z, b.r - a.r);
    const n = Math.ceil(len / maxStep);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push({
        z: a.z + (b.z - a.z) * t,
        r: a.r + (b.r - a.r) * t,
        wear: (a.wear ?? 0) * (1 - t) + (b.wear ?? 0) * t,
        tint: (a.tint ?? 1) * (1 - t) + (b.tint ?? 1) * t,
        ao: (a.ao ?? 1) * (1 - t) + (b.ao ?? 1) * t,
      });
    }
  }
  return out;
}

export function appendPart(into: Part, p: Part): Part {
  const base = into.vertexCount;
  for (let i = 0; i < p.pos.length; i++) {
    into.pos.push(p.pos[i]!);
    into.nrm.push(p.nrm[i]!);
    into.srf.push(p.srf[i]!);
  }
  for (const i of p.idx) into.idx.push(i + base);
  return into;
}

export function merge(...parts: Part[]): Part {
  const out = new Part();
  for (const p of parts) appendPart(out, p);
  return out;
}

/** Tube swept along a polyline using parallel-transport frames. */
export function tube(path: readonly Vector3[], radius: number | ((t: number) => number), segs: number, closed = false): Part {
  const n = path.length;
  const tangents: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i + n - 1) % n : Math.max(0, i - 1)]!;
    const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    tangents.push(b.clone().sub(a).normalize());
  }
  const normals: Vector3[] = [];
  const t0 = tangents[0]!;
  let ref = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let nrm = ref.clone().sub(t0.clone().multiplyScalar(ref.dot(t0))).normalize();
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    nrm = nrm.clone().sub(t.clone().multiplyScalar(nrm.dot(t))).normalize();
    normals.push(nrm);
  }
  ref = new Vector3();
  return grid(
    n,
    segs,
    (i, j, s) => {
      const t = tangents[i]!;
      const nv = normals[i]!;
      const bv = new Vector3().crossVectors(t, nv);
      const th = (j / segs) * Math.PI * 2;
      const r = typeof radius === 'number' ? radius : radius(i / (n - 1));
      const p = path[i]!;
      s.x = p.x + (nv.x * Math.cos(th) + bv.x * Math.sin(th)) * r;
      s.y = p.y + (nv.y * Math.cos(th) + bv.y * Math.sin(th)) * r;
      s.z = p.z + (nv.z * Math.cos(th) + bv.z * Math.sin(th)) * r;
    },
    { closedI: closed, closedJ: true, flip: true },
  );
}

// ---------------------------------------------------------------------------
// Deterministic hashing / smooth helpers
// ---------------------------------------------------------------------------

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cheap deterministic value noise on 1D/2D, -1..1. */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function vnoise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (a: number, b: number): number => hash1(a * 57 + b * 131);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------------------
// TSL helpers
// ---------------------------------------------------------------------------

/** The per-vertex `surf` attribute (tint, wear, ao). */
export function surfNode(): Node<'vec3'> {
  return attribute('surf', 'vec3');
}

/**
 * Perturbs the view-space normal with a procedural height field using
 * screen-space derivatives (no textures or tangents needed). `height` is in
 * metres of displacement.
 */
export function bumpNormal(height: Node<'float'>): Node<'vec3'> {
  const dpdx = dFdx(positionView);
  const dpdy = dFdy(positionView);
  const dhdx = dFdx(height);
  const dhdy = dFdy(height);
  const n = normalView;
  const r1 = dpdy.cross(n);
  const r2 = n.cross(dpdx);
  const det = dpdx.dot(r1);
  const grad = det.sign().mul(r1.mul(dhdx).add(r2.mul(dhdy)));
  return n.mul(det.abs()).sub(grad).normalize();
}
