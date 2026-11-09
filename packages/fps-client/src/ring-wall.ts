import { abs, atan, attribute, color, dot, exp, float, floor, fract, fwidth, min, mix, mx_noise_float, normalWorld, normalize, positionWorld, cameraPosition, sin, smoothstep, step, uniform, vec2, vec3 } from 'three/tsl';
import { AddEquation, BufferAttribute, CustomBlending, CylinderGeometry, DoubleSide, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, type Node, type Scene } from 'three/webgpu';
import type { RingCircle } from './ui/royale';

/**
 * The Ring's colours: the HUD's hazard colour (`--ds-hazard`, used for the
 * Ring alone), a deeper blue for the body of the curtain, a hot near-white
 * for its foot and its arcs, and the dark violet the wall stains what is
 * seen through it.
 */
const HAZARD = 0x8f6bff;
const DEEP = 0x3324c8;
const HOT = 0xd9ccff;
const STAIN = 0x1c0f52;
/** The wall runs from under the lowest ground to well over the summit (m). */
const FOOT = -30;
const HEIGHT = 420;
/** How many flat panels make the circle: at 700 m that's 17 m a panel, flat enough to read as a curve. */
const SEGMENTS = 256;
/** The wall is cut into lanes about this wide (m), each striking its own arcs. */
const LANE = 44;
/** The pulses that climb the wall: how far apart (m) and how fast (m/s). */
const PULSE = 58;
const PULSE_SPEED = 13;
/** Arcs strike this often in a lane (1/s), in this share of the lanes at a time. */
const STRIKES = 0.85;
const STRIKING = 0.3;

/**
 * How bright (linear luminance) the sky behind the wall is where its arcs and pulses
 * start to fade, and where they are gone: the sun's glow and the lit cloud round it burn
 * through them. Over that light the detail would lift the sky into the highlights the bloom
 * and the sun shafts take for the sun, and the sun would flicker with the arcs (ticket 53).
 */
export const DETAIL_FADE = [0.3, 1.2] as const;

/** How much of the wall's arcs and pulses shows over sky this bright: the shader's curve, for the tests. */
export function detailOver(sky: number): number {
  const t = Math.min(1, Math.max(0, (sky - DETAIL_FADE[1]) / (DETAIL_FADE[0] - DETAIL_FADE[1])));
  return t * t * (3 - 2 * t);
}

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
 * draw call, unlit so it costs nothing to light and glows over the dusk from
 * a kilometre off. It stains what is seen through it a dark violet, so the
 * land past it reads as lost, and adds its own light over that. Its shader
 * is procedural, with no texture, and everything in it moves, because the
 * wall is energy and not a thing built: a curtain of light hanging in long
 * vertical rays that drift, denser toward the ground; pulses that climb it from the foot, one after another,
 * each a bright edge with a fading tail; a hot line licking along the ground
 * (or the sea) where the wall stands on it; and arcs that strike up from
 * that line, a lane of the wall at a time, forked by noise and gone in a
 * moment. At a grazing angle it thickens, so the far side of the circle
 * stands out as a wall rather than a haze. Toward the sun its arcs and
 * pulses fade, the sun burning through them. It draws on both faces, so it
 * reads the same from inside and outside.
 */
export class RingWall {
  readonly mesh: Mesh;
  readonly #scene: Scene;
  readonly #radius = uniform(1);
  readonly #clock = uniform(0);
  readonly #strength = uniform(1);
  /** The wall's centre, and how many lanes go round it (a whole number, so they close without a seam). */
  readonly #cx = uniform(0);
  readonly #cz = uniform(0);
  readonly #lanes = uniform(40);
  /** The surface under each column, which the foot glow sits on; refilled only when the Ring moves. */
  readonly #ground: BufferAttribute;
  readonly #heights = new Float32Array((SEGMENTS + 1) * 2);
  readonly #terrain: RingGround | null;
  #at = { x: NaN, z: NaN, radius: NaN };

  /** `sky`: the sky the background draws in a direction, which the detail fades over where it's bright; none, no fade. */
  constructor(scene: Scene, terrain: RingGround | null = null, sky: ((direction: Node<'vec3'>) => Node<'vec3'>) | null = null) {
    this.#scene = scene;
    this.#terrain = terrain;
    const geometry = new CylinderGeometry(1, 1, 1, SEGMENTS, 1, true);
    geometry.translate(0, 0.5, 0);
    // One float a vertex, read by the shader: no extra draw, no texture.
    this.#ground = new BufferAttribute(this.#heights, 1);
    geometry.setAttribute('ground', this.#ground);
    // Its own light added, over the scene dimmed by its opacity: the colour is already multiplied through.
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, side: DoubleSide, fog: false });
    const p = positionWorld;
    const t = this.#clock;
    const up = p.y;
    /** Metres over the ground (or the sea) the wall stands on here. */
    const h = up.sub(attribute<'float'>('ground', 'float')).max(0);
    // Detail fades as it shrinks toward a pixel, judged by how fast it changes across one: far away it would only shimmer.
    const sharp = (n: Node<'float'>) => smoothstep(float(0.4), float(0.1), fwidth(n));
    // Close up the wall is busy with detail; past a couple of hundred metres it calms to its large shapes.
    const near = smoothstep(float(220), float(50), cameraPosition.sub(p).length());
    const unit = (n: Node<'float'>) => n.mul(0.5).add(0.5);
    // The top fades into the sky; the curtain is denser toward the ground.
    const body = smoothstep(float(HEIGHT - 30), float(20), up);
    const low = exp(h.div(-90)).mul(0.6).add(0.4);

    // The curtain: noise in world space (seamless all the way round), pulled out tall into rays that drift upward.
    const wide = unit(mx_noise_float(vec3(p.x.div(12), up.div(190).sub(t.mul(0.06)), p.z.div(12))));
    const thin = mx_noise_float(vec3(p.x.div(2.4), up.div(64).sub(t.mul(0.2)), p.z.div(2.4)));
    const broad = smoothstep(float(0.3), float(0.8), wide);
    const rays = broad.mul(broad).mul(0.75).add(smoothstep(float(0.05), float(0.6), thin).mul(sharp(thin)).mul(near).mul(0.5));

    // Pulses climbing from the foot: each a bright upper edge with a tail under it, its line bent by a slow noise.
    const bend = mx_noise_float(vec3(p.x.div(110), t.mul(0.05), p.z.div(110)));
    const climb = h.div(PULSE).sub(t.mul(PULSE_SPEED / PULSE)).add(bend.mul(0.22));
    const along = fract(climb);
    const cw = fwidth(climb);
    const half = along.mul(along).mul(along);
    const pulse = half
      .mul(half)
      .mul(smoothstep(float(0), cw.mul(1.5).add(0.004), float(1).sub(along)))
      .mul(smoothstep(float(0.5), float(0.12), cw))
      .mul(exp(h.div(-170)));

    // The foot: a hot line licking along the surface, in tongues of its own height, and its glow on the curtain over it.
    const lick = unit(mx_noise_float(vec3(p.x.div(2.6), t.mul(1.7), p.z.div(2.6))));
    const tongue = smoothstep(lick.mul(lick).mul(9).add(0.6), float(0), h);
    const line = tongue.mul(tongue).mul(0.55).add(exp(h.div(-0.4)).mul(1.6));
    const glowOver = exp(h.div(-9));

    // Arcs: the wall in lanes, each striking now and then. A strike is the zero line of the place across the lane
    // less a path that wanders with height, new every strike; it climbs so far, flickers and is gone.
    const rel = p.xz.sub(vec2(this.#cx, this.#cz));
    const lane = atan(rel.y, rel.x).div(Math.PI * 2).mul(this.#lanes);
    const width = this.#radius.mul(Math.PI * 2).div(this.#lanes);
    const hash = (n: Node<'float'>) => fract(sin(n.mul(12.9898)).mul(43758.5453));
    const id = floor(lane);
    const beat = t.mul(STRIKES).add(hash(id).mul(31));
    const strike = id.mul(1.37).add(floor(beat).mul(7.31));
    const age = fract(beat);
    const where = hash(strike.add(0.5));
    const path = mx_noise_float(vec2(h.div(17), strike)).mul(8).add(mx_noise_float(vec2(h.div(3.7), strike.add(40))).mul(1.5));
    const across = fract(lane).sub(0.5).mul(width).sub(where.sub(0.5).mul(width).mul(0.45)).sub(path);
    // A pixel's width across the wall (m): the arc is never thinner than that, and is gone where a pixel swallows it (and at the angle's seam).
    const pixel = fwidth(lane).mul(width);
    const reach = hash(strike.add(1.5)).mul(170).add(35);
    const alive = step(float(1 - STRIKING), hash(strike.add(2.5)))
      .mul(exp(age.mul(-6)))
      .mul(sin(age.mul(70)).mul(0.3).add(0.7))
      .mul(smoothstep(reach, reach.mul(0.55), h))
      .mul(smoothstep(float(9), float(3), pixel));
    const bolt = smoothstep(pixel.mul(1.6).add(0.1), float(0), abs(across)).mul(alive);
    const halo = exp(abs(across).div(-2.6)).mul(alive).mul(0.3);

    // The sky behind the wall, as the background draws it: toward the sun it outshines the detail, which fades there.
    const detail = sky ? smoothstep(float(DETAIL_FADE[1]), float(DETAIL_FADE[0]), dot(sky(normalize(p.sub(cameraPosition))), vec3(0.2126, 0.7152, 0.0722))) : float(1);
    // Grazing views see more of the sheet: the far side of the circle reads as a wall.
    const view = normalize(cameraPosition.sub(p));
    const facing = abs(dot(normalWorld, view));
    const graze = min(float(3), float(1).div(facing.add(0.33)));
    // What it hides: a thin stain everywhere, thicker in the rays and over the foot.
    const density = float(0.3).add(broad.mul(low).mul(0.16)).add(glowOver.mul(0.2)).mul(body).mul(graze).min(0.82).mul(this.#strength);
    // What it adds.
    const sheet = rays.mul(low).mul(0.3).add(glowOver.mul(0.16)).add(pulse.mul(detail).mul(0.36)).add(halo.mul(detail)).mul(body).mul(graze);
    const tint = mix(color(DEEP), color(HAZARD), rays.mul(0.55).add(pulse).add(glowOver).add(halo).min(1));
    const hot = line.add(bolt.mul(detail).mul(1.3)).mul(body);
    const glow = tint.mul(sheet).add(mix(color(HAZARD), color(HOT), line.max(bolt).min(1)).mul(hot));
    m.opacityNode = density;
    m.colorNode = glow.mul(this.#strength).add(color(STAIN).mul(density));
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
    // An even number: the angle's seam then falls between two lanes, not through one.
    this.#lanes.value = Math.max(4, Math.round((ring.radius * Math.PI) / LANE) * 2);
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
