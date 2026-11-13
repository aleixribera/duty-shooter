import type { WeaponId } from '@duty-shooter/fps-core';
import { Group, Object3D, Quaternion, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeAuthored } from './authored-m4a1';
import { palmFrame } from './m4a1';

/**
 * The v2 weapons for the first-person view: Blender models
 * (tools/weapon/: pistol.py, smg.py, shotgun.py, sniper.py, lmg.py, dmr.py, burst.py, revolver.py, frag.py) in the M4A1's gun space (metres, +Y up, muzzle
 * along -Z, right palm near the origin), plus the numbers the viewmodel needs
 * to hold, aim and animate each one. Moving parts are separate nodes in the
 * GLB with their pivots as origins.
 */

export type KitId = Exclude<WeaponId, 'm4a1'>;

type V3 = readonly [number, number, number];

/** A palm placement (see palmFrame): where it sits, the way it faces, and toward the wrist. */
interface Palm {
  readonly pos: V3;
  readonly normal: V3;
  readonly wrist: V3;
}

export interface KitRig {
  readonly url: string;
  readonly right: Palm;
  /** The support hand at rest; on the shotgun it rides the pump. */
  readonly left: Palm;
  readonly leftOnPump?: boolean;
  /** The sight line's rear point: aiming puts it on the camera axis, `eyeRelief` in front of the eye. */
  readonly rearSight: V3;
  readonly eyeRelief: number;
  readonly muzzle: V3;
  readonly ejectionPort: V3;
  /** Where the support hand grabs the magazine, in the magazine's own space, or loads a shell, in gun space. */
  readonly magGrab?: V3;
  readonly loadingPort?: V3;
  /** Where the gun sits at hipfire (view space). */
  readonly hip: V3;
  /** Slide, pump and bolt travel (m) toward the shooter. */
  readonly travel?: number;
  /** How hard a shot kicks the gun in the hands, against the M4A1's 1. */
  readonly kick: number;
  /** How long the slide, bolt or cylinder takes to run after a shot (s); the M4A1's bolt time when absent. */
  readonly cycle?: number;
  /** A second place the support hand goes in a reload, in gun space with everything shut: a feed cover's edge or a cylinder's side, which it then follows. */
  readonly reach?: Palm;
  /** The support hand on a charging handle it works itself, in gun space with the handle home, and how far it draws it (m). */
  readonly rack?: Palm;
  readonly chargeTravel?: number;
  /** The support hand on a speedloader it brings in: the palm from the loader's origin and the way it faces, both in gun space. */
  readonly carry?: Palm;
}

const asset = (name: string) => new URL(`./assets/${name}.glb`, import.meta.url).href;

/** Measured from the generators in tools/weapon (Blender x, y, z is gun x, z, -y). */
export const KIT_RIGS: Readonly<Record<KitId, KitRig>> = {
  smg: {
    url: asset('smg'),
    right: { pos: [0.019, -0.07, -0.006], normal: [-1, 0, 0], wrist: [0.15, -0.3, 0.94] },
    left: { pos: [-0.012, -0.03, -0.15], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    rearSight: [0, 0.06, 0.045],
    eyeRelief: 0.2,
    muzzle: [0, 0.012, -0.252],
    ejectionPort: [0.016, 0.017, -0.063],
    magGrab: [-0.014, -0.1, 0.024],
    hip: [0.12, -0.14, -0.4],
    travel: 0.025,
    kick: 0.7,
  },
  pistol: {
    url: asset('pistol'),
    right: { pos: [0.016, -0.06, 0.016], normal: [-1, 0, 0], wrist: [0.1, -0.45, 0.89] },
    // Two hands: the support palm wraps the left of the grip over the shooting hand's fingers.
    left: { pos: [-0.019, -0.07, 0.004], normal: [1, 0, 0], wrist: [-0.3, -0.5, 0.8] },
    rearSight: [0, 0.039, 0.045],
    // Aimed at near arm's length, as shooters push a handgun's sight plane out: the slide and hands take a narrow
    // column under the post rather than the lower middle of the view.
    eyeRelief: 0.46,
    muzzle: [0, 0.016, -0.14],
    ejectionPort: [0.013, 0.024, -0.03],
    magGrab: [-0.012, -0.095, 0],
    // Low and right of the crosshair, so the hip view keeps the middle of the screen.
    hip: [0.115, -0.14, -0.45],
    travel: 0.035,
    kick: 0.8,
  },
  shotgun: {
    url: asset('shotgun'),
    right: { pos: [0.021, -0.05, 0.06], normal: [-1, 0, 0], wrist: [0.1, -0.5, 0.86] },
    left: { pos: [-0.006, -0.031, -0.36], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    leftOnPump: true,
    rearSight: [0, 0.049, 0.03],
    eyeRelief: 0.2,
    muzzle: [0, 0.022, -0.67],
    ejectionPort: [0.0175, 0.021, -0.065],
    loadingPort: [0, -0.028, -0.085],
    hip: [0.13, -0.15, -0.43],
    travel: 0.09,
    kick: 2.2,
  },
  sniper: {
    url: asset('sniper'),
    right: { pos: [0.023, -0.068, 0.05], normal: [-1, 0, 0], wrist: [0.15, -0.25, 0.95] },
    left: { pos: [-0.006, -0.0395, -0.25], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    rearSight: [0, 0.072, 0.111],
    eyeRelief: 0.09,
    muzzle: [0, 0.012, -0.8],
    ejectionPort: [0.016, 0.024, -0.035],
    magGrab: [-0.016, -0.025, 0],
    hip: [0.13, -0.15, -0.43],
    travel: 0.075,
    kick: 2.6,
  },
  lmg: {
    url: asset('lmg'),
    right: { pos: [0.02, -0.07, -0.004], normal: [-1, 0, 0], wrist: [0.15, -0.3, 0.94] },
    left: { pos: [-0.006, -0.0305, -0.3], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    rearSight: [0, 0.094, 0.095],
    eyeRelief: 0.2,
    muzzle: [0, 0.03, -0.66],
    ejectionPort: [0.026, 0.02, -0.085],
    // Under the ammo box, from its left.
    magGrab: [-0.04, -0.075, 0],
    hip: [0.14, -0.165, -0.36],
    travel: 0.035,
    kick: 0.9,
    cycle: 0.08,
    // The feed cover's rear edge, from above; the charging handle on the left of the receiver.
    reach: { pos: [-0.02, 0.072, 0.01], normal: [0.45, -0.89, 0], wrist: [-0.6, 0.25, 0.76] },
    rack: { pos: [-0.046, 0.036, -0.034], normal: [1, 0, 0], wrist: [-0.5, -0.45, 0.74] },
    chargeTravel: 0.07,
  },
  dmr: {
    url: asset('dmr'),
    right: { pos: [0.019, -0.075, 0.036], normal: [-1, 0, 0], wrist: [0.15, -0.25, 0.95] },
    left: { pos: [-0.006, -0.0245, -0.24], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    // The optic's axis at its rear rim: the eye sits close behind it and looks down the open tube at the chevron.
    rearSight: [0, 0.0892, 0.03],
    eyeRelief: 0.11,
    muzzle: [0, 0.03, -0.7],
    ejectionPort: [0.019, 0.03, -0.06],
    magGrab: [-0.014, -0.065, -0.005],
    hip: [0.13, -0.155, -0.42],
    travel: 0.06,
    kick: 1.5,
    cycle: 0.09,
  },
  burst: {
    url: asset('burst'),
    right: { pos: [0.019, -0.07, -0.006], normal: [-1, 0, 0], wrist: [0.15, -0.3, 0.94] },
    left: { pos: [-0.006, -0.0095, -0.125], normal: [0, 1, 0], wrist: [-0.819, 0, 0.574] },
    rearSight: [0, 0.0923, 0.105],
    eyeRelief: 0.14,
    muzzle: [0, 0.034, -0.4],
    // A bullpup: the port and the magazine are behind the grip.
    ejectionPort: [0.026, 0.031, 0.14],
    magGrab: [-0.014, -0.1, -0.013],
    hip: [0.12, -0.15, -0.33],
    travel: 0.03,
    kick: 0.75,
    cycle: 0.07,
  },
  revolver: {
    url: asset('revolver'),
    right: { pos: [0.016, -0.052, 0.03], normal: [-1, 0, 0], wrist: [0.1, -0.45, 0.89] },
    left: { pos: [-0.019, -0.062, 0.018], normal: [1, 0, 0], wrist: [-0.3, -0.5, 0.8] },
    rearSight: [0, 0.054, 0.0235],
    // Held out like the pistol.
    eyeRelief: 0.46,
    muzzle: [0, 0.034, -0.168],
    // Nothing leaves a revolver on a shot; the socket sits by the cylinder.
    ejectionPort: [0.02, 0.021, -0.02],
    // The hand that brings the speedloader in by its knob; the cylinder's left side, where it swings it out and shut.
    carry: { pos: [-0.03, -0.015, 0.04], normal: [0.7, 0.2, -0.7], wrist: [-0.3, -0.65, 0.7] },
    reach: { pos: [-0.0245, 0.0212, -0.0225], normal: [1, 0, 0], wrist: [-0.35, -0.6, 0.72] },
    hip: [0.115, -0.14, -0.45],
    kick: 1.9,
    cycle: 0.2,
  },
};

/**
 * Moving parts by name. A revolver's `crane` carries its `cylinder`, which
 * carries the `rounds` in it and the `loader` behind it (see buildKitGun).
 */
const PART_NAMES = ['mag', 'slide', 'pump', 'bolt', 'cover', 'crane', 'cylinder', 'rounds', 'loader', 'hammer'] as const;
/** Parts that are only in the picture while a reload shows them: left out of every other view of the gun. */
export const RELOAD_ONLY_PARTS: readonly string[] = ['loader'];

const vec = (v: V3) => new Vector3(v[0], v[1], v[2]);

function socket(name: string, parent: Object3D, pos: V3): Object3D {
  const o = new Object3D();
  o.name = name;
  o.position.copy(vec(pos));
  parent.add(o);
  return o;
}

/** A moving part and where it rests. */
export interface KitPart {
  readonly node: Object3D;
  readonly position: Vector3;
  readonly quaternion: Quaternion;
}

export interface KitGun {
  readonly id: KitId;
  readonly rig: KitRig;
  readonly root: Group;
  readonly sockets: {
    readonly muzzle: Object3D;
    readonly ejectionPort: Object3D;
    readonly rightGrip: Object3D;
    readonly support: Object3D;
    readonly rearSight: Object3D;
    /** The rig's `reach` and `rack` palms, on the part each follows once the model is in. */
    readonly reach: Object3D | null;
    readonly rack: Object3D | null;
    /** The rig's `carry` palm: only its facing is read, the place comes from what is carried. */
    readonly carry: Object3D | null;
  };
  /** The support palm's rest position, which the pump moves. */
  readonly supportRest: Vector3;
  /** Moving parts by name (mag, slide, pump, bolt, cover, crane, cylinder, rounds, loader, hammer), once the model has loaded. */
  part(name: string): KitPart | null;
  /** Settles once the model is in (or failed to load). */
  readonly loaded: Promise<void>;
  dispose(): void;
}

/** Builds a weapon: sockets at once, the model when its GLB arrives. */
export function buildKitGun(id: KitId): KitGun {
  const rig = KIT_RIGS[id];
  const root = new Group();
  root.name = id;
  const parts = new Map<string, KitPart>();
  const rightGrip = socket('rightGrip', root, rig.right.pos);
  palmFrame(rightGrip, vec(rig.right.pos), vec(rig.right.normal), vec(rig.right.wrist));
  const support = socket('support', root, rig.left.pos);
  palmFrame(support, vec(rig.left.pos), vec(rig.left.normal), vec(rig.left.wrist));
  const palm = (name: string, at: Palm | undefined): Object3D | null => {
    if (!at) return null;
    const o = socket(name, root, at.pos);
    palmFrame(o, vec(at.pos), vec(at.normal), vec(at.wrist));
    return o;
  };
  const reach = palm('reach', rig.reach);
  const rack = palm('rack', rig.rack);
  const carry = palm('carry', rig.carry);
  let model: Object3D | null = null;
  let disposed = false;
  const loaded = new GLTFLoader().loadAsync(rig.url).then(({ scene }) => {
    if (disposed) {
      disposeAuthored(scene);
      return;
    }
    model = scene;
    root.add(scene);
    // A revolver: the cylinder swings with the crane, and what is in or behind it turns and slides with the cylinder.
    root.updateMatrixWorld(true);
    const cylinder = scene.getObjectByName('cylinder');
    if (cylinder) {
      scene.getObjectByName('crane')?.attach(cylinder);
      for (const name of ['rounds', 'loader']) {
        const node = scene.getObjectByName(name);
        if (node) cylinder.attach(node);
      }
    }
    for (const name of PART_NAMES) {
      const node = scene.getObjectByName(name);
      if (!node) continue;
      parts.set(name, { node, position: node.position.clone(), quaternion: node.quaternion.clone() });
      if (RELOAD_ONLY_PARTS.includes(name)) node.visible = false;
    }
    // The hand on a cover or a cylinder goes where it swings, and on a charging handle where it is drawn.
    const carrier = parts.get('cover') ?? parts.get('cylinder');
    if (reach && carrier) carrier.node.attach(reach);
    const handle = parts.get('slide');
    if (rack && handle) handle.node.attach(rack);
    scene.traverse((o) => {
      o.frustumCulled = false;
    });
  }).catch((error: unknown) => {
    console.warn(`Unable to load the ${id} model:`, error);
  });
  return {
    id,
    rig,
    root,
    sockets: {
      muzzle: socket('muzzle', root, rig.muzzle),
      ejectionPort: socket('ejectionPort', root, rig.ejectionPort),
      rightGrip,
      support,
      rearSight: socket('rearSight', root, rig.rearSight),
      reach,
      rack,
      carry,
    },
    supportRest: support.position.clone(),
    part: (name) => parts.get(name) ?? null,
    loaded,
    dispose(): void {
      disposed = true;
      if (model) disposeAuthored(model);
    },
  };
}

/** A frag, smoke or flash in the hand (ticket 20 added the tacticals): loaded once, shown while cooking. */
export function buildFrag(kind: 'frag' | 'smoke' | 'flash' = 'frag'): { readonly root: Group; readonly loaded: Promise<void>; dispose(): void } {
  const root = new Group();
  let model: Object3D | null = null;
  let disposed = false;
  const url = kind === 'smoke' ? new URL('./assets/smoke.glb', import.meta.url).href : kind === 'flash' ? new URL('./assets/flash.glb', import.meta.url).href : asset('frag');
  const loaded = new GLTFLoader().loadAsync(url).then(({ scene }) => {
    if (disposed) return disposeAuthored(scene);
    model = scene;
    scene.traverse((o) => {
      o.frustumCulled = false;
    });
    root.add(scene);
  }).catch((error: unknown) => {
    console.warn(`Unable to load the ${kind} model:`, error);
  });
  return {
    root,
    loaded,
    dispose(): void {
      disposed = true;
      if (model) disposeAuthored(model);
    },
  };
}
