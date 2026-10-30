import { INTERMISSION, type MatchStatus, type Vec3 } from '@duty-shooter/fps-core';
import { color, dot, float, instancedBufferAttribute, max, mix, mx_noise_float, normalLocal, normalWorld, positionLocal, positionWorld, smoothstep, time, uniform, vec3, vec4 } from 'three/tsl';
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  Sprite,
  SpriteNodeMaterial,
  TorusGeometry,
  type Node,
  type Scene,
} from 'three/webgpu';
import { sunDir } from './surface-materials';

/** Seconds after the match ends that the bomb goes off; the siren fills the time before. */
export const DETONATION = 2.4;
/** How fast the blast front (and its sound) travels (m/s). */
export const SHOCK_SPEED = 343;

/**
 * Seconds since the match ended, through the nuke and the vote (a lobby's
 * shorter scoreboard), from the match status and the server's clock; null
 * while a match is being played.
 */
export function sinceMatchEnd(status: MatchStatus | null, serverTime: number): number | null {
  if (!status || status.phase === 'playing' || status.phaseEnds === null) return null;
  const end = status.phase === 'nuke' ? INTERMISSION.nuke : INTERMISSION.nuke + (status.lobby ? INTERMISSION.scoreboard : INTERMISSION.vote);
  return Math.max(0, end - (status.phaseEnds - serverTime));
}

/** What the nuke does to the picture at one moment: a white-out, the colour grade and camera shake, each 0..1. */
export interface NukeFrame {
  readonly flash: number;
  readonly grade: number;
  readonly shake: number;
}

/** The picture `t` s after the match ended, for a player `distance` m from ground zero. */
export function nukeFrame(t: number, distance: number): NukeFrame {
  const since = t - DETONATION;
  if (since < 0) return { flash: 0, grade: 0, shake: 0 };
  // A blinding white that peaks in 50 ms and fades in about a second and a half.
  const flash = since < 0.05 ? since / 0.05 : Math.exp(-(since - 0.05) / 0.4);
  const grade = Math.min(1, since / 1.2);
  const hit = since - distance / SHOCK_SPEED;
  const shake = hit < 0 ? 0 : Math.exp(-hit / 0.9);
  return { flash, grade, shake };
}

const smoothUnit = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/**
 * A billowing cloud surface: the mesh's own shape pushed in and out by
 * drifting noise, lit by the sun from above and glowing from inside while
 * `heat` lasts (HDR, so the bloom catches it). `shadow` and `light` are
 * the smoke's colours underneath and on top.
 */
function cloudMaterial(heat: Node<'float'>, seed: number, shadow = 0x5b4a3e, light = 0xd6c3a6): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial();
  const p = positionLocal.mul(2.2).add(vec3(seed, time.mul(0.35), seed * 0.7));
  const bump = mx_noise_float(p).mul(0.16).add(mx_noise_float(p.mul(2.7)).mul(0.06));
  m.positionNode = positionLocal.add(normalLocal.mul(bump));
  const sun = sunDir;
  const lit = max(dot(normalWorld, sun), float(0));
  const smoke = mix(color(shadow), color(light), smoothstep(float(-0.4), float(0.9), normalWorld.y).mul(0.6).add(lit.mul(0.4)));
  const shade = float(0.55).add(lit.mul(0.75)).add(bump.mul(1.5));
  const glow = mix(color(0xff4f17), color(0xffe2a0), smoothstep(float(0.3), float(1), heat)).mul(heat.mul(heat).mul(9).add(heat.mul(1.2)));
  // Hottest underneath and in the folds.
  const inside = smoothstep(float(0.6), float(-0.6), normalWorld.y).mul(0.6).add(0.4).mul(float(1).sub(bump.mul(2)));
  m.colorNode = vec4(smoke.mul(shade).add(glow.mul(inside)), 1);
  return m;
}

/**
 * The end-of-match nuke, drawn only: a fireball that rises into a mushroom
 * cloud on a stem, a base surge, and a shock front of dust rolling out
 * across the desert and through the town. Driven entirely by the time
 * since the match ended, so every player sees the same moment from where
 * they stand, and a late joiner sees it mid-way. Nothing here collides or
 * casts shadows, and it all hides again at the next match.
 */
export class Nuke {
  readonly root = new Group();
  readonly #groundZero: Vec3;
  readonly #heat = uniform(0);
  readonly #cap: Mesh;
  readonly #ring: Mesh;
  readonly #stem: Mesh;
  readonly #surge: Mesh;
  readonly #shock: Mesh;
  readonly #shockRadius = uniform(1);
  readonly #shockFade = uniform(1);
  readonly #dust: Sprite;

  constructor(scene: Scene, groundZero: Vec3) {
    this.#groundZero = groundZero;
    this.root.name = 'nuke';
    this.root.position.set(groundZero[0], groundZero[1], groundZero[2]);
    const cloud = new Group();
    cloud.name = 'cloud';
    this.#cap = new Mesh(new IcosahedronGeometry(1, 5), cloudMaterial(this.#heat, 0));
    this.#ring = new Mesh(new TorusGeometry(1, 0.42, 20, 64), cloudMaterial(this.#heat, 11));
    this.#ring.rotation.x = Math.PI / 2;
    this.#stem = new Mesh(new CylinderGeometry(0.75, 1, 1, 32, 8, true), cloudMaterial(this.#heat, 23));
    this.#stem.geometry.translate(0, 0.5, 0);
    // The surge is desert dust, lit from below by the sand as much as from above, so it never reads as a dark band.
    this.#surge = new Mesh(new TorusGeometry(1, 0.5, 16, 96), cloudMaterial(uniform(0), 37, 0xb59c7c, 0xddcbad));
    this.#surge.rotation.x = Math.PI / 2;
    cloud.add(this.#cap, this.#ring, this.#stem, this.#surge);

    // The shock front: an open wall of dust, thickest at the ground, fading out over the last few hundred metres.
    const shock = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    const h = positionLocal.y;
    const grain = mx_noise_float(positionWorld.mul(0.06).add(vec3(0, time.mul(-0.8), 0))).mul(0.5).add(0.5);
    const body = smoothstep(float(1), float(0), h).pow(0.7);
    shock.colorNode = vec4(mix(color(0x8f7457), color(0xc9ab84), h), body.mul(grain.mul(0.5).add(0.5)).mul(this.#shockFade).mul(0.92));
    this.#shock = new Mesh(new CylinderGeometry(1, 1, 1, 128, 1, true), shock);
    this.#shock.geometry.translate(0, 0.5, 0);
    this.#shock.name = 'shock';
    this.#shock.renderOrder = 5;
    this.root.add(cloud, this.#shock);

    // Dust kicked up along the front: soft puffs riding the shock's radius.
    const count = 700;
    const data = new Float32Array(count * 4);
    let s = 1955;
    const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) data.set([rand() * Math.PI * 2, rand() * rand() * 22, rand() * 18 - 9, 6 + rand() * 10], i * 4);
    // Per puff: angle round the front, height, how far ahead or behind it, size.
    const puff = instancedBufferAttribute(new InstancedBufferAttribute(data, 4)) as unknown as Node<'vec4'>;
    const dust = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const r = this.#shockRadius.add(puff.z);
    dust.positionNode = vec3(puff.x.cos().mul(r), puff.y, puff.x.sin().mul(r));
    dust.scaleNode = puff.w;
    const uvc = positionLocal.xy.length();
    dust.colorNode = vec4(color(0xb39776), smoothstep(float(0.5), float(0.1), uvc).mul(this.#shockFade).mul(0.4));
    this.#dust = new Sprite(dust);
    this.#dust.count = count;
    this.#dust.name = 'dust';
    this.#dust.frustumCulled = false;
    this.root.add(this.#dust);
    this.root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    });
    this.root.visible = false;
    scene.add(this.root);
  }

  /** Distance (m) from ground zero to `p`. */
  distanceTo(p: Vec3): number {
    return Math.hypot(p[0] - this.#groundZero[0], p[1] - this.#groundZero[1], p[2] - this.#groundZero[2]);
  }

  /** Shows the nuke `t` s after the match ended; null hides it (a match is on). */
  update(t: number | null): void {
    const since = t === null ? -1 : t - DETONATION;
    this.root.visible = since >= 0;
    if (since < 0) return;
    // The fireball climbs and swells, cooling into the cap of the cloud.
    const rise = 1 - Math.exp(-since / 3.2);
    const swell = 1 - Math.exp(-since / 1.1);
    const top = 40 + 260 * rise;
    const radius = 28 + 70 * swell + since * 2.5;
    this.#heat.value = Math.max(0.12 * Math.exp(-since / 30), Math.exp(-since / 1.4));
    this.#cap.position.set(0, top, 0);
    this.#cap.scale.set(radius, radius * 0.62, radius);
    this.#ring.position.set(0, top - radius * 0.35, 0);
    this.#ring.scale.set(radius * 0.92, radius * 0.92, radius * 0.7);
    this.#ring.rotation.z = since * 0.15;
    const stemWidth = radius * 0.24 * smoothUnit(since / 1.5);
    this.#stem.visible = stemWidth > 0.5;
    this.#stem.scale.set(stemWidth, Math.max(1, top - radius * 0.45), stemWidth);
    // The base surge rolls out low round the foot of the stem.
    const surge = 40 + 160 * (1 - Math.exp(-since / 2.5));
    this.#surge.scale.set(surge, surge, surge * 0.3);
    this.#surge.position.y = surge * 0.08;
    // The shock front, from ground zero outwards at the speed of sound; gone by about 1.4 km.
    const front = Math.max(1, SHOCK_SPEED * since);
    this.#shockRadius.value = front;
    this.#shockFade.value = 1 - smoothUnit((front - 900) / 500);
    this.#shock.visible = this.#shockFade.value > 0.01;
    this.#shock.scale.set(front, 30 + 25 * Math.exp(-since / 2), front);
    this.#dust.visible = this.#shock.visible;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      // Every Sprite shares three's one quad, so the dust gives back only its material.
      if (mesh.isMesh) mesh.geometry.dispose();
      if (mesh.isMesh || (o as Sprite).isSprite) (mesh.material as MeshBasicNodeMaterial).dispose();
    });
    this.root.removeFromParent();
  }
}
