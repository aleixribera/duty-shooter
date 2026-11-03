import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { abs, attribute, cos, dFdx, dFdy, distance, float, int, length, log2, max, mix, normalLocal, normalWorld, normalWorldGeometry, pow, positionLocal, positionWorld, sin, smoothstep, step, texture, time, uv, vec2, vec3 } from 'three/tsl';
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
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Material,
  type Texture,
  type Object3D,
} from 'three/webgpu';
import { groundLayerIndex, GROUND_LAYERS, groundTextures } from './ground-layers';
import { foliageLit, openGroundLit } from './surface-materials';
import { PLANT_STRIDE, type PlantKind, type Plants } from './surfaces';

/**
 * A map's vegetation and rocks (ticket 29), drawn instanced: each model of
 * the kit is one draw, near and far alike. Every kind keeps its plants in
 * squares of the map, and when the camera has moved a few metres (`refillOf`) its meshes are
 * refilled with what's in range: the full model out to the kind's `near`, its
 * cheaper model out to `far`, nothing past that.
 *
 * Each model's colours come from its materials, with the occlusion baked into
 * its vertices (tools/map/vegetation.py). Leaves, needles, fronds and blades
 * are alpha-tested cards showing the foliage atlas (ticket 62), lit as the
 * mass they make; rocks and trunks are solid. Each plant tints its model,
 * sways in the wind by its own share (its leaves flutter besides), and wears
 * snow on what faces up where the map says so.
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

/** A model of the kit as one geometry: position, normal, atlas UVs, and its material colours with baked occlusion (in w) per vertex. */
function assetGeometry(scene: Object3D, name: string): BufferGeometry {
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
    // Colour and occlusion share one attribute: WebGPU allows a pipeline 8 vertex buffers, and the instances take 3 of them.
    const colour = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colour.set([material.color.r, material.color.g, material.color.b, ao ? ao.getX(i) : 1], i * 4);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', source.getAttribute('position'));
    g.setAttribute('normal', source.getAttribute('normal'));
    g.setAttribute('uv', source.getAttribute('uv') ?? new BufferAttribute(new Float32Array(n * 2).fill(SOLID_UV), 2));
    g.setAttribute('plantColor', new BufferAttribute(colour, 4));
    const index = source.index ? Array.from(source.index.array) : Array.from({ length: n }, (_, i) => i);
    g.setIndex(index);
    parts.push(g);
  });
  const merged = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (!merged) throw new Error(`The vegetation kit's "${name}" has no mesh`);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Where the atlas's opaque white cell is (u and v alike, as glTF has them):
 * bark and stems sample it and keep their own colour; anything far from it is
 * a leaf card (vegetation.py's `SOLID_UV`).
 */
const SOLID_UV = 0.875;
/** The atlas's size (px): its mip level, from how fast the UVs change on screen, keeps far leaves from thinning out. */
const ATLAS_SIZE = 2048;
/** How much a leaf's alpha grows per mip level down, so its coverage holds as the mipmaps average its edges away. */
const ALPHA_PER_MIP = 0.22;
/** The most snow a leaf wears, where it faces the sky. */
const LEAF_SNOW = 0.45;
/** Metres a leaf card's tip flutters, and how fast. */
const FLUTTER = 0.03;
const FLUTTER_RATE = 4.3;

/** The ground layer rocks wear, read from three sides (see `ground-layers.ts`), and its metres a tile. */
const ROCK_LAYER = 'rock';
const ROCK_METRES = 2.6;

type N = ReturnType<typeof float>;

/**
 * The plants' materials: their own colours and occlusion, swaying from the
 * ground up, snow on what faces up.
 *
 * - `rock`: also wears the ground's rock photo, from whichever side faces
 *   most (triplanar), its mean divided out so their colour stays the tint's.
 * - `solid`: trunks, as their materials colour them.
 * - `leaf`: cards showing the foliage atlas, cut to the leaves' outline,
 *   lit as foliage (see `foliageLit`), their leaves fluttering.
 */
function plantMaterial(kind: 'solid' | 'leaf' | 'rock', atlas: Texture | null): Material {
  // x: snow, y: the plant's own phase in the wind, z: metres its sway reaches per square metre of the model's height.
  const extra = attribute<'vec3'>('plantExtra', 'vec3');
  const base = attribute<'vec4'>('plantColor', 'vec4');
  let own = base.xyz.mul(attribute<'vec3'>('plantTint', 'vec3')).mul(mix(float(1 - CREASE), float(1), base.w));
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
  // A leaf's normal is its plant's volume, the same from either side of the card.
  const normal = kind === 'leaf' ? normalWorldGeometry : normalWorld;
  // Snow lies on what faces up; on leaves only the crown's top, and never hiding the needles under it.
  const up = kind === 'leaf' ? smoothstep(float(0.6), float(0.95), normal.y).mul(extra.x).mul(LEAF_SNOW) : smoothstep(float(0.35), float(0.75), normal.y).mul(extra.x);
  const snow = vec3(SNOW.r, SNOW.g, SNOW.b);
  let m: Material & { positionNode: unknown };
  if (kind === 'leaf' && atlas) {
    const at = uv();
    const leaf = texture(atlas, at);
    const px = at.mul(ATLAS_SIZE);
    const mip = log2(max(max(length(dFdx(px)), length(dFdy(px))), float(1)));
    const alpha = leaf.a.mul(mip.mul(ALPHA_PER_MIP).add(1));
    m = foliageLit(mix(own.mul(leaf.rgb), snow, up), alpha, normal) as typeof m;
  } else {
    m = openGroundLit(mix(own, snow, up)) as typeof m;
  }
  if (kind !== 'rock') {
    // The model's own height, before the instance's matrix (which three applies to positionLocal first).
    const height = attribute<'vec3'>('position', 'vec3').y.max(0);
    const phase = time.mul(1.3).add(extra.y);
    const bend = height.mul(height).mul(extra.z);
    let moved = positionLocal.add(vec3(sin(phase).mul(bend), float(0), cos(phase.mul(0.77)).mul(bend).mul(0.6)));
    if (kind === 'leaf') {
      // Leaves flutter along their plant's normal, each spot of the plant to its own beat; bark and stems (on the white cell) hold still.
      const onCard = step(float(0.06), distance(uv(), vec2(SOLID_UV, SOLID_UV)));
      const p = attribute<'vec3'>('position', 'vec3');
      const beat = sin(time.mul(FLUTTER_RATE).add(p.x.mul(2.9)).add(p.z.mul(3.7)).add(p.y.mul(1.7)).add(extra.y));
      moved = moved.add(normalLocal.mul(beat.mul(FLUTTER).mul(onCard)));
    }
    m.positionNode = moved;
  }
  return m;
}

/** The foliage atlas, as glTF reads textures (v down the image), mipmapped. */
async function loadAtlas(url: string): Promise<Texture> {
  const t = await new TextureLoader().loadAsync(url);
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
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

  constructor(kind: PlantKind, geometry: (name: string) => BufferGeometry, material: (kind: PlantKind) => Material) {
    this.#kind = kind;
    this.#refill = refillOf(kind);
    const count = kind.instances.length / PLANT_STRIDE;
    // Hard cover and bushes cast shadows near; blades and fronds don't (cheaper, and they'd only speckle the ground).
    const shadow = !kind.thin;
    this.near = new Level(geometry(kind.asset), material(kind), count, shadow);
    this.lod = kind.lod ? new Level(geometry(kind.lod), material(kind), count, false) : null;
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
    const [{ scene }, atlas] = await Promise.all([new GLTFLoader().loadAsync(plants.url), loadAtlas(plants.atlas)]);
    scene.updateMatrixWorld(true);
    const geometries = new Map<string, BufferGeometry>();
    const geometry = (name: string) => {
      let g = geometries.get(name);
      if (!g) geometries.set(name, (g = assetGeometry(scene, name)));
      return g;
    };
    const materials = { solid: plantMaterial('solid', null), leaf: plantMaterial('leaf', atlas), rock: plantMaterial('rock', null) };
    const material = (k: PlantKind) => materials[k.asset.startsWith('rock') ? 'rock' : k.asset.endsWith('-trunk') ? 'solid' : 'leaf'];
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
