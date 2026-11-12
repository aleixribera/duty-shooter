import { STATS, raycastWorld, smokeAmount, smokeCentre, type Material, type MuzzleId, type SmokeCloud, type Vec3, type WeaponId, type World } from '@duty-shooter/fps-core';
import { abs, attribute, instanceColor, instanceIndex, texture as textureNode, cameraFar, cameraNear, cameraViewMatrix, clamp, cos, dot, float, floor, linearDepth, max, mix, normalize, positionWorld, sin, smoothstep, sqrt, step, time, uniform, uv, vec2, vec3, viewportLinearDepth } from 'three/tsl';
import {
  AddEquation,
  AdditiveBlending,
  CustomBlending,
  DstColorFactor,
  OneFactor,
  SrcColorFactor,
  ZeroFactor,
  NormalBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  Vector4,
  type Camera,
  type Node,
  type Scene,
} from 'three/webgpu';
import { ambientTint, currentLighting, haze, horizonColor, skyZenith, sunColor, sunDir, type ProbeField } from './surface-materials';
import { cloudAt } from './surface-tiles';
import { PICTURE } from './quality';

/**
 * How each gun's shot reads at the muzzle, against the M4A1's 1: the flash's
 * size and the light it throws, and the smoke it leaves. A 9 mm barely
 * flashes and leaves a thread of smoke; a 12-gauge or a full-power rifle
 * round throws a big flash and a plume. A handgun's muzzle sits near the
 * middle of the view, so the Magnum's flash is kept to a rifle's size there
 * however hard it kicks.
 */
const MUZZLE: Readonly<Record<WeaponId, { readonly flash: number; readonly smoke: number }>> = {
  m4a1: { flash: 1, smoke: 1 },
  burst: { flash: 0.95, smoke: 0.95 },
  smg: { flash: 0.7, smoke: 0.7 },
  pistol: { flash: 0.7, smoke: 0.6 },
  revolver: { flash: 0.8, smoke: 1.2 },
  shotgun: { flash: 1.5, smoke: 1.8 },
  sniper: { flash: 1.45, smoke: 1.6 },
  dmr: { flash: 1.25, smoke: 1.3 },
  lmg: { flash: 1.1, smoke: 1.1 },
};
const PLAIN_MUZZLE = MUZZLE.m4a1;

/**
 * A muzzle device's flash (ticket 19): a suppressor shows none and barely
 * lights the scene, and wisps a little more smoke out of its can; a
 * compensator throws a bigger, brighter flash out of its ports. Both are what
 * every player sees, so the compensator's steadier gun is paid for in sight.
 */
const DEVICE_FLASH: Readonly<Record<MuzzleId, { readonly flash: number; readonly light: number; readonly smoke: number }>> = {
  suppressor: { flash: 0, light: 0.12, smoke: 1.25 },
  compensator: { flash: 1.45, light: 1.35, smoke: 1 },
};

type N = Node<'float'>;
type N3 = Node<'vec3'>;

interface Particle {
  p: Vector3;
  v: Vector3;
  age: number;
  life: number;
  size: number;
  stretch: number;
  grow: number;
  spin: number;
  rot: number;
  alpha: number;
  gravity: number;
  drag: number;
  color: Color;
  /** How much direct sun reaches it, 0 to 1 (what is lit is lit by it). */
  sun: number;
  /** Its own place in the noise, so no two puffs are the same shape. */
  seed: number;
  /** The light round where it was born against open ground's, per channel (see ambientTint): a room's dim warm light indoors. */
  ambient: Vec3;
}

/**
 * What a particle is drawn as. `puff`: smoke and dust, a billow lit by the sun
 * and the sky that breaks up as it dies. `chip`: a solid fragment. `spark`: a
 * bright streak along its own flight. `flame`: fire, white at the heart.
 * `ring`: a thin bright ring, for a blast's shock.
 */
type Kind = 'puff' | 'chip' | 'spark' | 'flame' | 'ring';

const tmp = new Object3D();
const tmpQ = new Quaternion();
const tmpRight = new Vector3();
const tmpUp = new Vector3();
const Z = new Vector3(0, 0, 1);
const WHITE: Vec3 = [1, 1, 1];
/** A puff gathers the room's light from every side, so in a dim room it stays paler than the walls behind it rather than soot-dark. */
const scattered = (c: Vec3): Vec3 => [c[0] ** 0.7, c[1] ** 0.7, c[2] ** 0.7];
const tmpU = new Vector3();
const tmpV = new Vector3();
const tmpW = new Vector3();
/**
 * The newest shot's light, for the smoke round the muzzle to catch: where it is (xyz) and how strong now (w, 1 at a
 * plain rifle's flash, 0 when out). The scene's surfaces get it from the shot's point light; puffs are unlit quads.
 */
export const shotGlow = uniform(new Vector4(0, 0, 0, 0));
/** The flash's light on smoke: orange-white, the colour of the flash's tongues. */
const GLOW_COLOR = vec3(1, 0.7, 0.42);
/** How far (m) from the flash its light on smoke falls to half. */
const GLOW_REACH = 0.55;
/**
 * Muzzle smoke's own shade: pale, as burnt powder's is. A mid grey (0xb4b6b8) drew a burst's haze in a room at half
 * the brightness of the plaster behind it, a dark smudge over the sights (review 2026-11-12d).
 */
const MUZZLE_SMOKE = 0xd6d6d4;
/** How far (m) behind a puff a surface must be for the puff to show in full: nearer, it fades, so smoke meets a wall or the ground without a hard line. */
const SOFT = 0.35;
/** How much longer than wide a spark is drawn, per m/s of its speed. */
const STREAK = 0.55;

function particleMaterial(kind: Kind): MeshBasicNodeMaterial {
  const additive = kind === 'spark' || kind === 'flame' || kind === 'ring';
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
  // alpha, roll (rad), age (0 to 1), sun (0 to 1).
  const data = attribute<'vec4'>('pData', 'vec4');
  const tint = attribute<'vec3'>('pColor', 'vec3') as unknown as N3;
  const seed = attribute<'float'>('pSeed', 'float');
  // Smoke, dust and chips take the sky's light scaled to the light round them: under a roof, a dark room's, not the open sky's
  // (review 2026-11-12d: muzzle smoke indoors was a pale blue cloud in a dim beige room).
  const around = attribute<'vec3'>('pAmbient', 'vec3') as unknown as N3;
  const alpha = data.x;
  const roll = data.y;
  const age = data.z;
  const sun = data.w;
  const p = uv().sub(0.5).mul(2);
  const r = p.length();
  // The noise every soft shape is cut from: the sky's fine billows, each particle reading its own patch.
  const billow = (cloudAt(uv().mul(0.21).add(vec2(seed, seed.mul(7.31))) as never) as unknown as { b: N }).b;
  // Fades where the world stands just behind, so a cloud has no hard edge where it meets a wall.
  const soft = clamp(viewportLinearDepth.sub(linearDepth()).mul(cameraFar.sub(cameraNear)).div(SOFT), 0, 1);

  if (kind === 'puff') {
    // A ball's normal, roughened by the billows, in view space (the quad is rolled, so the normal is rolled back).
    const c = cos(roll);
    const s = sin(roll);
    const bump = billow.sub(0.5).mul(0.9);
    const n = normalize(vec3(p.x.mul(c).sub(p.y.mul(s)).add(bump), p.x.mul(s).add(p.y.mul(c)).add(bump), sqrt(max(float(1).sub(r.mul(r)), float(0.02)))));
    const toSun = sunDir.transformDirection(cameraViewMatrix);
    const facing = dot(n, toSun).mul(0.5).add(0.5);
    const ambient = horizonColor.add(skyZenith).mul(0.5).mul(sun.mul(0.3).add(0.7)).mul(around);
    // Lit by the shot as well, so a burst's haze flickers orange at the barrel with each round (review 2026-11-12d: no
    // readable flash in a firing frame; indoors the haze was a dark smudge while the walls round it lit up with each shot).
    const near = positionWorld.sub(shotGlow.xyz).length().div(GLOW_REACH);
    const glow = GLOW_COLOR.mul(shotGlow.w.mul(1.6).div(near.mul(near).add(1)));
    const lit = tint.mul(ambient.add(sunColor.mul(sun).mul(facing.mul(facing)).mul(0.6)).add(glow)) as N3;
    material.colorNode = haze(lit) as never;
    // Breaks into wisps as it ages: the noise eats further in.
    const body = float(1).sub(r).sub(billow.mul(age.mul(0.65).add(0.22)));
    material.opacityNode = smoothstep(float(0), float(0.3), body).mul(alpha).mul(soft);
  } else if (kind === 'chip') {
    const ambient = horizonColor.add(skyZenith).mul(0.5).mul(sun.mul(0.3).add(0.7)).mul(around);
    material.colorNode = haze(tint.mul(ambient.add(sunColor.mul(sun).mul(0.3))) as N3) as never;
    // A shard: a lopsided diamond.
    material.opacityNode = step(abs(p.x).add(abs(p.y).mul(0.62)).add(p.x.mul(p.y).mul(0.4)), float(0.86)).mul(alpha);
  } else if (kind === 'spark') {
    const across = clamp(float(1).sub(abs(p.x)), 0, 1);
    const along = clamp(float(1).sub(abs(p.y)), 0, 1);
    const shape = across.mul(across).mul(along);
    material.colorNode = tint.mul(shape.mul(5)).add(vec3(1, 0.95, 0.8).mul(shape.mul(shape).mul(6))) as never;
    material.opacityNode = shape.mul(alpha);
  } else if (kind === 'flame') {
    const body = clamp(float(1).sub(r).sub(billow.mul(age.mul(0.5).add(0.3))).mul(2.2), 0, 1);
    // White at the heart, the particle's own colour around it, a dull red where it thins and as it dies.
    const heart = smoothstep(float(0.55), float(1), body).mul(float(1).sub(age));
    const ember = mix(vec3(0.7, 0.1, 0.02), tint, smoothstep(float(0.1), float(0.6), body.mul(float(1.15).sub(age))));
    material.colorNode = ember.mul(body.mul(3.2)).add(vec3(1, 0.9, 0.7).mul(heart.mul(7))) as never;
    material.opacityNode = body.mul(alpha).mul(soft);
  } else {
    const width = float(0.2).sub(age.mul(0.12));
    const band = clamp(float(1).sub(abs(r.sub(float(1).sub(width))).div(width)), 0, 1);
    material.colorNode = tint.mul(band.mul(2.5)) as never;
    material.opacityNode = band.mul(band).mul(alpha).mul(soft);
  }
  return material;
}

/** A pool of camera-facing quads drawn in one instanced draw call, each with its own colour, age and light. */
class ParticleLayer {
  readonly mesh: InstancedMesh;
  readonly #data: InstancedBufferAttribute;
  readonly #color: InstancedBufferAttribute;
  readonly #seed: InstancedBufferAttribute;
  readonly #ambient: InstancedBufferAttribute;
  readonly #particles: Particle[] = [];
  /** The baked light probes, for the light round a puff or chip where it is born; null on a map without them. */
  probes: ProbeField | null = null;
  readonly #max: number;
  readonly #kind: Kind;
  /** What the picture's share of particles owes this layer: an emission is drawn each time it reaches one. */
  #owed = 1;
  /** Drawn in full whatever the picture's particle share: what it shows decides a fight (a smoke cloud). */
  readonly #essential: boolean;
  /** Holds its alpha through its life and fades only at the end, instead of fading from the start. */
  readonly #steady: boolean;

  constructor(max: number, kind: Kind, options: { essential?: boolean; steady?: boolean } = {}) {
    this.#max = max;
    this.#kind = kind;
    this.#essential = options.essential === true;
    this.#steady = options.steady === true;
    const geometry = new PlaneGeometry(1, 1);
    this.#data = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.#color = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.#seed = new InstancedBufferAttribute(new Float32Array(max), 1);
    this.#ambient = new InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    for (const a of [this.#data, this.#color, this.#seed, this.#ambient]) a.setUsage(DynamicDrawUsage);
    geometry.setAttribute('pData', this.#data);
    geometry.setAttribute('pColor', this.#color);
    geometry.setAttribute('pSeed', this.#seed);
    geometry.setAttribute('pAmbient', this.#ambient);
    this.mesh = new InstancedMesh(geometry, particleMaterial(kind), max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    // Hidden while empty: a soft particle asks for a copy of the frame's depth, which nothing should pay for when there is no smoke.
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'puff' || kind === 'chip' ? 2 : 3;
  }

  emit(p: Partial<Particle> & { p: Vector3 }): void {
    // The look may draw a share of the particles: every nth emission, so a burst thins evenly and a lone puff still shows.
    const share = this.#essential ? 1 : PICTURE.particles;
    if (share < 1) {
      this.#owed += share;
      if (this.#owed < 1) return;
      this.#owed -= 1;
    }
    if (this.#particles.length >= this.#max) this.#particles.shift();
    this.#particles.push({
      v: new Vector3(),
      age: 0,
      life: 1,
      size: 0.1,
      stretch: 1,
      grow: 0,
      spin: 0,
      rot: Math.random() * Math.PI * 2,
      alpha: 1,
      gravity: 0,
      drag: 0,
      color: new Color(1, 1, 1),
      sun: 1,
      seed: Math.random(),
      ambient: this.probes && (this.#kind === 'puff' || this.#kind === 'chip') ? scattered(ambientTint(this.probes.sample([p.p.x, p.p.y, p.p.z]))) : WHITE,
      ...p,
    });
  }

  update(dt: number, camera: Camera): void {
    const list = this.#particles;
    if (list.length === 0) {
      this.mesh.count = 0;
      this.mesh.visible = false;
      return;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const q = list[i] as Particle;
      q.age += dt;
      if (q.age >= q.life) {
        list.splice(i, 1);
        continue;
      }
      q.v.y -= q.gravity * dt;
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.p.addScaledVector(q.v, dt);
      q.rot += q.spin * dt;
    }
    const streaks = this.#kind === 'spark';
    if (streaks) {
      tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    }
    for (let i = 0; i < list.length; i++) {
      const q = list[i] as Particle;
      const t = q.age / q.life;
      let roll = q.rot;
      let stretch = q.stretch;
      if (streaks) {
        // Drawn along its flight as the camera sees it, longer the faster it goes.
        const x = q.v.dot(tmpRight);
        const y = q.v.dot(tmpUp);
        roll = Math.atan2(y, x) - Math.PI / 2;
        stretch = 1 + Math.min(14, Math.hypot(x, y) * STREAK);
      }
      tmp.position.copy(q.p);
      tmp.quaternion.copy(camera.quaternion).multiply(tmpQ.setFromAxisAngle(Z, roll));
      const size = Math.max(0, q.size + q.grow * q.age);
      tmp.scale.set(size, size * stretch, size);
      tmp.updateMatrix();
      this.mesh.setMatrixAt(i, tmp.matrix);
      // Quick fade in, long fade out.
      const fade = this.#steady ? Math.min(1, t * 5) * (1 - t * t * t) : Math.min(1, t * 12) * (1 - t) * (1 - t);
      this.#data.setXYZW(i, q.alpha * fade, roll, t, q.sun);
      this.#color.setXYZ(i, q.color.r, q.color.g, q.color.b);
      this.#seed.setX(i, q.seed);
      this.#ambient.setXYZ(i, q.ambient[0], q.ambient[1], q.ambient[2]);
    }
    this.mesh.count = list.length;
    this.mesh.visible = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.#data.needsUpdate = true;
    this.#color.needsUpdate = true;
    this.#seed.needsUpdate = true;
    this.#ambient.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicNodeMaterial).dispose();
  }
}

/**
 * A bullet hole, for a decal that modulates the surface under it (×2, so 0.5 leaves it as it is) and so takes whatever light
 * that surface has, sun, shade or a dark room: a small dark core in a jagged, splintered crater of knocked-off material, shaded as
 * a dent lit from above (texture up is laid along the wall's up), a faint dust halo and a few chips thrown out of it.
 * Linear values; transparent outside. Drawn from one height field: flat surface, a sharp spalled rim, the crater falling away to the core.
 */
function holeTile(S: number): Uint8ClampedArray<ArrayBuffer> {
  const mid = S / 2 - 0.5;
  // A ragged radius round the centre: random reaches at even steps, softened with their neighbours and eased between.
  const outline = (radius: number, wobble: number): ((a: number) => number) => {
    const n = 18;
    const raw = Array.from({ length: n }, () => 1 + (Math.random() * 2 - 1) * wobble);
    const soft = raw.map((v, i) => (raw[(i + n - 1) % n]! + v * 2 + raw[(i + 1) % n]!) / 4);
    return (a) => {
      const f = ((a / (Math.PI * 2)) * n + n) % n;
      const i = Math.floor(f);
      const e = (1 - Math.cos((f - i) * Math.PI)) / 2;
      return radius * (soft[i % n]! * (1 - e) + soft[(i + 1) % n]! * e);
    };
  };
  // The crater is a little over twice the core's width: wide enough to read as wood or plaster knocked off round the hole,
  // not so wide that up close it reads as a pale disc stuck on the wall.
  const rim = outline(S * (0.1 + Math.random() * 0.03), 0.5);
  const core = outline(S * 0.048, 0.22);
  // Splinters: the broken surface in streaks running out from the hole, each angle its own, with a little fine grit over them.
  // Two scales of angular noise, fine over coarse, so the streaks run irregular rather than in even petals.
  const noise = (n: number): ((a: number) => number) => {
    const v = Array.from({ length: n }, () => Math.random());
    return (a) => {
      const f = ((a / (Math.PI * 2)) * n + n) % n;
      const i = Math.floor(f);
      return v[i % n]! * (1 - (f - i)) + v[(i + 1) % n]! * (f - i);
    };
  };
  const fine = noise(157);
  const coarse = noise(23);
  const streak = (a: number): number => fine(a) * 0.6 + coarse(a) * 0.4;
  const grit = new Float32Array(S * S).map(() => Math.random());
  const height = new Float32Array(S * S);
  const ring = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x - mid;
      const dy = y - mid;
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const rc = rim(a);
      const rh = core(a);
      const i = y * S + x;
      // 0 on the surface; inside the rim a step down, then a slope to the core, which is deeper still.
      const t = Math.min(1, Math.max(0, (rc - r) / Math.max(1, rc - rh)));
      height[i] = r < rh ? -1.6 : r < rc ? -0.35 - 0.65 * t + (streak(a) - 0.5) * 0.16 + (grit[i]! - 0.5) * 0.08 : 0;
      ring[i] = r / rc;
    }
  const at = (x: number, y: number): number => height[Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))]!;
  const chips = Array.from({ length: 7 }, () => {
    const a = Math.random() * Math.PI * 2;
    const d = rim(a) * (1.1 + Math.random() * 0.6);
    return { x: mid + Math.cos(a) * d, y: mid + Math.sin(a) * d, r: (S / 128) * (0.8 + Math.random() * 1.3) };
  });
  // Light from above and in front: canvas up is the wall's up.
  const L = [0, 0.6, 0.8] as const;
  const data = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const h = height[i]!;
      const q = ring[i]!;
      let value: number;
      let alpha: number;
      if (h < -1) {
        value = 0.05;
        alpha = 1;
      } else if (q < 1) {
        // The crater's slopes: canvas y runs down, so its slope up the wall flips sign.
        const nx = -(at(x + 1, y) - at(x - 1, y)) * 2.2 * (S / 128);
        const ny = (at(x, y + 1) - at(x, y - 1)) * 2.2 * (S / 128);
        const lit = Math.max(0.15, (nx * L[0] + ny * L[1] + L[2]) / Math.hypot(nx, ny, 1) / L[2]);
        // Lit about as the surface is, so the dent shows by its shading and its lit lower lip rather than as a pale fill.
        value = 0.56 * lit * (0.8 + 0.2 * q) * (0.85 + streak(Math.atan2(y - mid, x - mid)) * 0.3);
        alpha = 1;
      } else {
        // Dust: a thin darker haze falling off over about the crater's own width, and a few pale chips.
        const fall = Math.max(0, 1 - (q - 1) / 0.8);
        // The chips lie within 1.7 of the crater's radius, plus their own size: past 2 there are none to test.
        const chip = q < 2 && chips.some((c) => Math.hypot(x - c.x, y - c.y) < c.r);
        value = chip ? 0.62 : 0.4;
        alpha = chip ? 0.9 : 0.35 * fall * fall;
      }
      const v = Math.min(1, value) * 255;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = alpha * 255;
    }
  return data;
}

/** Four bullet holes (`holeTile`), two by two: a decal shows the one its slot picks. Linear: 128 is the neutral grey of a ×2 modulate. */
function holeTexture(): CanvasTexture {
  // 256 px a hole, so one a hand from the eye is still sharp.
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d');
  for (let k = 0; k < 4; k++) g?.putImageData(new ImageData(holeTile(S), S, S), (k % 2) * S, Math.floor(k / 2) * S);
  return new CanvasTexture(c);
}

function splatTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 20;
      g.beginPath();
      g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 4 + Math.random() * 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Instanced, ring-buffered decals laid flat on surfaces. A `modulate` layer doesn't light itself: it multiplies the surface
 * under it by twice its texture (0.5 leaves it be), tinted by each decal's colour where it covers, so it carries that
 * surface's own light (baked shade, a dark room) and can't stand out from it the way a lit sticker does. Its decals also
 * stand upright on walls.
 */
class DecalLayer {
  readonly mesh: InstancedMesh;
  #next = 0;
  readonly #max: number;
  readonly #upright: boolean;
  /** Each decal's point, normal and size, for a modulate layer's overlap test. */
  readonly #laid: Float32Array;

  constructor(max: number, texture: CanvasTexture, modulate = false) {
    this.#max = max;
    this.#upright = modulate;
    this.#laid = new Float32Array(modulate ? max * 7 : 0);
    const laid = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };
    let material: MeshStandardNodeMaterial | MeshBasicNodeMaterial;
    if (modulate) {
      const m = new MeshBasicNodeMaterial({ ...laid, fog: false, toneMapped: false });
      // Four decals to the texture, two by two: the slot picks which.
      const t = textureNode(texture, uv().mul(0.5).add(vec2(float(instanceIndex.mod(2)), float(instanceIndex.div(2).mod(2))).mul(0.5)));
      // The instance colour multiplies the colour node afterwards: divided out where the decal is clear, so it tints only what it covers.
      m.colorNode = mix(vec3(0.5).div(instanceColor), t.rgb, t.a);
      m.blending = CustomBlending;
      m.blendEquation = AddEquation;
      m.blendSrc = DstColorFactor;
      m.blendDst = SrcColorFactor;
      m.blendSrcAlpha = ZeroFactor;
      m.blendDstAlpha = OneFactor;
      material = m;
    } else material = new MeshStandardNodeMaterial({ map: texture, ...laid, roughness: 0.9 });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
  }

  add(point: Vec3, normal: Vec3, size: number, color: Color): void {
    // A modulate decal multiplies what is under it, so stacked ones compound into a dark blot: a shot into a hole already
    // there widens nothing new, and lays no second decal.
    if (this.#laid.length > 0 && this.#overlaps(point, normal, size)) return;
    const n = new Vector3(normal[0], normal[1], normal[2]);
    tmp.position.set(point[0], point[1], point[2]).addScaledVector(n, 0.004);
    tmp.quaternion.setFromUnitVectors(Z, n);
    // On a wall an upright decal's texture up runs up the wall, a little askew; on a floor or ceiling, any way round.
    let spin = Math.random() * Math.PI * 2;
    if (this.#upright && Math.abs(n.y) < 0.9) {
      const up = tmpV.set(0, 1, 0).applyQuaternion(tmp.quaternion);
      const want = tmpW.set(0, 1, 0).addScaledVector(n, -n.y).normalize();
      spin = Math.atan2(tmpU.crossVectors(up, want).dot(n), up.dot(want)) + (Math.random() - 0.5) * 0.5;
    }
    tmp.quaternion.multiply(tmpQ.setFromAxisAngle(Z, spin));
    tmp.scale.setScalar(size);
    tmp.updateMatrix();
    const i = this.#next;
    if (this.#laid.length > 0) this.#laid.set([point[0], point[1], point[2], normal[0], normal[1], normal[2], size], i * 7);
    this.mesh.setMatrixAt(i, tmp.matrix);
    this.mesh.setColorAt(i, color);
    this.#next = (i + 1) % this.#max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Whether a decal laid at `point` would sit in one already there: its centre inside that one's crater, on the same face. */
  #overlaps(point: Vec3, normal: Vec3, size: number): boolean {
    const d = this.#laid;
    for (let i = 0; i < this.mesh.count; i++) {
      const o = i * 7;
      if (normal[0] * d[o + 3]! + normal[1] * d[o + 4]! + normal[2] * d[o + 5]! < 0.9) continue;
      // The crater reaches 0.10 to 0.13 of a decal's size, up to about 0.2 where its outline wobbles out, and its dust a
      // little past that: a shot landing further off leaves a hole of its own.
      const reach = 0.24 * Math.min(size, d[o + 6]!);
      const dx = point[0] - d[o]!;
      const dy = point[1] - d[o + 1]!;
      const dz = point[2] - d[o + 2]!;
      if (dx * dx + dy * dy + dz * dz < reach * reach) return true;
    }
    return false;
  }
}

interface Casing {
  p: Vector3;
  v: Vector3;
  q: Quaternion;
  spin: Vector3;
  age: number;
  resting: boolean;
  bounces: number;
}

const HOLE_TINT: Readonly<Record<Material, number>> = {
  concrete: 0xffffff,
  plaster: 0xffffff,
  metal: 0xe4e8ec,
  wood: 0xf0dcc0,
  dirt: 0x907860,
  grass: 0x907860,
  glass: 0xe0f0ff,
  brick: 0xc89a88,
  asphalt: 0x8a8a8a,
  gravel: 0x9a9080,
  sand: 0xb8a582,
  sheetMetal: 0xe4e8ec,
  plastic: 0xf0f0f0,
};

/** Dust and chip colour per material (sparks are used for metal and glass instead). */
const DUST: Partial<Record<Material, number>> = {
  wood: 0x8a6038,
  dirt: 0x7c6a52,
  grass: 0x7c6a52,
  plaster: 0xd8d4cc,
  brick: 0xa8604a,
  asphalt: 0x55575a,
  gravel: 0x8c8478,
  sand: 0xc9b58c,
  plastic: 0xe8e4dc,
};

const BLAST_COLOR = 0xffa860;
/** A flash's light: white with a cold edge. */
const FLASH_COLOR = 0xeef4ff;
/** Puffs a smoke cloud keeps standing at full size, and how long each lasts (s). */
const CLOUD_PUFFS = 46;
const CLOUD_PUFF_LIFE = 4;
/** A cloud thinned to this hides nothing (smokeHides), and is no longer fed. */
const CLOUD_FEED_FLOOR = 0.35;
/** The Preparation's key light: a soft warm white, bright enough to lift a Squad out of the dusk from a few metres. */
const KEY_COLOR = 0xffe6cc;
const KEY_INTENSITY = 26;

/**
 * Combat effects: a muzzle flash that lights the scene, muzzle smoke after
 * sustained fire, ejected casings that bounce and settle, bullet-hole decals,
 * sparks or dust by surface material, and blood on player hits.
 */
export class Effects {
  readonly #world: World;
  readonly #root = new Group();
  readonly #lights: PointLight[] = [];
  readonly #lightAge: number[] = [];
  /** Each shot light's strength, by the gun that fired it. */
  readonly #lightPower: number[] = [];
  #nextLight = 0;
  readonly #sparks = new ParticleLayer(280, 'spark');
  readonly #dust = new ParticleLayer(260, 'puff');
  readonly #chips = new ParticleLayer(240, 'chip');
  readonly #smoke = new ParticleLayer(150, 'puff');
  readonly #blood = new ParticleLayer(60, 'puff');
  readonly #flames = new ParticleLayer(40, 'flame');
  readonly #rings = new ParticleLayer(6, 'ring');
  /** The smoke tacticals' clouds (ticket 20): drawn in full whatever the particle share, since they decide who sees whom. */
  readonly #cloud = new ParticleLayer(CLOUD_PUFFS * 12, 'puff', { essential: true, steady: true });
  /** Each standing cloud's puffs owed (emitted as they reach one), by canister id. */
  readonly #clouds = new Map<number, { owed: number }>();
  /** The blast light now: a frag's orange, or a flash's brighter, shorter white. */
  #blastHex = BLAST_COLOR;
  #blastPeak = 80;
  #blastFor = 0.25;
  readonly #fires: readonly Vec3[];
  readonly #fire: ParticleLayer | null;
  readonly #fireSmoke: ParticleLayer | null;
  #fireClock = 0;
  #fireSmokeClock = 0;
  readonly #holes: DecalLayer;
  readonly #splats: DecalLayer;
  readonly #casingMesh: InstancedMesh;
  readonly #casings: Casing[] = [];
  /** Flashes on show, by age (s); a new one is -1 until the frame that first draws it, so a slow frame can't hide it unseen. */
  readonly #flashes: { mesh: Mesh; age: number }[] = [];
  readonly #falling: { mesh: Mesh; v: Vector3; spin: Vector3; age: number; resting: boolean }[] = [];
  readonly #flashMaterial: MeshBasicNodeMaterial;
  readonly #recentShots: number[] = [];
  /** A frag's flash: brighter and longer than a muzzle's. */
  readonly #blastLight = new PointLight(BLAST_COLOR, 0, 22, 1.4);
  #blastAge = 1;
  /** The Preparation's key light on the Squad, which borrows the frag's light (nothing explodes while it is on). */
  #key: Vec3 | null = null;
  #time = 0;
  /** Called when a casing hits a surface hard enough to be heard. */
  onCasingBounce: ((position: Vec3, material: Material, intensity: number) => void) | null = null;

  constructor(scene: Scene, world: World, fires: readonly Vec3[] = []) {
    this.#world = world;
    this.#fires = fires;
    this.#fire = fires.length ? new ParticleLayer(96, 'flame') : null;
    this.#fireSmoke = fires.length ? new ParticleLayer(64, 'puff') : null;
    if (this.#fire && this.#fireSmoke) {
      this.#fire.mesh.name = 'ambient-fire';
      this.#fireSmoke.mesh.name = 'ambient-fire-smoke';
    }
    for (let i = 0; i < 2; i++) {
      const light = new PointLight(0xffb468, 0, 9, 1.6);
      this.#lights.push(light);
      this.#lightAge.push(1);
      this.#lightPower.push(1);
      this.#root.add(light);
    }
    this.#holes = new DecalLayer(220, holeTexture(), true);
    this.#splats = new DecalLayer(60, splatTexture());
    const casingGeometry = new CylinderGeometry(0.0048, 0.0048, 0.045, 8);
    casingGeometry.rotateZ(Math.PI / 2);
    // Brass that stays brass: all metal, a case turned away from the sun reflected only the dim sky and ground and flew
    // as a black rod (review 2026-11-12d). A little diffuse takes the light round it and a faint warmth keeps it off black.
    this.#casingMesh = new InstancedMesh(casingGeometry, new MeshStandardNodeMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.36, emissive: 0x4a3510 }), 80);
    this.#casingMesh.count = 0;
    this.#casingMesh.frustumCulled = false;
    this.#casingMesh.castShadow = true;
    this.#flashMaterial = flashMaterial();
    this.#root.add(this.#blastLight);
    this.#root.add(...this.#layers().map((l) => l.mesh), this.#holes.mesh, this.#splats.mesh, this.#casingMesh);
    scene.add(this.#root);
  }

  /** Every particle pool there is. */
  #layers(): ParticleLayer[] {
    const combat = [this.#sparks, this.#dust, this.#chips, this.#smoke, this.#cloud, this.#blood, this.#flames, this.#rings];
    return this.#fire && this.#fireSmoke ? [...combat, this.#fire, this.#fireSmoke] : combat;
  }

  /** The baked light probes, so smoke, dust and chips take the light round them (null: the sky's, as on open ground). */
  set probes(field: ProbeField | null) {
    for (const l of this.#layers()) l.probes = field;
  }

  /** Lights the Preparation's Squad from `at` (world), or puts the light out (null). */
  set keyLight(at: Vec3 | null) {
    this.#key = at;
  }

  /** A muzzle-flash star mesh, for attaching to a weapon's muzzle socket. */
  createFlash(): Mesh {
    const mesh = new Mesh(flashGeometry(), this.#flashMaterial);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return mesh;
  }

  /** Shows a flash mesh for one or two frames with a random twist and size, sized for `weapon`'s round. */
  flash(mesh: Mesh, weapon?: WeaponId, device?: MuzzleId): void {
    const size = (weapon ? MUZZLE[weapon] : PLAIN_MUZZLE).flash * (device ? DEVICE_FLASH[device].flash : 1);
    if (size <= 0) return;
    mesh.visible = true;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar((0.8 + Math.random() * 0.5) * size);
    const existing = this.#flashes.find((f) => f.mesh === mesh);
    if (existing) existing.age = -1;
    else this.#flashes.push({ mesh, age: -1 });
  }

  /** How much direct sun reaches `p`, 0 or 1: what a puff thrown up there is lit by. */
  #sunlit(p: Vector3): number {
    const d = currentLighting().sunDirection;
    const from: Vec3 = [p.x + d[0] * 0.15, p.y + d[1] * 0.15, p.z + d[2] * 0.15];
    return raycastWorld(this.#world, from, [p.x + d[0] * 60, p.y + d[1] * 60, p.z + d[2] * 60]) ? 0 : 1;
  }

  /** A shot fired at `origin` (world) toward `direction` by `weapon`: lights the scene and builds up smoke on sustained fire. */
  shot(origin: Vec3, direction: Vec3, weapon?: WeaponId, device?: MuzzleId): void {
    const plain = weapon ? MUZZLE[weapon] : PLAIN_MUZZLE;
    const fx = device ? DEVICE_FLASH[device] : null;
    const look = fx ? { flash: plain.flash * fx.light, smoke: plain.smoke * fx.smoke } : plain;
    const i = this.#nextLight;
    this.#nextLight = (i + 1) % this.#lights.length;
    const light = this.#lights[i] as PointLight;
    light.position.set(origin[0] + direction[0] * 0.6, origin[1] + direction[1] * 0.6, origin[2] + direction[2] * 0.6);
    // Fresh until the next update: that frame draws it at full strength however long the frame took.
    this.#lightAge[i] = -1;
    this.#lightPower[i] = look.flash;
    this.#recentShots.push(this.#time);
    while ((this.#recentShots[0] ?? Infinity) < this.#time - 1.2) this.#recentShots.shift();
    const heat = this.#recentShots.length;
    const at = new Vector3(origin[0] + direction[0] * 0.75, origin[1] + direction[1] * 0.75 - 0.05, origin[2] + direction[2] * 0.75);
    // Every shot leaves a wisp at the muzzle; a long burst leaves a haze that hangs.
    // A big round's smoke builds a haze sooner.
    const n = heat * look.smoke >= 12 ? 2 : heat * look.smoke >= 5 ? 1 : 0;
    const sun = this.#sunlit(at);
    this.#smoke.emit({
      p: at.clone(),
      v: new Vector3(direction[0] * 1.6, 0.15, direction[2] * 1.6),
      life: (0.35 + Math.random() * 0.2) * Math.sqrt(look.smoke),
      size: 0.08 * look.smoke,
      grow: 0.9,
      alpha: Math.min(0.3, 0.16 * look.smoke),
      drag: 5,
      sun,
      color: new Color(MUZZLE_SMOKE),
    });
    // Each haze puff its own place along the barrel, size and stretch: the same disc at the same spot every shot laid a
    // turning burst out as a row of evenly spaced grey discs (review 2026-11-12d).
    for (let k = 0; k < n; k++) {
      const ahead = (Math.random() - 0.3) * 0.35;
      this.#smoke.emit({
        p: at.clone().add(new Vector3(direction[0] * ahead + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.08, direction[2] * ahead + (Math.random() - 0.5) * 0.1)),
        v: new Vector3(direction[0] * 0.4 + (Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.2, direction[2] * 0.4 + (Math.random() - 0.5) * 0.15),
        life: 1.6 + Math.random() * 0.8,
        size: 0.12 * Math.sqrt(look.smoke) * (0.6 + Math.random() * 0.8),
        stretch: 1 + Math.random() * 0.9,
        grow: 0.32,
        spin: (Math.random() - 0.5) * 0.8,
        alpha: 0.2,
        drag: 1.2,
        sun,
        color: new Color(MUZZLE_SMOKE),
      });
    }
  }

  /** A casing ejected from `position` (world) with the shooter's right and up vectors. */
  eject(position: Vec3, right: Vec3, up: Vec3, carry: Vec3): void {
    if (this.#casings.length >= 80) this.#casings.shift();
    const s = 1.6 + Math.random() * 0.8;
    this.#casings.push({
      p: new Vector3(position[0], position[1], position[2]),
      v: new Vector3(right[0] * s + up[0] * 1.4 + carry[0], right[1] * s + up[1] * 1.4 + carry[1], right[2] * s + up[2] * 1.4 + carry[2]),
      q: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.random() * Math.PI),
      spin: new Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
      age: 0,
      resting: false,
      bounces: 0,
    });
  }

  /**
   * A bullet hitting the world: a hole, and what that surface throws back.
   * Metal and glass spit sparks with a flash at the strike; wood splinters;
   * earth and sand go up in a tall plume; masonry puffs and chips.
   */
  impact(point: Vec3, normal: Vec3, material: Material): void {
    const m = material;
    // Loose ground closes over a bullet: a small dark pock, not a cracked hole.
    const loose = m === 'dirt' || m === 'grass' || m === 'sand' || m === 'gravel';
    this.#holes.add(point, normal, loose ? 0.04 + Math.random() * 0.015 : 0.065 + Math.random() * 0.03, new Color(HOLE_TINT[m]));
    const n = new Vector3(normal[0], normal[1], normal[2]);
    const p = new Vector3(point[0], point[1], point[2]).addScaledVector(n, 0.03);
    const sun = this.#sunlit(p);
    const spread = () => new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    if (m === 'metal' || m === 'glass' || m === 'sheetMetal') {
      for (let i = 0; i < 10; i++) {
        this.#sparks.emit({ p: p.clone(), v: n.clone().multiplyScalar(3 + Math.random() * 7).add(spread().multiplyScalar(3.5)), life: 0.14 + Math.random() * 0.28, size: 0.012 + Math.random() * 0.008, gravity: 9, drag: 1.6, color: new Color(1, 0.7 + Math.random() * 0.25, 0.35) });
      }
      this.#flames.emit({ p: p.clone(), life: 0.07, size: 0.16, grow: 1.5, alpha: 0.8, color: new Color(1, 0.8, 0.5) });
      this.#dust.emit({ p: p.clone(), v: n.clone().multiplyScalar(0.5), life: 0.5, size: 0.07, grow: 0.35, alpha: 0.3, drag: 3, sun, color: new Color(0x8c8c8c) });
      if (m === 'glass') {
        for (let i = 0; i < 6; i++) {
          this.#chips.emit({ p: p.clone(), v: n.clone().multiplyScalar(1.5 + Math.random() * 2.5).add(spread().multiplyScalar(1.6)), life: 0.6, size: 0.014 + Math.random() * 0.012, spin: (Math.random() - 0.5) * 30, gravity: 9.8, drag: 0.4, sun, color: new Color(0xd6e6ea) });
        }
      }
      return;
    }
    const color = DUST[m] ?? 0xb2b0ac;
    // The puff: thrown out along the surface's normal, slowing fast and hanging.
    for (let i = 0; i < 4; i++) {
      this.#dust.emit({
        p: p.clone(),
        v: n.clone().multiplyScalar(0.8 + Math.random() * 1.9).add(spread().multiplyScalar(0.5)),
        life: 0.6 + Math.random() * 0.7,
        size: 0.07,
        grow: 0.5,
        spin: (Math.random() - 0.5) * 1.5,
        alpha: 0.55,
        gravity: 0.3,
        drag: 3.2,
        sun,
        color: new Color(color),
      });
    }
    if (loose) {
      // Loose ground jumps: a taller, thinner column.
      for (let i = 0; i < 3; i++) {
        this.#dust.emit({ p: p.clone(), v: n.clone().multiplyScalar(2.6 + Math.random() * 2.4).add(spread().multiplyScalar(0.35)), life: 0.5 + Math.random() * 0.5, size: 0.05, grow: 0.42, alpha: 0.5, gravity: 2.2, drag: 3.6, sun, color: new Color(color) });
      }
    }
    // Debris: small, fast, falling. Wood comes off in long splinters.
    const splinters = m === 'wood';
    for (let i = 0; i < 5; i++) {
      this.#chips.emit({
        p: p.clone(),
        v: n.clone().multiplyScalar(1.8 + Math.random() * 2.4).add(spread().multiplyScalar(1.5)),
        life: 0.5 + Math.random() * 0.2,
        size: splinters ? 0.008 + Math.random() * 0.006 : 0.012 + Math.random() * 0.014,
        stretch: splinters ? 3 + Math.random() * 3 : 1,
        spin: (Math.random() - 0.5) * 26,
        gravity: 9.8,
        drag: 0.5,
        sun,
        color: new Color(color).multiplyScalar(splinters ? 1.15 : 0.7),
      });
    }
  }

  /**
   * A frag going off at `point`: a white flash and a shock ring, a fireball
   * that is gone in a third of a second, sparks and embers, dust rolling out
   * along the ground, a column of smoke that hangs for seconds, and a scorch.
   */
  explosion(point: Vec3): void {
    const p = new Vector3(point[0], point[1] + 0.1, point[2]);
    this.#blastLight.position.copy(p).add(new Vector3(0, 0.6, 0));
    this.#blastAge = 0;
    this.#blastHex = BLAST_COLOR;
    this.#blastPeak = 80;
    this.#blastFor = 0.25;
    const sun = this.#sunlit(new Vector3(point[0], point[1] + 0.8, point[2]));
    const dir = () => {
      const u = Math.random() * Math.PI * 2;
      const up = Math.random();
      const r = Math.sqrt(1 - up * up);
      return new Vector3(Math.cos(u) * r, up, Math.sin(u) * r);
    };
    this.#flames.emit({ p: p.clone().add(new Vector3(0, 0.3, 0)), life: 0.09, size: 2.2, grow: 14, alpha: 1, rot: 0, color: new Color(1, 0.92, 0.75) });
    this.#rings.emit({ p: p.clone().add(new Vector3(0, 0.3, 0)), life: 0.2, size: 0.8, grow: 46, alpha: 0.4, rot: 0, color: new Color(1, 0.86, 0.66) });
    for (let i = 0; i < 8; i++) {
      this.#flames.emit({ p: p.clone().add(dir().multiplyScalar(0.35)), v: dir().multiplyScalar(2.2 + Math.random() * 2), life: 0.26 + Math.random() * 0.22, size: 1.0, grow: 7, spin: (Math.random() - 0.5) * 3, alpha: 0.9, drag: 4, color: new Color(1, 0.5 + Math.random() * 0.12, 0.16) });
    }
    for (let i = 0; i < 40; i++) {
      this.#sparks.emit({ p: p.clone(), v: dir().multiplyScalar(8 + Math.random() * 16), life: 0.2 + Math.random() * 0.4, size: 0.02 + Math.random() * 0.015, gravity: 9, drag: 1.5, color: new Color(1, 0.7 + Math.random() * 0.25, 0.35) });
    }
    // Embers: slower, and they outlive the fireball.
    for (let i = 0; i < 14; i++) {
      this.#sparks.emit({ p: p.clone(), v: dir().multiplyScalar(2.5 + Math.random() * 4).add(new Vector3(0, 3, 0)), life: 0.8 + Math.random() * 0.8, size: 0.016, gravity: 5, drag: 1.1, color: new Color(1, 0.45 + Math.random() * 0.2, 0.12) });
    }
    // Dust driven out along the ground.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      this.#dust.emit({
        p: p.clone().add(new Vector3(Math.cos(a) * 0.4, 0.05, Math.sin(a) * 0.4)),
        v: new Vector3(Math.cos(a) * (6 + Math.random() * 4), 0.5 + Math.random() * 0.6, Math.sin(a) * (6 + Math.random() * 4)),
        life: 1.3 + Math.random() * 0.9,
        size: 0.7,
        grow: 1.2,
        spin: (Math.random() - 0.5) * 0.8,
        alpha: 0.55,
        drag: 4.5,
        sun,
        color: new Color(0x9a8f7d).multiplyScalar(0.8 + Math.random() * 0.3),
      });
    }
    // The column: dark at first where the fire was, paler as it climbs and thins.
    for (let i = 0; i < 16; i++) {
      this.#smoke.emit({
        p: p.clone().add(dir().multiplyScalar(0.5)),
        v: dir().multiplyScalar(1.6 + Math.random() * 2.2).add(new Vector3(0, 1.4 + Math.random() * 1.4, 0)),
        life: 3.4 + Math.random() * 2.6,
        size: 0.9,
        grow: 1.0,
        spin: (Math.random() - 0.5) * 0.5,
        alpha: 0.72,
        drag: 1.9,
        gravity: -0.25,
        sun,
        color: new Color(0x5a554e).multiplyScalar(0.55 + Math.random() * 0.6),
      });
    }
    // Dirt and grit thrown up and falling back.
    for (let i = 0; i < 30; i++) {
      this.#chips.emit({ p: p.clone(), v: dir().multiplyScalar(3 + Math.random() * 6).add(new Vector3(0, 2.5, 0)), life: 0.9 + Math.random() * 0.7, size: 0.02 + Math.random() * 0.03, spin: (Math.random() - 0.5) * 20, gravity: 9.8, drag: 0.4, sun, color: new Color(0x4a4238) });
    }
    const ground = raycastWorld(this.#world, [point[0], point[1] + 0.3, point[2]], [point[0], point[1] - 1, point[2]]);
    if (ground) this.#splats.add(ground.point, ground.normal, 1.8 + Math.random() * 0.5, new Color(0.06, 0.055, 0.05));
  }

  /**
   * A flash going off at `point` (ticket 20): a white light far brighter and
   * shorter than a frag's, a hard white star and ring, a spray of white
   * sparks, and a little grey smoke where the canister lies. No fire, no scorch.
   */
  flashPop(point: Vec3): void {
    const p = new Vector3(point[0], point[1] + 0.12, point[2]);
    this.#blastLight.position.copy(p).add(new Vector3(0, 0.4, 0));
    this.#blastAge = 0;
    this.#blastHex = FLASH_COLOR;
    this.#blastPeak = 220;
    this.#blastFor = 0.14;
    const sun = this.#sunlit(p);
    const dir = () => {
      const u = Math.random() * Math.PI * 2;
      const up = Math.random() * 1.3 - 0.3;
      const r = Math.sqrt(Math.max(0, 1 - up * up));
      return new Vector3(Math.cos(u) * r, up, Math.sin(u) * r);
    };
    this.#flames.emit({ p: p.clone(), life: 0.07, size: 1.6, grow: 22, alpha: 1, rot: 0, color: new Color(1, 1, 1) });
    this.#rings.emit({ p: p.clone(), life: 0.14, size: 0.6, grow: 40, alpha: 0.5, rot: 0, color: new Color(0.95, 0.97, 1) });
    for (let i = 0; i < 30; i++) {
      this.#sparks.emit({ p: p.clone(), v: dir().multiplyScalar(6 + Math.random() * 10), life: 0.12 + Math.random() * 0.2, size: 0.016 + Math.random() * 0.01, gravity: 6, drag: 2, color: new Color(1, 0.98, 0.92) });
    }
    for (let i = 0; i < 6; i++) {
      this.#smoke.emit({
        p: p.clone().add(dir().multiplyScalar(0.25)),
        v: dir().multiplyScalar(0.6 + Math.random() * 0.8).add(new Vector3(0, 0.6, 0)),
        life: 1.8 + Math.random() * 1.2,
        size: 0.5,
        grow: 0.6,
        spin: (Math.random() - 0.5) * 0.6,
        alpha: 0.4,
        drag: 2.2,
        gravity: -0.2,
        sun,
        color: new Color(0x8e8c88),
      });
    }
  }

  /**
   * The smoke clouds standing at `time` (ticket 20), stepped by `dt`: each is
   * kept full of slow, heavy, steady puffs inside the shape the simulation
   * hides by, so what you see hides what a bot can't see. A cloud first met
   * already standing (a late join, a respawn) is filled at once. Once a cloud
   * has thinned past the point it hides anything it is no longer fed, and its
   * last puffs last only that long, so it clears when the game says it has.
   */
  smokeClouds(clouds: readonly SmokeCloud[], time: number, dt: number): void {
    const S = STATS.tactical.smoke;
    const live = new Set<number>();
    for (const c of clouds) {
      live.add(c.id);
      const amount = smokeAmount(c, time);
      const age = time - c.popped;
      let state = this.#clouds.get(c.id);
      if (!state) {
        state = { owed: 0 };
        this.#clouds.set(c.id, state);
        // Met already risen: filled at once, its puffs at every age.
        if (age > S.rise.value * 0.5 && amount > CLOUD_FEED_FLOOR) {
          for (let i = 0; i < Math.round(CLOUD_PUFFS * amount); i++) this.#cloudPuff(c, amount, time, Math.random());
        }
      }
      if (age < 0 || (amount <= CLOUD_FEED_FLOOR && age > S.rise.value)) continue;
      // Pours out fast while it swells, then only tops itself up.
      const rate = age < S.rise.value ? (CLOUD_PUFFS * 1.4) / S.rise.value : CLOUD_PUFFS / CLOUD_PUFF_LIFE;
      // However slow the frame, it is fed for all of it (a slow frame must not let it drain), up to one full cloud at once.
      state.owed = Math.min(CLOUD_PUFFS, state.owed + rate * Math.max(0, dt));
      while (state.owed >= 1) {
        state.owed -= 1;
        this.#cloudPuff(c, amount, time, 0);
      }
    }
    for (const id of [...this.#clouds.keys()]) if (!live.has(id)) this.#clouds.delete(id);
  }

  /** One puff of `cloud`, `along` (0..1) of the way through its life already. */
  #cloudPuff(cloud: SmokeCloud, amount: number, time: number, along: number): void {
    const S = STATS.tactical.smoke;
    const age = time - cloud.popped;
    const c = smokeCentre(cloud);
    // Where in the cloud's full shape it belongs, weighted toward the middle.
    const u = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const r = Math.cbrt(Math.random()) * 0.92;
    const across = Math.sqrt(1 - y * y) * r;
    const rx = S.width.value / 2;
    const ry = S.height.value / 2;
    const place = new Vector3(c[0] + Math.cos(u) * across * rx, c[1] + y * r * ry, c[2] + Math.sin(u) * across * rx);
    // Still swelling: born at the canister and carried out to its place (drag 1.5 stops it about 1/1.5 of its speed on).
    const rising = age < S.rise.value;
    const at = rising ? new Vector3(cloud.at[0], cloud.at[1] + 0.25, cloud.at[2]) : place;
    const v = rising ? place.clone().sub(at).multiplyScalar(1.5) : new Vector3((Math.random() - 0.5) * 0.12, 0.03 + Math.random() * 0.05, (Math.random() - 0.5) * 0.12);
    // Its last puffs last only as long as it hides anything.
    const hides = S.life.value - age - S.fade.value * CLOUD_FEED_FLOOR;
    const life = Math.max(0.6, Math.min(CLOUD_PUFF_LIFE, hides + 0.5));
    const shade = 0.82 + Math.random() * 0.14;
    this.#cloud.emit({
      p: at,
      v,
      age: along * life,
      life,
      size: 1.2 + 0.8 * Math.max(0.3, amount),
      grow: 0.12,
      spin: (Math.random() - 0.5) * 0.25,
      alpha: 0.92,
      drag: rising ? 1.5 : 0.4,
      sun: this.#sunlit(new Vector3(c[0], c[1] + 1, c[2])),
      color: new Color(0xc9c7c1).multiplyScalar(shade),
    });
  }

  /** A hit on a player or dummy at `point`, travelling along `direction`. */
  blood(point: Vec3, direction: Vec3, heavy: boolean): void {
    const p = new Vector3(point[0], point[1], point[2]);
    const d = new Vector3(direction[0], direction[1], direction[2]).normalize();
    const k = heavy ? 1.6 : 1;
    const sun = this.#sunlit(p);
    // Drops, carried on by the bullet.
    for (let i = 0; i < Math.round(7 * k); i++) {
      this.#chips.emit({
        p: p.clone(),
        v: d.clone().multiplyScalar(1.2 + Math.random() * 2.4).add(new Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6)),
        life: 0.35 + Math.random() * 0.3,
        size: 0.014 + Math.random() * 0.016,
        stretch: 1.6,
        spin: (Math.random() - 0.5) * 12,
        gravity: 7,
        drag: 2,
        sun,
        color: new Color(0.3 + Math.random() * 0.08, 0.012, 0.012),
      });
    }
    // The mist at the wound.
    for (let i = 0; i < (heavy ? 3 : 2); i++) {
      this.#blood.emit({ p: p.clone(), v: d.clone().multiplyScalar(0.5 + Math.random() * 0.9).add(new Vector3(0, 0.2, 0)), life: 0.4 + Math.random() * 0.2, size: 0.1, grow: 0.6, alpha: 0.5, drag: 3.5, sun, color: new Color(0.34, 0.03, 0.03) });
    }
    // A splat on whatever is behind the target.
    const end: Vec3 = [point[0] + d.x * 2.5, point[1] + d.y * 2.5 - 0.4, point[2] + d.z * 2.5];
    const hit = raycastWorld(this.#world, point, end);
    if (hit) this.#splats.add(hit.point, hit.normal, 0.25 + Math.random() * 0.25, new Color(0.35, 0.02, 0.02));
  }

  update(dt: number, camera: Camera): void {
    this.#time += dt;
    if (this.#fire && this.#fireSmoke) {
      // Ambient fire has its own bounded pools so it cannot evict combat smoke
      // or sparks. Cap catch-up after a background tab resumes.
      this.#fireClock += Math.min(dt,0.1);
      this.#fireSmokeClock += Math.min(dt,0.1);
      while (this.#fireClock >= 0.05) {
        this.#fireClock -= 0.05;
        for (const [x,y,z] of this.#fires) {
          this.#fire.emit({p:new Vector3(x+(Math.random()-0.5)*0.32,y+0.08,z+(Math.random()-0.5)*0.32),
            v:new Vector3((Math.random()-0.5)*0.12,0.7+Math.random()*0.4,(Math.random()-0.5)*0.12),
            life:0.55+Math.random()*0.2,size:0.35+Math.random()*0.12,stretch:2.1,grow:-0.12,alpha:1,rot:0,
            color:new Color(1,0.27+Math.random()*0.22,0.025)});
        }
      }
      while (this.#fireSmokeClock >= 0.32) {
        this.#fireSmokeClock -= 0.32;
        for (const [x,y,z] of this.#fires) {
          this.#fireSmoke.emit({p:new Vector3(x,y+0.48,z),v:new Vector3(0.12,0.55+Math.random()*0.2,0.04),
            life:1.8+Math.random()*0.6,size:0.32,grow:0.23,alpha:0.22,
            spin:(Math.random()-0.5)*0.4,color:new Color(0x55534d)});
        }
      }
    }
    let glow = 0;
    for (let i = 0; i < this.#lights.length; i++) {
      const before = this.#lightAge[i] ?? 1;
      const age = before < 0 ? 0 : before + dt;
      this.#lightAge[i] = age;
      const light = this.#lights[i] as PointLight;
      light.intensity = age < 0.05 ? (14 * (1 - age / 0.05) + 4) * (this.#lightPower[i] ?? 1) : 0;
      if (light.intensity / 18 > glow) {
        glow = light.intensity / 18;
        shotGlow.value.set(light.position.x, light.position.y, light.position.z, glow);
      }
    }
    if (glow === 0) shotGlow.value.w = 0;
    this.#blastAge += dt;
    const key = this.#key;
    if (key) {
      this.#blastLight.position.set(key[0], key[1], key[2]);
      this.#blastLight.color.setHex(KEY_COLOR);
      this.#blastLight.intensity = KEY_INTENSITY;
    } else {
      if (this.#blastLight.color.getHex() !== this.#blastHex) this.#blastLight.color.setHex(this.#blastHex);
      this.#blastLight.intensity = this.#blastAge < this.#blastFor ? this.#blastPeak * (1 - this.#blastAge / this.#blastFor) ** 2 : 0;
    }
    for (let i = this.#flashes.length - 1; i >= 0; i--) {
      const f = this.#flashes[i]!;
      // Shown since the last frame: drawn once at least, then aged.
      f.age = f.age < 0 ? 0 : f.age + dt;
      if (f.age > 0.035) {
        f.mesh.visible = false;
        this.#flashes.splice(i, 1);
      }
    }
    for (const layer of this.#layers()) layer.update(dt, camera);
    this.#updateCasings(dt);
    this.#updateFalling(dt);
  }

  /** Drops a knocked-off prop (a mannequin head): it flies off along the shot, tumbles, bounces and is cleared after a while. Presentation only. */
  fall(mesh: Mesh, direction: Vec3): void {
    this.#root.add(mesh);
    const v = new Vector3(direction[0], direction[1], direction[2]).multiplyScalar(3.5).add(new Vector3(0, 1.8, 0));
    const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    this.#falling.push({ mesh, v, spin, age: 0, resting: false });
  }

  #updateFalling(dt: number): void {
    for (let i = this.#falling.length - 1; i >= 0; i--) {
      const f = this.#falling[i]!;
      f.age += dt;
      if (f.age > 12) {
        f.mesh.removeFromParent();
        this.#falling.splice(i, 1);
        continue;
      }
      if (f.resting) continue;
      f.v.y -= 9.81 * dt;
      const p = f.mesh.position;
      const a: Vec3 = [p.x, p.y, p.z];
      const b: Vec3 = [p.x + f.v.x * dt, p.y + f.v.y * dt, p.z + f.v.z * dt];
      const hit = raycastWorld(this.#world, a, b);
      if (hit) {
        const n = new Vector3(hit.normal[0], hit.normal[1], hit.normal[2]);
        const into = f.v.dot(n);
        f.v.addScaledVector(n, -into * 1.35).multiplyScalar(0.5);
        f.spin.multiplyScalar(0.5);
        p.set(hit.point[0], hit.point[1], hit.point[2]).addScaledVector(n, 0.12);
        if (n.y > 0.7 && Math.abs(into) < 1) f.resting = true;
      } else {
        p.set(b[0], b[1], b[2]);
        const w = f.spin.length();
        if (w > 0) f.mesh.quaternion.premultiply(tmpQ.setFromAxisAngle(f.spin.clone().divideScalar(w), w * dt));
      }
    }
  }

  /** The muzzle-flash light's current strength, 0 to 1 (drives the bloom boost). */
  get flashStrength(): number {
    return Math.max(0, ...this.#lightAge.map((a) => (a < 0 ? 1 : a < 0.05 ? 1 - a / 0.05 : 0)));
  }

  #updateCasings(dt: number): void {
    const list = this.#casings;
    if (list.length === 0) {
      this.#casingMesh.count = 0;
      return;
    }
    const m = new Matrix4();
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i]!;
      c.age += dt;
      if (c.age > 8) {
        list.splice(i, 1);
        continue;
      }
      if (c.resting) continue;
      c.v.y -= 9.81 * dt;
      const a: Vec3 = [c.p.x, c.p.y, c.p.z];
      const b: Vec3 = [c.p.x + c.v.x * dt, c.p.y + c.v.y * dt, c.p.z + c.v.z * dt];
      const hit = raycastWorld(this.#world, a, b);
      if (hit) {
        const n = new Vector3(hit.normal[0], hit.normal[1], hit.normal[2]);
        const into = c.v.dot(n);
        const speed = Math.abs(into);
        c.v.addScaledVector(n, -into * 1.4).multiplyScalar(0.55);
        c.p.set(hit.point[0], hit.point[1], hit.point[2]).addScaledVector(n, 0.005);
        c.spin.multiplyScalar(0.5);
        c.bounces += 1;
        if (speed > 0.6) this.onCasingBounce?.([c.p.x, c.p.y, c.p.z], hit.material, Math.min(1, speed / 4));
        if (n.y > 0.7 && (speed < 0.8 || c.bounces > 4)) {
          c.resting = true;
          // Lie flat on the surface.
          const yaw = Math.random() * Math.PI * 2;
          c.q.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
          c.p.y += 0.0048;
        }
      } else {
        c.p.set(b[0], b[1], b[2]);
        const w = c.spin.length();
        if (w > 0) c.q.multiply(tmpQ.setFromAxisAngle(c.spin.clone().divideScalar(w), w * dt));
      }
    }
    list.forEach((c, i) => {
      m.compose(c.p, c.q, new Vector3(1, 1, 1));
      this.#casingMesh.setMatrixAt(i, m);
    });
    this.#casingMesh.count = list.length;
    this.#casingMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Draws, for one frame, one unseen instance of each particle layer, decal
   * layer and the casings, so their shaders compile before a match needs
   * them. Returns what puts them back.
   */
  showSamples(): () => void {
    const meshes = [...this.#layers().map((l) => l.mesh), this.#holes.mesh, this.#splats.mesh, this.#casingMesh];
    const before = meshes.map((m) => [m.count, m.visible] as const);
    const unseen = new Matrix4().makeScale(0, 0, 0);
    for (const m of meshes) {
      if (m.count > 0) continue;
      m.setMatrixAt(0, unseen);
      m.instanceMatrix.needsUpdate = true;
      m.count = 1;
      m.visible = true;
    }
    return () =>
      meshes.forEach((m, i) => {
        m.count = before[i]![0];
        m.visible = before[i]![1];
      });
  }

  dispose(): void {
    this.#root.removeFromParent();
    for (const layer of this.#layers()) layer.dispose();
    // The glow is shared by every puff material: a flash still lit when a match ends mustn't light the next one's smoke.
    shotGlow.value.w = 0;
  }
}

/** The quad a muzzle flash is drawn on. */
function flashGeometry(): PlaneGeometry {
  return new PlaneGeometry(0.26, 0.26);
}

/**
 * A muzzle flash seen from behind or in front: three tongues of fire with
 * ragged ends round a white heart, a new shape about every frame, so two shots
 * never show the same one.
 */
function flashMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const p = uv().sub(0.5).mul(2);
  const r = p.length();
  const turn = p.y.atan(p.x).div(Math.PI * 2);
  const shot = floor(time.mul(75));
  const ragged = (cloudAt(vec2(turn, shot.mul(0.173)) as never) as unknown as { b: N }).b;
  const tongues = cos(turn.mul(Math.PI * 6).add(shot.mul(2.4))).mul(0.5).add(0.5);
  const reach = float(0.24).add(tongues.mul(tongues).mul(0.44)).add(ragged.mul(0.3));
  const shape = float(1).sub(smoothstep(reach.mul(0.3), reach, r));
  const heart = float(1).sub(smoothstep(float(0), float(0.3), r));
  m.colorNode = vec3(1, 0.6, 0.24).mul(shape.mul(4.5)).add(vec3(1, 0.95, 0.8).mul(heart.mul(7)));
  m.opacityNode = shape;
  return m;
}
