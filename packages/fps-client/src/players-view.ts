import { raycastWorld, STATS, type PlayerId, type PlayerOutput, type TeamId, type Vec3, type World } from '@duty-shooter/fps-core';
import {
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Sphere,
  SphereGeometry,
  Sprite,
  SpriteNodeMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
} from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface Look {
  readonly uniform: number;
  readonly vest: number;
  readonly skin: number;
  readonly helmet: number;
  readonly boots: number;
  /** Shoulder pads: the team colour, where there is one. */
  readonly accent: number;
}

/** Free-for-all: nobody's side, in olive drab. */
const SOLDIER: Look = { uniform: 0x5d6447, vest: 0x3d4232, skin: 0xc08f6a, helmet: 0x4b5139, boots: 0x2a2622, accent: 0x5d6447 };
/** The two teams, in the UI's team colours (blue #3D8BFF, orange #FF9A3C) on the pads and toned-down versions on the cloth. */
const TEAM_LOOKS: Readonly<Record<number, Look>> = {
  1: { uniform: 0x40577a, vest: 0x26364d, skin: 0xc08f6a, helmet: 0x2f4362, boots: 0x22252b, accent: 0x3d8bff },
  2: { uniform: 0x8a6544, vest: 0x5b412c, skin: 0xb98563, helmet: 0x6e4c30, boots: 0x2a2420, accent: 0xff9a3c },
};
/** The third-person rifle's one colour. */
const GUNMETAL = new Color(0x2b2d31);
const DUMMY: Look = { uniform: 0xd9d2c3, vest: 0xe07a2e, skin: 0xe8e2d6, helmet: 0xe07a2e, boots: 0x6e6a62, accent: 0xe07a2e };

/** What the view needs to know about sides: whether the match has teams, the local player's team, and names for nameplates. */
export interface Allegiance {
  readonly teams: boolean;
  readonly self: TeamId | null;
  readonly names: ReadonlyMap<PlayerId, string>;
}

const NO_TEAMS: Allegiance = { teams: false, self: null, names: new Map() };

function lookFor(p: PlayerOutput, allegiance: Allegiance): Look {
  if (p.kind === 'dummy') return DUMMY;
  return (allegiance.teams && TEAM_LOOKS[p.team]) || SOLDIER;
}

/**
 * A teammate's name over their head: a sprite that keeps the same size on
 * screen at any distance, depth-tested so walls hide it like anything else.
 */
class Nameplate {
  readonly sprite: Sprite;
  readonly #material: SpriteNodeMaterial;
  readonly #canvas: HTMLCanvasElement | null;
  readonly #texture: CanvasTexture | null;
  #shown: string | null = null;

  constructor(player: PlayerId) {
    // Headless (tests, the server's tools) there is no canvas; the plate is still placed and shown.
    this.#canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    this.#texture = this.#canvas ? new CanvasTexture(this.#canvas) : null;
    if (this.#texture) this.#texture.colorSpace = SRGBColorSpace;
    // It writes depth too, so the heat shimmer takes it for the near thing it is.
    this.#material = new SpriteNodeMaterial({ transparent: true, depthWrite: true, depthTest: true, sizeAttenuation: false });
    if (this.#texture) this.#material.map = this.#texture;
    this.sprite = new Sprite(this.#material);
    this.sprite.name = 'nameplate';
    this.sprite.userData['player'] = player;
    this.sprite.renderOrder = 10;
  }

  show(name: string, colour: number): void {
    const key = `${name}/${colour}`;
    if (key === this.#shown) return;
    this.#shown = key;
    const canvas = this.#canvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !this.#texture) return;
    const font = '600 40px "Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", sans-serif';
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(name).width) + 44;
    canvas.height = 56;
    ctx.font = font;
    ctx.fillStyle = 'rgba(11, 14, 19, 0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `#${colour.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 6, canvas.height);
    ctx.fillStyle = '#f3f1ea';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 22, canvas.height / 2 + 2);
    this.#texture.needsUpdate = true;
    // About 2.4 % of the screen's height, whatever the distance.
    const h = 0.034;
    this.sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
  }

  dispose(): void {
    this.#texture?.dispose();
    this.#material.dispose();
  }
}

type Part = 'pelvis' | 'torso' | 'head' | 'upperArmL' | 'upperArmR' | 'foreArmL' | 'foreArmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR';

/** A lightweight tactical soldier, posed by the existing animation hierarchy. */
class Soldier {
  readonly root = new Group();
  readonly #hips = new Bone();
  readonly #spine = new Bone();
  readonly #neck = new Bone();
  readonly #shoulderL = new Bone();
  readonly #shoulderR = new Bone();
  readonly #elbowL = new Bone();
  readonly #elbowR = new Bone();
  readonly #hipL = new Bone();
  readonly #hipR = new Bone();
  readonly #kneeL = new Bone();
  readonly #kneeR = new Bone();
  readonly #gunMount = new Bone();
  readonly parts = new Map<Part, Mesh>();
  readonly #materials: MeshStandardNodeMaterial[] = [];
  #phase = 0;
  #strideBlend = 0;
  #flash = 0;
  #pitch = 0;
  #crouch = 0;
  #prone = 0;
  #slide = 0;
  #sprint = 0;
  #air = 0;

  constructor(look: Look, weapon: Object3D | null) {
    const mat = (color: number, roughness = 0.85) => {
      const m = new MeshStandardNodeMaterial({ color, roughness, metalness: 0 });
      this.#materials.push(m);
      return m;
    };
    const uniform = mat(look.uniform);
    const vest = mat(look.vest, 0.75);
    const skin = mat(look.skin, 0.7);
    const helmet = mat(look.helmet, 0.6);
    const boots = mat(look.boots, 0.9);
    const accent = mat(look.accent, 0.7);
    const gear = vest;
    const lens = mat(0x172128, 0.3);
    const box = (part: Part | null, parent: Object3D, size: Vec3, at: Vec3, material: MeshStandardNodeMaterial, shape: 'box' | 'capsule' | 'sphere' = 'box') => {
      const radius = Math.min(...size) * 0.22;
      let geometry: BufferGeometry = look === DUMMY ? new BoxGeometry(size[0], size[1], size[2]) : new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius);
      if (look !== DUMMY && shape === 'capsule') {
        geometry.dispose();
        geometry = new CapsuleGeometry(size[0] / 2, Math.max(0, size[1] - size[0]), 3, 8);
        geometry.scale(1, 1, size[2] / size[0]);
      } else if (look !== DUMMY && shape === 'sphere') {
        geometry.dispose();
        geometry = new SphereGeometry(.5, 12, 8);
        geometry.scale(size[0], size[1], size[2]);
      }
      if (look !== DUMMY && geometry.index) {
        const unindexed = geometry.toNonIndexed();
        geometry.dispose();
        geometry = unindexed;
      }
      const m = new Mesh(geometry, material);
      m.position.set(at[0], at[1], at[2]);
      if (part) m.name = part;
      m.castShadow = true;
      parent.add(m);
      if (part) this.parts.set(part, m);
      return m;
    };
    this.root.add(this.#hips);
    this.#hips.position.y = 0.86;
    box('pelvis', this.#hips, [0.36, 0.2, 0.22], [0, 0.04, 0], uniform);
    this.#hips.add(this.#spine);
    this.#spine.position.y = 0.14;
    box('torso', this.#spine, [0.42, 0.42, 0.25], [0, 0.22, 0], uniform);
    box(null, this.#spine, [0.44, 0.34, 0.29], [0, 0.24, 0], vest);
    if (look !== DUMMY) {
      // Shallow modular pouches and a belt read at distance without changing
      // the simulation's hit zones or increasing the character's footprint.
      for (const x of [-0.13, 0, 0.13]) box(null, this.#spine, [0.10, 0.13, 0.045], [x, 0.21, -0.158], vest);
      box(null, this.#spine, [0.26, 0.045, 0.035], [0, 0.34, -0.16], gear);
      box(null, this.#hips, [0.37, 0.055, 0.235], [0, 0.11, 0], gear);
    }
    this.#spine.add(this.#neck);
    this.#neck.position.y = 0.46;
    box('head', this.#neck, [0.2, 0.24, 0.22], [0, 0.15, 0], skin, 'sphere');
    box(null, this.#neck, [0.25, 0.15, 0.27], [0, 0.27, 0.01], helmet, 'sphere');
    box(null, this.#neck, [0.16, 0.035, 0.02], [0, 0.17, -0.11], look === DUMMY ? mat(0x1c1e20, 0.3) : lens);
    if (look !== DUMMY) {
      box(null, this.#neck, [0.21, 0.105, 0.10], [0, 0.09, -0.073], gear);
      box(null, this.#neck, [0.18, 0.052, 0.025], [0, 0.185, -0.116], lens);
      box(null, this.#neck, [0.09, 0.045, 0.035], [0, 0.29, -0.125], helmet);
      for (const side of [-1, 1]) box(null, this.#neck, [0.035, 0.09, 0.10], [side * 0.12, 0.19, 0], gear);
    }

    // Arms hold the rifle at the ready: forward and in toward the centre line.
    for (const [shoulder, elbow, side, upper, fore] of [
      [this.#shoulderL, this.#elbowL, -1, 'upperArmL', 'foreArmL'],
      [this.#shoulderR, this.#elbowR, 1, 'upperArmR', 'foreArmR'],
    ] as const) {
      this.#spine.add(shoulder);
      shoulder.position.set(0.26 * side, 0.38, 0);
      box(upper, shoulder, [0.11, 0.3, 0.11], [0, -0.13, 0], uniform, 'capsule');
      shoulder.add(elbow);
      elbow.position.y = -0.27;
      box(fore, elbow, [0.1, 0.28, 0.1], [0, -0.12, 0], uniform, 'capsule');
      box(null, elbow, [0.09, 0.08, 0.1], [0, -0.28, 0], look === DUMMY ? skin : gear);
      if (look !== DUMMY) {
        box(null, shoulder, [0.13, 0.13, 0.13], [0, -0.06, 0], accent);
        box(null, elbow, [0.105, 0.08, 0.115], [0, -0.015, 0.01], gear);
      }
    }
    for (const [hip, knee, side, thigh, shin] of [
      [this.#hipL, this.#kneeL, -1, 'thighL', 'shinL'],
      [this.#hipR, this.#kneeR, 1, 'thighR', 'shinR'],
    ] as const) {
      this.#hips.add(hip);
      hip.position.set(0.1 * side, 0, 0);
      box(thigh, hip, [0.16, 0.44, 0.17], [0, -0.22, 0], uniform, 'capsule');
      hip.add(knee);
      knee.position.y = -0.43;
      box(shin, knee, [0.14, 0.4, 0.15], [0, -0.2, 0], uniform, 'capsule');
      box(null, knee, [0.15, 0.1, 0.25], [0, -0.39, -0.04], boots);
      if (look !== DUMMY) {
        box(null, hip, [0.17, 0.16, 0.18], [0, -0.13, 0.015], uniform);
        box(null, knee, [0.15, 0.11, 0.055], [0, -0.045, -0.085], boots);
      }
    }
    this.#spine.add(this.#gunMount);
    this.#gunMount.position.set(0.12, 0.3, -0.25);
    if (weapon) {
      weapon.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = true;
      });
      this.#gunMount.add(weapon);
    }
    if (look !== DUMMY) {
      // Merge stationary pieces on each animated pivot by material. This keeps
      // the added detail inexpensive for several players on laptop GPUs.
      for (const parent of [this.#hips, this.#spine, this.#neck, this.#shoulderL, this.#shoulderR, this.#elbowL, this.#elbowR, this.#hipL, this.#hipR, this.#kneeL, this.#kneeR]) {
        const groups = new Map<Material, Mesh[]>();
        for (const child of parent.children) {
          const mesh = child as Mesh;
          if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
          const list = groups.get(mesh.material) ?? [];
          list.push(mesh);
          groups.set(mesh.material, list);
        }
        for (const [material, meshes] of groups) {
          if (meshes.length < 2) continue;
          const geometries = meshes.map((mesh) => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
          const combined = mergeGeometries(geometries);
          for (const geometry of geometries) geometry.dispose();
          if (!combined) continue;
          const merged = new Mesh(combined, material);
          merged.castShadow = true;
          for (const mesh of meshes) {
            if (mesh.name) this.parts.set(mesh.name as Part, merged);
            parent.remove(mesh);
            mesh.geometry.dispose();
          }
          parent.add(merged);
        }
      }
    }
    this.#skin();
  }

  /**
   * Draws the whole soldier, rifle included, as one skinned mesh: each piece
   * rides its pivot as a rigidly weighted bone, in its material's colour. One
   * draw call (two with its shadow) however detailed the soldier gets. The
   * pieces stay, hidden, for the ragdoll to throw.
   */
  #skin(): void {
    const bones = [this.#hips, this.#spine, this.#neck, this.#shoulderL, this.#shoulderR, this.#elbowL, this.#elbowR, this.#hipL, this.#hipR, this.#kneeL, this.#kneeR, this.#gunMount];
    this.root.updateMatrixWorld(true);
    const pieces: Mesh[] = [];
    const geometries: BufferGeometry[] = [];
    this.root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      let bone: Object3D | null = mesh.parent;
      while (bone && !(bone as Bone).isBone) bone = bone.parent;
      const index = bones.indexOf(bone as Bone);
      if (index < 0) return;
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const g = new BufferGeometry();
      g.setAttribute('position', source.getAttribute('position').clone());
      if (source.getAttribute('normal')) g.setAttribute('normal', source.getAttribute('normal').clone());
      else g.computeVertexNormals();
      if (source !== mesh.geometry) source.dispose();
      g.applyMatrix4(mesh.matrixWorld);
      // The rifle's materials draw their colour in nodes; at third-person distance it reads as gunmetal.
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as { color?: Color };
      const c = bone === this.#gunMount ? GUNMETAL : (material.color ?? GUNMETAL);
      const n = g.getAttribute('position').count;
      const colour = new Float32Array(n * 3);
      const skinIndex = new Uint16Array(n * 4);
      const skinWeight = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) {
        colour.set([c.r, c.g, c.b], v * 3);
        skinIndex[v * 4] = index;
        skinWeight[v * 4] = 1;
      }
      g.setAttribute('color', new BufferAttribute(colour, 3));
      g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
      g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
      geometries.push(g);
      pieces.push(mesh);
    });
    const merged = mergeGeometries(geometries);
    for (const g of geometries) g.dispose();
    if (!merged) return;
    const material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
    this.#materials.push(material);
    const body = new SkinnedMesh(merged, material);
    body.name = 'body';
    body.castShadow = true;
    this.root.add(body);
    body.updateMatrixWorld(true);
    body.bind(new Skeleton(bones));
    // Posed, a soldier reaches about a metre and a half from its feet (prone, rifle forward).
    body.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.6);
    for (const piece of pieces) piece.visible = false;
  }

  hitFlash(): void {
    this.#flash = 1;
  }

  update(p: PlayerOutput, dt: number): void {
    this.root.position.set(p.position[0], p.position[1], p.position[2]);
    this.root.rotation.y = p.yaw;
    const ease = (cur: number, target: number, tau: number) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
    const speed = Math.hypot(p.velocity[0], p.velocity[2]);
    const crouching = p.stance === 'crouch' ? 1 : 0;
    this.#crouch = ease(this.#crouch, crouching, 0.08);
    this.#prone = ease(this.#prone, p.stance === 'prone' && p.eyeHeight < STATS.stance.crouchEyeHeight.value ? 1 : 0, 0.12);
    this.#slide = ease(this.#slide, p.movement === 'slide' ? 1 : 0, 0.06);
    this.#sprint = ease(this.#sprint, p.movement === 'sprint' || p.movement === 'tacticalSprint' ? 1 : 0, 0.1);
    this.#air = ease(this.#air, p.movement === 'airborne' || p.movement === 'mantle' ? 1 : 0, 0.08);
    this.#pitch = ease(this.#pitch, p.pitch, 0.05);

    // Stride: legs swing with distance travelled.
    const stride = 1.6 - this.#prone * 0.7;
    this.#phase += (speed * dt * Math.PI) / stride;
    const targetSwing = Math.min(1, speed / 3) * (1 - this.#slide) * (1 - this.#air);
    this.#strideBlend = ease(this.#strideBlend, targetSwing, 0.12);
    const s = Math.sin(this.#phase) * this.#strideBlend * (0.55 + this.#sprint * 0.35);

    // Crouch lowers the hips and folds the legs; prone lays the body along its facing.
    const crouchDrop = this.#crouch * 0.34 + this.#slide * 0.4;
    this.#hips.position.y = 0.86 - crouchDrop - this.#prone * 0.68 + Math.abs(Math.sin(this.#phase)) * this.#strideBlend * 0.018 * (1 - this.#prone);
    this.#hips.rotation.x = -this.#prone * (Math.PI / 2) * 0.98 + this.#slide * 0.5;
    this.#hipL.rotation.x = s + this.#crouch * 1.15 + this.#slide * 1.3 + this.#air * 0.6;
    this.#hipR.rotation.x = -s + this.#crouch * 0.55 + this.#slide * 1.1 + this.#air * 0.2;
    this.#kneeL.rotation.x = -Math.max(0, -s) * 1.2 - this.#crouch * 1.6 - this.#air * 1.1;
    this.#kneeR.rotation.x = -Math.max(0, s) * 1.2 - this.#crouch * 0.9 - this.#slide * 0.3 - this.#air * 0.6;
    if (this.#prone > 0.01) {
      this.#hipL.rotation.x = s * 0.3 * this.#prone + this.#hipL.rotation.x * (1 - this.#prone);
      this.#hipR.rotation.x = -s * 0.3 * this.#prone + this.#hipR.rotation.x * (1 - this.#prone);
      this.#kneeL.rotation.x *= 1 - this.#prone;
      this.#kneeR.rotation.x *= 1 - this.#prone;
    }

    // Upper body: aim pitch, sprint lean with the rifle lowered.
    const aim = this.#pitch * (1 - this.#sprint * 0.8);
    this.#spine.rotation.x = this.#sprint * -0.25 + aim * 0.45 - this.#slide * 0.2 + this.#prone * (Math.PI / 2) * 0.85;
    this.#spine.rotation.z = -s * 0.045 * (1 - this.#prone);
    this.#neck.rotation.x = aim * 0.4 - this.#prone * 0.6;
    const armAim = aim * 0.55 + this.#prone * 0.3;
    this.#shoulderR.rotation.set(1.25 + armAim - this.#sprint * 0.7, 0, -0.15);
    this.#elbowR.rotation.x = 0.9 - this.#sprint * 0.2;
    this.#shoulderL.rotation.set(1.45 + armAim - this.#sprint * 0.7, 0, 0.55);
    this.#elbowL.rotation.x = 0.3;
    this.#gunMount.rotation.x = armAim - this.#sprint * 0.75;
    this.#gunMount.rotation.y = this.#sprint * 0.5;
    this.#gunMount.position.z = -0.28 + this.#sprint * 0.1;

    this.#flash = Math.max(0, this.#flash - dt * 6);
    const glow = new Color(0.9, 0.1, 0.05).multiplyScalar(this.#flash * 0.8);
    for (const m of this.#materials) m.emissive.copy(glow);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).geometry.dispose();
    });
    for (const m of this.#materials) m.dispose();
  }
}

interface RagPart {
  mesh: Mesh;
  v: Vector3;
  w: Vector3;
  floor: number;
  half: number;
}

/** A cosmetic ragdoll: the soldier's parts, thrown with the killing shot's push, tumble and settle. */
class Ragdoll {
  readonly root = new Group();
  readonly #parts: RagPart[] = [];
  age = 0;

  constructor(soldier: Soldier, velocity: Vec3, push: Vec3, world: World) {
    soldier.root.updateMatrixWorld(true);
    const centre = new Vector3();
    soldier.root.getWorldPosition(centre);
    // The pieces the soldier is drawn from, not the skinned body that draws them.
    for (const mesh of soldier.root.getObjectsByProperty('isMesh', true) as Mesh[]) {
      if ((mesh as SkinnedMesh).isSkinnedMesh) continue;
      const m = new Mesh(mesh.geometry, mesh.material);
      mesh.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      m.castShadow = true;
      this.root.add(m);
      const below = raycastWorld(world, [m.position.x, m.position.y + 0.2, m.position.z], [m.position.x, m.position.y - 3, m.position.z]);
      const height = m.position.y - centre.y;
      const v = new Vector3(velocity[0] + push[0] * (0.6 + height), velocity[1] + 0.6 + push[1], velocity[2] + push[2] * (0.6 + height));
      v.add(new Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new Vector3());
      this.#parts.push({
        mesh: m,
        v,
        w: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6),
        floor: below ? below.point[1] : centre.y,
        half: size ? Math.min(size.x * Math.abs(m.scale.x), size.y * Math.abs(m.scale.y), size.z * Math.abs(m.scale.z)) / 2 : 0.05,
      });
    }
  }

  update(dt: number): boolean {
    this.age += dt;
    const q = new Quaternion();
    for (const p of this.#parts) {
      p.v.y -= 9.81 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      const ground = p.floor + p.half;
      if (p.mesh.position.y < ground) {
        p.mesh.position.y = ground;
        if (p.v.y < 0) p.v.y *= -0.2;
        p.v.x *= Math.exp(-8 * dt);
        p.v.z *= Math.exp(-8 * dt);
        p.w.multiplyScalar(Math.exp(-6 * dt));
      }
      const w = p.w.length();
      if (w > 1e-3) p.mesh.quaternion.premultiply(q.setFromAxisAngle(p.w.clone().divideScalar(w), w * dt));
    }
    // Sink into the floor at the end instead of popping out.
    if (this.age > 5) this.root.position.y = -(this.age - 5) * 0.4;
    return this.age < 6.5;
  }
}

/**
 * Everyone but the local player: soldiers and range dummies, posed from the
 * interpolated simulation output, flashing on hits and leaving a ragdoll on death.
 */
export class PlayersView {
  readonly #world: World;
  readonly #root = new Group();
  readonly #soldiers = new Map<PlayerId, Soldier>();
  readonly #alive = new Map<PlayerId, boolean>();
  readonly #ragdolls: Ragdoll[] = [];
  readonly #lastPush = new Map<PlayerId, Vec3>();
  readonly #weapon: (() => Object3D) | null;
  /** The look each soldier was built in, so a team change rebuilds it. */
  readonly #looks = new Map<PlayerId, Look>();
  readonly #plates = new Map<PlayerId, Nameplate>();

  constructor(scene: Scene, world: World, weapon: (() => Object3D) | null) {
    this.#world = world;
    this.#weapon = weapon;
    scene.add(this.#root);
  }

  /** A hit landed on `victim`, travelling along `direction`: flashes it and remembers the push for its ragdoll. */
  hit(victim: PlayerId, direction: Vec3, damage: number): void {
    this.#soldiers.get(victim)?.hitFlash();
    const k = Math.min(3, damage / 12);
    this.#lastPush.set(victim, [direction[0] * k, direction[1] * k, direction[2] * k]);
  }

  /** Where a player's chest is right now, for effects and the damage indicator. */
  chest(id: PlayerId): Vec3 | null {
    const s = this.#soldiers.get(id);
    if (!s || !s.root.visible) return null;
    const p = s.root.position;
    return [p.x, p.y + 1.2, p.z];
  }

  /**
   * Poses everyone from this frame's output. With teams on, soldiers wear
   * their team's uniform and teammates of the local player carry nameplates.
   */
  update(players: readonly PlayerOutput[], dt: number, allegiance: Allegiance = NO_TEAMS): void {
    const seen = new Set<PlayerId>();
    for (const p of players) {
      seen.add(p.id);
      let soldier = this.#soldiers.get(p.id);
      const look = lookFor(p, allegiance);
      if (soldier && this.#looks.get(p.id) !== look) {
        // Changed sides (or teams came on or off between matches): rebuild in the new uniform.
        soldier.root.removeFromParent();
        soldier.dispose();
        soldier = undefined;
      }
      if (!soldier) {
        soldier = new Soldier(look, look === DUMMY || !this.#weapon ? null : this.#weapon());
        this.#soldiers.set(p.id, soldier);
        this.#looks.set(p.id, look);
        this.#root.add(soldier.root);
      }
      this.#nameplate(p, soldier, allegiance);
      const wasAlive = this.#alive.get(p.id) ?? p.alive;
      if (wasAlive && !p.alive) {
        soldier.update(p, 0);
        const rag = new Ragdoll(soldier, p.velocity, this.#lastPush.get(p.id) ?? [0, 0, 0], this.#world);
        this.#ragdolls.push(rag);
        this.#root.add(rag.root);
      }
      this.#alive.set(p.id, p.alive);
      soldier.root.visible = p.alive;
      if (p.alive) soldier.update(p, dt);
    }
    for (const [id, soldier] of this.#soldiers) {
      if (seen.has(id)) continue;
      soldier.root.removeFromParent();
      soldier.dispose();
      this.#soldiers.delete(id);
      this.#looks.delete(id);
      this.#alive.delete(id);
      this.#plates.get(id)?.dispose();
      this.#plates.delete(id);
    }
    for (let i = this.#ragdolls.length - 1; i >= 0; i--) {
      const rag = this.#ragdolls[i]!;
      if (!rag.update(dt)) {
        rag.root.removeFromParent();
        this.#ragdolls.splice(i, 1);
      }
    }
  }

  /** A teammate's nameplate, above their head; nobody else gets one. */
  #nameplate(p: PlayerOutput, soldier: Soldier, allegiance: Allegiance): void {
    const ally = allegiance.teams && allegiance.self !== null && p.kind !== 'dummy' && p.team === allegiance.self;
    let plate = this.#plates.get(p.id);
    if (!ally) {
      if (plate) plate.sprite.visible = false;
      return;
    }
    if (!plate) {
      plate = new Nameplate(p.id);
      this.#plates.set(p.id, plate);
    }
    // On the soldier, so it hides with them when they die.
    if (plate.sprite.parent !== soldier.root) soldier.root.add(plate.sprite);
    plate.show(allegiance.names.get(p.id) ?? '', TEAM_LOOKS[p.team]?.accent ?? 0xf3f1ea);
    plate.sprite.visible = true;
    plate.sprite.position.set(0, p.eyeHeight + 0.55, 0);
  }

  dispose(): void {
    for (const s of this.#soldiers.values()) s.dispose();
    for (const plate of this.#plates.values()) plate.dispose();
    this.#root.removeFromParent();
  }
}
