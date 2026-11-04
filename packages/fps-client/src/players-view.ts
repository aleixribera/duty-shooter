import { raycastWorld, STATS, WEAPON_IDS, type PlayerId, type PlayerOutput, type TeamId, type Vec3, type WeaponId, type World } from '@duty-shooter/fps-core';
import {
  BufferAttribute,
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
  type Camera,
  type Object3D,
  type Scene,
  type SkinnedMesh,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hasDistanceDetail } from './detail';
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

/** Every look, in a fixed order, for the far stand-ins' keys. */
const FAR_LOOKS: readonly Look[] = [SOLDIER, ...Object.values(TEAM_LOOKS), DUMMY];

/** A small stable number from a player id, to spread the mid-range soldiers' poses over frames. */
function hashId(id: PlayerId): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** What the view needs to know about sides: whether the match has teams, and the local player's team. Allies' tags are the HUD's (`hud/ally-tags.ts`). */
export interface Allegiance {
  readonly teams: boolean;
  readonly self: TeamId | null;
}

const NO_TEAMS: Allegiance = { teams: false, self: null };

function lookFor(p: PlayerOutput, allegiance: Allegiance): Look {
  if (p.kind === 'dummy') return DUMMY;
  return (allegiance.teams && TEAM_LOOKS[p.team]) || SOLDIER;
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

/**
 * How far (m) from the camera each soldier level reaches (ticket 10). Near, as far as the
 * server sends a seat every snapshot (`WIDE_MAP`'s near), a soldier is drawn in full, posed
 * every frame and casting its shadow. Out to `far` it is posed every `midEvery` frames and
 * casts none (cheap animated). Past that it is an instanced stand-in (`FarSoldiers`).
 * A soldier changes level `margin` past the line, so one standing on it doesn't flicker.
 */
export const SOLDIER_LEVELS = { near: 60, far: 150, midEvery: 3, margin: 6 } as const;

type Level = 0 | 1 | 2;
const NEAR: Level = 0;
const MID: Level = 1;
const FAR: Level = 2;

let forced: Level | null = null;
/** Draws every soldier at one level whatever its distance, or by distance again with null: for looking at a level up close (`?soldiers=`). */
export function showSoldiersAt(level: 'near' | 'mid' | 'far' | null): void {
  forced = level === null ? null : ({ near: NEAR, mid: MID, far: FAR } as const)[level];
}

/** The level a soldier `distance` m away is drawn at, given the one it was drawn at. */
function levelAt(distance: number, was: Level | undefined): Level {
  const { near, far, margin } = SOLDIER_LEVELS;
  // Each line moves away from the level the soldier is at, by the margin.
  const at = (line: number, level: Level) => (was === undefined ? line : was < level ? line + margin : line - margin);
  if (distance > at(far, FAR)) return FAR;
  if (distance > at(near, MID)) return MID;
  return NEAR;
}

/** A far soldier's stance: its stand-in is posed in each. */
type FarStance = 'stand' | 'crouch' | 'prone';
const farStance = (p: PlayerOutput): FarStance => (p.downed || p.stance === 'prone' ? 'prone' : p.stance === 'crouch' ? 'crouch' : 'stand');

/** The smallest piece (m³ of its box) a far stand-in keeps. */
const STAND_IN_SMALLEST = 0.001;

/** A posed soldier as one box per body piece, in each piece's colour: a few hundred triangles for a figure a few pixels tall. */
function standIn(model: Object3D, look: Look, stance: FarStance): BufferGeometry {
  const soldier = new Soldier(model, look);
  const eyeHeight = stance === 'prone' ? STATS.stance.proneEyeHeight.value : stance === 'crouch' ? STATS.stance.crouchEyeHeight.value : STATS.stance.standEyeHeight.value;
  const pose = { id: 'stand-in', team: 0, kind: 'player', alive: true, position: [0, 0, 0], velocity: [0, 0, 0], yaw: 0, pitch: 0, stance, movement: 'walk', eyeHeight, weapon: null, grenade: null } as unknown as PlayerOutput;
  // Let the stance's easing settle.
  for (let i = 0; i < 90; i++) soldier.update(pose, 1 / 30);
  soldier.root.updateMatrixWorld(true);
  const boxes: BufferGeometry[] = [];
  for (const piece of soldier.parts.values()) {
    if (!piece.geometry.boundingBox) piece.geometry.computeBoundingBox();
    const bounds = piece.geometry.boundingBox!;
    const size = bounds.getSize(new Vector3());
    // Straps, soles, lenses and the smaller pouches don't show at that distance.
    if (size.x * size.y * size.z < STAND_IN_SMALLEST) continue;
    const box = new BoxGeometry(size.x, size.y, size.z);
    box.deleteAttribute('uv');
    const centre = bounds.getCenter(new Vector3());
    box.translate(centre.x, centre.y, centre.z);
    box.applyMatrix4(piece.matrixWorld);
    const c = (piece.material as MeshStandardNodeMaterial).color;
    const n = box.getAttribute('position').count;
    const colour = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) colour.set([c.r, c.g, c.b], v * 3);
    box.setAttribute('color', new BufferAttribute(colour, 3));
    boxes.push(box);
  }
  soldier.dispose();
  const merged = mergeGeometries(boxes) ?? new BufferGeometry();
  for (const b of boxes) b.dispose();
  return merged;
}

const _matrix = new Matrix4();
const _place = new Vector3();
const _turn = new Quaternion();
const _one = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/**
 * The far soldiers: every one in a look and stance drawn by one instanced mesh of its
 * stand-in, so sixty soldiers across the island cost a handful of draw calls. They cast
 * no shadow (the sun's shadow map doesn't reach them) and aren't culled one by one.
 */
class FarSoldiers {
  readonly root = new Group();
  readonly #material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
  readonly #meshes = new Map<string, InstancedMesh>();
  readonly #used = new Map<InstancedMesh, number>();

  /** Starts a frame: nobody drawn yet. */
  begin(): void {
    for (const mesh of this.#meshes.values()) this.#used.set(mesh, 0);
  }

  /** Draws `p` this frame, in `look`. */
  add(model: Object3D, look: Look, p: PlayerOutput): void {
    const stance = farStance(p);
    const key = `${FAR_LOOKS.indexOf(look)} ${stance}`;
    let mesh = this.#meshes.get(key);
    const used = (mesh && this.#used.get(mesh)) ?? 0;
    if (!mesh || used >= mesh.instanceMatrix.count) {
      const grown = new InstancedMesh(mesh?.geometry ?? standIn(model, look, stance), this.#material, Math.max(64, used * 2));
      grown.frustumCulled = false;
      grown.castShadow = false;
      grown.receiveShadow = true;
      if (mesh) {
        grown.instanceMatrix.array.set(mesh.instanceMatrix.array.subarray(0, used * 16));
        mesh.removeFromParent();
        mesh.dispose();
        this.#used.delete(mesh);
      }
      mesh = grown;
      this.#meshes.set(key, mesh);
      this.root.add(mesh);
    }
    _place.set(p.position[0], p.position[1], p.position[2]);
    _turn.setFromAxisAngle(UP, p.yaw);
    mesh.setMatrixAt(used, _matrix.compose(_place, _turn, _one));
    this.#used.set(mesh, used + 1);
  }

  /** A stand-in at `position`, a thousandth of its size, drawn for a frame to compile its shader before a far soldier needs it. Returns what takes it away. */
  sample(model: Object3D, position: Vector3): () => void {
    const mesh = new InstancedMesh(standIn(model, SOLDIER, 'stand'), this.#material, 1);
    mesh.frustumCulled = false;
    mesh.setMatrixAt(0, _matrix.compose(position, _turn.identity(), _one.clone().setScalar(0.001)));
    this.root.add(mesh);
    return () => {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.dispose();
    };
  }

  /** Ends a frame: each mesh draws the soldiers it was given, and none draws with none. */
  end(): void {
    for (const mesh of this.#meshes.values()) {
      const used = this.#used.get(mesh) ?? 0;
      mesh.count = used;
      mesh.visible = used > 0;
      if (used > 0) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const mesh of this.#meshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.#material.dispose();
    this.root.removeFromParent();
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
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
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
  /**
   * The soldiers `showSamples` drew, kept hidden: while they live, their
   * shaders stay compiled for the real soldiers built later.
   */
  readonly #samples: Soldier[] = [];
  /** The level each soldier was drawn at, and the time it has gone unposed (s). */
  readonly #levels = new Map<PlayerId, Level>();
  readonly #unposed = new Map<PlayerId, number>();
  readonly #far = new FarSoldiers();
  #frame = 0;

  constructor(scene: Scene, world: World, weapon: (() => Object3D) | null) {
    this.#world = world;
    this.#guns = weapon ? new GunModels(weapon) : null;
    scene.add(this.#root, this.#far.root);
  }

  /** A new mesh of third-person gun `id` (a weapon lying on the ground), or null while it loads. */
  gunMesh(id: WeaponId): Mesh | null {
    return this.#guns?.mesh(id) ?? null;
  }

  /** Fetches the soldier and every third-person gun, settling once all are in. */
  prepare(): Promise<void> {
    return Promise.all([loadSoldierModel(), this.#guns?.loadAll()]).then(() => undefined);
  }

  /**
   * Shows, for one frame, a soldier in every look holding each weapon in
   * turn, with the pieces a ragdoll throws and a far stand-in, a few metres in
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
    }
    const ahead = new Vector3(0, 0, -4).applyQuaternion(camera.quaternion).add(camera.position);
    this.#samples.forEach((soldier, i) => {
      soldier.root.position.copy(ahead).add(new Vector3((i - this.#samples.length / 2) * 0.001, 0, 0));
      soldier.root.scale.setScalar(0.001);
      // The skinned body and the hidden pieces the ragdoll draws.
      soldier.root.traverse((o) => (o.visible = true));
      this.#root.add(soldier.root);
    });
    const farSample = model ? this.#far.sample(model, ahead) : null;
    return () => {
      for (const soldier of this.#samples) soldier.root.removeFromParent();
      farSample?.();
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
    if (!s || !this.#alive.get(id)) return null;
    const p = s.root.position;
    return [p.x, p.y + 1.2, p.z];
  }

  /**
   * Poses everyone from this frame's output. With teams on, soldiers wear
   * their team's uniform. Seen from `viewer` (the camera), each is drawn at
   * its distance's level (`SOLDIER_LEVELS`), that distance divided by
   * `zoom` (a scope's magnification); with no viewer, all in full.
   */
  update(players: readonly PlayerOutput[], dt: number, allegiance: Allegiance = NO_TEAMS, viewer: Vec3 | null = null, zoom = 1): void {
    const model = soldierModel();
    if (!model) {
      // Soldiers are built once their model is in (`prepare` fetches it).
      void loadSoldierModel();
      return;
    }
    const seen = new Set<PlayerId>();
    this.#far.begin();
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
      if (look !== DUMMY && this.#guns && soldier.gunId !== p.weapon.id) {
        const gun = this.#guns.mesh(p.weapon.id);
        if (gun) soldier.hold(p.weapon.id, gun);
      }
      const level = forced ?? (viewer && hasDistanceDetail() ? levelAt(Math.hypot(p.position[0] - viewer[0], p.position[1] - viewer[1], p.position[2] - viewer[2]) / Math.max(1, zoom), this.#levels.get(p.id)) : NEAR);
      this.#levels.set(p.id, level);
      const wasAlive = this.#alive.get(p.id) ?? p.alive;
      // Far away, a soldier who falls is simply gone: a ragdoll there would be a few pixels.
      if (wasAlive && !p.alive && level !== FAR) {
        soldier.update(p, 0);
        const rag = new Ragdoll(soldier, p.velocity, this.#lastPush.get(p.id) ?? [0, 0, 0], this.#world);
        this.#ragdolls.push(rag);
        this.#root.add(rag.root);
      }
      this.#alive.set(p.id, p.alive);
      soldier.root.visible = p.alive && level !== FAR;
      if (!p.alive) continue;
      // The time since this soldier was last posed, so a pose that waited catches up (no more than a moment of it).
      const unposed = Math.min(0.5, (this.#unposed.get(p.id) ?? 0) + dt);
      // Mid-range soldiers take turns, so each frame poses about a third of them.
      const pose = level === NEAR || (level === MID && (this.#frame + hashId(p.id)) % SOLDIER_LEVELS.midEvery === 0);
      if (pose) {
        soldier.update(p, unposed);
        this.#unposed.set(p.id, 0);
      } else {
        soldier.place(p);
        this.#unposed.set(p.id, unposed);
      }
      soldier.castShadows(level === NEAR);
      if (level === FAR) this.#far.add(model, look, p);
    }
    this.#far.end();
    this.#frame++;
    for (const [id, soldier] of this.#soldiers) {
      if (seen.has(id)) continue;
      soldier.root.removeFromParent();
      soldier.dispose();
      this.#soldiers.delete(id);
      this.#looks.delete(id);
      this.#alive.delete(id);
      this.#levels.delete(id);
      this.#unposed.delete(id);
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
    for (const s of this.#samples) s.dispose();
    this.#guns?.dispose();
    this.#far.dispose();
    this.#root.removeFromParent();
  }
}
