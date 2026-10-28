import type { WeaponId } from '@duty-shooter/fps-core';
import { Group, Object3D, Quaternion, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeAuthored } from './authored-m4a1';
import { palmFrame } from './m4a1';

/**
 * The v2 weapons for the first-person view: Blender models
 * (tools/weapon/: pistol.py, smg.py, shotgun.py, sniper.py, frag.py) in the M4A1's gun space (metres, +Y up, muzzle
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
    eyeRelief: 0.34,
    muzzle: [0, 0.016, -0.14],
    ejectionPort: [0.013, 0.024, -0.03],
    magGrab: [-0.012, -0.095, 0],
    hip: [0.1, -0.12, -0.4],
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
};

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
  };
  /** The support palm's rest position, which the pump moves. */
  readonly supportRest: Vector3;
  /** Moving parts by name (mag, slide, pump, bolt), once the model has loaded. */
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
  let model: Object3D | null = null;
  let disposed = false;
  const loaded = new GLTFLoader().loadAsync(rig.url).then(({ scene }) => {
    if (disposed) {
      disposeAuthored(scene);
      return;
    }
    model = scene;
    root.add(scene);
    for (const name of ['mag', 'slide', 'pump', 'bolt']) {
      const node = scene.getObjectByName(name);
      if (node) parts.set(name, { node, position: node.position.clone(), quaternion: node.quaternion.clone() });
    }
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

/** The frag in the hand: loaded once, shown while cooking. */
export function buildFrag(): { readonly root: Group; readonly loaded: Promise<void>; dispose(): void } {
  const root = new Group();
  let model: Object3D | null = null;
  let disposed = false;
  const loaded = new GLTFLoader().loadAsync(asset('frag')).then(({ scene }) => {
    if (disposed) return disposeAuthored(scene);
    model = scene;
    scene.traverse((o) => {
      o.frustumCulled = false;
    });
    root.add(scene);
  }).catch((error: unknown) => {
    console.warn('Unable to load the frag model:', error);
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
