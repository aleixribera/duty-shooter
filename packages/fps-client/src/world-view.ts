import type { Box, Material, Vec3 } from '@duty-shooter/fps-core';
import { abs, color, float, fract, fwidth, max, min, mix, normalWorld, positionWorld, screenUV, select, smoothstep } from 'three/tsl';
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  SRGBColorSpace,
  type WebGPURenderer,
} from 'three/webgpu';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import type { PerspectiveCamera } from 'three/webgpu';

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
  readonly boxes: readonly Box[];
  readonly ramps?: readonly RampShape[];
  readonly labels?: readonly WorldLabel[];
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

function boxGeometry(b: Box): BufferGeometry {
  const g = new BoxGeometry(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
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
 * The static world: merged grid-lined meshes per material, ramps, signs, a
 * sky, image-based lighting and a sun with shadows scaled by preset.
 */
export class WorldView {
  readonly scene = new Scene();
  readonly sun: DirectionalLight;
  readonly #root = new Group();
  #csm: CSMShadowNode | null = null;
  #quality: ShadowQuality = 'normal';

  constructor(renderer: WebGPURenderer, content: WorldContent) {
    const scene = this.scene;
    scene.backgroundNode = mix(color(0xc9d3dc), color(0x5d7fa3), smoothstep(float(0.2), float(1.0), screenUV.y.oneMinus()));
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    scene.add(new HemisphereLight(0xdfe8f2, 0x5a5650, 0.9));
    this.sun = new DirectionalLight(0xfff1dc, 2.6);
    this.sun.position.set(-40, 80, 30);
    this.sun.castShadow = true;
    scene.add(this.sun, this.sun.target);

    const byMaterial = new Map<Material, BufferGeometry[]>();
    const push = (material: Material, g: BufferGeometry) => {
      const list = byMaterial.get(material) ?? [];
      list.push(g.index ? g.toNonIndexed() : g);
      byMaterial.set(material, list);
    };
    for (const b of content.boxes) push(b.material, boxGeometry(b));
    for (const r of content.ramps ?? []) push(r.material, rampGeometry(r));
    for (const [material, geometries] of byMaterial) {
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      for (const g of geometries) g.dispose();
      const mesh = new Mesh(merged, gridMaterial(material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.#root.add(mesh);
    }
    for (const label of content.labels ?? []) this.#root.add(labelMesh(label));
    scene.add(this.#root);
    this.setShadowQuality('normal');
  }

  /** Low: one small shadow map near the player. Normal: one larger map. High: three cascades. */
  setShadowQuality(quality: ShadowQuality): void {
    this.#quality = quality;
    const shadow = this.sun.shadow;
    const size = quality === 'low' ? 1024 : 2048;
    shadow.mapSize.set(size, size);
    shadow.bias = -0.0004;
    shadow.normalBias = 0.02;
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
      this.#csm = new CSMShadowNode(this.sun, { cascades: 3, maxFar: 120, mode: 'practical', lightMargin: 60 });
      shadow.shadowNode = this.#csm;
    } else {
      this.#csm = null;
      (shadow as { shadowNode?: unknown }).shadowNode = undefined;
    }
  }

  /** Keeps the sun's shadow frustum around the player (single-map presets). */
  follow(position: Vec3): void {
    if (this.#csm) return;
    const snap = this.#quality === 'low' ? 2 : 4;
    const x = Math.round(position[0] / snap) * snap;
    const z = Math.round(position[2] / snap) * snap;
    this.sun.position.set(x - 40, 80, z + 30);
    this.sun.target.position.set(x, 0, z);
  }

  /** Re-fits the cascades after the camera's projection changes. */
  updateCascades(): void {
    // Before its first render the node has no camera or frustums yet.
    if (this.#csm?.camera) this.#csm.updateFrustums();
  }
}
