import type { Attachments, GripId, MuzzleId, WeaponId } from '@duty-shooter/fps-core';
import { Box3, Matrix4, Object3D, Vector3, type Mesh, type Quaternion } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CamoId } from '../customize';
import { paintGun } from './camo';
import { mountAt, type V3 } from './optics';

/**
 * What a player fits shows on the gun (PLAN item 7, Customizing): the muzzle
 * device on the muzzle, the foregrip under the handguard, the extended
 * magazine longer, the speed magazine's pull tab under its floor plate, and
 * the gun's camo. Blender models (tools/weapon/fittings.py) with their
 * origins on the point they fit to. Shared by the first-person gun and the
 * Loadout screen's.
 */

type Fitting = MuzzleId | GripId | 'tab';

const asset = (name: string) => new URL(`./assets/${name}.glb`, import.meta.url).href;
const URLS: { readonly [F in Fitting]: string } = {
  suppressor: asset('suppressor'),
  compensator: asset('compensator'),
  vertical: asset('grip-vertical'),
  angled: asset('grip-angled'),
  tab: asset('mag-tab'),
};

/** How far ahead of the muzzle each device ends (m): SUPPRESSOR_LENGTH / COMPENSATOR_LENGTH in fittings.py, with the cap. */
const MUZZLE_FRONT: { readonly [M in MuzzleId]: number } = { suppressor: 0.1313, compensator: 0.042 };

/** How much longer an extended magazine is drawn. */
const EXTENDED = 1.28;

/**
 * Where each gun takes a foregrip: under the handguard ahead of the support hand, on its underside (gun space,
 * measured by casting up into each model); `on` is the moving part it rides (the shotgun's pump).
 */
export const GRIP_MOUNTS: Readonly<Partial<Record<WeaponId, { readonly at: V3; readonly on?: string }>>> = {
  m4a1: { at: [0, -0.026, -0.31] },
  smg: { at: [0, -0.022, -0.17] },
  shotgun: { at: [0, -0.024, -0.4], on: 'pump' },
  sniper: { at: [0, -0.031, -0.3] },
  lmg: { at: [0, -0.03, -0.36] },
  dmr: { at: [0, -0.021, -0.27] },
  burst: { at: [0, -0.003, -0.15] },
};

const templates = new Map<Fitting, Promise<Object3D | null>>();

function template(f: Fitting): Promise<Object3D | null> {
  let t = templates.get(f);
  if (!t) {
    t = new GLTFLoader().loadAsync(URLS[f]).then(({ scene }) => {
      scene.traverse((o) => (o.frustumCulled = false));
      return scene as Object3D;
    }).catch((error: unknown) => {
      console.warn(`Unable to load the ${f} model:`, error);
      return null;
    });
    templates.set(f, t);
  }
  return t;
}

/** A gun to dress: its root, when its model is in, its magazine and its moving parts at rest. */
export interface DressableGun {
  readonly id: WeaponId;
  readonly root: Object3D;
  readonly loaded: Promise<void>;
  /** The magazine's node: what an extended magazine lengthens and the pull tab hangs from. */
  magazine(): Object3D | null;
  /** A moving part's rest pose, for a fitting that rides it. */
  rest(name: string): { readonly position: Vector3; readonly quaternion: Quaternion } | null;
}

/** What is on a gun now, and what to undo to take it off. */
interface Dressed {
  key: string;
  /** The last dress asked for, to skip a repeat without building its key. */
  last: { readonly muzzle: MuzzleId | undefined; readonly grip: GripId | undefined; readonly magazine: Attachments['magazine']; readonly camo: CamoId | null };
  readonly nodes: Object3D[];
  magazine: { readonly node: Object3D; readonly scale: Vector3 } | null;
  muzzle: { readonly node: Object3D; readonly z: number } | null;
}

const dressed = new WeakMap<Object3D, Dressed>();

/** The gun's muzzle socket (a direct child of its root). */
const muzzleSocket = (root: Object3D) => root.children.find((c) => c.name === 'muzzle') ?? null;

/**
 * Dresses `gun` with `kit`'s muzzle device, grip and magazine and `camo` (null: its own finish), once its model and
 * the fittings' are in. A later call replaces what an earlier one put on.
 */
export function dressGun(gun: DressableGun, kit: Attachments | undefined, camo: CamoId | null): void {
  let state = dressed.get(gun.root);
  // Called every frame: the same dress again costs nothing.
  const same = state?.last;
  if (same && same.muzzle === kit?.muzzle && same.grip === kit?.grip && same.magazine === kit?.magazine && same.camo === camo) return;
  const key = `${kit?.muzzle ?? ''}|${kit?.grip ?? ''}|${kit?.magazine ?? ''}|${camo ?? ''}`;
  if (state) state.last = { muzzle: kit?.muzzle, grip: kit?.grip, magazine: kit?.magazine, camo };
  if (state?.key === key) return;
  if (!state) dressed.set(gun.root, (state = { key, last: { muzzle: kit?.muzzle, grip: kit?.grip, magazine: kit?.magazine, camo }, nodes: [], magazine: null, muzzle: null }));
  state.key = key;
  const want: Fitting[] = [];
  if (kit?.muzzle) want.push(kit.muzzle);
  if (kit?.grip && GRIP_MOUNTS[gun.id]) want.push(kit.grip);
  if (kit?.magazine === 'speed') want.push('tab');
  void Promise.all([gun.loaded, Promise.all(want.map(template))]).then(([, models]) => {
    const s = dressed.get(gun.root);
    if (!s || s.key !== key) return;
    undress(s);
    want.forEach((f, i) => {
      const model = models[i];
      if (model) fit(gun, s, f, model.clone());
    });
    const mag = gun.magazine();
    if (mag && kit?.magazine === 'extended') {
      s.magazine = { node: mag, scale: mag.scale.clone() };
      mag.scale.y *= EXTENDED;
    }
    paintGun(gun.root, camo);
  });
}

/** Takes off everything `s` put on. */
function undress(s: Dressed): void {
  for (const n of s.nodes) n.removeFromParent();
  s.nodes.length = 0;
  if (s.magazine) s.magazine.node.scale.copy(s.magazine.scale);
  s.magazine = null;
  if (s.muzzle) s.muzzle.node.position.z = s.muzzle.z;
  s.muzzle = null;
}

function fit(gun: DressableGun, s: Dressed, f: Fitting, node: Object3D): void {
  node.name = `fitting:${f}`;
  if (f === 'suppressor' || f === 'compensator') {
    const socket = muzzleSocket(gun.root);
    if (!socket) return;
    const p = socket.position;
    mountAt(gun.root, node, [p.x, p.y, p.z]);
    // The flash and the tracers leave from the device's front.
    s.muzzle = { node: socket, z: p.z };
    socket.position.z -= MUZZLE_FRONT[f];
  } else if (f === 'tab') {
    const mag = gun.magazine();
    if (!mag) return;
    const floor = magazineFloor(mag);
    mag.add(node);
    node.position.copy(floor);
  } else {
    const mount = GRIP_MOUNTS[gun.id];
    if (!mount) return;
    mountAt(gun.root, node, mount.at, mount.on, mount.on ? gun.rest(mount.on) : null);
  }
  s.nodes.push(node);
}

/** The middle of the magazine's floor plate, in the magazine's own space. */
function magazineFloor(mag: Object3D): Vector3 {
  mag.updateWorldMatrix(true, true);
  const toMag = new Matrix4().copy(mag.matrixWorld).invert();
  const box = new Box3();
  const part = new Box3();
  const m = new Matrix4();
  mag.traverse((o) => {
    // Hidden too: a reload hides the magazine while it swaps.
    const geometry = (o as Mesh).isMesh ? (o as Mesh).geometry : null;
    if (!geometry || o.name.startsWith('fitting:')) return;
    geometry.boundingBox ?? geometry.computeBoundingBox();
    if (geometry.boundingBox) box.union(part.copy(geometry.boundingBox).applyMatrix4(m.multiplyMatrices(toMag, o.matrixWorld)));
  });
  if (box.isEmpty()) return new Vector3();
  const c = box.getCenter(new Vector3());
  return new Vector3(c.x, box.min.y, c.z);
}
