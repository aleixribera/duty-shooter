import type { OpticId, WeaponId } from '@duty-shooter/fps-core';
import { Color, Matrix4, MeshStandardMaterial, Object3D, Vector3, type Material, type Mesh, type Quaternion } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The rail optics in first person (ticket 19): the Reflex and the Prism 2x,
 * Blender models (tools/weapon/optics.py) with their origin on the rail's top
 * face under the clamp. A gun that takes an optic carries it at its mount, its
 * iron sights fold away, and aiming puts the optic's axis on the camera's.
 */

type V3 = readonly [number, number, number];

export interface OpticSpec {
  readonly url: string;
  /** The sight axis's height above the rail (m); REFLEX_AXIS_Z / PRISM_AXIS_Z in optics.py. */
  readonly axis: number;
  /** The rear rim, behind the mount (m, gun +Z); -REFLEX_REAR / -PRISM_REAR in optics.py. */
  readonly rear: number;
  /** How far behind the rear rim the eye sits when aimed (m): a reflex's window fills about a third of the view, a prism's eyepiece most of it. */
  readonly eyeRelief: number;
}

export const OPTICS: Readonly<Record<OpticId, OpticSpec>> = {
  reflex: { url: new URL('./assets/reflex.glb', import.meta.url).href, axis: 0.032, rear: 0.006, eyeRelief: 0.07 },
  prism: { url: new URL('./assets/prism.glb', import.meta.url).href, axis: 0.032, rear: 0.0345, eyeRelief: 0.035 },
};

/** Where a gun carries each optic: the rail's top under the clamp's middle, in gun space; `on` is the moving part whose rail it is. */
export interface OpticMount {
  readonly reflex: V3;
  readonly prism: V3;
  readonly on?: string;
}

/**
 * Measured from each gun's rail (tools/weapon/*.py, m4a1.ts's picatinny): forward of the folded rear sight, clear of the moving parts.
 * The Breacher has no rail yet: its optic clamps to the receiver's flat top (its bead stays, below the sight line).
 */
export const OPTIC_MOUNTS: Readonly<Partial<Record<WeaponId, OpticMount>>> = {
  m4a1: { reflex: [0, 0.03, -0.07], prism: [0, 0.03, -0.085] },
  smg: { reflex: [0, 0.0433, 0], prism: [0, 0.0433, -0.005] },
  shotgun: { reflex: [0, 0.04, -0.07], prism: [0, 0.04, -0.075] },
  // The feed cover's rail: the optic lifts with the cover in a reload.
  lmg: { reflex: [0, 0.0793, -0.01], prism: [0, 0.0793, -0.01], on: 'cover' },
  burst: { reflex: [0, 0.0653, 0.07], prism: [0, 0.0653, 0.06] },
};

/** Nodes that are the iron sights, hidden while an optic is on: a kit gun's `irons` part, the M4A1's front post. */
export const IRON_NODES: readonly string[] = ['irons', 'frontSightPost'];

/** The aim point: the optic's axis at its rear rim, in gun space, for `optic` on the mount `at`. */
export function opticSight(optic: OpticId, at: V3, target = new Vector3()): Vector3 {
  const spec = OPTICS[optic];
  return target.set(at[0], at[1] + spec.axis, at[2] + spec.rear);
}

const templates = new Map<OpticId, Promise<Object3D | null>>();

/** The glass reads as clear tinted glass and the reticle glows; both stay out of the baked texture's dark lens finish. */
function dress(scene: Object3D): void {
  const swap = new Map<Material, Material>();
  scene.traverse((o) => {
    o.frustumCulled = false;
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const old = mesh.material as Material;
    // Blender's exporter may suffix a finish's name (`lens.001`).
    const finish = old.name.replace(/\.\d+$/, '');
    let next = swap.get(old);
    if (!next) {
      if (finish === 'lens') {
        next = new MeshStandardMaterial({ color: new Color(0.55, 0.75, 0.8), roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false });
      } else if (finish === 'red_insert') {
        next = new MeshStandardMaterial({ color: new Color(0, 0, 0), emissive: new Color(1, 0.06, 0.03), emissiveIntensity: 3, roughness: 1, metalness: 0 });
      } else {
        next = old;
      }
      next.name = old.name;
      swap.set(old, next);
      if (next !== old) old.dispose();
    }
    mesh.material = next;
    // The glass draws after the reticle behind it and the world beyond.
    if (finish === 'lens') mesh.renderOrder = 1;
  });
}

/** The optic's model, loaded once; each gun that carries it takes a clone (sharing geometry and materials). */
export function opticTemplate(optic: OpticId): Promise<Object3D | null> {
  let t = templates.get(optic);
  if (!t) {
    t = new GLTFLoader().loadAsync(OPTICS[optic].url).then(({ scene }) => {
      dress(scene);
      return scene as Object3D;
    }).catch((error: unknown) => {
      console.warn(`Unable to load the ${optic} model:`, error);
      return null;
    });
    templates.set(optic, t);
  }
  return t;
}

/**
 * Puts a clone of `template` on `gun` at `mount`. On a moving part (`mount.on`, found in `gun`), it goes
 * into that part's space at rest, so it follows the part. Returns the node; remove it from its parent to take
 * the optic off.
 */
export function mountOptic(gun: Object3D, template: Object3D, optic: OpticId, mount: OpticMount, rest?: { readonly position: Vector3; readonly quaternion: Quaternion } | null): Object3D {
  const node = template.clone();
  node.name = `optic:${optic}`;
  const at = mount[optic];
  const pos = new Vector3(at[0], at[1], at[2]);
  const part = mount.on ? gun.getObjectByName(mount.on) : null;
  if (part && rest) {
    // The part's own transform at rest, under the gun root (the GLB's scene sits at identity).
    const inv = new Matrix4().compose(rest.position, rest.quaternion, new Vector3(1, 1, 1)).invert();
    pos.applyMatrix4(inv);
    node.quaternion.copy(rest.quaternion).invert();
    part.add(node);
  } else {
    gun.add(node);
  }
  node.position.copy(pos);
  return node;
}
