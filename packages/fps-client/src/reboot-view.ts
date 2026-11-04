import type { BattleRoyaleState } from '@duty-shooter/fps-core';
import { AdditiveBlending, Color, CylinderGeometry, Group, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, type MeshStandardMaterial, type Object3D, type Scene } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { nodeMaterial } from './supply-drop-view';
import { disposeAuthored } from './viewmodel/authored-m4a1';
import { beaconLook } from './ui/reboot';

/** The Card as it lies: this much bigger than the model, floating this high (m), turning this fast (rad/s). */
const CARD_SCALE = 3;
const CARD_HEIGHT = 0.9;
const CARD_TURN = 1.6;
/** The column of light over a Beacon rebooting: metres tall and across. */
const BEAM_HEIGHT = 60;
const BEAM_WIDTH = 0.7;

interface BeaconModel {
  readonly root: Object3D;
  readonly head: Object3D | null;
  readonly lamp: MeshStandardNodeMaterial;
  readonly beam: Mesh;
}

/**
 * A Battle Royale's Reboot in the world: the Blender Beacons where the map
 * keeps them, their light bands lit by their state (ready, rebooting, resting,
 * or dark once Reboot has closed), their head turning and a column of light
 * over them while they reboot, and the Cards lying on the island, turning in
 * the air where their seats went out.
 */
export class RebootView {
  readonly #root = new Group();
  readonly #beacons: BeaconModel[] = [];
  readonly #cards = new Map<string, Object3D>();
  readonly #beamGeometry = new CylinderGeometry(0.5, 0.5, 1, 12, 1, true).translate(0, 0.5, 0);
  #beacon: Object3D | null = null;
  #card: Object3D | null = null;
  #disposed = false;
  readonly loaded: Promise<void>;

  constructor(scene: Scene) {
    scene.add(this.#root);
    this.loaded = new GLTFLoader()
      .loadAsync(new URL('./viewmodel/assets/reboot-beacon.glb', import.meta.url).href)
      .then(({ scene: model }) => {
        if (this.#disposed) return disposeAuthored(model);
        model.traverse((o) => {
          o.castShadow = true;
          o.receiveShadow = true;
          // The world lights moving things through node materials (WorldView.lightMoving): the glTF's own would draw black.
          if (o instanceof Mesh) o.material = nodeMaterial(o.material as MeshStandardMaterial);
        });
        const card = model.getObjectByName('card');
        if (card) {
          card.removeFromParent();
          card.position.set(0, 0, 0);
          this.#card = card;
        }
        this.#beacon = model;
      })
      .catch((error: unknown) => {
        console.warn('Unable to load the Reboot Beacon model:', error);
      });
  }

  /** Draws the Beacons and Cards of `state` (null: none) at simulation time `time`. */
  update(state: BattleRoyaleState | null, time: number, dt: number): void {
    const now = performance.now() / 1000;
    const beacons = state?.beacons ?? [];
    if (this.#beacon && this.#beacons.length < beacons.length) {
      for (const b of beacons.slice(this.#beacons.length)) {
        const model = this.#build();
        model.root.position.set(b.position[0], b.position[1], b.position[2]);
        this.#beacons.push(model);
        this.#root.add(model.root);
      }
    }
    for (const [i, m] of this.#beacons.entries()) {
      const b = beacons[i];
      const look = beaconLook(b ?? null, time, now);
      m.lamp.emissive.set(look.colour).multiplyScalar(look.glow);
      m.beam.visible = look.beam > 0;
      (m.beam.material as MeshBasicNodeMaterial).opacity = look.beam;
      if (m.head && look.turn) m.head.rotation.y += dt * 2.4;
    }
    const lying = new Set<string>();
    for (const c of state?.cards ?? []) {
      if (!c.position || !this.#card) continue;
      let mesh = this.#cards.get(c.owner);
      if (!mesh) {
        mesh = this.#card.clone();
        mesh.scale.setScalar(CARD_SCALE);
        this.#cards.set(c.owner, mesh);
        this.#root.add(mesh);
      }
      lying.add(c.owner);
      mesh.position.set(c.position[0], c.position[1] + CARD_HEIGHT + Math.sin(now * 2) * 0.08, c.position[2]);
      mesh.rotation.y = now * CARD_TURN;
    }
    for (const [owner, mesh] of this.#cards) {
      if (lying.has(owner)) continue;
      mesh.removeFromParent();
      this.#cards.delete(owner);
    }
  }

  #build(): BeaconModel {
    const root = (this.#beacon as Object3D).clone();
    const lampMesh = root.getObjectByName('lamp');
    // Its own lamp material, lit by its own state.
    const lamp = new MeshStandardNodeMaterial({ color: new Color(0.6, 0.6, 0.6), roughness: 0.4, metalness: 0 });
    lampMesh?.traverse((o) => {
      if (o instanceof Mesh) o.material = lamp;
    });
    const beam = new Mesh(this.#beamGeometry, new MeshBasicNodeMaterial({ color: new Color('#8fe3c8'), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }));
    beam.scale.set(BEAM_WIDTH, BEAM_HEIGHT, BEAM_WIDTH);
    beam.position.y = 2.6;
    beam.visible = false;
    beam.frustumCulled = false;
    root.add(beam);
    return { root, head: root.getObjectByName('head') ?? null, lamp, beam };
  }

  dispose(): void {
    this.#disposed = true;
    this.#root.removeFromParent();
    for (const m of this.#beacons) {
      m.lamp.dispose();
      (m.beam.material as MeshBasicNodeMaterial).dispose();
    }
    this.#beamGeometry.dispose();
    if (this.#beacon) disposeAuthored(this.#beacon);
    if (this.#card) disposeAuthored(this.#card);
  }
}
