import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { abs, attribute, cos, float, int, max, mix, normalWorld, pow, positionLocal, positionWorld, sin, smoothstep, texture, time, vec3 } from 'three/tsl';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { groundLayerIndex, GROUND_LAYERS, groundTextures } from './ground-layers';
import { openGroundLit } from './surface-materials';
import { PLANT_STRIDE, type PlantKind, type Plants } from './surfaces';

/**
 * A map's vegetation and rocks (ticket 29), drawn instanced: each model of
 * the kit is one draw, near and far alike. Every kind keeps its plants in
 * squares of the map, and when the camera has moved a few metres (`refillOf`) its meshes are
 * refilled with what's in range: the full model out to the kind's `near`, its
 * cheaper model out to `far`, nothing past that.
 *
 * Each model's colours come from its materials, with the occlusion baked into
 * its vertices (tools/map/vegetation.py), so one material draws every model.
 * Each plant tints it, sways in the wind by its own share, and wears snow on
 * what faces up where the map says so.
 */

/**
 * Metres the camera moves before a kind's meshes are refilled: a sixth of its
 * near ring, so the switch to the cheaper model never strays far from it, and
 * the far kinds, which hold the most plants, refill seldom.
 */
const refillOf = (kind: PlantKind) => Math.min(24, Math.max(6, kind.near / 6));
/** Metres a side of the squares the plants are kept in. */
const TILE = 32;
/**
 * The fewest slots a level has. three binds a smaller instance matrix (under
 * 64 kB) as a uniform buffer and uploads it again on every draw, shadows too;
 * past this it's a vertex attribute, uploaded only when it changes.
 */
export const MIN_SLOTS = 1100;
/** How much of the light baked occlusion takes away in the deepest creases, as the map models do. */
const CREASE = 0.5;
const SNOW = new Color(0xe8edf2);
const up = new Vector3(0, 1, 0);

/** A model of the kit as one geometry: position, normal, its material colours and baked occlusion per vertex. */
function assetGeometry(scene: Object3D, name: string, thin: boolean): BufferGeometry {
  const root = scene.getObjectByName(name);
  if (!root) throw new Error(`The vegetation kit has no "${name}"`);
  const toRoot = root.matrixWorld.clone().invert();
  const parts: BufferGeometry[] = [];
  root.traverse((o: Object3D) => {
    if (!(o instanceof Mesh)) return;
    const source = (o.geometry as BufferGeometry).clone().applyMatrix4(toRoot.clone().multiply(o.matrixWorld));
    const material = (Array.isArray(o.material) ? o.material[0] : o.material) as MeshStandardMaterial;
    const n = source.getAttribute('position').count;
    const ao = source.getAttribute('color');
    const colour = new Float32Array(n * 3);
    const occlusion = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      colour.set([material.color.r, material.color.g, material.color.b], i * 3);
      occlusion[i] = ao ? ao.getX(i) : 1;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', source.getAttribute('position'));
    g.setAttribute('normal', source.getAttribute('normal'));
    g.setAttribute('plantColor', new BufferAttribute(colour, 3));
    g.setAttribute('plantAo', new BufferAttribute(occlusion, 1));
    const index = source.index ? Array.from(source.index.array) : Array.from({ length: n }, (_, i) => i);
    g.setIndex(index);
    parts.push(g);
  });
  const merged = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (!merged) throw new Error(`The vegetation kit's "${name}" has no mesh`);
  if (thin) bladeShading(merged);
  merged.computeBoundingSphere();
  return merged;
}

/** How far a blade's normal leans to the sky: grass lit like the ground it grows from, not like the flat strips it is. */
const BLADE_UP = 0.7;

/**
 * Blades and fronds: their normals lean up, and each face is drawn twice,
 * once each way round, so whichever side faces the camera is lit from above
 * (a double-sided material would turn the back's normal to the ground and
 * draw it black).
 */
function bladeShading(g: BufferGeometry): void {
  const normal = g.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) {
    const n = new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i));
    if (n.y < 0) n.negate();
    n.lerp(up, BLADE_UP).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  const index = Array.from(g.index!.array);
  const back: number[] = [];
  for (let i = 0; i < index.length; i += 3) back.push(index[i]!, index[i + 2]!, index[i + 1]!);
  g.setIndex([...index, ...back]);
}

/** The ground layer rocks wear, read from three sides (see `ground-layers.ts`), and its metres a tile. */
const ROCK_LAYER = 'rock';
const ROCK_METRES = 2.6;

type N = ReturnType<typeof float>;

/**
 * The plants' material: their own colours and occlusion, swaying from the
 * ground up, snow on what faces up. Rocks also wear the ground's rock photo,
 * from whichever side faces most (triplanar), its mean divided out so their
 * colour stays the tint's.
 */
function plantMaterial(kind: 'solid' | 'thin' | 'rock'): Material {
  // x: snow, y: the plant's own phase in the wind, z: metres its sway reaches per square metre of the model's height.
  const extra = attribute<'vec3'>('plantExtra', 'vec3');
  const ao = attribute<'float'>('plantAo', 'float');
  let own = attribute<'vec3'>('plantColor', 'vec3').mul(attribute<'vec3'>('plantTint', 'vec3')).mul(mix(float(1 - CREASE), float(1), ao));
  if (kind === 'rock') {
    const layer = groundLayerIndex(ROCK_LAYER);
    const mean = GROUND_LAYERS[layer]!.mean;
    const photos = groundTextures().color;
    const p = positionWorld.div(ROCK_METRES);
    const n = normalWorld;
    const w = pow(abs(n), vec3(4, 4, 4));
    const ws = w.div(w.x.add(w.y).add(w.z));
    const read = (u: N, v: N) => texture(photos, vec3(u, v, 0).xy as never).depth(int(layer)).rgb;
    const photo = read(p.z as N, p.y.negate() as N).mul(ws.x).add(read(p.x as N, p.z as N).mul(ws.y)).add(read(p.x as N, p.y.negate() as N).mul(ws.z));
    own = own.mul(photo.div(max(vec3(...mean), vec3(0.01, 0.01, 0.01))).clamp(0, 3));
  }
  const up = smoothstep(float(0.35), float(0.75), normalWorld.y).mul(extra.x);
  const m = openGroundLit(mix(own, vec3(SNOW.r, SNOW.g, SNOW.b), up));
  if (kind !== 'rock') {
    // The model's own height, before the instance's matrix (which three applies to positionLocal first).
    const height = attribute<'vec3'>('position', 'vec3').y.max(0);
    const phase = time.mul(1.3).add(extra.y);
    const bend = height.mul(height).mul(extra.z);
    m.positionNode = positionLocal.add(vec3(sin(phase).mul(bend), float(0), cos(phase.mul(0.77)).mul(bend).mul(0.6)));
  }
  return m;
}

const matrix = new Matrix4();
const turn = new Quaternion();
const at = new Vector3();
const size = new Vector3();
const tint = new Color();

/** One model of one kind: an instanced mesh with room for all of the kind's plants. */
class Level {
  readonly mesh: InstancedMesh;
  readonly #extra: InstancedBufferAttribute;
  readonly #tint: InstancedBufferAttribute;

  constructor(geometry: BufferGeometry, material: Material, plants: number, shadow: boolean) {
    const capacity = Math.max(plants, MIN_SLOTS);
    // Each level its own geometry object (the kind's attributes are its own), sharing the model's buffers.
    const g = new BufferGeometry();
    for (const [name, a] of Object.entries(geometry.attributes)) g.setAttribute(name, a);
    g.setIndex(geometry.index);
    g.boundingSphere = geometry.boundingSphere;
    // Static usage, though a refill rewrites them: three uploads a dynamic attribute again on every draw.
    this.#extra = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    g.setAttribute('plantExtra', this.#extra);
    this.#tint = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    g.setAttribute('plantTint', this.#tint);
    this.mesh = new InstancedMesh(g, material, capacity);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
  }

  /** Puts plant `p` of `data` in slot `slot`. */
  put(slot: number, data: Float32Array, p: number, sway: number): void {
    const o = p * PLANT_STRIDE;
    at.set(data[o]!, data[o + 1]!, data[o + 2]!);
    turn.setFromAxisAngle(up, data[o + 3]!);
    size.set(data[o + 4]!, data[o + 5]!, data[o + 6]!);
    this.mesh.setMatrixAt(slot, matrix.compose(at, turn, size));
    const c = data[o + 7]!;
    tint.setRGB(((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255).convertSRGBToLinear();
    this.#tint.setXYZ(slot, tint.r, tint.g, tint.b);
    // The sway grows with the square of the model's height, scaled as the plant is.
    this.#extra.setXYZ(slot, data[o + 8]!, (at.x * 0.37 + at.z * 0.61) % 6.283, sway * size.y * 0.5);
  }

  finish(count: number): void {
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count === 0) return;
    // Only the slots in use go to the GPU, not the room for every plant of the kind.
    for (const a of [this.mesh.instanceMatrix, this.#extra, this.#tint]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, count * a.itemSize);
      a.needsUpdate = true;
    }
    this.mesh.computeBoundingSphere();
  }
}

/** One kind of plant: its full and cheap meshes, kept filled with the plants in range. Exported for tests. */
export class KindView {
  readonly near: Level;
  readonly lod: Level | null;
  readonly #kind: PlantKind;
  /** The plants in each square, by key. */
  readonly #tiles = new Map<number, number[]>();
  readonly #refill: number;
  #at: readonly [number, number, number] | null = null;
  #zoom = 1;

  constructor(kind: PlantKind, geometry: (name: string, thin: boolean) => BufferGeometry, material: (kind: PlantKind) => Material) {
    this.#kind = kind;
    this.#refill = refillOf(kind);
    const count = kind.instances.length / PLANT_STRIDE;
    // Hard cover and bushes cast shadows near; blades and fronds don't (cheaper, and they'd only speckle the ground).
    const shadow = !kind.thin;
    this.near = new Level(geometry(kind.asset, kind.thin), material(kind), count, shadow);
    this.lod = kind.lod ? new Level(geometry(kind.lod, kind.thin), material(kind), count, false) : null;
    for (let p = 0; p < count; p++) {
      const key = KindView.key(kind.instances[p * PLANT_STRIDE]!, kind.instances[p * PLANT_STRIDE + 2]!);
      const list = this.#tiles.get(key);
      if (list) list.push(p);
      else this.#tiles.set(key, [p]);
    }
  }

  static key(x: number, z: number): number {
    return (Math.floor(x / TILE) + 1024) * 4096 + Math.floor(z / TILE) + 1024;
  }

  /** Refills the meshes round (x, y, z) once the camera has moved far enough from the last fill, or the zoom changed. */
  follow(x: number, y: number, z: number, zoom: number): void {
    if (this.#at && zoom === this.#zoom && Math.hypot(x - this.#at[0], y - this.#at[1], z - this.#at[2]) < this.#refill) return;
    this.#at = [x, y, z];
    this.#zoom = zoom;
    this.fill(x, y, z, zoom);
  }

  /**
   * Fills the meshes with the plants in range of the camera at (x, y, z): from
   * high up, less is near. Through a scope of magnification `zoom` every ring
   * reaches that much farther, so a bush a sniper hides in is still drawn.
   */
  fill(x: number, y: number, z: number, zoom = 1): void {
    const { instances, sway } = this.#kind;
    const far = this.#kind.far * zoom;
    const near = this.#kind.near * zoom;
    let nears = 0;
    let lods = 0;
    const visit = (list: readonly number[]) => {
      for (const p of list) {
        const px = instances[p * PLANT_STRIDE]! - x;
        const py = instances[p * PLANT_STRIDE + 1]! - y;
        const pz = instances[p * PLANT_STRIDE + 2]! - z;
        const d2 = px * px + py * py + pz * pz;
        if (d2 > far * far) continue;
        if (d2 <= near * near || !this.lod) this.near.put(nears++, instances, p, sway);
        else this.lod.put(lods++, instances, p, sway);
      }
    };
    const span = Math.ceil(far / TILE) + 1;
    if ((2 * span + 1) ** 2 > this.#tiles.size) {
      // Reaching most of the map: every square there is.
      for (const list of this.#tiles.values()) visit(list);
    } else {
      const [ci, cj] = [Math.floor(x / TILE), Math.floor(z / TILE)];
      for (let i = ci - span; i <= ci + span; i++) {
        for (let j = cj - span; j <= cj + span; j++) {
          const list = this.#tiles.get((i + 1024) * 4096 + j + 1024);
          if (list) visit(list);
        }
      }
    }
    this.near.finish(nears);
    this.lod?.finish(lods);
  }
}

export class PlantsView {
  readonly root = new Group();
  /** Settles once the kit has loaded and its meshes are in `root` (or it failed, which leaves no plants). */
  readonly loaded: Promise<void>;
  #kinds: KindView[] = [];

  constructor(plants: Plants) {
    this.root.name = 'plants';
    this.loaded = this.#load(plants).catch((error: unknown) => console.error(`Plants failed to load: ${String(error)}`));
  }

  async #load(plants: Plants): Promise<void> {
    const { scene } = await new GLTFLoader().loadAsync(plants.url);
    scene.updateMatrixWorld(true);
    const geometries = new Map<string, BufferGeometry>();
    const geometry = (name: string, thin: boolean) => {
      let g = geometries.get(name);
      if (!g) geometries.set(name, (g = assetGeometry(scene, name, thin)));
      return g;
    };
    const materials = { solid: plantMaterial('solid'), thin: plantMaterial('thin'), rock: plantMaterial('rock') };
    const material = (k: PlantKind) => materials[k.asset.startsWith('rock') ? 'rock' : k.thin ? 'thin' : 'solid'];
    this.#kinds = plants.kinds.filter((k) => k.instances.length > 0).map((k) => new KindView(k, geometry, material));
    for (const k of this.#kinds) {
      this.root.add(k.near.mesh);
      if (k.lod) this.root.add(k.lod.mesh);
    }
    // Until the camera says where it is, every mesh holds one plant, so the shaders compile with the rest.
    for (const k of this.#kinds) {
      k.near.finish(1);
      k.lod?.finish(1);
    }
  }

  #zoom = 1;

  /** Keeps the meshes filled round the camera. */
  update(position: readonly [number, number, number]): void {
    if (this.#kinds.length === 0) return;
    const [x, y, z] = position;
    for (const k of this.#kinds) k.follow(x, y, z, this.#zoom);
  }

  /** The view's magnification (1 unscoped): the rings reach farther through a scope, from the next `update`. */
  zoom(zoom: number): void {
    // In half-octave steps (1, 1.4, 2, 2.8, 4 ...): a scope's zoom eases in, and every step is a refill.
    const z = zoom <= 1 ? 1 : 2 ** (Math.round(Math.log2(zoom) * 2) / 2);
    this.#zoom = z;
  }

  /** How many plants each level draws now, for `?stats`. */
  get drawn(): number {
    let n = 0;
    for (const k of this.#kinds) n += (k.near.mesh.visible ? k.near.mesh.count : 0) + (k.lod?.mesh.visible ? k.lod.mesh.count : 0);
    return n;
  }
}
