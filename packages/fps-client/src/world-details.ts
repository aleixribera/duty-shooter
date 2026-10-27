import type { Vec3 } from '@duty-shooter/fps-core';
import { attribute, color, cos, dot, float, max, mix, normalWorld, positionLocal, sin, smoothstep, time, vec3 } from 'three/tsl';
import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, SRGBColorSpace } from 'three/webgpu';
import { atlasUv, LIGHTING, type SurfaceLayout } from './surfaces';
import { haze, type ProbeField } from './surface-materials';

/** Where a live sign's face goes: its centre on the board, facing `yaw`, and its size (m). */
export interface SignPlacement {
  readonly center: Vec3;
  readonly yaw: number;
  readonly width: number;
  readonly height: number;
}

/** The UI's type: system fonts only, condensed first. */
const FONT = '"Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", sans-serif';
const INK = '#9b2f24';
const PAPER = '#f2ead6';

/**
 * The population sign's face: the town's name, how many are in the lobby and
 * how many kills this match, painted on a canvas and redrawn when either
 * count changes. Lit like the moving things, so it sits in the world's light.
 */
export class PopulationSign {
  readonly mesh: Mesh;
  readonly #canvas: HTMLCanvasElement;
  readonly #texture: CanvasTexture;
  #shown = '';

  constructor(at: SignPlacement) {
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = 1024;
    this.#canvas.height = Math.round((1024 * at.height) / at.width);
    this.#texture = new CanvasTexture(this.#canvas);
    this.#texture.colorSpace = SRGBColorSpace;
    this.#texture.anisotropy = 8;
    const material = new MeshStandardNodeMaterial({ map: this.#texture, roughness: 0.8 });
    this.mesh = new Mesh(new PlaneGeometry(at.width, at.height), material);
    // A few millimetres off the board, so the two never fight.
    const off = 0.004;
    this.mesh.position.set(at.center[0] + Math.sin(at.yaw) * off, at.center[1], at.center[2] + Math.cos(at.yaw) * off);
    this.mesh.rotation.y = at.yaw;
    this.show(0, 0);
  }

  /** Shows these counts, redrawing only when they changed. */
  show(population: number, kills: number): void {
    const key = `${population}/${kills}`;
    if (key === this.#shown) return;
    this.#shown = key;
    this.#draw(population, kills);
    this.#texture.needsUpdate = true;
  }

  #draw(population: number, kills: number): void {
    const ctx = this.#canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = this.#canvas;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    // A double rule round the edge.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, w - 64, h - 64);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `700 ${Math.round(h * 0.2)}px ${FONT}`;
    ctx.fillText('SURVIVAL TOWN', w / 2, h * 0.3);
    ctx.fillRect(w * 0.12, h * 0.36, w * 0.76, 4);
    // Two columns: the lobby and the match.
    for (const [x, label, value] of [
      [w * 0.29, 'POPULATION', population],
      [w * 0.71, 'KILLS THIS MATCH', kills],
    ] as const) {
      ctx.font = `600 ${Math.round(h * 0.075)}px ${FONT}`;
      ctx.fillText(label, x, h * 0.49);
      ctx.font = `700 ${Math.round(h * 0.3)}px ${FONT}`;
      ctx.fillText(String(value), x, h * 0.8);
    }
    ctx.fillRect(w / 2 - 2, h * 0.43, 4, h * 0.4);
    ctx.font = `600 ${Math.round(h * 0.055)}px ${FONT}`;
    ctx.fillText('EST. 1955', w / 2, h * 0.92);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardNodeMaterial).dispose();
    this.#texture.dispose();
  }
}

/** The far world round a map (see the map definition's `horizon`). */
export interface Horizon {
  /** The finish the far ground wears. */
  readonly ground: string;
  /** The map's own ground, which the far ground surrounds. */
  readonly inner: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  /** Open ground whose baked light the far ground borrows (x, z). */
  readonly light: readonly [number, number];
}

/** How far the far ground runs from the map's middle (m); the mountains stand inside it. */
export const FAR_GROUND = 1500;
/** The mountains' ring: where they rise from the ground and where they end (m from the map's middle). */
const MOUNTAINS = { from: 650, to: 1350 } as const;

/** Whether a face is part of the ground: looking up, at y 0. */
const isGround = (f: SurfaceLayout['faces'][number]) => f.normal[1] > 0.99 && Math.abs(f.origin[1]) < 1e-4;

/** The lightmap coordinates of the drawn ground face under (x, z), or null when no face is there. */
export function groundUv(layout: SurfaceLayout, x: number, z: number): [number, number] | null {
  for (const [i, f] of layout.faces.entries()) {
    const rect = layout.atlas.rects[i];
    if (!rect || !isGround(f)) continue;
    const dx = x - f.origin[0];
    const dz = z - f.origin[2];
    const s = (dx * f.u[0] + dz * f.u[2]) / (f.u[0] * f.u[0] + f.u[2] * f.u[2]);
    const t = (dx * f.v[0] + dz * f.v[2]) / (f.v[0] * f.v[0] + f.v[2] * f.v[2]);
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) return atlasUv(layout.atlas, rect, s, t);
  }
  return null;
}

/**
 * The far ground: a flat apron at y 0 from the edge of the map's ground out
 * to `FAR_GROUND`, every vertex of its inner edge on a vertex of the map's
 * ground faces so no crack opens along the seam. It wears the map's ground
 * finish (pattern coordinates as a floor's) and reads one lightmap texel, the
 * open ground's at `horizon.light`, so the two meet in the same light.
 */
export function farGroundGeometry(layout: SurfaceLayout, horizon: Horizon): BufferGeometry {
  const { x0, x1, z0, z1 } = horizon.inner;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const R = FAR_GROUND;
  type P = readonly [number, number];
  // The inner rectangle's sides and the outer square's, corner to corner, the same way round.
  const sides: (readonly [P, P, P, P])[] = [
    [[x0, z0], [x1, z0], [cx - R, cz - R], [cx + R, cz - R]],
    [[x1, z0], [x1, z1], [cx + R, cz - R], [cx + R, cz + R]],
    [[x1, z1], [x0, z1], [cx + R, cz + R], [cx - R, cz + R]],
    [[x0, z1], [x0, z0], [cx - R, cz + R], [cx - R, cz - R]],
  ];
  const corners: P[] = [];
  for (const f of layout.faces) {
    if (!isGround(f)) continue;
    for (const [a, b] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      corners.push([f.origin[0] + f.u[0] * a + f.v[0] * b, f.origin[2] + f.u[2] * a + f.v[2] * b]);
    }
  }
  const light = groundUv(layout, horizon.light[0], horizon.light[1]) ?? [0, 0];
  const at = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const position: number[] = [];
  for (const [a, b, oa, ob] of sides) {
    // Where the ground's own vertices fall along this side (0..1).
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const along = new Set([0, 1]);
    for (const [x, z] of corners) {
      const t = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (len * len);
      const off = Math.abs((x - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0])) / len;
      if (off < 1e-4 && t > 0 && t < 1) along.add(Math.round(t * 1e7) / 1e7);
    }
    const ts = [...along].sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i++) {
      const p0 = at(a, b, ts[i]!);
      const p1 = at(a, b, ts[i + 1]!);
      const q0 = at(oa, ob, ts[i]!);
      const q1 = at(oa, ob, ts[i + 1]!);
      for (const p of [p0, q0, p1, p1, q0, q1]) position.push(p[0], 0, p[1]);
    }
  }
  // Every triangle must face up; flip any that came out the other way.
  for (let i = 0; i < position.length; i += 9) {
    const ux = position[i + 3]! - position[i]!;
    const uz = position[i + 5]! - position[i + 2]!;
    const vx = position[i + 6]! - position[i]!;
    const vz = position[i + 8]! - position[i + 2]!;
    // y of (u x v): negative means the triangle faces down.
    if (uz * vx - ux * vz < 0) {
      for (let k = 0; k < 3; k++) [position[i + 3 + k], position[i + 6 + k]] = [position[i + 6 + k]!, position[i + 3 + k]!];
    }
  }
  const n = position.length / 3;
  const normal: number[] = [];
  const uv: number[] = [];
  const uv1: number[] = [];
  for (let v = 0; v < n; v++) {
    normal.push(0, 1, 0);
    // A floor's pattern axes: x, then -z.
    uv.push(position[v * 3]!, -position[v * 3 + 2]!);
    uv1.push(light[0], light[1]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  g.computeBoundingSphere();
  return g;
}

/** Smooth 2D value noise in 0..1, from a seeded lattice. */
function valueNoise(seed: number): (x: number, z: number) => number {
  const hash = (i: number, j: number) => {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, z) => {
    const i = Math.floor(x);
    const j = Math.floor(z);
    const fx = fade(x - i);
    const fz = fade(z - j);
    const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * fx;
    const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * fx;
    return a + (b - a) * fz;
  };
}

/** Mountain height (m) at (x, z), `k` of the way across the ring and `a` round it (rad). */
function mountainHeight(noise: (x: number, z: number) => number, x: number, z: number, k: number, a: number): number {
  if (k <= 0) return 0;
  let sum = 0;
  let amp = 0.5;
  let f = 1 / 380;
  for (let o = 0; o < 4; o++) {
    sum += amp * noise(x * f + o * 17.3, z * f - o * 9.1);
    amp *= 0.5;
    f *= 2.1;
  }
  const ridge = 1 - Math.abs((sum / 0.9375) * 2 - 1);
  // Rising from the plain over the first third, then ridges; some directions lower than others.
  const u = Math.min(1, k / 0.35);
  const rise = u * u * (3 - 2 * u);
  const range = 0.45 + 0.55 * noise(Math.cos(a) * 2.3 + 40, Math.sin(a) * 2.3 + 40);
  return rise * range * (25 + 105 * ridge * ridge);
}

/**
 * Distant mountains all round: a low-poly ring of ridges between
 * `MOUNTAINS.from` and `.to` round (cx, cz), a few degrees high, in desert
 * rock that the haze turns blue-grey. Their feet take the colour of the
 * ground they rise from (`ground`, sRGB), so no line shows where they meet
 * it. Drawn only; nothing collides with them or casts a shadow from them.
 */
export function mountains(cx: number, cz: number, ground: number): Mesh {
  const noise = valueNoise(1955);
  const segments = 360;
  const rings = 9;
  const position = new Float32Array((segments + 1) * rings * 3);
  for (let s = 0; s <= segments; s++) {
    // The last column repeats the first, so the ring closes without a seam.
    const a = ((s % segments) / segments) * Math.PI * 2;
    for (let r = 0; r < rings; r++) {
      const k = r / (rings - 1);
      const radius = MOUNTAINS.from + (MOUNTAINS.to - MOUNTAINS.from) * k;
      const x = cx + Math.cos(a) * radius;
      const z = cz + Math.sin(a) * radius;
      position.set([x, mountainHeight(noise, x, z, k, a), z], (s * rings + r) * 3);
    }
  }
  const index: number[] = [];
  for (let s = 0; s < segments; s++) {
    for (let r = 0; r + 1 < rings; r++) {
      const p = s * rings + r;
      const q = (s + 1) * rings + r;
      index.push(p, q, p + 1, q, q + 1, p + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  // Lit by the sky and the sun, lighter on the ridges than in the gullies, then hazed with distance.
  const material = new MeshBasicNodeMaterial();
  const sun = vec3(...LIGHTING.sunDirection);
  const y = positionLocal.y;
  const rock = mix(color(ground), mix(color(0x6f5b49), color(0x9d8467), smoothstep(float(20), float(110), y)), smoothstep(float(2), float(30), y));
  const lit = rock.mul(vec3(0.42, 0.44, 0.47).add(vec3(...LIGHTING.sunColor).mul(LIGHTING.sunIntensity * 0.8).mul(max(dot(normalWorld, sun), float(0)))));
  material.colorNode = haze(mix(lit, vec3(...LIGHTING.skyHorizon).mul(LIGHTING.skyIntensity), 0.1) as never);
  const mesh = new Mesh(g, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** A small seeded random source, so the motes sit in the same places every load. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Dust motes drifting in the air of the indoor zones: tiny specks, one draw
 * call, bright where the probes see the sun and nearly gone in shade. Purely
 * visual; nothing collides with them.
 */
export function dustMotes(zones: readonly { readonly min: Vec3; readonly max: Vec3 }[], probes: ProbeField, perCubicMetre = 0.25, perZone = 140): Mesh | null {
  const rand = random(1955);
  const centres: Vec3[] = [];
  for (const z of zones) {
    const size = [z.max[0] - z.min[0], z.max[1] - z.min[1], z.max[2] - z.min[2]] as const;
    const n = Math.min(perZone, Math.round(size[0] * size[1] * size[2] * perCubicMetre));
    for (let i = 0; i < n; i++) centres.push([z.min[0] + rand() * size[0], z.min[1] + 0.3 + rand() * (size[1] - 0.5), z.min[2] + rand() * size[2]]);
  }
  if (centres.length === 0) return null;
  // Each mote a tetrahedron about a centimetre across, with a phase for its drift.
  const r = 0.008;
  const corners: Vec3[] = [
    [r, r, r],
    [r, -r, -r],
    [-r, r, -r],
    [-r, -r, r],
  ];
  const position = new Float32Array(centres.length * 12);
  const phase = new Float32Array(centres.length * 4);
  const index = new Uint32Array(centres.length * 12);
  centres.forEach((c, m) => {
    const p = rand() * Math.PI * 2;
    corners.forEach((k, j) => {
      position.set([c[0] + k[0], c[1] + k[1], c[2] + k[2]], (m * 4 + j) * 3);
      phase[m * 4 + j] = p;
    });
    const v = m * 4;
    index.set([v, v + 1, v + 2, v, v + 3, v + 1, v, v + 2, v + 3, v + 1, v + 3, v + 2], m * 12);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('phase', new BufferAttribute(phase, 1));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingSphere();

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const ph = attribute('phase', 'float');
  const t = time.mul(0.25).add(ph);
  material.positionNode = positionLocal.add(vec3(sin(t).mul(0.18), sin(t.mul(0.7).add(ph.mul(1.3))).mul(0.12), cos(t.mul(0.8)).mul(0.18)));
  material.colorNode = color(0xfff1d6);
  material.opacityNode = float(0.04).add(probes.sun().mul(0.5));
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
