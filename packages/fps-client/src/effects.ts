import { raycastWorld, type Material, type Vec3, type World } from '@duty-shooter/fps-core';
import { attribute, cameraFar, cameraNear, clamp, float, perspectiveDepthToViewZ, positionView, smoothstep, uv, vec3, viewportDepthTexture } from 'three/tsl';
import {
  AdditiveBlending,
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
  type Camera,
  type Scene,
} from 'three/webgpu';
import type { PresetFeatures } from './pipeline';

interface Particle {
  p: Vector3;
  v: Vector3;
  age: number;
  life: number;
  size: number;
  grow: number;
  spin: number;
  rot: number;
  alpha: number;
  gravity: number;
  drag: number;
  color: Color;
}

const tmp = new Object3D();
const tmpQ = new Quaternion();
const Z = new Vector3(0, 0, 1);

/** A pool of camera-facing quads drawn in one instanced draw call, with per-particle colour and alpha. */
class ParticleLayer {
  readonly mesh: InstancedMesh;
  readonly #alpha: InstancedBufferAttribute;
  readonly #particles: Particle[] = [];
  readonly #max: number;

  constructor(max: number, additive: boolean, soft: boolean) {
    this.#max = max;
    const geometry = new PlaneGeometry(1, 1);
    this.#alpha = new InstancedBufferAttribute(new Float32Array(max), 1);
    this.#alpha.setUsage(DynamicDrawUsage);
    geometry.setAttribute('pAlpha', this.#alpha);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
    // A round, soft-edged sprite.
    const r = uv().sub(0.5).length().mul(2);
    let shape = clamp(float(1).sub(r), 0, 1).pow(additive ? 2.5 : 1.4);
    if (soft) {
      // Soft particles: fade where the quad meets scene geometry, so smoke reads as a volume, not a card.
      const sceneZ = perspectiveDepthToViewZ(viewportDepthTexture(), cameraNear, cameraFar);
      shape = shape.mul(smoothstep(float(0), float(0.6), positionView.z.sub(sceneZ)));
    }
    material.opacityNode = shape.mul(attribute<'float'>('pAlpha', 'float'));
    this.mesh = new InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.setColorAt(0, new Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
  }

  emit(p: Partial<Particle> & { p: Vector3 }): void {
    if (this.#particles.length >= this.#max) this.#particles.shift();
    this.#particles.push({
      v: new Vector3(),
      age: 0,
      life: 1,
      size: 0.1,
      grow: 0,
      spin: 0,
      rot: Math.random() * Math.PI * 2,
      alpha: 1,
      gravity: 0,
      drag: 0,
      color: new Color(1, 1, 1),
      ...p,
    });
  }

  update(dt: number, camera: Camera): void {
    const list = this.#particles;
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
    for (let i = 0; i < list.length; i++) {
      const q = list[i] as Particle;
      const t = q.age / q.life;
      tmp.position.copy(q.p);
      tmp.quaternion.copy(camera.quaternion).multiply(tmpQ.setFromAxisAngle(Z, q.rot));
      tmp.scale.setScalar(q.size + q.grow * q.age);
      tmp.updateMatrix();
      this.mesh.setMatrixAt(i, tmp.matrix);
      this.mesh.setColorAt(i, q.color);
      // Quick fade in, long fade out.
      this.#alpha.setX(i, q.alpha * Math.min(1, t * 12) * (1 - t) * (1 - t));
    }
    this.mesh.count = list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.#alpha.needsUpdate = true;
  }
}

/** A bullet hole texture: dark core, scorched ring, transparent outside. */
function holeTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(10,10,10,1)');
    grad.addColorStop(0.22, 'rgba(25,22,20,0.95)');
    grad.addColorStop(0.4, 'rgba(60,55,50,0.55)');
    grad.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
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

/** Instanced, ring-buffered decals laid flat on surfaces. */
class DecalLayer {
  readonly mesh: InstancedMesh;
  #next = 0;
  readonly #max: number;

  constructor(max: number, texture: CanvasTexture) {
    this.#max = max;
    const material = new MeshStandardNodeMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
  }

  add(point: Vec3, normal: Vec3, size: number, color: Color): void {
    const n = new Vector3(normal[0], normal[1], normal[2]);
    tmp.position.set(point[0], point[1], point[2]).addScaledVector(n, 0.004);
    tmp.quaternion.setFromUnitVectors(Z, n).multiply(tmpQ.setFromAxisAngle(Z, Math.random() * Math.PI * 2));
    tmp.scale.setScalar(size);
    tmp.updateMatrix();
    const i = this.#next;
    this.mesh.setMatrixAt(i, tmp.matrix);
    this.mesh.setColorAt(i, color);
    this.#next = (i + 1) % this.#max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
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
  metal: 0xb8c0c8,
  wood: 0xd0a070,
  dirt: 0x907860,
  grass: 0x907860,
  glass: 0xe0f0ff,
  brick: 0xc89a88,
  asphalt: 0x8a8a8a,
  gravel: 0x9a9080,
  sand: 0xb8a582,
  sheetMetal: 0xc0c8d0,
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
  #nextLight = 0;
  readonly #sparks = new ParticleLayer(240, true, false);
  readonly #dust = new ParticleLayer(260, false, false);
  #smoke: ParticleLayer;
  readonly #blood = new ParticleLayer(160, false, false);
  readonly #holes: DecalLayer;
  readonly #splats: DecalLayer;
  readonly #casingMesh: InstancedMesh;
  readonly #casings: Casing[] = [];
  readonly #flashes: { mesh: Mesh; age: number }[] = [];
  readonly #falling: { mesh: Mesh; v: Vector3; spin: Vector3; age: number; resting: boolean }[] = [];
  readonly #flashMaterial: MeshBasicNodeMaterial;
  #features: PresetFeatures;
  readonly #recentShots: number[] = [];
  #time = 0;
  /** Called when a casing hits a surface hard enough to be heard. */
  onCasingBounce: ((position: Vec3, material: Material, intensity: number) => void) | null = null;

  constructor(scene: Scene, world: World, features: PresetFeatures) {
    this.#world = world;
    this.#features = features;
    this.#smoke = new ParticleLayer(features.volumetricSmoke ? 160 : 90, false, features.volumetricSmoke);
    for (let i = 0; i < 2; i++) {
      const light = new PointLight(0xffb468, 0, 9, 1.6);
      this.#lights.push(light);
      this.#lightAge.push(1);
      this.#root.add(light);
    }
    this.#holes = new DecalLayer(220, holeTexture());
    this.#splats = new DecalLayer(60, splatTexture());
    const casingGeometry = new CylinderGeometry(0.0048, 0.0048, 0.045, 8);
    casingGeometry.rotateZ(Math.PI / 2);
    this.#casingMesh = new InstancedMesh(casingGeometry, new MeshStandardNodeMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.32 }), 80);
    this.#casingMesh.count = 0;
    this.#casingMesh.frustumCulled = false;
    this.#casingMesh.castShadow = true;
    this.#flashMaterial = flashMaterial();
    this.#root.add(this.#sparks.mesh, this.#dust.mesh, this.#smoke.mesh, this.#blood.mesh, this.#holes.mesh, this.#splats.mesh, this.#casingMesh);
    scene.add(this.#root);
  }

  setFeatures(features: PresetFeatures): void {
    if (features.volumetricSmoke !== this.#features.volumetricSmoke) {
      this.#root.remove(this.#smoke.mesh);
      this.#smoke = new ParticleLayer(features.volumetricSmoke ? 160 : 90, false, features.volumetricSmoke);
      this.#root.add(this.#smoke.mesh);
    }
    this.#features = features;
  }

  /** A muzzle-flash star mesh, for attaching to a weapon's muzzle socket. */
  createFlash(): Mesh {
    const mesh = new Mesh(flashGeometry(), this.#flashMaterial);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    return mesh;
  }

  /** Shows a flash mesh for one or two frames with a random twist and size. */
  flash(mesh: Mesh): void {
    mesh.visible = true;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.8 + Math.random() * 0.5);
    const existing = this.#flashes.find((f) => f.mesh === mesh);
    if (existing) existing.age = 0;
    else this.#flashes.push({ mesh, age: 0 });
  }

  /** A shot fired at `origin` (world) toward `direction`: lights the scene and builds up smoke on sustained fire. */
  shot(origin: Vec3, direction: Vec3): void {
    const i = this.#nextLight;
    this.#nextLight = (i + 1) % this.#lights.length;
    const light = this.#lights[i] as PointLight;
    light.position.set(origin[0] + direction[0] * 0.6, origin[1] + direction[1] * 0.6, origin[2] + direction[2] * 0.6);
    this.#lightAge[i] = 0;
    this.#recentShots.push(this.#time);
    while ((this.#recentShots[0] ?? Infinity) < this.#time - 1.2) this.#recentShots.shift();
    const heat = this.#recentShots.length;
    if (heat >= 5) {
      const n = Math.round((heat >= 12 ? 2 : 1) * this.#features.particles);
      for (let k = 0; k < n; k++) {
        this.#smoke.emit({
          p: new Vector3(origin[0] + direction[0] * 0.75, origin[1] + direction[1] * 0.75 - 0.05, origin[2] + direction[2] * 0.75),
          v: new Vector3(direction[0] * 0.4 + (Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.2, direction[2] * 0.4 + (Math.random() - 0.5) * 0.15),
          life: 1.6 + Math.random() * 0.8,
          size: 0.12,
          grow: 0.32,
          spin: (Math.random() - 0.5) * 0.8,
          alpha: 0.22,
          drag: 1.2,
          color: new Color(0xd8dadc),
        });
      }
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

  /** A bullet hitting the world: a decal plus sparks (metal), splinters (wood) or dust. */
  impact(point: Vec3, normal: Vec3, material: Material): void {
    const m = material;
    this.#holes.add(point, normal, 0.06 + Math.random() * 0.03, new Color(HOLE_TINT[m]));
    const n = new Vector3(normal[0], normal[1], normal[2]);
    const p = new Vector3(point[0], point[1], point[2]).addScaledVector(n, 0.02);
    const k = this.#features.particles;
    const spread = () => new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    if (m === 'metal' || m === 'glass' || m === 'sheetMetal') {
      for (let i = 0; i < Math.round(9 * k); i++) {
        this.#sparks.emit({ p: p.clone(), v: n.clone().multiplyScalar(3 + Math.random() * 4).add(spread().multiplyScalar(3)), life: 0.18 + Math.random() * 0.2, size: 0.025, gravity: 9, drag: 2, color: new Color(1, 0.75 + Math.random() * 0.2, 0.4) });
      }
      this.#dust.emit({ p: p.clone(), v: n.clone().multiplyScalar(0.5), life: 0.4, size: 0.06, grow: 0.3, alpha: 0.35, drag: 3, color: new Color(0x9a9a9a) });
    } else {
      const color = DUST[m] ?? 0xb2b0ac;
      for (let i = 0; i < Math.round(5 * k); i++) {
        this.#dust.emit({ p: p.clone(), v: n.clone().multiplyScalar(1 + Math.random() * 1.6).add(spread().multiplyScalar(0.6)), life: 0.5 + Math.random() * 0.5, size: 0.05, grow: 0.35, alpha: 0.55, gravity: 0.6, drag: 3.5, color: new Color(color) });
      }
      // Debris chips: small, fast, falling.
      for (let i = 0; i < Math.round(4 * k); i++) {
        this.#dust.emit({ p: p.clone(), v: n.clone().multiplyScalar(2 + Math.random() * 2).add(spread().multiplyScalar(1.5)), life: 0.45, size: 0.018, alpha: 1, gravity: 9.8, drag: 0.5, color: new Color(color).multiplyScalar(0.7) });
      }
    }
  }

  /** A hit on a player or dummy at `point`, travelling along `direction`. */
  blood(point: Vec3, direction: Vec3, heavy: boolean): void {
    const p = new Vector3(point[0], point[1], point[2]);
    const d = new Vector3(direction[0], direction[1], direction[2]).normalize();
    const k = this.#features.particles * (heavy ? 1.6 : 1);
    for (let i = 0; i < Math.round(7 * k); i++) {
      this.#blood.emit({
        p: p.clone(),
        v: d.clone().multiplyScalar(1 + Math.random() * 2).add(new Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6)),
        life: 0.35 + Math.random() * 0.3,
        size: 0.05 + Math.random() * 0.04,
        grow: 0.2,
        gravity: 6,
        drag: 2.5,
        alpha: 0.9,
        color: new Color(0.45 + Math.random() * 0.1, 0.02, 0.02),
      });
    }
    this.#blood.emit({ p: p.clone(), v: d.clone().multiplyScalar(0.5), life: 0.5, size: 0.12, grow: 0.5, alpha: 0.5, drag: 3, color: new Color(0.5, 0.05, 0.05) });
    // A splat on whatever is behind the target.
    const end: Vec3 = [point[0] + d.x * 2.5, point[1] + d.y * 2.5 - 0.4, point[2] + d.z * 2.5];
    const hit = raycastWorld(this.#world, point, end);
    if (hit) this.#splats.add(hit.point, hit.normal, 0.25 + Math.random() * 0.25, new Color(0.35, 0.02, 0.02));
  }

  update(dt: number, camera: Camera): void {
    this.#time += dt;
    for (let i = 0; i < this.#lights.length; i++) {
      const age = (this.#lightAge[i] ?? 1) + dt;
      this.#lightAge[i] = age;
      const light = this.#lights[i] as PointLight;
      light.intensity = age < 0.05 ? 22 * (1 - age / 0.05) + 6 : 0;
    }
    for (let i = this.#flashes.length - 1; i >= 0; i--) {
      const f = this.#flashes[i]!;
      f.age += dt;
      if (f.age > 0.035) {
        f.mesh.visible = false;
        this.#flashes.splice(i, 1);
      }
    }
    this.#sparks.update(dt, camera);
    this.#dust.update(dt, camera);
    this.#smoke.update(dt, camera);
    this.#blood.update(dt, camera);
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
    return Math.max(0, ...this.#lightAge.map((a) => (a < 0.05 ? 1 - a / 0.05 : 0)));
  }

  #updateCasings(dt: number): void {
    const m = new Matrix4();
    const list = this.#casings;
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

  dispose(): void {
    this.#root.removeFromParent();
  }
}

/** Three crossed quads: a star from the front, a cone of fire from the side. */
function flashGeometry(): PlaneGeometry {
  const g = new PlaneGeometry(0.16, 0.16);
  return g;
}

function flashMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const p = uv().sub(0.5).mul(2);
  const r = p.length();
  const angle = p.y.atan(p.x);
  // A five-pointed star with a hot core.
  const star = angle.mul(5).cos().mul(0.25).add(0.6);
  const shape = clamp(star.sub(r).mul(4), 0, 1).mul(clamp(float(1).sub(r), 0, 1));
  m.colorNode = vec3(1, 0.72, 0.36).mul(shape.mul(5)).add(vec3(1, 1, 0.85).mul(clamp(float(0.35).sub(r).mul(6), 0, 1).mul(6)));
  m.opacityNode = shape;
  return m;
}
