import type { BattleRoyaleState, Vec3, WeaponId } from '@duty-shooter/fps-core';
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type Camera, type MeshStandardMaterial, type Object3D, type Scene } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { dropPose } from './ui/supply-drop';
import { disposeAuthored } from './viewmodel/authored-m4a1';

/** The flare's smoke column: metres tall and wide, and how long it thins out once the crate is opened (s). */
const SMOKE_HEIGHT = 46;
const SMOKE_WIDTH = 4.5;
const SMOKE_FADE = 4;
/** How far the lid swings open (radians) and how long it takes (s). */
const LID_OPEN = 1.95;
const LID_TIME = 0.45;
/** The smoke thins out within this many metres of the eye, so standing at the crate doesn't put a red sheet over the view. */
const SMOKE_NEAR = 8;
const SMOKE_CLEAR = 30;

/** The glTF's baked textures on a standard node material. */
function nodeMaterial(m: MeshStandardMaterial): MeshStandardNodeMaterial {
  const out = new MeshStandardNodeMaterial({ color: m.color, roughness: m.roughness, metalness: m.metalness, map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap });
  out.name = m.name;
  m.dispose();
  return out;
}

/** A soft red plume, thick at the flare and thinning up the column, with billows the scroll carries upward. */
function smokeTexture(): CanvasTexture {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  // Billows: overlapping soft puffs, wrapped top to bottom so the scroll never shows a seam.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y = random() * h;
    const r = 14 + random() * 22;
    const x = w / 2 + (random() - 0.5) * 18;
    for (const dy of [-h, 0, h]) {
      const g = ctx.createRadialGradient(x, y + dy, 0, x, y + dy, r);
      g.addColorStop(0, 'rgba(235,70,52,0.42)');
      g.addColorStop(1, 'rgba(235,70,52,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y + dy - r, r * 2, r * 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** The fade up the column: full at the flare, gone at the top. */
function columnTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 256);
  const side = ctx.createLinearGradient(0, 0, 32, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 32, 256);
  return new CanvasTexture(canvas);
}

interface Crate {
  readonly root: Object3D;
  readonly crate: Object3D;
  readonly lid: Object3D | null;
  readonly chute: Object3D | null;
  readonly smoke: Mesh;
  /** Where the flare's tip stands, from the landing spot. */
  readonly tip: Vec3;
  /** performance.now() seconds when it was first seen opened. */
  openedAt: number | null;
}

/**
 * A Battle Royale's Supply Drops in the world (the Blender crate under its
 * canopy, coming down in its last seconds, its lid swinging open once taken,
 * and the red smoke of the flare that marks where it lands from the moment
 * it is called in) and the weapons lying on the ground.
 */
export class SupplyDropView {
  readonly #root = new Group();
  readonly #crates = new Map<number, Crate>();
  readonly #loose = new Map<number, Object3D>();
  readonly #gun: (id: WeaponId) => Object3D | null;
  readonly #smokeGeometry = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  readonly #smokeMaterial: MeshBasicNodeMaterial;
  #template: Object3D | null = null;
  #disposed = false;
  readonly loaded: Promise<void>;

  constructor(scene: Scene, gun: (id: WeaponId) => Object3D | null) {
    scene.add(this.#root);
    this.#gun = gun;
    const smoke = smokeTexture();
    smoke.repeat.set(1, 0.35);
    this.#smokeMaterial = new MeshBasicNodeMaterial({ map: smoke, alphaMap: columnTexture(), transparent: true, depthWrite: false, side: DoubleSide, fog: true });
    this.loaded = new GLTFLoader()
      .loadAsync(new URL('./viewmodel/assets/supply-drop.glb', import.meta.url).href)
      .then(({ scene: model }) => {
        if (this.#disposed) return disposeAuthored(model);
        model.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
          // The world lights moving things through node materials (WorldView.lightMoving): the glTF's own would draw black.
          if (o instanceof Mesh) o.material = nodeMaterial(o.material as MeshStandardMaterial);
        });
        this.#template = model;
      })
      .catch((error: unknown) => {
        console.warn('Unable to load the supply drop model:', error);
      });
  }

  /** Draws the crates and loose weapons of `state` (null: none) at simulation time `time`. */
  update(state: BattleRoyaleState | null, time: number, camera: Camera, dt: number): void {
    const now = performance.now() / 1000;
    const shown = new Set<number>();
    const map = this.#smokeMaterial.map;
    if (map) map.offset.y -= dt * 0.035;
    for (const d of state?.drops ?? []) {
      let c = this.#crates.get(d.stage);
      if (!c) {
        if (!this.#template) continue;
        c = this.#build();
        this.#crates.set(d.stage, c);
        this.#root.add(c.root);
      }
      shown.add(d.stage);
      c.root.position.set(d.position[0], d.position[1], d.position[2]);
      const pose = dropPose(d, time);
      c.crate.visible = pose.height !== null;
      c.crate.position.y = pose.height ?? 0;
      if (c.chute) {
        c.chute.visible = pose.chute > 0.01;
        // Folding: the canopy sinks and spreads as it falls onto the crate.
        c.chute.scale.set(1 + (1 - pose.chute) * 0.3, Math.max(0.02, pose.chute), 1 + (1 - pose.chute) * 0.3);
      }
      if (d.opened !== undefined && c.openedAt === null) c.openedAt = now;
      const open = c.openedAt === null ? 0 : Math.min(1, (now - c.openedAt) / LID_TIME);
      if (c.lid) c.lid.rotation.x = -LID_OPEN * (1 - (1 - open) ** 3);
      // The smoke stands from the call to the opening, then thins away.
      const fade = c.openedAt === null ? 1 : Math.max(0, 1 - (now - c.openedAt) / SMOKE_FADE);
      const wx = d.position[0] + c.tip[0];
      const wz = d.position[2] + c.tip[2];
      const far = Math.hypot(camera.position.x - wx, camera.position.z - wz);
      (c.smoke.material as MeshBasicNodeMaterial).opacity = fade * Math.max(0, Math.min(1, (far - SMOKE_NEAR) / (SMOKE_CLEAR - SMOKE_NEAR)));
      c.smoke.visible = (c.smoke.material as MeshBasicNodeMaterial).opacity > 0.01;
      c.smoke.scale.set(SMOKE_WIDTH * (1 + (1 - fade) * 0.6), SMOKE_HEIGHT * (0.4 + 0.6 * fade), 1);
      // Turned to face the camera about the upright.
      c.smoke.rotation.y = Math.atan2(camera.position.x - wx, camera.position.z - wz);
    }
    for (const [stage, c] of this.#crates) {
      if (shown.has(stage)) continue;
      c.root.removeFromParent();
      (c.smoke.material as MeshBasicNodeMaterial).dispose();
      this.#crates.delete(stage);
    }
    const lying = new Set<number>();
    for (const l of state?.loose ?? []) {
      let mesh = this.#loose.get(l.id);
      if (!mesh) {
        const made = this.#gun(l.weapon);
        if (!made) continue;
        mesh = made;
        // On its side, turned by its number so a pile doesn't line up.
        mesh.rotation.set(0, (l.id * 2.39996) % (Math.PI * 2), Math.PI / 2, 'YXZ');
        this.#loose.set(l.id, mesh);
        this.#root.add(mesh);
      }
      lying.add(l.id);
      mesh.position.set(l.position[0], l.position[1] + 0.05, l.position[2]);
    }
    for (const [id, mesh] of this.#loose) {
      if (lying.has(id)) continue;
      mesh.removeFromParent();
      this.#loose.delete(id);
    }
  }

  #build(): Crate {
    const model = (this.#template as Object3D).clone();
    const root = new Group();
    const crate = new Group();
    root.add(crate);
    const flare = model.getObjectByName('flare');
    const tip: Vec3 = flare ? [flare.position.x, flare.position.y, flare.position.z] : [1, 0.3, 0];
    for (const child of [...model.children]) (child === flare ? root : crate).add(child);
    // Its own copy of the material, so each column thins by its own distance.
    const smoke = new Mesh(this.#smokeGeometry, this.#smokeMaterial.clone());
    smoke.position.set(tip[0], tip[1], tip[2]);
    smoke.renderOrder = 3;
    smoke.frustumCulled = false;
    root.add(smoke);
    return { root, crate, lid: crate.getObjectByName('lid') ?? null, chute: crate.getObjectByName('chute') ?? null, smoke, tip, openedAt: null };
  }

  dispose(): void {
    this.#disposed = true;
    this.#root.removeFromParent();
    this.#smokeGeometry.dispose();
    this.#smokeMaterial.map?.dispose();
    this.#smokeMaterial.alphaMap?.dispose();
    this.#smokeMaterial.dispose();
    if (this.#template) disposeAuthored(this.#template);
  }
}
