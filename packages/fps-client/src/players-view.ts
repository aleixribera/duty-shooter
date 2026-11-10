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
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hasDistanceDetail } from './detail';
import { KIT_RIGS, RELOAD_ONLY_PARTS } from './viewmodel/kit';
import { loadSoldierModel, pieceShade, Soldier, soldierModel, type Look } from './soldier';
import { TEAM_PALETTES, colourVision, hexNumber, type ColourVision } from './team-colours';

/** Free-for-all: nobody's side, in olive drab. */
const SOLDIER: Look = { uniform: 0x5d6447, vest: 0x3d4232, skin: 0xa9836a, helmet: 0x4b5139, boots: 0x2a2622, accent: 0x5d6447 };
/** What of a team's look is not its colours. */
const TEAM_BODIES: Readonly<Record<1 | 2, Pick<Look, 'skin' | 'boots'>>> = { 1: { skin: 0xb08c72, boots: 0x22252b }, 2: { skin: 0x94705a, boots: 0x2a2420 } };
const TEAM_LOOKS = new Map<ColourVision, Readonly<Record<number, Look>>>();
/**
 * The two teams, in the UI's team colours on the pads and toned-down versions
 * on the cloth: `team-colours.ts`'s, as the colour-vision setting has them
 * now. One object per look and setting, so a look can be told by identity.
 */
function teamLooks(): Readonly<Record<number, Look>> {
  const vision = colourVision();
  let looks = TEAM_LOOKS.get(vision);
  if (!looks) {
    const of = (team: 1 | 2): Look => {
      const c = TEAM_PALETTES[vision].teams[team];
      return { uniform: hexNumber(c.uniform), vest: hexNumber(c.vest), helmet: hexNumber(c.helmet), accent: hexNumber(c.colour), ...TEAM_BODIES[team] };
    };
    TEAM_LOOKS.set(vision, (looks = { 1: of(1), 2: of(2) }));
  }
  return looks;
}
/** The third-person rifle's one colour. */
const GUNMETAL = new Color(0x2b2d31);
const DUMMY: Look = { uniform: 0xd9d2c3, vest: 0xe07a2e, skin: 0xe8e2d6, helmet: 0xe07a2e, boots: 0x6e6a62, accent: 0xe07a2e, glove: 0xe8e2d6, lens: 0x1c1e20 };

/** A number for each look met, for the far stand-ins' keys. */
const FAR_LOOKS = new Map<Look, number>();
function farLook(look: Look): number {
  let n = FAR_LOOKS.get(look);
  if (n === undefined) FAR_LOOKS.set(look, (n = FAR_LOOKS.size));
  return n;
}

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
  return (allegiance.teams && teamLooks()[p.team]) || SOLDIER;
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
      if (!mesh.isMesh || RELOAD_ONLY_PARTS.includes(mesh.name) || RELOAD_ONLY_PARTS.includes(mesh.parent?.name ?? '')) return;
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
    // As dark as the piece's baked shade makes it up close, so a soldier doesn't brighten when it becomes a stand-in.
    const shade = pieceShade(piece.geometry);
    const n = box.getAttribute('position').count;
    const colour = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) colour.set([c.r * shade, c.g * shade, c.b * shade], v * 3);
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
    const key = `${farLook(look)} ${stance}`;
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

/** How long a body lies where it fell (s), how long it then takes to sink away, and how many lie at once. */
export const BODIES = { lies: 10, sinks: 1.6, most: 12 } as const;
/** How much of the soldier's own speed and of the killing shot's push a body keeps, and how fast it loses them (1/s). */
const BODY_CARRY = 0.4;
const BODY_PUSH = 0.35;
const BODY_DRAG = 5;
/** How long (s) a hit's push is the push of the death that follows it: longer ago, something else killed the soldier. */
const PUSH_LASTS = 0.5;
/** The heights (m) over the ground a body needs clear to lie somewhere, and how far the ground there may step up or down. */
const LIE_CLEAR = [0.45, 0.25] as const;
const LIE_STEP = 0.3;

/**
 * A dead soldier: the Soldier it was, now falling by its death clip (soldier.ts), carried a little by its own
 * speed and the shot that killed it, dropped onto the ground under it and laid along its slope. It sinks away
 * after a while. Cosmetic only: the simulation has no bodies.
 */
class Body {
  readonly soldier: Soldier;
  readonly #world: World;
  readonly #v: Vector3;
  readonly #stood = new Quaternion();
  readonly #lain = new Quaternion();
  #floor: number;
  age = 0;
  /** The soldier level it was last drawn at (PlayersView's). */
  level: Level | undefined;

  constructor(soldier: Soldier, velocity: Vec3, push: Vec3, world: World) {
    this.soldier = soldier;
    this.#world = world;
    const root = soldier.root;
    const yaw = root.rotation.y;
    const at = root.position;
    // The ground it stands on (or will come down on), taken as a plane: a body lies along a slope, not level.
    const below = raycastWorld(world, [at.x, at.y + 0.5, at.z], [at.x, at.y - 40, at.z]);
    const floor = below ? below.point[1] : at.y;
    const slope: Vec3 = below && below.normal[1] > 0.8 ? below.normal : [0, 1, 0];
    // Whether the body may reach `dx`, `dz` (m, world) from where it is: nothing in the way at knee or shin height, and
    // ground there to lie on, with no ledge, step or kerb between here and there.
    const clear = (dx: number, dz: number) => {
      const y = floor - (slope[0] * dx + slope[2] * dz) / slope[1];
      for (const h of LIE_CLEAR) if (raycastWorld(world, [at.x, floor + h, at.z], [at.x + dx, y + h, at.z + dz])) return false;
      // (With no ground under the body either, there is none to compare.)
      if (!below) return true;
      // (With no ground under the body either, there is none to compare.)
      if (!below) return true;
      const ground = raycastWorld(world, [at.x + dx, y + 0.5, at.z + dz], [at.x + dx, y - 0.5, at.z + dz]);
      return ground !== null && Math.abs(ground.point[1] - y) < LIE_STEP;
    };
    // `right` m to the soldier's right and `back` m behind it, as a way in the world.
    const across = (right: number, back: number): [number, number] => [right * Math.cos(yaw) + back * Math.sin(yaw), -right * Math.sin(yaw) + back * Math.cos(yaw)];
    const reach = soldier.die(push, (right, back) => clear(...across(right, back)));
    const lies = across(reach.right, reach.back);
    this.#v = new Vector3(velocity[0] * BODY_CARRY + push[0] * BODY_PUSH, Math.min(0, velocity[1]), velocity[2] * BODY_CARRY + push[2] * BODY_PUSH);
    // It would slide this far in all, and lie that much further: not into a wall, and not out over an edge.
    const slide = this.#v.clone().setY(0).multiplyScalar(1 / BODY_DRAG);
    const far = slide.length();
    if (far > 0.01) {
      const past = (far + 0.4) / far;
      if (!clear(slide.x * past, slide.z * past) || !clear(slide.x + lies[0], slide.z + lies[1])) this.#v.setX(0).setZ(0);
    }
    this.#stood.copy(root.quaternion);
    this.#lain.copy(root.quaternion);
    this.#floor = at.y;
    this.#ground();
  }

  /** Finds the ground under the body, and how the body lies along it. */
  #ground(): void {
    const at = this.soldier.root.position;
    const below = raycastWorld(this.#world, [at.x, at.y + 0.5, at.z], [at.x, at.y - 40, at.z]);
    if (!below) return;
    this.#floor = below.point[1];
    // Up to about a 35 degree slope; steeper, the hit was a wall's edge.
    if (below.normal[1] > 0.8) this.#lain.setFromUnitVectors(UP, _place.set(below.normal[0], below.normal[1], below.normal[2])).multiply(this.#stood);
  }

  /** Moves the body on by `dt` seconds. False once it has sunk away. */
  update(dt: number): boolean {
    this.age += dt;
    const root = this.soldier.root;
    const fallen = this.soldier.fall(dt);
    const moving = this.#v.x * this.#v.x + this.#v.z * this.#v.z > 0.0004;
    if (moving || root.position.y > this.#floor) {
      root.position.x += this.#v.x * dt;
      root.position.z += this.#v.z * dt;
      const drag = Math.exp(-BODY_DRAG * dt);
      this.#v.x *= drag;
      this.#v.z *= drag;
      if (moving) this.#ground();
      // Killed in the air, it comes down first; on a slope it follows the ground.
      this.#v.y -= 9.81 * dt;
      root.position.y = Math.max(this.#floor, root.position.y + this.#v.y * dt);
      if (root.position.y === this.#floor) this.#v.y = 0;
    }
    if (this.age < BODIES.lies) {
      root.position.y = Math.max(root.position.y, this.#floor);
      root.quaternion.slerpQuaternions(this.#stood, this.#lain, fallen * fallen);
      return true;
    }
    // Sink into the ground at the end instead of popping out.
    root.position.y = this.#floor - ((this.age - BODIES.lies) / BODIES.sinks) * 0.5;
    return this.age < BODIES.lies + BODIES.sinks;
  }
}

/**
 * Everyone but the local player: soldiers and range dummies, posed from the
 * interpolated simulation output, flashing on hits and leaving a body where they die.
 */
export class PlayersView {
  readonly #world: World;
  readonly #root = new Group();
  readonly #soldiers = new Map<PlayerId, Soldier>();
  readonly #alive = new Map<PlayerId, boolean>();
  readonly #bodies: Body[] = [];
  /** The last hit each soldier took and when (`#time`): the push that throws its body, if it dies of it. */
  readonly #lastPush = new Map<PlayerId, { readonly push: Vec3; readonly at: number }>();
  #time = 0;
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
   * turn, and a far stand-in, a few metres in
   * front of `camera`: drawing them compiles their shaders before a match
   * needs them. They are drawn a thousandth of their size, so nothing shows
   * through the loading screen. Returns what hides them again.
   */
  showSamples(camera: Camera): () => void {
    const model = soldierModel();
    if (this.#samples.length === 0 && model) {
      const looks = [SOLDIER, ...Object.values(teamLooks()), DUMMY];
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
      this.#root.add(soldier.root);
    });
    const farSample = model ? this.#far.sample(model, ahead) : null;
    return () => {
      for (const soldier of this.#samples) soldier.root.removeFromParent();
      farSample?.();
    };
  }

  /** A hit landed on `victim`, travelling along `direction`: flashes it and remembers the push, which throws its body if it dies. */
  hit(victim: PlayerId, direction: Vec3, damage: number): void {
    this.#soldiers.get(victim)?.hitFlash();
    const k = Math.min(3, damage / 12);
    this.#lastPush.set(victim, { push: [direction[0] * k, direction[1] * k, direction[2] * k], at: this.#time });
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
    this.#time += dt;
    // How far something is drawn from: a scope brings it nearer.
    const distance = (x: number, y: number, z: number) => (viewer ? Math.hypot(x - viewer[0], y - viewer[1], z - viewer[2]) / Math.max(1, zoom) : 0);
    const byDistance = viewer !== null && hasDistanceDetail();
    this.#far.begin();
    for (const p of players) {
      seen.add(p.id);
      let soldier = this.#soldiers.get(p.id);
      const look = lookFor(p, allegiance);
      if (soldier && this.#looks.get(p.id) !== look) {
        // Changed sides (or teams came on or off between matches): rebuild in the new uniform.
        soldier.root.removeFromParent();
        soldier.dispose();
        this.#forget(p.id);
        soldier = undefined;
      }
      if (!soldier) {
        // The dead have no soldier until they are back: theirs became the body lying where they fell.
        if (!p.alive) {
          this.#alive.set(p.id, false);
          continue;
        }
        soldier = new Soldier(model, look);
        this.#soldiers.set(p.id, soldier);
        this.#looks.set(p.id, look);
        this.#root.add(soldier.root);
      }
      if (look !== DUMMY && this.#guns && soldier.gunId !== p.weapon.id) {
        const gun = this.#guns.mesh(p.weapon.id);
        if (gun) soldier.hold(p.weapon.id, gun);
      }
      const level = forced ?? (byDistance ? levelAt(distance(p.position[0], p.position[1], p.position[2]), this.#levels.get(p.id)) : NEAR);
      this.#levels.set(p.id, level);
      const wasAlive = this.#alive.get(p.id) ?? p.alive;
      // Far away, a soldier who falls is simply gone: a body there would be a few pixels.
      if (wasAlive && !p.alive && level !== FAR) {
        soldier.update(p, 0);
        soldier.castShadows(level === NEAR);
        // A soldier that was a far stand-in a frame ago was hidden.
        soldier.root.visible = true;
        const hit = this.#lastPush.get(p.id);
        const body = new Body(soldier, p.velocity, hit && this.#time - hit.at <= PUSH_LASTS ? hit.push : [0, 0, 0], this.#world);
        body.level = level;
        this.#bodies.push(body);
        this.#forget(p.id);
        this.#lastPush.delete(p.id);
        this.#alive.set(p.id, false);
        continue;
      }
      // Whatever hit a soldier in its last life has nothing to do with the next.
      if (!p.alive) this.#lastPush.delete(p.id);
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
      this.#forget(id);
      this.#alive.delete(id);
    }
    for (const id of this.#alive.keys()) if (!seen.has(id)) this.#alive.delete(id);
    for (const id of this.#lastPush.keys()) if (!seen.has(id)) this.#lastPush.delete(id);
    for (let i = this.#bodies.length - 1; i >= 0; i--) {
      const body = this.#bodies[i]!;
      // The oldest go first when too many lie about, sinking away like the rest.
      if (this.#bodies.length - i > BODIES.most) body.age = Math.max(body.age, BODIES.lies);
      if (body.update(dt)) {
        // A body is drawn like the soldier it was: its shadow near, and nothing at all where a soldier is a stand-in.
        const root = body.soldier.root;
        const level = forced ?? (byDistance ? levelAt(distance(root.position.x, root.position.y, root.position.z), body.level) : NEAR);
        body.level = level;
        root.visible = level !== FAR;
        body.soldier.castShadows(level === NEAR);
        continue;
      }
      body.soldier.root.removeFromParent();
      body.soldier.dispose();
      this.#bodies.splice(i, 1);
    }
  }

  /** Lets go of a player's soldier (it is disposed of, or has become a body). */
  #forget(id: PlayerId): void {
    this.#soldiers.delete(id);
    this.#looks.delete(id);
    this.#levels.delete(id);
    this.#unposed.delete(id);
  }

  dispose(): void {
    for (const s of this.#soldiers.values()) s.dispose();
    for (const b of this.#bodies) b.soldier.dispose();
    for (const s of this.#samples) s.dispose();
    this.#guns?.dispose();
    this.#far.dispose();
    this.#root.removeFromParent();
  }
}
