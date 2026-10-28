import { raycastWorld, WEAPON_IDS, type PlayerId, type PlayerOutput, type TeamId, type Vec3, type WeaponId, type World } from '@duty-shooter/fps-core';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  Sprite,
  SpriteNodeMaterial,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Object3D,
  type Scene,
  type SkinnedMesh,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KIT_RIGS } from './viewmodel/kit';
import { loadSoldierModel, Soldier, soldierModel, type Look } from './soldier';

/** Free-for-all: nobody's side, in olive drab. */
const SOLDIER: Look = { uniform: 0x5d6447, vest: 0x3d4232, skin: 0xc08f6a, helmet: 0x4b5139, boots: 0x2a2622, accent: 0x5d6447 };
/** The two teams, in the UI's team colours (blue #3D8BFF, orange #FF9A3C) on the pads and toned-down versions on the cloth. */
const TEAM_LOOKS: Readonly<Record<number, Look>> = {
  1: { uniform: 0x40577a, vest: 0x26364d, skin: 0xc08f6a, helmet: 0x2f4362, boots: 0x22252b, accent: 0x3d8bff },
  2: { uniform: 0x8a6544, vest: 0x5b412c, skin: 0xb98563, helmet: 0x6e4c30, boots: 0x2a2420, accent: 0xff9a3c },
};
/** The third-person rifle's one colour. */
const GUNMETAL = new Color(0x2b2d31);
const DUMMY: Look = { uniform: 0xd9d2c3, vest: 0xe07a2e, skin: 0xe8e2d6, helmet: 0xe07a2e, boots: 0x6e6a62, accent: 0xe07a2e, glove: 0xe8e2d6, lens: 0x1c1e20 };

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

/**
 * Each weapon as one vertex-coloured mesh for third person (one draw call per
 * soldier's gun): the M4A1 from its procedural builder in gunmetal, the
 * others from their GLBs in their own colours. Loaded on first use; a
 * soldier holds nothing until its model has arrived.
 */
class GunModels {
  readonly #m4a1: () => Object3D;
  readonly #models = new Map<WeaponId, { geometry: BufferGeometry; material: MeshStandardNodeMaterial } | null>();
  readonly #loading = new Map<WeaponId, Promise<void>>();
  #disposed = false;

  constructor(m4a1: () => Object3D) {
    this.#m4a1 = m4a1;
  }

  /** A new mesh of weapon `id` sharing the cached model, or null while it loads. */
  mesh(id: WeaponId): Mesh | null {
    if (!this.#models.has(id)) this.#load(id);
    const model = this.#models.get(id);
    if (!model) return null;
    const mesh = new Mesh(model.geometry, model.material);
    mesh.castShadow = true;
    return mesh;
  }

  /** Fetches every weapon's model, settling once all are in (or failed). */
  loadAll(): Promise<void> {
    for (const id of WEAPON_IDS) if (!this.#models.has(id)) this.#load(id);
    return Promise.all(this.#loading.values()).then(() => undefined);
  }

  #load(id: WeaponId): void {
    this.#models.set(id, null);
    if (id === 'm4a1') {
      this.#models.set(id, this.#merge(this.#m4a1(), GUNMETAL));
      return;
    }
    const loading = new GLTFLoader().loadAsync(KIT_RIGS[id].url).then(({ scene }) => {
      if (!this.#disposed) this.#models.set(id, this.#merge(scene, null));
    }).catch((error: unknown) => {
      console.warn(`Unable to load the ${id} model:`, error);
    });
    this.#loading.set(id, loading);
  }

  /** Bakes `root`'s meshes into one geometry in its own space, coloured `tint` or by each material's flat colour. */
  #merge(root: Object3D, tint: Color | null): { geometry: BufferGeometry; material: MeshStandardNodeMaterial } {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const geometries: BufferGeometry[] = [];
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      const g = new BufferGeometry();
      g.setAttribute('position', source.getAttribute('position'));
      if (source.getAttribute('normal')) g.setAttribute('normal', source.getAttribute('normal'));
      else g.computeVertexNormals();
      g.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
      const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as { color?: Color; userData: { tint?: [number, number, number] } };
      // Textured weapon materials carry their flat colour as the glTF extra `tint`.
      const flat = material.userData.tint ? new Color().fromArray(material.userData.tint) : null;
      const c = tint ?? flat ?? material.color ?? GUNMETAL;
      const n = g.getAttribute('position').count;
      const colour = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) colour.set([c.r, c.g, c.b], v * 3);
      g.setAttribute('color', new BufferAttribute(colour, 3));
      geometries.push(g);
      source.dispose();
    });
    const geometry = mergeGeometries(geometries) ?? new BufferGeometry();
    for (const g of geometries) g.dispose();
    return { geometry, material: new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }) };
  }

  dispose(): void {
    this.#disposed = true;
    for (const model of this.#models.values()) {
      model?.geometry.dispose();
      model?.material.dispose();
    }
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
  readonly #guns: GunModels | null;
  /** The look each soldier was built in, so a team change rebuilds it. */
  readonly #looks = new Map<PlayerId, Look>();
  readonly #plates = new Map<PlayerId, Nameplate>();
  /**
   * The soldiers `showSamples` drew, kept hidden: while they live, their
   * shaders stay compiled for the real soldiers built later.
   */
  readonly #samples: Soldier[] = [];
  readonly #samplePlate = new Nameplate('sample');

  constructor(scene: Scene, world: World, weapon: (() => Object3D) | null) {
    this.#world = world;
    this.#guns = weapon ? new GunModels(weapon) : null;
    scene.add(this.#root);
  }

  /** Fetches the soldier and every third-person gun, settling once all are in. */
  prepare(): Promise<void> {
    return Promise.all([loadSoldierModel(), this.#guns?.loadAll()]).then(() => undefined);
  }

  /**
   * Shows, for one frame, a soldier in every look holding each weapon in
   * turn, with the pieces a ragdoll throws and a nameplate, a few metres in
   * front of `camera`: drawing them compiles their shaders before a match
   * needs them. They are drawn a thousandth of their size, so nothing shows
   * through the loading screen. Returns what hides them again.
   */
  showSamples(camera: Camera): () => void {
    const model = soldierModel();
    if (this.#samples.length === 0 && model) {
      const looks = [SOLDIER, ...Object.values(TEAM_LOOKS), DUMMY];
      const count = Math.max(looks.length, WEAPON_IDS.length + 1);
      for (let i = 0; i < count; i++) {
        const look = looks[i % looks.length]!;
        const soldier = new Soldier(model, look);
        const id = WEAPON_IDS[i % WEAPON_IDS.length]!;
        const gun = look === DUMMY ? null : (this.#guns?.mesh(id) ?? null);
        if (gun) soldier.hold(id, gun);
        this.#samples.push(soldier);
      }
        this.#samples[0]!.root.add(this.#samplePlate.sprite);
      this.#samplePlate.show('Ready', TEAM_LOOKS[1]!.accent);
      this.#samplePlate.sprite.position.set(0, 2.2, 0);
    }
    const ahead = new Vector3(0, 0, -4).applyQuaternion(camera.quaternion).add(camera.position);
    this.#samples.forEach((soldier, i) => {
      soldier.root.position.copy(ahead).add(new Vector3((i - this.#samples.length / 2) * 0.001, 0, 0));
      soldier.root.scale.setScalar(0.001);
      // The skinned body and the hidden pieces the ragdoll draws.
      soldier.root.traverse((o) => (o.visible = true));
      this.#root.add(soldier.root);
    });
    return () => {
      for (const soldier of this.#samples) soldier.root.removeFromParent();
    };
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
    const model = soldierModel();
    if (!model) {
      // Soldiers are built once their model is in (`prepare` fetches it).
      void loadSoldierModel();
      return;
    }
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
        soldier = new Soldier(model, look);
        this.#soldiers.set(p.id, soldier);
        this.#looks.set(p.id, look);
        this.#root.add(soldier.root);
      }
      this.#nameplate(p, soldier, allegiance);
      if (look !== DUMMY && this.#guns && soldier.gunId !== p.weapon.id) {
        const gun = this.#guns.mesh(p.weapon.id);
        if (gun) soldier.hold(p.weapon.id, gun);
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
    for (const s of this.#samples) s.dispose();
    this.#samplePlate.dispose();
    this.#guns?.dispose();
    for (const plate of this.#plates.values()) plate.dispose();
    this.#root.removeFromParent();
  }
}
