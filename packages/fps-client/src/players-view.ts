import { raycastWorld, STATS, type PlayerId, type PlayerOutput, type Vec3, type World } from '@duty-shooter/fps-core';
import { BoxGeometry, Color, Group, Mesh, MeshStandardNodeMaterial, Quaternion, Vector3, type Object3D, type Scene } from 'three/webgpu';

interface Look {
  readonly uniform: number;
  readonly vest: number;
  readonly skin: number;
  readonly helmet: number;
  readonly boots: number;
}

const SOLDIER: Look = { uniform: 0x5d6447, vest: 0x3d4232, skin: 0xc08f6a, helmet: 0x4b5139, boots: 0x2a2622 };
const DUMMY: Look = { uniform: 0xd9d2c3, vest: 0xe07a2e, skin: 0xe8e2d6, helmet: 0xe07a2e, boots: 0x6e6a62 };

type Part = 'pelvis' | 'torso' | 'head' | 'upperArmL' | 'upperArmR' | 'foreArmL' | 'foreArmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR';

/** A stylised blocky soldier: a pivot hierarchy of boxes posed procedurally from the simulation output. */
class Soldier {
  readonly root = new Group();
  readonly #hips = new Group();
  readonly #spine = new Group();
  readonly #neck = new Group();
  readonly #shoulderL = new Group();
  readonly #shoulderR = new Group();
  readonly #elbowL = new Group();
  readonly #elbowR = new Group();
  readonly #hipL = new Group();
  readonly #hipR = new Group();
  readonly #kneeL = new Group();
  readonly #kneeR = new Group();
  readonly #gunMount = new Group();
  readonly parts = new Map<Part, Mesh>();
  readonly #materials: MeshStandardNodeMaterial[] = [];
  #phase = 0;
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
    const box = (part: Part | null, parent: Object3D, size: Vec3, at: Vec3, material: MeshStandardNodeMaterial) => {
      const m = new Mesh(new BoxGeometry(size[0], size[1], size[2]), material);
      m.position.set(at[0], at[1], at[2]);
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
    this.#spine.add(this.#neck);
    this.#neck.position.y = 0.46;
    box('head', this.#neck, [0.2, 0.24, 0.22], [0, 0.15, 0], skin);
    box(null, this.#neck, [0.25, 0.12, 0.27], [0, 0.27, 0.01], helmet);
    box(null, this.#neck, [0.16, 0.035, 0.02], [0, 0.17, -0.11], mat(0x1c1e20, 0.3));

    // Arms hold the rifle at the ready: forward and in toward the centre line.
    for (const [shoulder, elbow, side, upper, fore] of [
      [this.#shoulderL, this.#elbowL, -1, 'upperArmL', 'foreArmL'],
      [this.#shoulderR, this.#elbowR, 1, 'upperArmR', 'foreArmR'],
    ] as const) {
      this.#spine.add(shoulder);
      shoulder.position.set(0.26 * side, 0.38, 0);
      box(upper, shoulder, [0.11, 0.3, 0.11], [0, -0.13, 0], uniform);
      shoulder.add(elbow);
      elbow.position.y = -0.27;
      box(fore, elbow, [0.1, 0.28, 0.1], [0, -0.12, 0], uniform);
      box(null, elbow, [0.09, 0.08, 0.1], [0, -0.28, 0], skin);
    }
    for (const [hip, knee, side, thigh, shin] of [
      [this.#hipL, this.#kneeL, -1, 'thighL', 'shinL'],
      [this.#hipR, this.#kneeR, 1, 'thighR', 'shinR'],
    ] as const) {
      this.#hips.add(hip);
      hip.position.set(0.1 * side, 0, 0);
      box(thigh, hip, [0.16, 0.44, 0.17], [0, -0.22, 0], uniform);
      hip.add(knee);
      knee.position.y = -0.43;
      box(shin, knee, [0.14, 0.4, 0.15], [0, -0.2, 0], uniform);
      box(null, knee, [0.15, 0.1, 0.25], [0, -0.39, -0.04], boots);
    }
    this.#spine.add(this.#gunMount);
    this.#gunMount.position.set(0.12, 0.3, -0.25);
    if (weapon) {
      weapon.traverse((o) => {
        if ((o as Mesh).isMesh) o.castShadow = true;
      });
      this.#gunMount.add(weapon);
    }
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
    const stride = this.#prone > 0.5 ? 0.9 : 1.6;
    this.#phase += (speed * dt * Math.PI) / stride;
    const swing = Math.min(1, speed / 3) * (this.#slide > 0.5 ? 0 : 1) * (1 - this.#air);
    const s = Math.sin(this.#phase) * swing * (0.55 + this.#sprint * 0.35);

    // Crouch lowers the hips and folds the legs; prone lays the body along its facing.
    const crouchDrop = this.#crouch * 0.34 + this.#slide * 0.4;
    this.#hips.position.y = 0.86 - crouchDrop - this.#prone * 0.68;
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
    for (const mesh of soldier.root.getObjectsByProperty('isMesh', true) as Mesh[]) {
      const m = new Mesh(mesh.geometry, mesh.material);
      mesh.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      m.castShadow = true;
      this.root.add(m);
      const below = raycastWorld(world, [m.position.x, m.position.y + 0.2, m.position.z], [m.position.x, m.position.y - 3, m.position.z]);
      const height = m.position.y - centre.y;
      const v = new Vector3(velocity[0] + push[0] * (0.6 + height), velocity[1] + 0.6 + push[1], velocity[2] + push[2] * (0.6 + height));
      v.add(new Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      const box = (mesh.geometry as BoxGeometry).parameters;
      this.#parts.push({
        mesh: m,
        v,
        w: new Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6),
        floor: below ? below.point[1] : centre.y,
        half: box ? Math.min(box.width, box.height, box.depth) / 2 : 0.05,
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

  update(players: readonly PlayerOutput[], dt: number): void {
    const seen = new Set<PlayerId>();
    for (const p of players) {
      seen.add(p.id);
      let soldier = this.#soldiers.get(p.id);
      if (!soldier) {
        const dummy = p.kind === 'dummy';
        soldier = new Soldier(dummy ? DUMMY : SOLDIER, dummy || !this.#weapon ? null : this.#weapon());
        this.#soldiers.set(p.id, soldier);
        this.#root.add(soldier.root);
      }
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
      this.#alive.delete(id);
    }
    for (let i = this.#ragdolls.length - 1; i >= 0; i--) {
      const rag = this.#ragdolls[i]!;
      if (!rag.update(dt)) {
        rag.root.removeFromParent();
        this.#ragdolls.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const s of this.#soldiers.values()) s.dispose();
    this.#root.removeFromParent();
  }
}
