import type { TerrainData, Vec3 } from '@duty-shooter/fps-core';
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Material,
} from 'three/webgpu';
import { chunkStep, TERRAIN_CHUNK, terrainChunkCount, terrainChunkMesh, terrainColorBytes, terrainWaterMesh, type TerrainMesh } from './surfaces';
import { seabedMaterial, terrainMaterial } from './surface-materials';

/** The coarsest step: every chunk has it from the start, so nothing is ever a hole. */
const COARSEST = 8;
/** Finer chunks built a frame, nearest first: one costs about a millisecond. */
const BUILDS_PER_FRAME = 2;
/** Metres the viewer moves between fresh looks at which chunks need what. */
const RECHECK = 6;
/** A move this far in a frame is a teleport: everything catches up at once. */
const TELEPORT = 64;
/** Ground wholly deeper than this can't be seen through the sea, and the seabed stands in for it (m). */
const SEABED = -5.5;
/** How far the sea and seabed reach from the middle of the ground (m). */
const SEA_REACH = 3000;

interface Chunk {
  readonly x: number;
  readonly z: number;
  readonly mesh: Mesh;
  /** The nearest point's corners in world metres. */
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  step: number;
}

function geometry(m: TerrainMesh): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals, 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** The ground as chunks of triangles, finer near the viewer, with the sea round it. */
export class TerrainView {
  readonly root = new Group();
  readonly #data: TerrainData;
  readonly #chunks: Chunk[] = [];
  readonly #colors: DataTexture;
  #lookedFrom: Vec3 | null = null;
  /** Chunks waiting for another step, nearest first: [chunk, step]. */
  #queue: (readonly [Chunk, number])[] = [];

  constructor(data: TerrainData, colors: readonly number[], water: Material) {
    this.#data = data;
    const t = new DataTexture(terrainColorBytes(data, colors), data.columns, data.rows, RGBAFormat, UnsignedByteType);
    t.colorSpace = SRGBColorSpace;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this.#colors = t;
    const width = data.columns * data.cell;
    const depth = data.rows * data.cell;
    const material = terrainMaterial({ texture: t, origin: data.origin, size: [width, depth] });
    const { columns, rows } = terrainChunkCount(data);
    const span = TERRAIN_CHUNK * data.cell;
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < columns; x++) {
        if (this.#drowned(x, z)) continue;
        const mesh = new Mesh(geometry(terrainChunkMesh(data, x, z, COARSEST)), material);
        // The ground takes the sun's shadow but casts none: the shadow map reaches 45 m, and a low sun would have every hill redrawn into it.
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        const x0 = data.origin[0] + x * span;
        const z0 = data.origin[1] + z * span;
        this.#chunks.push({ x, z, mesh, step: COARSEST, x0, x1: Math.min(x0 + span, data.origin[0] + width), z0, z1: Math.min(z0 + span, data.origin[1] + depth) });
        this.root.add(mesh);
      }
    }
    const middleX = data.origin[0] + width / 2;
    const middleZ = data.origin[1] + depth / 2;
    const plane = (y: number, m: Material) => {
      const g = new PlaneGeometry(SEA_REACH * 2, SEA_REACH * 2).rotateX(-Math.PI / 2);
      const mesh = new Mesh(g, m);
      mesh.position.set(middleX, y, middleZ);
      return mesh;
    };
    this.root.add(plane(SEABED - 0.5, seabedMaterial(0x24454f)), plane(0, water));
    const river = terrainWaterMesh(data);
    if (river.index.length > 0) this.root.add(new Mesh(geometry(river), water));
  }

  /** Whether a whole chunk lies deep under the sea. */
  #drowned(chunkX: number, chunkZ: number): boolean {
    const { columns, rows, heights } = this.#data;
    const stride = columns + 1;
    for (let j = chunkZ * TERRAIN_CHUNK, end = Math.min(rows, j + TERRAIN_CHUNK); j <= end; j++) {
      for (let i = chunkX * TERRAIN_CHUNK, last = Math.min(columns, i + TERRAIN_CHUNK); i <= last; i++) {
        if (heights[j * stride + i]! > SEABED) return false;
      }
    }
    return true;
  }

  /** Each frame: moves chunks toward the detail the viewer's position wants. */
  update(viewer: Vec3): void {
    const from = this.#lookedFrom;
    const moved = from ? Math.hypot(viewer[0] - from[0], viewer[2] - from[2]) : Infinity;
    if (moved >= RECHECK) {
      this.#lookedFrom = viewer.slice() as unknown as Vec3;
      this.#queue = this.#wanted(viewer);
    }
    const budget = moved >= TELEPORT ? this.#queue.length : BUILDS_PER_FRAME;
    for (const [chunk, step] of this.#queue.splice(0, budget)) {
      chunk.mesh.geometry.dispose();
      chunk.mesh.geometry = geometry(terrainChunkMesh(this.#data, chunk.x, chunk.z, step));
      chunk.step = step;
    }
  }

  /** The chunks not at the step they should be, nearest first. */
  #wanted(viewer: Vec3): (readonly [Chunk, number])[] {
    const found: { chunk: Chunk; step: number; distance: number }[] = [];
    for (const chunk of this.#chunks) {
      const dx = Math.max(chunk.x0 - viewer[0], 0, viewer[0] - chunk.x1);
      const dz = Math.max(chunk.z0 - viewer[2], 0, viewer[2] - chunk.z1);
      const distance = Math.hypot(dx, dz);
      const step = chunkStep(distance, chunk.step);
      if (step !== chunk.step) found.push({ chunk, step, distance });
    }
    found.sort((a, b) => a.distance - b.distance);
    return found.map((f) => [f.chunk, f.step] as const);
  }

  /** For the benchmark and the tests of a page: how many chunks stand at each step. */
  counts(): Readonly<Record<number, number>> {
    const out: Record<number, number> = {};
    for (const c of this.#chunks) out[c.step] = (out[c.step] ?? 0) + 1;
    return out;
  }

  /** Frees what the scene's own traversal doesn't. */
  dispose(): void {
    this.#colors.dispose();
  }
}
