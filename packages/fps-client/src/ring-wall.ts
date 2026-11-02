import { abs, atan, attribute, color, dot, exp, float, fract, fwidth, max, min, mix, mx_noise_float, normalWorld, normalize, positionWorld, cameraPosition, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import { AdditiveBlending, BufferAttribute, CylinderGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, type Node, type Scene } from 'three/webgpu';
import type { RingCircle } from './ui/royale';

/**
 * The Ring's colours: the HUD's hazard colour (`--ds-hazard`, used for the
 * Ring alone), a deeper blue for the body of the sheet and a hot near-white
 * for the crackle.
 */
const HAZARD = 0x8f6bff;
const DEEP = 0x3324c8;
const HOT = 0xd9ccff;
/** The wall runs from under the lowest ground to well over the summit (m). */
const FOOT = -30;
const HEIGHT = 420;
/** How many flat panels make the circle: at 700 m that's 17 m a panel, flat enough to read as a curve. */
const SEGMENTS = 256;
/** A lattice diamond's width (m). */
const CELL = 7;

/** What the wall stands on: the ground's height and the water's surface, as the island's Terrain gives them. */
export interface RingGround {
  heightAt(x: number, z: number): number;
  waterAbove(x: number, y: number, z: number): number;
}

/**
 * The surface under each column of the wall, for its foot glow: the ground, or the water over
 * it, never under sea level (off the island's rectangle there is only the sea). The cylinder's
 * vertices run round it in `SEGMENTS + 1` columns, angle `2π·j/SEGMENTS` at (r·sin, r·cos),
 * and its two rows share a column's height, so `out` holds the row twice (ticket 44).
 */
export function groundUnderRing(ring: RingCircle, ground: RingGround, out = new Float32Array((SEGMENTS + 1) * 2)): Float32Array {
  const columns = out.length / 2;
  for (let j = 0; j < columns; j++) {
    const theta = (j / (columns - 1)) * Math.PI * 2;
    const x = ring.x + ring.radius * Math.sin(theta);
    const z = ring.z + ring.radius * Math.cos(theta);
    const h = Math.max(0, ground.heightAt(x, z), ground.waterAbove(x, 0, z));
    out[j] = h;
    out[j + columns] = h;
  }
  return out;
}

/**
 * The Battle Royale's Ring as a wall in the world: one open cylinder, one
 * draw call, unlit and additive so it costs nothing to light and glows over
 * the dusk from a kilometre off. Its shader is a few lines of procedural
 * pattern with no texture: a thin sheet in the hazard colour, brightest
 * where it meets the ground and fading up into the sky; slow streams
 * rising through it; a faint diamond lattice that reads as a made thing up
 * close and fades out before it can shimmer far away; and bright filaments
 * crackling across it in patches. At a grazing angle it thickens, so the
 * far side of the circle stands out as a wall rather than a haze. It
 * draws on both faces, so it reads the same from inside and outside.
 */
export class RingWall {
  readonly mesh: Mesh;
  readonly #scene: Scene;
  readonly #radius = uniform(1);
  readonly #clock = uniform(0);
  readonly #strength = uniform(1);
  /** The wall's centre, and how many lattice cells go round it (a whole number, so the pattern closes without a seam). */
  readonly #cx = uniform(0);
  readonly #cz = uniform(0);
  readonly #cells = uniform(100);
  /** The surface under each column, which the foot glow sits on; refilled only when the Ring moves. */
  readonly #ground: BufferAttribute;
  readonly #heights = new Float32Array((SEGMENTS + 1) * 2);
  readonly #terrain: RingGround | null;
  #at = { x: NaN, z: NaN, radius: NaN };

  constructor(scene: Scene, terrain: RingGround | null = null) {
    this.#scene = scene;
    this.#terrain = terrain;
    const geometry = new CylinderGeometry(1, 1, 1, SEGMENTS, 1, true);
    geometry.translate(0, 0.5, 0);
    // One float a vertex, read by the shader: no extra draw, no texture.
    this.#ground = new BufferAttribute(this.#heights, 1);
    geometry.setAttribute('ground', this.#ground);
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false });
    const p = positionWorld;
    const t = this.#clock;
    // Lattice cells round the wall and up it, whatever the radius, so the pattern keeps its size as the Ring closes.
    const rel = p.xz.sub(vec2(this.#cx, this.#cz));
    const around = atan(rel.y, rel.x).div(Math.PI * 2).mul(this.#cells);
    const up = p.y;
    const cell = this.#radius.mul(Math.PI * 2).div(this.#cells);
    // Height: a bright foot where the wall meets the ground (or the sea), a long fade into the sky.
    const foot = exp(up.sub(attribute<'float'>('ground', 'float')).max(0).div(-14)).mul(0.9);
    const body = smoothstep(float(HEIGHT - 30), float(20), up);
    // Detail fades as it shrinks toward a pixel, judged by how fast it changes across one: far away it would only shimmer.
    const sharp = (n: Node<'float'>) => smoothstep(float(0.4), float(0.1), fwidth(n));
    // Streams rising slowly, broken up by a second, slower noise.
    // Noise in world space: on the wall's surface it is seamless all the way round.
    const rising = mx_noise_float(vec3(p.x.div(9), up.div(38).sub(t.mul(0.35)), p.z.div(9)));
    // Close up the wall is busy with detail; past a couple of hundred metres it calms to its large shapes.
    const near = smoothstep(float(220), float(50), cameraPosition.sub(p).length());
    const stream = mix(float(0.5), rising.mul(0.5).add(0.5), sharp(rising).mul(near.mul(0.6).add(0.4)));
    const drift = mx_noise_float(vec3(p.x.div(70).add(t.mul(0.04)), up.div(120), p.z.div(70))).mul(0.5).add(0.5);
    const flow = stream.mul(drift).mul(1.6);
    // The lattice: diamonds 7 m across, lines a little thicker than a pixel, gone once a cell is smaller than a few pixels.
    const a = around.add(up.div(cell));
    const b = around.sub(up.div(cell));
    const line = (v: typeof a) => {
      const w = fwidth(v);
      const d = abs(fract(v).sub(0.5));
      return smoothstep(w.mul(1.5).add(0.02), float(0.0), float(0.5).sub(d)).mul(smoothstep(float(0.25), float(0.05), w));
    };
    const lattice = max(line(a), line(b)).mul(0.45);
    // Crackle: the zero lines of a fast noise, thin and bright, only where a slow mask lets them through.
    const zap = mx_noise_float(vec3(p.x.div(5).add(t.mul(1.7)), up.div(5), p.z.div(5).sub(t.mul(1.1))));
    const zw = fwidth(zap).add(0.015);
    const filament = smoothstep(zw.mul(2), float(0), abs(zap)).mul(sharp(zap)).mul(near);
    const mask = smoothstep(float(0.45), float(0.7), mx_noise_float(vec3(p.x.div(40), up.div(30).add(t.mul(0.6)), p.z.div(40))).mul(0.5).add(0.5));
    // The same crackle six times larger, so the wall still sparks from far off where the fine one has faded.
    const arc = mx_noise_float(vec3(p.x.div(32).add(t.mul(0.5)), up.div(32), p.z.div(32).sub(t.mul(0.33))));
    const aw = fwidth(arc).add(0.01);
    const bolt = smoothstep(aw.mul(1.6), float(0), abs(arc)).mul(sharp(arc));
    const flicker = smoothstep(float(0.55), float(0.8), mx_noise_float(vec3(p.x.div(160), up.div(90).add(t.mul(0.9)), p.z.div(160))).mul(0.5).add(0.5));
    const crackle = filament.mul(mask).mul(1.4).add(bolt.mul(flicker).mul(0.9));
    // Grazing views see more of the sheet: the far side of the circle reads as a wall.
    const view = normalize(cameraPosition.sub(p));
    const facing = abs(dot(normalWorld, view));
    const graze = min(float(3), float(1).div(facing.add(0.33)));
    const sheet = float(0.16).add(flow.mul(0.22)).add(foot).mul(body).mul(graze);
    const glow = mix(color(DEEP), color(HAZARD), stream.add(foot).min(1)).mul(sheet).add(color(HAZARD).mul(lattice.mul(body))).add(color(HOT).mul(crackle.mul(body)));
    m.colorNode = glow.mul(this.#strength);
    this.mesh = new Mesh(geometry, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.mesh.position.y = FOOT;
    this.mesh.scale.y = HEIGHT - FOOT;
    scene.add(this.mesh);
  }

  /** Puts the wall where the Ring stands, or hides it (null: no Ring in play). `time` drives the animation (s). */
  update(ring: RingCircle | null, time: number): void {
    const on = ring !== null && ring.radius > 0.5;
    this.mesh.visible = on;
    if (!on) return;
    this.mesh.position.x = ring.x;
    this.mesh.position.z = ring.z;
    this.mesh.scale.x = ring.radius;
    this.mesh.scale.z = ring.radius;
    this.#cx.value = ring.x;
    this.#cz.value = ring.z;
    this.#radius.value = ring.radius;
    this.#cells.value = Math.max(4, Math.round((ring.radius * Math.PI * 2) / CELL));
    this.#clock.value = time % 1000;
    const at = this.#at;
    if (this.#terrain && (at.x !== ring.x || at.z !== ring.z || at.radius !== ring.radius)) {
      this.#at = { x: ring.x, z: ring.z, radius: ring.radius };
      groundUnderRing(ring, this.#terrain, this.#heights);
      this.#ground.needsUpdate = true;
    }
  }

  /** Brightness, 1 by default (the Preparation can ignite it from 0). */
  set strength(v: number) {
    this.#strength.value = v;
  }

  dispose(): void {
    this.#scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}
