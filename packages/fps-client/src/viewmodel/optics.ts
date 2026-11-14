import type { OpticId, WeaponId } from '@duty-shooter/fps-core';
import { CircleGeometry, Color, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NoBlending, Object3D, Vector3, type Material, type Quaternion } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { reticleOf, RETICLE_SHAPES, type ReticleColour, type Reticles } from '../customize';

/**
 * The rail optics in first person (ticket 19): the Reflex and the Prism 2x,
 * Blender models (tools/weapon/optics.py) with their origin on the rail's top
 * face under the clamp. A gun that takes an optic carries it at its mount, its
 * iron sights fold away, and aiming puts the optic's axis on the camera's.
 */

export type V3 = readonly [number, number, number];

export interface OpticSpec {
  readonly url: string;
  /** The sight axis's height above the rail (m); REFLEX_AXIS_Z / PRISM_AXIS_Z in optics.py. */
  readonly axis: number;
  /** The rear rim, behind the mount (m, gun +Z); -REFLEX_REAR / -PRISM_REAR in optics.py. */
  readonly rear: number;
  /** How far behind the rear rim the eye sits when aimed (m): a reflex's window fills about a third of the view, a prism's eyepiece most of it. */
  readonly eyeRelief: number;
  /** A magnified optic's sight window (`sightWindow`): just in front of its reticle, the bore's width there. */
  readonly window?: SightWindowSpec;
}

/** Where a sight window stands: its centre in the optic's (or gun's) space, and its radius (m). */
export interface SightWindowSpec {
  readonly at: V3;
  readonly radius: number;
}

export const OPTICS: Readonly<Record<OpticId, OpticSpec>> = {
  reflex: { url: new URL('./assets/reflex.glb', import.meta.url).href, axis: 0.032, rear: 0.006, eyeRelief: 0.07 },
  // The reticle's plane is in the eyepiece just past the eyecup (RY -0.0285 in optics.py), the window 0.6 mm beyond it;
  // the bore there is BORE (0.0135), the window a hair wider so its rim hides in the wall. So near the eye, the clear
  // picture fills the eyepiece instead of a small circle down a dark tube (review 2026-11-14b, the Prism tunnel).
  prism: { url: new URL('./assets/prism.glb', import.meta.url).href, axis: 0.032, rear: 0.0345, eyeRelief: 0.038, window: { at: [0, 0.032, 0.0279], radius: 0.0137 } },
};

/** The Vantage's own optic (dmr.py): its reticle at the tube's middle (y -0.009, so gun z 0.009) on the axis at OPTIC_Z, in a bore of OPTIC_R. */
export const VANTAGE_WINDOW: SightWindowSpec = { at: [0, 0.0892, 0.0084], radius: 0.0213 };

/** The name of a sight window's mesh. */
export const SIGHT_WINDOW = 'sight_window';

/**
 * Clears the first-person picture to the world where it is drawn: a disc writing nothing but a clear pixel, at full
 * depth so whatever of the gun lies beyond it is hidden. The viewmodel's pass is laid over the world by its alpha
 * (`pipeline.ts`), so the disc shows the magnified world alone (PLAN item 6, review 2026-11-14a: the gun's own front
 * post, barrel and the far end of the tube sat in the sight picture, and the reticle's post ran past the glass onto the
 * tube). The Loadout screen's stage, with no world behind it, hides it (`gun-stage.ts`). Your own muzzle flash, out at
 * the muzzle, is hidden inside the sight with the rest of the gun, so it never covers the target.
 *
 * Put on `parent` at `spec`, facing down the bore (gun -Z), with its own material so a gun let go disposes it alone.
 */
export function addSightWindow(parent: Object3D, spec: SightWindowSpec): Mesh {
  const material = new MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: false, blending: NoBlending, side: DoubleSide, depthWrite: true });
  material.name = SIGHT_WINDOW;
  const disc = new Mesh(new CircleGeometry(spec.radius, 48), material);
  disc.name = SIGHT_WINDOW;
  disc.position.set(...spec.at);
  disc.frustumCulled = false;
  disc.castShadow = false;
  disc.receiveShadow = false;
  parent.add(disc);
  return disc;
}

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

/**
 * The reticle's glow in each colour a player may pick (PLAN item 7). The red is pure and moderate: brighter, the film
 * curve washes it to salmon, which vanishes on the orange targets; the others are held as saturated.
 */
const RETICLE_GLOW: { readonly [C in ReticleColour]: readonly [number, number, number] } = {
  red: [1, 0, 0.004],
  green: [0.08, 1, 0.04],
  amber: [1, 0.4, 0],
  cyan: [0, 0.75, 1],
  white: [0.85, 0.85, 0.85],
};
const glowRed = () => new MeshStandardMaterial({ color: new Color(0, 0, 0), emissive: new Color(...RETICLE_GLOW.red), emissiveIntensity: 1.4, roughness: 1, metalness: 0 });

/** Each optic's reticle glow (shared by every copy of it) and the copies on guns now, which take a new look at once. */
const glows = new Map<OpticId, MeshStandardMaterial[]>();
const mounted = new Set<Object3D>();
let reticles: Reticles = {};

/** Shows the picked reticle of `optic` in `node` (its template or a copy on a gun), the others hidden. */
function showReticle(node: Object3D, optic: OpticId): void {
  const look = reticleOf(reticles, optic);
  for (const shape of RETICLE_SHAPES) {
    const o = node.getObjectByName(`reticle_${shape}`);
    if (o) o.visible = shape === look.shape;
  }
}

/** Sets every optic's reticle colour and shape, on the templates and on every gun that carries one now. */
export function setReticles(next: Reticles): void {
  reticles = next;
  for (const [optic, list] of glows) for (const m of list) m.emissive.setRGB(...RETICLE_GLOW[reticleOf(reticles, optic).colour]);
  for (const node of mounted) {
    if (!node.parent) {
      mounted.delete(node);
      continue;
    }
    showReticle(node, node.userData['optic'] as OpticId);
  }
  for (const [optic, t] of templates) void t.then((template) => template && showReticle(template, optic));
}

/**
 * A gun with its optic built in (the Vantage): its `red_insert` reticle glows as a
 * rail optic's does. Lit by the scene, it sat black in the dark tube and vanished
 * on a target in shade (ticket 112).
 */
export function glowBuiltInReticle(scene: Object3D): void {
  let glow: Material | null = null;
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const old = mesh.material as Material;
    if (Array.isArray(old) || old.name.replace(/\.\d+$/, '') !== 'red_insert') return;
    glow ??= Object.assign(glowRed(), { name: old.name });
    mesh.material = glow;
    old.dispose();
  });
}

/** The glass reads as clear tinted glass and the reticle glows; both stay out of the baked texture's dark lens finish. */
function dress(scene: Object3D, optic: OpticId): void {
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
        const glow = glowRed();
        glow.emissive.setRGB(...RETICLE_GLOW[reticleOf(reticles, optic).colour]);
        glows.set(optic, [...(glows.get(optic) ?? []), glow]);
        next = glow;
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
      dress(scene, optic);
      showReticle(scene, optic);
      const sight = OPTICS[optic].window;
      if (sight) addSightWindow(scene, sight);
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
  node.userData['optic'] = optic;
  showReticle(node, optic);
  mounted.add(node);
  return mountAt(gun, node, mount[optic], mount.on, rest);
}

/**
 * Puts `node` on `gun` at `at` (gun space). On a moving part (`on`, found in `gun`), it goes into that part's
 * space at rest (`rest`), so it follows the part.
 */
export function mountAt(gun: Object3D, node: Object3D, at: V3, on?: string, rest?: { readonly position: Vector3; readonly quaternion: Quaternion } | null): Object3D {
  const pos = new Vector3(at[0], at[1], at[2]);
  const part = on ? gun.getObjectByName(on) : null;
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
