import type { AmbientSource } from './map-sound';
import type { ChargeSite, Material, Solid, Vec3, Zone } from '@duty-shooter/fps-core';
import { abs, color, float, fract, fwidth, max, min, mix, normalWorld, positionWorld, positionWorldDirection, select, smoothstep, uniform } from 'three/tsl';
import { Vector2 } from 'three/webgpu';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
  type WebGPURenderer,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { atlasUv, layoutSurfaces, LIGHTING, type BakeFile, type Decoration, type Finish, type FreightTrain, type Lighting, type Look, type MapModels, type SurfaceLayout } from './surfaces';
import { Train } from './train';
import { loadMapModels } from './map-models';
import { currentLighting, lightmapNode, lightmapTexture, ProbeField, probeLit, skyNode, surfaceMaterial, useLighting } from './surface-materials';
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
  /** The end-of-match nuke's ground zero and siren, if the map has one (see Nuke). */
  readonly nuke?: { readonly groundZero: Vec3; readonly siren: Vec3 } | null;
  /** The end-of-match freight train, if the map has one (see Train). */
  readonly train?: FreightTrain | null;
  /** The map's sun and sky (the afternoon if not given). */
  readonly lighting?: Lighting;
  /** The map's ambient sound sources (see Ambience). */
  readonly ambience?: readonly AmbientSource[];
}

export type ShadowQuality = 'low' | 'normal' | 'high';

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

/**
 * The static surfaces as one geometry per finish: each face a quad with its
 * normal, its own coordinates in metres (uv: along it horizontally and up it,
 * for the finish patterns) and its lightmap coordinates (uv1).
 */
function surfaceGeometries(layout: SurfaceLayout, solids: readonly Solid[]): Map<string, BufferGeometry> {
  const byFinish = new Map<string, number[]>();
  layout.faces.forEach((f, i) => {
    if (f.solid >= 0 && solids[f.solid]!.prop !== null) return;
    const list = byFinish.get(f.finish) ?? [];
    list.push(i);
    byFinish.set(f.finish, list);
  });
  const out = new Map<string, BufferGeometry>();
  for (const [finish, faces] of byFinish) {
    const position = new Float32Array(faces.length * 12);
    const normal = new Float32Array(faces.length * 12);
    const uv = new Float32Array(faces.length * 8);
    const uv1 = new Float32Array(faces.length * 8);
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
      });
      index.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(position, 3));
    g.setAttribute('normal', new BufferAttribute(normal, 3));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    g.setAttribute('uv1', new BufferAttribute(uv1, 2));
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
export class WorldView {
  readonly scene = new Scene();
  #sun: DirectionalLight;
  /** Where the realtime shadow map reaches: its centre (x, z) and the radius it fully covers (m). */
  readonly #shadowCentre = uniform(new Vector2(0, 0));
  readonly #shadowRadius = uniform(36);
  /** The baked light probes, for lighting moving objects. */
  readonly probes = new ProbeField();
  readonly #root = new Group();
  /** The end-of-match freight train, for a map that has one. */
  readonly train: Train | null = null;
  #csm: CSMShadowNode | null = null;
  #quality: ShadowQuality = 'normal';
  /** Props (mannequin heads), drawn on their own so a shot can knock one off. */
  readonly #props = new Map<string, Mesh>();
  /** Standard materials already switched to probe lighting. */
  readonly #lit = new WeakSet<object>();
  readonly #sign: PopulationSign | null = null;

  constructor(renderer: WebGPURenderer, content: WorldContent, bake: Promise<BakeFile | null> = Promise.resolve(null)) {
    const scene = this.scene;
    useLighting(content.lighting ?? LIGHTING);
    scene.backgroundNode = skyNode(positionWorldDirection as never);
    // Reflections only (metals, the viewmodel): the probes carry the ambient light.
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.2;

    this.#sun = this.#makeSun();
    this.follow([0, 0, 0]);

    const layout = layoutSurfaces(content.solids, { finishes: content.finishes, looks: content.looks, decorations: content.decorations, indoor: content.indoorZones, modelled: content.models?.placements.flatMap((p) => p.solids) ?? [] });
    const size = uniform(new Vector2(1, 1));
    const baked = { lightmap: lightmapNode(), size: size as never, ready: uniform(0), shadowCentre: this.#shadowCentre as never, shadowRadius: this.#shadowRadius as never };
    for (const [key, geometry] of surfaceGeometries(layout, content.solids)) {
      const mesh = new Mesh(geometry, surfaceMaterial(layout.finishes[key]!, baked));
      // Everything casts into the realtime shadow map: near the player it lights static surfaces more crisply than the bake, and it keeps the sun off soldiers indoors.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#root.add(mesh);
    }
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
    if (content.models) {
      void loadMapModels(content.models, layout.finishes).then(
        (group) => this.#root.add(group),
        (error: unknown) => console.error(`Map models failed to load: ${String(error)}`),
      );
    }
    if (content.train) this.train = new Train(this.#root, content.train, layout.finishes);
    void bake.then((file) => {
      if (!file) return;
      if (file.key !== layout.key) {
        console.warn(`Baked lighting is for another layout (${file.key}, not ${layout.key}); drawing without it.`);
        return;
      }
      (baked.lightmap as unknown as { value: unknown }).value = lightmapTexture(file);
      size.value.set(file.width, file.height);
      baked.ready.value = 1;
      this.probes.load(file);
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
    this.lightMoving();
    this.setShadowQuality('normal');
  }

  /** The sun: the scene's one directional light (rebuilt when the shadow quality changes). */
  get sun(): DirectionalLight {
    return this.#sun;
  }

  /** A fresh sun light in the scene. Three's lights divide by pi where the bake's light does not. */
  #makeSun(): DirectionalLight {
    const l = currentLighting();
    const sun = new DirectionalLight(new Color(...l.sunColor), l.sunIntensity * Math.PI);
    sun.castShadow = true;
    this.scene.add(sun, sun.target);
    return sun;
  }

  /** Shows the lobby's head count and this match's kills on the population sign, if the map has one. */
  setPopulation(population: number, kills: number): void {
    this.#sign?.show(population, kills);
  }

  /**
   * Switches every standard material in the scene not yet switched to probe
   * lighting. Called before each frame, so soldiers, decals and casings added
   * since are lit like the rest.
   */
  lightMoving(): void {
    this.scene.traverse((o) => {
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
      if (!(o instanceof Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as { map?: { dispose(): void } | null }).map?.dispose();
        m.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.#sun.shadow.map?.dispose();
  }

  /** Low: one small shadow map near the player. Normal: one larger map. High: three cascades. */
  setShadowQuality(quality: ShadowQuality): void {
    // Three builds a light's shadow once and keeps it, so a new quality needs a new light.
    if (quality !== this.#quality) {
      const old = this.#sun;
      old.shadow.map?.dispose();
      this.scene.remove(old, old.target);
      old.dispose();
      this.#sun = this.#makeSun();
    }
    this.#quality = quality;
    const shadow = this.#sun.shadow;
    const size = quality === 'low' ? 1024 : 2048;
    shadow.mapSize.set(size, size);
    shadow.bias = -0.0005;
    // About a texel and a half: walls and roofs cast too, so surfaces facing the sun must not shadow themselves.
    shadow.normalBias = quality === 'low' ? 0.08 : 0.06;
    const extent = quality === 'low' ? 28 : 45;
    const cam = shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = 220;
    cam.updateProjectionMatrix();
    shadow.map?.dispose();
    shadow.map = null;
    if (quality === 'high') {
      // The node takes the rendering camera and builds its cascades on its first
      // render; setting its camera here would skip that set-up.
      this.#csm = new CSMShadowNode(this.#sun, { cascades: 3, maxFar: 120, mode: 'practical', lightMargin: 60 });
      shadow.shadowNode = this.#csm;
      this.#shadowRadius.value = 100;
    } else {
      this.#csm = null;
      (shadow as { shadowNode?: unknown }).shadowNode = undefined;
      // Where the map covers the ground all round (its square reaches farther on the ground than across).
      this.#shadowRadius.value = extent * 0.9;
    }
    this.#texel = (2 * extent) / size;
  }

  /** One shadow-map texel (m), for the single-map presets. */
  #texel = 0.044;

  /**
   * Keeps the sun's shadow map around the player. Single-map presets move it
   * in whole texels across the light's view, so the shadows stay put on the
   * ground instead of crawling and jumping as the player walks.
   */
  follow(position: Vec3): void {
    this.#shadowCentre.value.set(position[0], position[2]);
    if (this.#csm) return;
    const d = currentLighting().sunDirection;
    // The light's view: x and y across it, z toward the sun (as lookAt builds it with +y up).
    const z = new Vector3(d[0], d[1], d[2]);
    const x = new Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    const p = new Vector3(position[0], 0, position[2]);
    const t = this.#texel;
    const at = x.multiplyScalar(Math.round(p.dot(x) / t) * t).add(y.multiplyScalar(Math.round(p.dot(y) / t) * t)).add(z.clone().multiplyScalar(p.dot(z)));
    this.#shadowCentre.value.set(at.x, at.z);
    this.#sun.target.position.copy(at);
    this.#sun.position.copy(at).addScaledVector(z, 100);
    this.#sun.target.updateMatrixWorld();
  }

  /** Re-fits the cascades after the camera's projection changes. */
  updateCascades(): void {
    // Before its first render the node has no camera or frustums yet.
    if (this.#csm?.camera) this.#csm.updateFrustums();
  }
}
