import { TICK_SECONDS, viewDirection, type GrenadeOutput, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, SRGBColorSpace, type Camera, type Object3D, type Scene } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeAuthored } from './viewmodel/authored-m4a1';

/** A scope glints only for viewers further than this (m)… */
const GLINT_MIN_DISTANCE = 20;
/** …and inside its view cone (radians off its aim). */
const GLINT_CONE = 0.35;
/** Aimed at least this far before the glint shows. */
const GLINT_ADS = 0.6;

function glintTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,250,1)');
  g.addColorStop(0.15, 'rgba(255,245,215,0.9)');
  g.addColorStop(0.5, 'rgba(255,220,160,0.18)');
  g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // A thin horizontal streak, like light caught in a lens.
  ctx.fillStyle = 'rgba(255,250,235,0.7)';
  ctx.fillRect(0, size / 2 - 1, size, 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The arsenal in the world: thrown frags (the Blender model, spinning in
 * flight) and the glint of a sniper scope aimed toward the viewer.
 */
export class ArsenalView {
  readonly #root = new Group();
  readonly #frags = new Map<number, Object3D>();
  readonly #glints = new Map<string, Mesh>();
  readonly #glintGeometry = new PlaneGeometry(1, 1);
  readonly #glintMaterial: MeshBasicNodeMaterial;
  #template: Object3D | null = null;
  #disposed = false;

  constructor(scene: Scene) {
    scene.add(this.#root);
    this.#glintMaterial = new MeshBasicNodeMaterial({ map: glintTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending });
    void new GLTFLoader().loadAsync(new URL('./viewmodel/assets/frag.glb', import.meta.url).href).then(({ scene: model }) => {
      if (this.#disposed) return disposeAuthored(model);
      this.#template = model;
    }).catch((error: unknown) => {
      console.warn('Unable to load the frag model:', error);
    });
  }

  /** Draws the live grenades `alpha` of a tick past the latest one. */
  grenades(list: readonly GrenadeOutput[], alpha: number): void {
    const live = new Set<number>();
    for (const g of list) {
      live.add(g.id);
      let mesh = this.#frags.get(g.id);
      if (!mesh) {
        if (!this.#template) continue;
        mesh = this.#template.clone();
        mesh.traverse((o) => {
          o.castShadow = true;
        });
        this.#frags.set(g.id, mesh);
        this.#root.add(mesh);
      }
      const t = g.resting ? 0 : alpha * TICK_SECONDS;
      mesh.position.set(g.position[0] + g.velocity[0] * t, g.position[1] + g.velocity[1] * t + 0.035, g.position[2] + g.velocity[2] * t);
      // Tumbling in flight, lying on its side at rest.
      const speed = Math.hypot(g.velocity[0], g.velocity[1], g.velocity[2]);
      if (g.resting) mesh.rotation.set(Math.PI / 2, mesh.rotation.y, 0);
      else mesh.rotation.set(mesh.rotation.x + speed * 0.02, mesh.rotation.y + speed * 0.01, 0);
    }
    for (const [id, mesh] of this.#frags) {
      if (live.has(id)) continue;
      mesh.removeFromParent();
      this.#frags.delete(id);
    }
  }

  /** Scope glints of the players in `others` aiming a sniper toward `eye`, facing `camera`. */
  glints(others: readonly PlayerOutput[], eye: Vec3, camera: Camera): void {
    const shown = new Set<string>();
    for (const p of others) {
      if (!p.alive || p.weapon.id !== 'sniper' || p.weapon.ads < GLINT_ADS) continue;
      const from: Vec3 = [p.position[0], p.position[1] + p.eyeHeight, p.position[2]];
      const to: Vec3 = [eye[0] - from[0], eye[1] - from[1], eye[2] - from[2]];
      const distance = Math.hypot(to[0], to[1], to[2]);
      if (distance < GLINT_MIN_DISTANCE) continue;
      const aim = viewDirection(p.yaw, p.pitch);
      const cos = (aim[0] * to[0] + aim[1] * to[1] + aim[2] * to[2]) / distance;
      if (cos < Math.cos(GLINT_CONE)) continue;
      shown.add(p.id);
      let mesh = this.#glints.get(p.id);
      if (!mesh) {
        mesh = new Mesh(this.#glintGeometry, this.#glintMaterial);
        mesh.renderOrder = 4;
        this.#glints.set(p.id, mesh);
        this.#root.add(mesh);
      }
      // Brightest when the scope looks straight at the viewer; a constant size on screen.
      const on = (cos - Math.cos(GLINT_CONE)) / (1 - Math.cos(GLINT_CONE));
      mesh.position.set(from[0] + aim[0] * 0.25, from[1] + aim[1] * 0.25, from[2] + aim[2] * 0.25);
      mesh.quaternion.copy(camera.quaternion);
      mesh.scale.setScalar(distance * 0.012 * (0.6 + 0.6 * on) * (0.9 + 0.1 * Math.sin(performance.now() / 70)));
    }
    for (const [id, mesh] of this.#glints) {
      if (shown.has(id)) continue;
      mesh.removeFromParent();
      this.#glints.delete(id);
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#root.removeFromParent();
    if (this.#template) disposeAuthored(this.#template);
    this.#glintGeometry.dispose();
    this.#glintMaterial.map?.dispose();
    this.#glintMaterial.dispose();
  }
}
