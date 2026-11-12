import type { AmbientSource } from './map-sound';
import type { ChargeSite, Material, Solid, TerrainData, Vec3, Zone } from '@duty-shooter/fps-core';
import { abs, color, float, fract, fwidth, max, min, mix, normalWorld, positionWorld, positionWorldDirection, select, smoothstep, uniform } from 'three/tsl';
import { Vector2 } from 'three/webgpu';
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  type Texture,
  Color,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { atlasUv, GRIME_MARKS, grimeQuads, layoutSurfaces, LIGHTING, SCATTER_FINISHES, scatterModels, type BakeFile, type Decoration, type EndingShot, type Finish, type FreightTrain, type GrimeQuad, type Lighting, type Look, type MapModels, type Plants, type Scatter, type SurfaceLayout } from './surfaces';
import { cornerEdges, openEdges } from './surfaces/edges';
import { TerrainView } from './terrain-view';
import { SurfaceBlocks, surfaceBlocks } from './surface-blocks';
import { hasDistanceDetail } from './detail';
import { PICTURE, keeps, type QualityProfile } from './quality';
import { Train } from './train';
import { depthFirst, isDepthTwin, loadMapModels } from './map-models';
import { cloudySky } from './surface-sky';
import { tilesLoaded } from './surface-tiles';
import { groundLoaded } from './ground-layers';
import { PlantsView } from './plants-view';
import { currentLighting, grimeMaterial, lightmapNode, lightmapTexture, ProbeField, probeLit, reflectedSky, setShadowReach, surfaceMaterial, useLighting, useSkyField } from './surface-materials';
import { buildSkyField } from './sky-field';
import { distantTown, dustMotes, farGroundGeometry, mountains, PopulationSign, type Horizon, type SignPlacement } from './world-details';

/** A sloped surface drawn as a ramp (collision is the map's business). Rises along -Z from z0 to z1. */
export interface RampShape {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly h0: number;
  readonly h1: number;
  readonly material: Material;
}

export interface WorldLabel {
  readonly text: string;
  readonly position: Vec3;
  readonly yaw: number;
  readonly size: number;
}

export interface WorldContent {
  /** Solids to draw (collision-only solids are left out by the map). */
  readonly solids: readonly Solid[];
  /** How the solids look (see SurfaceSpec): named finishes, a look per solid, decoration and the indoor zones. */
  readonly finishes: Readonly<Record<string, Finish>>;
  readonly looks: readonly (Look | null)[];
  readonly decorations: readonly Decoration[];
  /** Modelled things drawn in place of the solids they stand for (see ModelPlacement). */
  readonly models?: MapModels | null;
  /** Vegetation and rocks, drawn instanced (see PlantsView). */
  readonly plants?: Plants | null;
  readonly indoorZones: readonly { readonly min: Vec3; readonly max: Vec3 }[];
  /** The Outposts zones, for the HUD's markers (none on a map without them). */
  readonly zones?: readonly Zone[];
  /** The Charge sites, for the HUD's markers (none on a map without them). */
  readonly sites?: readonly ChargeSite[];
  readonly ramps?: readonly RampShape[];
  readonly labels?: readonly WorldLabel[];
  /** Where the population sign's live face goes, if the map has one. */
  readonly populationSign?: SignPlacement | null;
  /** The far ground and mountains round the map, if it has them. */
  readonly horizon?: Horizon | null;
  /** The ground, for a map on terrain (see Terrain), and the sRGB colour of each palette entry. */
  readonly terrain?: TerrainData | null;
  readonly terrainColors?: readonly number[];
  /** The ground layer each palette entry wears (see `GROUND_LAYERS`), for ground that wears photos. */
  readonly terrainLayers?: readonly string[];
  /** The named places the island map letters; a map with them and terrain gets the Battle Royale's Ring and island map. */
  readonly places?: readonly { readonly name: string; readonly x: number; readonly z: number }[];
  /** The end-of-match nuke's ground zero, siren and the camera's shot of it, if the map has one (see Nuke). */
  readonly nuke?: { readonly groundZero: Vec3; readonly siren: Vec3; readonly shot?: EndingShot } | null;
  /** The end-of-match freight train, if the map has one (see Train). */
  readonly train?: FreightTrain | null;
  /** The map's sun and sky (the afternoon if not given). */
  readonly lighting?: Lighting;
  /** The map's ambient sound sources (see Ambience). */
  readonly ambience?: readonly AmbientSource[];
  /** Small visual-only fires emitted by the game's effects. */
  readonly fires?: readonly Vec3[];
  /** The rocks and dry shrubs strewn over its ground (see Scatter). */
  readonly scatter?: Scatter;
}

/**
 * The sun's shadow map is the look's (`quality.ts`): its size
 * (texels), how far it reaches either side of the player (m), and its redraws a
 * second at most, so a fast display doesn't redraw every caster on every frame.
 * 2048 texels over 45 m either side, 60 times a second.
 */

/** Base tint, roughness and metalness per surface: a polished studio blockout palette. */
const LOOK: Readonly<Record<Material, { tint: number; line: number; roughness: number; metalness: number }>> = {
  concrete: { tint: 0xb9bcc0, line: 0x6f7378, roughness: 0.82, metalness: 0 },
  plaster: { tint: 0xd9d6cf, line: 0x9a968e, roughness: 0.9, metalness: 0 },
  metal: { tint: 0x6f7c88, line: 0x3c4650, roughness: 0.45, metalness: 0.65 },
  wood: { tint: 0xc08a52, line: 0x7a5530, roughness: 0.7, metalness: 0 },
  dirt: { tint: 0x8c7a62, line: 0x5e5040, roughness: 0.95, metalness: 0 },
  grass: { tint: 0x6f8a58, line: 0x4c6340, roughness: 0.95, metalness: 0 },
  glass: { tint: 0x9fc4d4, line: 0x6a8c99, roughness: 0.1, metalness: 0.1 },
  brick: { tint: 0xa8624c, line: 0x6e3e30, roughness: 0.88, metalness: 0 },
  asphalt: { tint: 0x55585c, line: 0x35373a, roughness: 0.92, metalness: 0 },
  gravel: { tint: 0x8f887c, line: 0x625c52, roughness: 0.95, metalness: 0 },
  sand: { tint: 0xc9b48a, line: 0x9a8662, roughness: 0.96, metalness: 0 },
  sheetMetal: { tint: 0x9aa4ae, line: 0x5c666e, roughness: 0.5, metalness: 0.55 },
  plastic: { tint: 0xe6e0d4, line: 0xa8a294, roughness: 0.55, metalness: 0 },
};

/**
 * A grid-lined physically based material: 1 m minor and 5 m major lines in
 * world space on whichever plane the surface faces, so every surface reads
 * as a measurement grid.
 */
function gridMaterial(material: Material): MeshStandardNodeMaterial {
  const look = LOOK[material];
  const m = new MeshStandardNodeMaterial({ roughness: look.roughness, metalness: look.metalness });
  const n = abs(normalWorld);
  const p = positionWorld;
  const uv = select(n.y.greaterThan(0.57), p.xz, select(n.x.greaterThan(0.57), p.zy, p.xy));
  const line = (scale: number, width: number) => {
    const q = uv.div(scale);
    const d = abs(fract(q.sub(0.5)).sub(0.5)).div(fwidth(q).mul(width));
    return float(1).sub(min(min(d.x, d.y), float(1)));
  };
  const minor = line(1, 1.0);
  const major = line(5, 1.6);
  // Faint 10 cm subdivisions near the eye only: fade them out with distance via their screen-space size.
  const fine = line(0.1, 0.8).mul(smoothstep(float(0.08), float(0.02), max(fwidth(uv.x), fwidth(uv.y))));
  const base = color(look.tint);
  const ink = color(look.line);
  const lines = max(max(minor.mul(0.55), major.mul(0.9)), fine.mul(0.18));
  m.colorNode = mix(base, ink, lines);
  m.roughnessNode = float(look.roughness).add(lines.mul(0.05));
  return m;
}

function boxGeometry(b: Solid): BufferGeometry {
  const o = b.orientation;
  if (!o) {
    const g = new BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    return g;
  }
  const g = new BoxGeometry(o.half[0] * 2, o.half[1] * 2, o.half[2] * 2);
  const [x, y, z] = o.axes;
  g.applyMatrix4(new Matrix4().makeBasis(new Vector3(...x), new Vector3(...y), new Vector3(...z)));
  g.translate(o.center[0], o.center[1], o.center[2]);
  return g;
}

function rampGeometry(r: RampShape): BufferGeometry {
  // Side profile in (distance along -Z, height), extruded across X.
  const length = Math.abs(r.z1 - r.z0);
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, r.h1);
  shape.lineTo(0, r.h0);
  shape.closePath();
  const g = new ExtrudeGeometry(shape, { depth: r.x1 - r.x0, bevelEnabled: false });
  // Shape x -> world -Z, extrusion -> world +X.
  g.rotateY(Math.PI / 2);
  g.translate(r.x0, 0, r.z0);
  return g; // ExtrudeGeometry is already non-indexed
}

/** The picture's margin round each mark (of a cell), so a mipmap's blur doesn't pick up the next. */
const GRIME_INSET = 0.03;

/** A map's weathering marks as one geometry: one draw, however many. */
function grimeGeometry(marks: readonly GrimeQuad[]): BufferGeometry {
  const position = new Float32Array(marks.length * 12);
  const uv = new Float32Array(marks.length * 8);
  const tint = new Float32Array(marks.length * 16);
  const index = new Uint32Array(marks.length * 6);
  marks.forEach((m, k) => {
    const cell = GRIME_MARKS.indexOf(m.mark);
    const left = (cell + GRIME_INSET) / GRIME_MARKS.length;
    const right = (cell + 1 - GRIME_INSET) / GRIME_MARKS.length;
    ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).forEach(([a, b], corner) => {
      const v = k * 4 + corner;
      position.set([0, 1, 2].map((i) => m.origin[i]! + m.u[i]! * a + m.v[i]! * b), v * 3);
      // The picture's top is v = 0: it runs down from the head of a wall.
      uv.set([a ? right : left, b ? GRIME_INSET : 1 - GRIME_INSET], v * 2);
      tint.set(m.tint, v * 4);
    });
    index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  // Nothing lights the marks; the renderer asks every mesh for a normal all the same.
  g.setAttribute('normal', new BufferAttribute(new Float32Array(marks.length * 12), 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('grimeTint', new BufferAttribute(tint, 4));
  g.setIndex(new BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * The static surfaces as one geometry per finish: each face a quad with its
 * normal, its own coordinates in metres (uv: along it horizontally and up it,
 * for the finish patterns), its lightmap coordinates (uv1) and how far each
 * corner is from the wall's open edges (faceEdges, for the weathering).
 */
function surfaceGeometries(layout: SurfaceLayout, solids: readonly Solid[], only: readonly number[] | null = null, open = openEdges(layout.faces)): Map<string, BufferGeometry> {
  const byFinish = new Map<string, number[]>();
  for (const i of only ?? layout.faces.keys()) {
    const f = layout.faces[i]!;
    if (f.solid >= 0 && solids[f.solid]!.prop !== null) continue;
    const list = byFinish.get(f.finish) ?? [];
    list.push(i);
    byFinish.set(f.finish, list);
  }
  const out = new Map<string, BufferGeometry>();
  for (const [finish, faces] of byFinish) {
    const position = new Float32Array(faces.length * 12);
    const normal = new Float32Array(faces.length * 12);
    const uv = new Float32Array(faces.length * 8);
    const uv1 = new Float32Array(faces.length * 8);
    const edges = new Float32Array(faces.length * 16);
    const index = new Uint32Array(faces.length * 6);
    faces.forEach((fi, k) => {
      const f = layout.faces[fi]!;
      const rect = layout.atlas.rects[fi];
      const [nx, ny, nz] = f.normal;
      // Pattern axes: horizontal along the surface, then up it (or along -Z on a floor).
      let h: Vec3 = Math.abs(ny) < 0.99 ? [nz, 0, -nx] : [1, 0, 0];
      const hl = Math.hypot(h[0], h[1], h[2]);
      h = [h[0] / hl, h[1] / hl, h[2] / hl];
      const w: Vec3 = [ny * h[2] - nz * h[1], nz * h[0] - nx * h[2], nx * h[1] - ny * h[0]];
      const corners: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      corners.forEach(([a, b], c) => {
        const p: Vec3 = [f.origin[0] + f.u[0] * a + f.v[0] * b, f.origin[1] + f.u[1] * a + f.v[1] * b, f.origin[2] + f.u[2] * a + f.v[2] * b];
        const v = k * 4 + c;
        position.set(p, v * 3);
        normal.set(f.normal, v * 3);
        uv.set([p[0] * h[0] + p[1] * h[1] + p[2] * h[2], p[0] * w[0] + p[1] * w[1] + p[2] * w[2]], v * 2);
        uv1.set(rect ? atlasUv(layout.atlas, rect, a, b) : [0, 0], v * 2);
        edges.set(cornerEdges(f, open[fi]!, a, b), v * 4);
      });
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(position, 3));
    g.setAttribute('normal', new BufferAttribute(normal, 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setAttribute('uv1', new BufferAttribute(uv1, 2));
    g.setAttribute('faceEdges', new BufferAttribute(edges, 4));
    g.setIndex(new BufferAttribute(index, 1));
    g.computeBoundingSphere();
    out.set(finish, g);
  }
  return out;
}

function labelMesh(label: WorldLabel): Mesh {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 96;
  canvas.height = 128;
  if (ctx) {
    ctx.font = `700 ${font}px system-ui, sans-serif`;
    canvas.width = Math.ceil(ctx.measureText(label.text).width + 48);
    ctx.font = `700 ${font}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(20, 22, 26, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f2c14e';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.text, 24, canvas.height / 2 + 4);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const height = label.size;
  const mesh = new Mesh(new PlaneGeometry((height * canvas.width) / canvas.height, height), new MeshBasicNodeMaterial({ map: texture, side: DoubleSide }));
  mesh.position.set(label.position[0], label.position[1], label.position[2]);
  mesh.rotation.y = label.yaw;
  return mesh;
}

/**
 * The static world: lightmapped surfaces merged per finish, ramps, signs,
 * the sky, and the sun. Static surfaces take their light from the bake;
 * moving objects take theirs from its probe grid and the realtime sun, whose
 * shadows only they cast.
 */
const reflectionMaps = new WeakMap<WebGPURenderer, WeakMap<Lighting, Texture>>();
/** The sky as a room to reflect: one sphere, drawn with whatever light is current. */
let skyRoom: Scene | null = null;

/**
 * What shiny things reflect under `lighting`: that map's own sky, sun and
 * ground, blurred for rough metal. Made once for each light. The first is
 * slow enough (its shaders) that a page starting up makes one on its own.
 */
export function reflections(renderer: WebGPURenderer, lighting: Lighting = LIGHTING): Texture {
  let maps = reflectionMaps.get(renderer);
  if (!maps) reflectionMaps.set(renderer, (maps = new WeakMap()));
  let map = maps.get(lighting);
  if (!map) {
    if (!skyRoom) {
      const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
      material.colorNode = reflectedSky(positionWorldDirection as never) as never;
      skyRoom = new Scene();
      skyRoom.add(new Mesh(new SphereGeometry(50, 32, 16), material));
    }
    const before = currentLighting();
    useLighting(lighting);
    map = new PMREMGenerator(renderer).fromScene(skyRoom, 0.03).texture;
    useLighting(before);
    maps.set(lighting, map);
  }
  return map;
}

export class WorldView {
  readonly scene = new Scene();
  readonly #sun: DirectionalLight;
  /** Where the realtime shadow map reaches: its centre (x, z) and the radius it fully covers (m). */
  readonly #shadowCentre = uniform(new Vector2(0, 0));
  // The map covers the ground all round that far (its square reaches farther on the ground than across).
  readonly #shadowRadius = uniform(PICTURE.shadowDistance * 0.9);
  /** The shadow map as the look has it: its reach either side of the player (m), one texel (m), and the seconds between redraws. */
  #shadowTexel = (2 * PICTURE.shadowDistance) / PICTURE.shadowMapSize;
  #shadowRefresh = 1 / PICTURE.shadowRate;
  /** The baked light probes, for lighting moving objects. */
  readonly probes = new ProbeField();
  readonly #root = new Group();
  /** The end-of-match freight train, for a map that has one. */
  readonly train: Train | null = null;
  /** The ground, for a map on terrain. */
  readonly terrain: TerrainView | null = null;
  /** A map on terrain's surfaces, near and far by block. */
  readonly #surfaceBlocks: SurfaceBlocks | null = null;
  readonly #plants: PlantsView | null = null;
  /** Props (mannequin heads), drawn on their own so a shot can knock one off. */
  readonly #props = new Map<string, Mesh>();
  /** Standard materials already switched to probe lighting. */
  readonly #lit = new WeakSet<object>();
  readonly #sign: PopulationSign | null = null;
  /** Settles once the map's models are in the scene, or have failed to load. */
  readonly modelsIn: Promise<void> = Promise.resolve();

  constructor(renderer: WebGPURenderer, content: WorldContent, bake: Promise<BakeFile | null> = Promise.resolve(null)) {
    const scene = this.scene;
    useLighting(content.lighting ?? LIGHTING);
    // A map on terrain bakes only its surfaces: its sky field lights the rest (far shadows, and how much sky each place sees).
    useSkyField(content.terrain ? buildSkyField(content.terrain, content.solids, (content.lighting ?? LIGHTING).sunDirection) : null);
    scene.backgroundNode = cloudySky(positionWorldDirection as never);
    // Reflections only (metals, the viewmodel): the probes carry the ambient light.
    scene.environment = reflections(renderer, content.lighting ?? LIGHTING);
    scene.environmentIntensity = 0.3;

    this.#sun = this.#makeSun();
    this.follow([0, 0, 0]);

    const layout = layoutSurfaces(content.solids, { finishes: content.finishes, looks: content.looks, decorations: content.decorations, indoor: content.indoorZones, modelled: [...(content.models?.placements.flatMap((p) => p.solids) ?? []), ...(content.plants?.modelled ?? [])] });
    const size = uniform(new Vector2(1, 1));
    const baked = { lightmap: lightmapNode(), size: size as never, ready: uniform(0), shadowCentre: this.#shadowCentre as never, shadowRadius: this.#shadowRadius as never };
    const materials = new Map<string, ReturnType<typeof surfaceMaterial>>();
    const materialOf = (key: string) => {
      let m = materials.get(key);
      if (!m) materials.set(key, (m = surfaceMaterial(layout.finishes[key]!, baked)));
      return m;
    };
    const meshes = (geometries: Map<string, BufferGeometry>, castShadow: boolean) =>
      [...geometries].map(([key, geometry]) => {
        const mesh = new Mesh(geometry, materialOf(key));
        // Everything near casts into the realtime shadow map: near the player it lights static surfaces more crisply than the bake, and it keeps the sun off soldiers indoors.
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        // One mesh per finish across the map draws in no useful order: its depth goes down first, so walls light only what shows.
        // Glass is see-through and a lamp's glow costs nothing to draw twice.
        const family = layout.finishes[key]!.family;
        if (family !== 'glass' && family !== 'lamp') mesh.add(depthFirst(mesh));
        return mesh;
      });
    if (content.terrain && hasDistanceDetail()) {
      // A map on terrain is too wide to draw whole: its surfaces go in blocks, the far ones with their big solids alone.
      const open = openEdges(layout.faces);
      this.#surfaceBlocks = new SurfaceBlocks(
        surfaceBlocks(layout, content.solids).map((b) => ({ ...b, near: meshes(surfaceGeometries(layout, content.solids, b.near, open), true), far: meshes(surfaceGeometries(layout, content.solids, b.far, open), false) })),
      );
      this.#root.add(this.#surfaceBlocks.root);
    } else this.#root.add(...meshes(surfaceGeometries(layout, content.solids), true));
    if (content.horizon) {
      const finish = layout.finishes[content.horizon.ground];
      if (!finish) throw new Error(`Unknown horizon finish "${content.horizon.ground}"`);
      const ground = new Mesh(farGroundGeometry(layout, content.horizon), surfaceMaterial(finish, baked));
      ground.castShadow = false;
      ground.receiveShadow = true;
      const { x0, x1, z0, z1 } = content.horizon.inner;
      this.#root.add(ground, mountains((x0 + x1) / 2, (z0 + z1) / 2, finish.color));
      if (content.horizon.town) this.#root.add(distantTown(content.horizon.town));
    }
    if (content.terrain) {
      this.terrain = new TerrainView(content.terrain, content.terrainColors ?? [0x808080], surfaceMaterial({ family: 'glass', color: 0x2a5d6e, accent: 0x2a5d6e }, baked), { layers: content.terrainLayers ?? null });
      this.#root.add(this.terrain.root);
    }
    if (content.models) {
      this.modelsIn = loadMapModels(content.models, layout.finishes).then(
        (group) => {
          this.#lightObject(group);
          this.#root.add(group);
        },
        (error: unknown) => console.error(`Map models failed to load: ${String(error)}`),
      );
    }
    if (content.plants) {
      const plants = new PlantsView(content.plants);
      this.#plants = plants;
      const plantsIn = plants.loaded.then(() => {
        this.#lightObject(plants.root);
        this.#root.add(plants.root);
      });
      this.modelsIn = Promise.all([this.modelsIn, plantsIn]).then(() => undefined);
    }
    if (content.scatter) {
      const marks = grimeQuads(layout.faces, content.solids, layout.finishes, content.scatter);
      if (marks.length > 0) this.#root.add(new Mesh(grimeGeometry(marks), grimeMaterial()));
      const strewn = scatterModels(layout.faces, content.solids, content.scatter);
      // Strewn rocks and shrubs are for the eye alone: the picture's density says how many are laid out.
      const models = { ...strewn, placements: strewn.placements.filter((_, i) => keeps(i, PICTURE.scatterDensity)) };
      const scatterIn = loadMapModels(models, SCATTER_FINISHES).then(
        (group) => {
          this.#lightObject(group);
          this.#root.add(group);
        },
        (error: unknown) => console.error(`Scatter failed to load: ${String(error)}`),
      );
      this.modelsIn = Promise.all([this.modelsIn, scatterIn]).then(() => undefined);
    }
    if (content.train) {
      this.train = new Train(this.#root, content.train, layout.finishes);
      this.modelsIn = Promise.all([this.modelsIn, this.train.modelsIn]).then(() => undefined);
    }
    this.modelsIn = Promise.all([this.modelsIn, tilesLoaded(), content.terrainLayers ? groundLoaded() : null]).then(() => undefined);
    void bake.then((file) => {
      if (!file) return;
      if (file.key !== layout.key) {
        console.warn(`Baked lighting is for another layout (${file.key}, not ${layout.key}); drawing without it.`);
        return;
      }
      (baked.lightmap as unknown as { value: unknown }).value = lightmapTexture(file);
      size.value.set(file.width, file.height);
      baked.ready.value = 1;
      // A map on terrain bakes its surfaces alone: the sky field goes on lighting its ground, plants and whatever moves.
      if (file.probes.dims[0] === 0) return;
      this.probes.load(file);
      useSkyField(null);
    });

    for (const [i, b] of content.solids.entries()) {
      if (b.prop === null) continue;
      // Centred on its own origin, so a knocked-off copy tumbles about its middle.
      const centre: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
      const finish = layout.finishes[content.looks[i]?.side ?? ''];
      let mesh: Mesh;
      if (finish && finish.family !== 'grid') {
        // A mannequin head in its finish: an egg filling the prop's box.
        const geometry = new SphereGeometry(0.5, 20, 14);
        geometry.scale(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
        mesh = new Mesh(geometry, new MeshStandardNodeMaterial({ color: new Color(finish.color), roughness: 0.45 }));
      } else {
        const geometry = boxGeometry(b);
        geometry.translate(-centre[0], -centre[1], -centre[2]);
        mesh = new Mesh(geometry, gridMaterial(b.material));
      }
      mesh.position.set(...centre);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#props.set(b.prop, mesh);
      this.#root.add(mesh);
    }
    const ramps = new Map<Material, BufferGeometry[]>();
    for (const r of content.ramps ?? []) ramps.set(r.material, [...(ramps.get(r.material) ?? []), rampGeometry(r)]);
    for (const [material, geometries] of ramps) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      for (const g of geometries) g.dispose();
      const mesh = new Mesh(merged, gridMaterial(material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#root.add(mesh);
    }
    for (const label of content.labels ?? []) this.#root.add(labelMesh(label));
    if (content.populationSign) {
      this.#sign = new PopulationSign(content.populationSign);
      this.#root.add(this.#sign.mesh);
    }
    const dust = dustMotes(content.indoorZones, this.probes);
    if (dust) this.#root.add(dust);
    scene.add(this.#root);
    this.#lightObject(this.#root);
    this.lightMoving();
  }

  /** The scene's one directional light. Three's lights divide by pi where the bake's light does not. */
  #makeSun(): DirectionalLight {
    const l = currentLighting();
    const sun = new DirectionalLight(new Color(...l.sunColor), l.sunIntensity * Math.PI);
    sun.castShadow = true;
    const shadow = sun.shadow;
    shadow.bias = -0.0005;
    const cam = shadow.camera;
    cam.near = 1;
    cam.far = 220;
    shadow.autoUpdate = false;
    this.scene.add(sun, sun.target);
    this.#shadowQuality(sun, PICTURE);
    return sun;
  }

  /** Sizes the sun's shadow map as the look has it. */
  #shadowQuality(sun: DirectionalLight, quality: QualityProfile): void {
    const shadow = sun.shadow;
    const extent = quality.shadowDistance;
    this.#shadowTexel = (2 * extent) / quality.shadowMapSize;
    this.#shadowRefresh = 1 / quality.shadowRate;
    this.#shadowRadius.value = extent * 0.9;
    // The node that draws the map resizes it to this on its next redraw.
    shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    // About a texel and a half: walls and roofs cast too, so surfaces facing the sun must not shadow themselves.
    shadow.normalBias = this.#shadowTexel * 1.37;
    const cam = shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.updateProjectionMatrix();
    shadow.needsUpdate = true;
    this.#shadowAt = -Infinity;
  }

  /** Shows the lobby's head count and this match's kills on the population sign, if the map has one. */
  setPopulation(population: number, kills: number): void {
    this.#sign?.show(population, kills);
  }

  /**
   * Light dynamic scene objects before rendering. The static map is handled
   * once at creation (and as its models load), so it need not be walked every frame.
   */
  lightMoving(): void {
    for (const child of this.scene.children) {
      if (child !== this.#root) this.#lightObject(child);
    }
    // The train's models load asynchronously under the otherwise static root.
    if (this.train) this.#lightObject(this.train.root);
  }

  #lightObject(root: Object3D): void {
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!(m instanceof MeshStandardNodeMaterial) || this.#lit.has(m)) continue;
        probeLit(m, this.probes, () => this.#sun, { centre: this.#shadowCentre as never, radius: this.#shadowRadius as never });
        m.needsUpdate = true;
        this.#lit.add(m);
      }
    });
  }

  /**
   * Knocks a prop off: hides it and returns a copy for the effects to drop,
   * or null if it was already gone.
   */
  popProp(id: string): Mesh | null {
    const mesh = this.#props.get(id);
    if (!mesh || !mesh.visible) return null;
    mesh.visible = false;
    const copy = mesh.clone();
    copy.visible = true;
    return copy;
  }

  /** Hides props the server says are already gone (a late join), with no falling copy. */
  hideProps(ids: readonly string[]): void {
    for (const id of ids) {
      const mesh = this.#props.get(id);
      if (mesh) mesh.visible = false;
    }
  }

  /** Puts every prop back (a new match). */
  restoreProps(): void {
    for (const mesh of this.#props.values()) mesh.visible = true;
  }

  /** Frees the GPU resources this view made (switching maps builds a new one). */
  dispose(): void {
    this.scene.traverse((o) => {
      if (!(o instanceof Mesh) || isDepthTwin(o)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as { map?: { dispose(): void } | null }).map?.dispose();
        m.dispose();
      }
    });
    this.#sun.shadow.map?.dispose();
    this.terrain?.dispose();
  }

  /** The view's magnification (1 unscoped): plants are drawn as far again through a scope, as soldiers are. */
  zoom(zoom: number): void {
    this.#plants?.zoom(zoom);
  }

  /** Where the plants were last asked to be filled round: `follow` may run more than once a frame. */
  #plantsAt: Vec3 | null = null;

  /**
   * Once a frame, just before it's drawn: the plants refill round the last
   * place followed. A frame can follow two places (you, then whom you watch),
   * and refilling for each in turn would upload every plant every frame.
   */
  frame(): void {
    if (this.#plantsAt) this.#plants?.update(this.#plantsAt);
  }

  /** For the warm-up frame: every plant that casts a shadow on show (see `PlantsView.showCasters`). Returns what puts them back. */
  showPlants(): () => void {
    return this.#plants?.showCasters() ?? (() => undefined);
  }

  /** Redraws the shadow map on the next frame, whatever its refresh rate. */
  redrawShadow(): void {
    this.#sun.shadow.needsUpdate = true;
  }

  /** When the shadow map was last redrawn. */
  #shadowAt = -Infinity;

  /**
   * Keeps the sun's shadow map around the player. It moves in whole texels
   * across the light's view, so the shadows stay put on the ground instead of
   * crawling and jumping as the player walks.
   */
  follow(position: Vec3): void {
    this.terrain?.update(position);
    this.#surfaceBlocks?.update(position);
    this.#plantsAt = position;
    // The map and the light move only on the frames that redraw it, so nothing jumps. A frame a little early still
    // redraws: at the display's rate frames land either side of the interval.
    const now = performance.now() / 1000;
    if (now - this.#shadowAt < this.#shadowRefresh * 0.8) return;
    this.#shadowAt = now;
    this.#sun.shadow.needsUpdate = true;
    const d = currentLighting().sunDirection;
    // The light's view: x and y across it, z toward the sun (as lookAt builds it with +y up).
    const z = new Vector3(d[0], d[1], d[2]);
    const x = new Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    const p = new Vector3(position[0], 0, position[2]);
    const t = this.#shadowTexel;
    const at = x.multiplyScalar(Math.round(p.dot(x) / t) * t).add(y.multiplyScalar(Math.round(p.dot(y) / t) * t)).add(z.clone().multiplyScalar(p.dot(z)));
    this.#shadowCentre.value.set(at.x, at.z);
    setShadowReach(at.x, at.z, this.#shadowRadius.value);
    this.#sun.target.position.copy(at);
    this.#sun.position.copy(at).addScaledVector(z, 100);
    this.#sun.target.updateMatrixWorld();
  }
}
