import { STATS, WEAPON_IDS, isShellReload, type WeaponId, type WeaponRow } from '@duty-shooter/fps-core';
import { DirectionalLight, Euler, Group, HemisphereLight, Object3D, PerspectiveCamera, Quaternion, Scene, Vector3, type Texture } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { attachAuthoredM4, disposeAuthored } from './authored-m4a1';
import { Spring } from '../spring';
import { buildArms, type ArmsModel } from './arms';
import { buildFrag, buildKitGun, type KitGun, type KitId } from './kit';
import { M4A1_BOLT_TRAVEL, M4A1_CHARGING_HANDLE_TRAVEL, buildM4A1, palmFrame, type M4A1Model } from './m4a1';
import type { ViewmodelState } from './state';

const W = STATS.weapon;
const DEG = Math.PI / 180;

/** A gun pose offset: position (m, view space) and rotation (radians: pitch, yaw, roll). */
interface Pose {
  readonly p: readonly [number, number, number];
  readonly r: readonly [number, number, number];
}

const ZERO: Pose = { p: [0, 0, 0], r: [0, 0, 0] };

/** A keyframe: time (s), gun offset, and optionally where the left hand is and how the magazine sits. */
interface Key {
  readonly t: number;
  readonly pose: Pose;
  /** 0 = left hand on the handguard, 1 = on the magazine. */
  readonly hand?: number;
  /** Magazine offset from its seat, in gun space (m). */
  readonly mag?: readonly [number, number, number];
  /** Charging handle pull, 0..1. */
  readonly charge?: number;
  /** Bolt held back (empty), 0..1. */
  readonly bolt?: number;
  /** 0..1: the left hand reaches the bolt catch. */
  readonly catchPress?: number;
  /** Pump pulled back, 0..1. */
  readonly pump?: number;
  /** Bolt handle lifted, then the bolt drawn back, 0..1 each. */
  readonly boltLift?: number;
  readonly boltPull?: number;
  /** 0 = right hand on the grip, 1 = on the bolt handle. */
  readonly right?: number;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Samples a track at `t`: smoothstep between neighbouring keys. Missing optional channels hold their last value. */
function sample(track: readonly Key[], t: number) {
  const first = track[0] as Key;
  let a = first;
  let b = first;
  for (const k of track) {
    if (k.t <= t) a = k;
    if (k.t >= t) {
      b = k;
      break;
    }
    b = k;
  }
  const f = b.t === a.t ? 0 : ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
  const ch = (get: (k: Key) => number | undefined, fallback: number) => lerp(get(a) ?? fallback, get(b) ?? get(a) ?? fallback, f);
  const v3 = (get: (k: Key) => readonly [number, number, number] | undefined): [number, number, number] => {
    const va = get(a) ?? [0, 0, 0];
    const vb = get(b) ?? va;
    return [lerp(va[0], vb[0], f), lerp(va[1], vb[1], f), lerp(va[2], vb[2], f)];
  };
  return {
    pose: { p: v3((k) => k.pose.p), r: v3((k) => k.pose.r) } as Pose,
    hand: ch((k) => k.hand, 0),
    mag: v3((k) => k.mag),
    charge: ch((k) => k.charge, 0),
    bolt: ch((k) => k.bolt, 0),
    catchPress: ch((k) => k.catchPress, 0),
    pump: ch((k) => k.pump, 0),
    boltLift: ch((k) => k.boltLift, 0),
    boltPull: ch((k) => k.boltPull, 0),
    right: ch((k) => k.right, 0),
  };
}

type Sample = ReturnType<typeof sample>;

const pose = (p: [number, number, number], r: [number, number, number]): Pose => ({ p, r });

/**
 * Keyframe tracks, authored in code. Every duration comes from the stats
 * file, so the animation lands its add-ammo point exactly when the
 * simulation adds the ammo.
 */
function reloadTrack(
  empty: boolean,
  timing = { add: empty ? W.emptyReloadAddAmmo.value : W.tacticalReloadAddAmmo.value, end: empty ? W.emptyReloadDuration.value : W.tacticalReloadDuration.value },
  boltCatch = true,
): Key[] {
  const { add, end } = timing;
  const tilt = pose([0.02, 0.03, 0.02], [0.12, 0.18, 0.55]);
  const down: [number, number, number] = [0.04, -0.32, 0.12];
  const keys: Key[] = [
    { t: 0, pose: ZERO, hand: 0, mag: [0, 0, 0], bolt: empty ? 1 : 0 },
    { t: 0.22, pose: tilt, hand: 0.6 },
    { t: 0.3, pose: tilt, hand: 1, mag: [0, 0, 0] },
    // Mag out and away (the "mag out" sound sits at 0.32 s).
    { t: 0.42, pose: pose([0.02, 0.035, 0.02], [0.14, 0.2, 0.58]), hand: 1, mag: [0, -0.07, 0.01] },
    { t: add * 0.45, pose: tilt, hand: 1, mag: down },
    // A fresh mag comes up and seats.
    { t: add * 0.72, pose: tilt, hand: 1, mag: [0, -0.09, 0.015] },
    { t: add - (empty ? 0.55 : 0.22), pose: pose([0.02, 0.045, 0.02], [0.16, 0.2, 0.55]), hand: 1, mag: [0, 0, 0] },
  ];
  if (empty && !boltCatch) {
    // A slide or charging handle sends the round home as the hand comes away.
    keys.push({ t: add, pose: pose([0.015, 0.035, 0.01], [0.13, 0.22, 0.42]), hand: 1, mag: [0, 0, 0], bolt: 0 });
  } else if (empty) {
    // Bolt release: the left hand slaps the bolt catch and the bolt runs home.
    keys.push({ t: add - 0.35, pose: pose([0.02, 0.03, 0.02], [0.1, 0.24, 0.42]), hand: 1, catchPress: 0.6, bolt: 1 });
    keys.push({ t: add - 0.08, pose: pose([0.02, 0.025, 0.0], [0.06, 0.26, 0.4]), hand: 1, catchPress: 1, bolt: 1 });
    keys.push({ t: add, pose: pose([0.015, 0.035, 0.01], [0.13, 0.22, 0.42]), hand: 1, catchPress: 1, bolt: 0 });
  } else {
    keys.push({ t: add, pose: pose([0.02, 0.025, 0.02], [0.1, 0.2, 0.55]), hand: 1, mag: [0, 0, 0] });
  }
  keys.push({ t: add + (end - add) * 0.4, pose: pose([0.01, 0.01, 0.01], [0.05, 0.08, 0.2]), hand: 0.2, catchPress: 0 });
  keys.push({ t: end, pose: ZERO, hand: 0, bolt: 0, catchPress: 0 });
  return keys;
}

function inspectTrack(charge = 0.45): Key[] {
  const d = W.inspectDuration.value;
  return [
    { t: 0, pose: ZERO },
    { t: d * 0.12, pose: pose([-0.06, 0.05, 0.06], [0.1, 0.7, -0.55]) },
    { t: d * 0.36, pose: pose([-0.07, 0.06, 0.07], [0.15, 0.85, -0.6]) },
    { t: d * 0.48, pose: pose([-0.03, 0.04, 0.05], [0.25, -0.45, 0.8]) },
    { t: d * 0.68, pose: pose([-0.03, 0.05, 0.05], [0.3, -0.55, 0.9]) },
    // Press check: a short charging-handle pull.
    { t: d * 0.78, pose: pose([0.0, 0.03, 0.03], [0.12, 0.12, 0.25]), charge: 0 },
    { t: d * 0.82, pose: pose([0.0, 0.035, 0.035], [0.14, 0.12, 0.25]), charge },
    { t: d * 0.87, pose: pose([0.0, 0.03, 0.03], [0.1, 0.1, 0.2]), charge: 0 },
    { t: d, pose: ZERO, charge: 0 },
  ];
}

/** Out of sight below the view: where a draw starts and a holster ends. */
const LOWERED = pose([0.05, -0.28, 0.1], [-0.9, 0.3, 0.5]);

function drawTrack(d: number = W.drawTime.value): Key[] {
  return [
    { t: 0, pose: LOWERED },
    { t: d * 0.75, pose: pose([0, -0.01, 0.01], [0.04, 0, -0.04]) },
    { t: d, pose: ZERO },
  ];
}

function meleeTrack(): Key[] {
  const hit = STATS.melee.impactTime.value;
  const d = STATS.melee.duration.value;
  return [
    { t: 0, pose: ZERO },
    { t: hit * 0.45, pose: pose([0.06, 0.02, 0.06], [0.1, -0.35, -0.3]) },
    { t: hit, pose: pose([-0.16, 0.03, -0.12], [0.05, 0.9, 0.5]) },
    { t: hit + 0.15, pose: pose([-0.13, 0.02, -0.08], [0.05, 0.8, 0.45]) },
    { t: d, pose: ZERO },
  ];
}

function holsterTrack(d: number): Key[] {
  return [
    { t: 0, pose: ZERO },
    { t: d, pose: LOWERED },
  ];
}

/** Working a pump: the support hand runs the forend back and forward. */
function pumpTrack(d: number): Key[] {
  return [
    { t: 0, pose: ZERO, pump: 0 },
    { t: d * 0.18, pose: pose([0, 0.005, 0.01], [0.05, 0, 0.04]), pump: 0 },
    { t: d * 0.42, pose: pose([0, -0.005, 0.02], [0.07, 0.02, 0.08]), pump: 1 },
    { t: d * 0.72, pose: pose([0, 0, 0.01], [0.03, 0, 0.03]), pump: 0 },
    { t: d, pose: ZERO, pump: 0 },
  ];
}

/** Working a bolt: the right hand leaves the grip, lifts the handle, draws it back, runs it home and locks it. */
function boltTrack(d: number): Key[] {
  const tilt = pose([0.01, 0, 0.02], [0.05, 0.06, 0.18]);
  return [
    { t: 0, pose: ZERO, right: 0 },
    { t: d * 0.14, pose: tilt, right: 1, boltLift: 0 },
    { t: d * 0.26, pose: tilt, right: 1, boltLift: 1, boltPull: 0 },
    { t: d * 0.44, pose: pose([0.01, 0, 0.025], [0.06, 0.07, 0.2]), right: 1, boltLift: 1, boltPull: 1 },
    { t: d * 0.6, pose: tilt, right: 1, boltLift: 1, boltPull: 0 },
    { t: d * 0.72, pose: tilt, right: 1, boltLift: 0 },
    { t: d * 0.9, pose: ZERO, right: 0 },
    { t: d, pose: ZERO, right: 0 },
  ];
}

interface Tracks {
  readonly tactical: Key[];
  readonly empty: Key[];
  readonly inspect: Key[];
  readonly draw: Key[];
  readonly holster: Key[];
  readonly melee: Key[];
  readonly cycle: Key[] | null;
}

const TRACKS: Tracks = {
  tactical: reloadTrack(false),
  empty: reloadTrack(true),
  inspect: inspectTrack(),
  draw: drawTrack(),
  holster: holsterTrack(STATS.weapons.m4a1.handling.holsterTime.value),
  melee: meleeTrack(),
  cycle: null,
};

/** A weapon's tracks, timed from its row. Shell reloads are worked out per frame (see shellReload). */
function kitTracks(row: WeaponRow): Tracks {
  const h = row.handling;
  const r = row.reload;
  const mag = isShellReload(r) ? null : r;
  const cycle = h.cycleTime?.value ?? 0;
  const still: Key[] = [{ t: 0, pose: ZERO }];
  return {
    tactical: mag ? reloadTrack(false, { add: mag.tacticalAddAmmo.value, end: mag.tacticalDuration.value }, false) : still,
    empty: mag ? reloadTrack(true, { add: mag.emptyAddAmmo.value, end: mag.emptyDuration.value }, false) : still,
    inspect: inspectTrack(0),
    draw: drawTrack(h.drawTime.value),
    holster: holsterTrack(h.holsterTime.value),
    melee: meleeTrack(),
    cycle: row.traits.fireMode === 'pump' ? pumpTrack(cycle) : row.traits.fireMode === 'bolt' ? boltTrack(cycle) : null,
  };
}

const KIT_TRACKS = new Map<KitId, Tracks>();
function tracksFor(id: WeaponId): Tracks {
  if (id === 'm4a1') return TRACKS;
  let t = KIT_TRACKS.get(id);
  if (!t) KIT_TRACKS.set(id, (t = kitTracks(STATS.weapons[id])));
  return t;
}

/**
 * A shell-by-shell reload, from how far in it is and the rounds in the
 * tube: the gun rolls to show the loading port and the support hand goes
 * from the pump to the port for each shell, landing as the simulation adds
 * it, then back to the pump (working it first when the reload began empty).
 */
function shellReload(row: WeaponRow, t: number, ammo: number, empty: boolean): Sample {
  const r = row.reload;
  if (!isShellReload(r)) return sample([{ t: 0, pose: ZERO }], 0);
  const start = r.start.value;
  const per = r.perShell.value;
  const tilt = pose([0.02, 0.03, 0.02], [0.14, 0.12, 0.5]);
  if (ammo < row.handling.magazineSize.value || t < start) {
    // In for each shell at start + k * per, back out to fetch the next between.
    const hand = t < start ? ease(Math.min(1, t / start)) : 0.5 + 0.5 * Math.cos((2 * Math.PI * (t - start)) / per);
    return { ...sample([{ t: 0, pose: ZERO }, { t: start * 0.6, pose: tilt }], t), hand };
  }
  const loaded = Math.floor((t - start) / per + 1e-6) + 1;
  const since = t - (start + (loaded - 1) * per);
  const chamber = empty ? r.chamber.value : 0;
  const end = r.end.value;
  const keys: Key[] = [
    { t: 0, pose: tilt, hand: 1 },
    { t: Math.min(0.15, end * 0.4), pose: tilt, hand: 0 },
  ];
  if (empty) keys.push({ t: chamber * 0.3, pose: tilt, hand: 0, pump: 0 }, { t: chamber * 0.6, pose: tilt, hand: 0, pump: 1 }, { t: chamber, pose: tilt, hand: 0, pump: 0 });
  keys.push({ t: chamber + end, pose: ZERO, hand: 0, pump: 0 });
  return sample(keys, since);
}

/** Cooking: the gun lowered and the frag held up in the support hand. */
const GRENADE_LOWERED = pose([0.06, -0.22, 0.08], [-0.7, 0.2, 0.3]);
/** The right hand on a bolt knob (tools/weapon/sniper.py), in gun space: from below and behind, palm up and in, the knob at the base of the fingers. */
const BOLT_PALM = (() => {
  const o = new Object3D();
  palmFrame(o, new Vector3(), new Vector3(-0.45, 0.85, 0), new Vector3(0.3, -0.15, 0.94));
  return o.quaternion.clone();
})();
const BOLT_KNOB = new Vector3(0.052, -0.0095, 0.034);
const BOLT_PALM_FROM_KNOB = new Vector3(0.012, -0.022, 0.03);

/** Where the frag hand is while cooking, wound back, and at the release, in view space. */
const FRAG_HOLD = new Vector3(-0.15, -0.13, -0.42);
const FRAG_WIND = new Vector3(-0.17, -0.06, -0.24);
const FRAG_RELEASE = new Vector3(-0.03, 0.0, -0.62);
/** The throw's release (s): the hand is empty after it. */
const FRAG_LETGO = 0.2;
const FRAG_PALM = (() => {
  const o = new Object3D();
  palmFrame(o, new Vector3(), new Vector3(0.3, 0.2, -0.93), new Vector3(-0.2, -0.5, 0.85));
  return o.quaternion.clone();
})();
/** The frag's centre from the palm, in the palm frame (the palm faces -Y). */
const FRAG_IN_PALM = new Vector3(0, -0.035, -0.02);

/** A second scope: the viewmodel hides behind the scope overlay once aimed this far. */
const SCOPED_AT = 0.9;

/** Where the gun sits in view space at hipfire. */
const HIP = new Vector3(0.13, -0.15, -0.43);
const HIP_ROT = new Euler(0.02, 0.035, -0.02, 'YXZ');
/** Distance from the eye to the rear sight when aimed. */
const EYE_RELIEF = 0.22;

/** The gun's light levels in open sun: sky fill, key, rim and reflections. */
const FILL = 0.8;
const KEY = 2.2;
const RIM = 0.8;
const ENVIRONMENT = 0.8;

/** A pistol slide's run back and forward after a shot (s). */
const SLIDE_CYCLE = 0.07;

/**
 * The first-person weapon and arms: keyframed actions driven by the weapon
 * state, layered with sway, turn inertia, movement bob, a spring recoil kick
 * and a landing dip. Drawn in its own scene with its own camera and FOV.
 * The M4A1 is the procedural model; the other weapons are Blender models
 * (see kit.ts), built the first time they are drawn.
 */
export class Viewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(52, 16 / 9, 0.01, 10);
  /** Everything visible: hide it when the player is dead. */
  readonly root = new Group();
  readonly gun: M4A1Model;
  readonly arms: ArmsModel;
  readonly #pivot = new Group();
  readonly #leftTarget = new Object3D();
  readonly #rightTarget = new Object3D();
  readonly #magRest = new Vector3();
  readonly #boltRest = new Vector3();
  readonly #chargeRest = new Vector3();
  readonly #catchRest = new Quaternion();
  readonly #adsOffset: Vector3;
  readonly #kits = new Map<KitId, KitGun>();
  /** The frag in hand, built the first time one is cooked. */
  #frag: ReturnType<typeof buildFrag> | null = null;
  /** Follow the gun in hand, so effects parented to them move with a switch. */
  readonly #muzzle = new Object3D();
  readonly #ejectionPort = new Object3D();
  #weapon: WeaponId = 'm4a1';
  // Procedural layers.
  readonly #swayX = new Spring(90, 12);
  readonly #swayY = new Spring(90, 12);
  readonly #kickZ = new Spring(320, 20);
  readonly #kickPitch = new Spring(260, 16);
  readonly #kickYaw = new Spring(260, 18);
  readonly #dip = new Spring(120, 11);
  #bobPhase = 0;
  #bobAmount = 0;
  #sprint = 0;
  #tactical = 0;
  #boltCycle = 1;
  #time = 0;
  #disposed = false;
  #disposeAuthored: (() => void) | null = null;
  /** The M4A1's authored detail pass, settled once it is attached (or failed). */
  readonly #authored: Promise<void>;

  /** The gun's own lights: sky and ground fill, a key from above like the sun, and a cool rim. */
  readonly #fill = new HemisphereLight(0xe8eef5, 0x4a4640, FILL);
  readonly #key = new DirectionalLight(0xfff2e0, KEY);
  readonly #rim = new DirectionalLight(0xbfd4ff, RIM);
  #sunLight = 1;
  #ambientLight = 1;

  constructor(environment: Texture | null = null) {
    this.scene.environment = environment;
    this.scene.environmentIntensity = ENVIRONMENT;
    this.scene.add(this.#fill);
    this.#key.position.set(-0.6, 1, 0.4);
    this.#rim.position.set(0.8, 0.3, -1);
    this.scene.add(this.#key, this.#rim, this.camera);
    this.camera.rotation.order = 'YXZ';

    this.gun = buildM4A1({ detail: 'high' });
    // The animation targets and sockets remain on the procedural model. The
    // authored detail pass is attached in the same metre-scale gun space.
    this.#authored = new GLTFLoader().loadAsync(new URL('./assets/m4a1-details.glb', import.meta.url).href).then(({ scene }) => {
      if (this.#disposed) {
        disposeAuthored(scene);
        return;
      }
      try {
        this.#disposeAuthored = attachAuthoredM4(this.gun, scene);
      } catch (error) {
        disposeAuthored(scene);
        throw error;
      }
    }).catch((error: unknown) => {
      console.warn('Unable to load M4A1 detail asset:', error);
    });
    this.arms = buildArms();
    this.#pivot.add(this.gun.root);
    this.root.add(this.#pivot, this.arms.root, this.#leftTarget, this.#rightTarget);
    this.scene.add(this.root);
    this.#magRest.copy(this.gun.magazine.position);
    this.#boltRest.copy(this.gun.bolt.position);
    this.#chargeRest.copy(this.gun.chargingHandle.position);
    this.#catchRest.copy(this.gun.boltCatch.quaternion);
    // Aimed: the gun moves so the sight line runs down the camera's axis.
    const rear = this.gun.sockets.rearSight.position;
    this.#adsOffset = new Vector3(-rear.x, -rear.y, -EYE_RELIEF - rear.z);
    this.gun.sockets.muzzle.add(this.#muzzle);
    this.gun.sockets.ejectionPort.add(this.#ejectionPort);
    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  get muzzle(): Object3D {
    return this.#muzzle;
  }

  get ejectionPort(): Object3D {
    return this.#ejectionPort;
  }

  /** The weapon in hand. */
  get weapon(): WeaponId {
    return this.#weapon;
  }

  /** A shot: spring kick, scaled to the weapon in hand, and the bolt or slide cycling. */
  fire(): void {
    const kick = this.#weapon === 'm4a1' ? 1 : this.#kit(this.#weapon).rig.kick;
    this.#kickZ.velocity += 1.6 * kick;
    this.#kickPitch.velocity += (2.4 + Math.random() * 0.6) * kick;
    this.#kickYaw.velocity += (Math.random() - 0.5) * 1.2 * kick;
    this.#boltCycle = 0;
  }

  land(fallHeight: number): void {
    this.#dip.velocity -= Math.min(1.6, 0.4 + fallHeight * 0.25);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Lights the gun like the spot the player stands in: `sun` is how much
   * direct sun reaches it (0 to 1) and `ambient` how bright the surrounding
   * light is next to open sky (about 1 outdoors, less in a room). Eased over
   * a fraction of a second, so stepping through a door doesn't snap.
   */
  setLighting(sun: number, ambient: number, dt: number): void {
    const k = 1 - Math.exp(-dt / 0.2);
    this.#sunLight += (sun - this.#sunLight) * k;
    this.#ambientLight += (ambient - this.#ambientLight) * k;
    // Out of the sun the key is only a faint bounce; every light follows the ambient level, so a room darkens the gun as much as its walls.
    const amb = Math.min(1, this.#ambientLight);
    this.#key.intensity = KEY * (0.12 + 0.88 * this.#sunLight) * amb;
    this.#rim.intensity = RIM * amb;
    this.#fill.intensity = FILL * this.#ambientLight;
    this.scene.environmentIntensity = ENVIRONMENT * amb;
  }

  /** Builds every weapon and the frag now, settling once their models are in: a first switch then has nothing to fetch. */
  prepare(): Promise<void> {
    for (const id of WEAPON_IDS) if (id !== 'm4a1') this.#kit(id);
    if (!this.#frag) {
      this.#frag = buildFrag();
      this.#frag.root.visible = false;
      this.root.add(this.#frag.root);
    }
    return Promise.all([this.#authored, this.#frag.loaded, ...[...this.#kits.values()].map((k) => k.loaded)]).then(() => undefined);
  }

  /**
   * Shows every weapon and the frag at once, for one frame that compiles their
   * shaders, shrunk out of sight (the loading screen lets the frame show
   * through); returns what puts them back.
   */
  showAll(): () => void {
    const shown = [this.root, this.gun.root, ...[...this.#kits.values()].map((k) => k.root), ...(this.#frag ? [this.#frag.root] : [])];
    const was = shown.map((o) => o.visible);
    const scale = this.root.scale.x;
    for (const o of shown) o.visible = true;
    this.root.scale.setScalar(1e-4);
    return () => {
      shown.forEach((o, i) => (o.visible = was[i]!));
      this.root.scale.setScalar(scale);
    };
  }

  #kit(id: KitId): KitGun {
    let kit = this.#kits.get(id);
    if (!kit) {
      kit = buildKitGun(id);
      kit.root.visible = false;
      this.#kits.set(id, kit);
      this.#pivot.add(kit.root);
    }
    return kit;
  }

  /** Shows the weapon `id` and moves the muzzle and ejection-port anchors onto it. */
  #hold(id: WeaponId): void {
    if (id === this.#weapon && (id === 'm4a1' || this.#kits.has(id))) return;
    this.#weapon = id;
    this.gun.root.visible = id === 'm4a1';
    for (const [kid, kit] of this.#kits) kit.root.visible = kid === id;
    if (id === 'm4a1') {
      this.gun.sockets.muzzle.add(this.#muzzle);
      this.gun.sockets.ejectionPort.add(this.#ejectionPort);
      const rear = this.gun.sockets.rearSight.position;
      this.#adsOffset.set(-rear.x, -rear.y, -EYE_RELIEF - rear.z);
      return;
    }
    const kit = this.#kit(id);
    kit.root.visible = true;
    kit.sockets.muzzle.add(this.#muzzle);
    kit.sockets.ejectionPort.add(this.#ejectionPort);
    const rear = kit.sockets.rearSight.position;
    this.#adsOffset.set(-rear.x, -rear.y, -kit.rig.eyeRelief - rear.z);
  }

  /** Advances the animation. `worldVerticalFov` (radians) only nudges the viewmodel FOV with the player's setting. */
  update(state: ViewmodelState, dt: number, worldVerticalFov: number): void {
    this.#time += dt;
    this.#hold(state.weapon ?? 'm4a1');
    const id = this.#weapon;
    const kit = id === 'm4a1' ? null : this.#kit(id);
    const row = STATS.weapons[id];
    const ads = ease(Math.min(1, Math.max(0, state.ads)));
    const sprinting = state.movement === 'sprint' || state.movement === 'tacticalSprint';
    const k = (tau: number) => 1 - Math.exp(-dt / tau);
    // A reload carries on through a sprint, so the gun stays in its reload pose rather than the sprint cant.
    this.#sprint += ((sprinting && state.action !== 'melee' && state.action !== 'reload' ? 1 : 0) - this.#sprint) * k(0.09);
    this.#tactical += ((state.movement === 'tacticalSprint' ? 1 : 0) - this.#tactical) * k(0.1);

    // Viewmodel FOV: a little narrower when aimed, so the sights fill more of the view.
    const fov = (54 - ads * 10) * DEG + (worldVerticalFov - 49 * DEG) * 0.25;
    if (Math.abs(this.camera.fov - fov / DEG) > 1e-3) {
      this.camera.fov = fov / DEG;
      this.camera.updateProjectionMatrix();
    }

    // Action keyframes.
    const tracks = tracksFor(id);
    let track: Key[] | null = null;
    if (state.action === 'reload' && kit && isShellReload(row.reload)) track = null;
    else if (state.action === 'reload') track = state.reload === 'empty' ? tracks.empty : tracks.tactical;
    else if (state.action === 'inspect') track = tracks.inspect;
    else if (state.action === 'draw') track = tracks.draw;
    else if (state.action === 'holster') track = tracks.holster;
    else if (state.action === 'melee') track = tracks.melee;
    else if (state.action === 'cycle') track = tracks.cycle;
    const s =
      state.action === 'reload' && kit && isShellReload(row.reload)
        ? shellReload(row, state.actionTime, state.ammo, state.reload === 'empty')
        : track
          ? sample(track, state.actionTime)
          : sample([{ t: 0, pose: ZERO }], 0);
    const boltLocked = state.ammo === 0 && state.action !== 'reload' ? 1 : s.bolt;

    // The grenade: the gun drops away while it's cooked, and comes back once it's thrown.
    const g = state.grenade ?? null;
    const throwTime = STATS.grenade.throwTime.value;
    const lowered = !g ? 0 : g.phase === 'cook' ? ease(Math.min(1, g.time / 0.18)) : 1 - ease(Math.min(1, Math.max(0, (g.time - FRAG_LETGO) / (throwTime - FRAG_LETGO))));

    // Procedural layers.
    const calm = 1 - ads * 0.85;
    this.#swayX.update(dt, Math.max(-0.05, Math.min(0.05, -state.lookDelta.yaw * 0.9)));
    this.#swayY.update(dt, Math.max(-0.04, Math.min(0.04, state.lookDelta.pitch * 0.9)));
    this.#kickZ.update(dt);
    this.#kickPitch.update(dt);
    this.#kickYaw.update(dt);
    this.#dip.update(dt);
    const moving = state.grounded ? Math.min(1, state.speed / 7) : 0;
    this.#bobAmount += (moving - this.#bobAmount) * k(0.12);
    this.#bobPhase += dt * (5.2 + state.speed * 0.95);
    const bob = this.#bobAmount * calm * (1 + this.#sprint * 0.8);
    const bobX = Math.sin(this.#bobPhase) * 0.012 * bob;
    const bobY = -Math.abs(Math.cos(this.#bobPhase)) * 0.014 * bob;
    const breathe = Math.sin(this.#time * 1.4) * 0.0015 * calm;
    this.#boltCycle = Math.min(1, this.#boltCycle + dt / (id === 'pistol' ? SLIDE_CYCLE : 60 / W.fireRate.value));

    // Sprint: gun canted and lowered; tactical sprint: held up by the shoulder.
    const sprintP = new Vector3(-0.04, -0.05, 0.04).lerp(new Vector3(0.0, 0.03, 0.02), this.#tactical);
    const sprintR = new Euler(-0.35, 0.65, 0.35).toArray().map((v, i) => lerp(v as number, ([1.05, 0.35, 0.9] as number[])[i] as number, this.#tactical));

    const hip = kit ? new Vector3(...kit.rig.hip) : HIP;
    const base = hip.clone().lerp(this.#adsOffset, ads);
    const p = s.pose.p.map((v, i) => lerp(v, GRENADE_LOWERED.p[i] as number, lowered));
    const r = s.pose.r.map((v, i) => lerp(v, GRENADE_LOWERED.r[i] as number, lowered));
    const actionWeight = 1 - ads * 0.6;
    this.#pivot.position.set(
      base.x + (p[0] ?? 0) * actionWeight + sprintP.x * this.#sprint + bobX + this.#swayX.value * 0.6 * calm,
      base.y + (p[1] ?? 0) * actionWeight + sprintP.y * this.#sprint + bobY + breathe + this.#swayY.value * 0.5 * calm + this.#dip.value * 0.03,
      base.z + (p[2] ?? 0) * actionWeight + sprintP.z * this.#sprint + this.#kickZ.value * 0.025 * (1 - ads * 0.4),
    );
    const hipRot = 1 - ads;
    this.#pivot.rotation.set(
      HIP_ROT.x * hipRot + (r[0] ?? 0) * actionWeight + (sprintR[0] ?? 0) * this.#sprint + this.#kickPitch.value * 0.02 * (1 - ads * 0.5) + this.#swayY.value * 0.6,
      HIP_ROT.y * hipRot + (r[1] ?? 0) * actionWeight + (sprintR[1] ?? 0) * this.#sprint + this.#kickYaw.value * 0.01 + this.#swayX.value * 0.8,
      HIP_ROT.z * hipRot + (r[2] ?? 0) * actionWeight + (sprintR[2] ?? 0) * this.#sprint + bobX * 2 + this.#swayX.value * 1.2 * calm,
      'YXZ',
    );

    const cycle = this.#boltCycle < 1 ? Math.sin(this.#boltCycle * Math.PI) : 0;
    const target = this.#leftTarget;
    let right: Object3D;
    if (!kit) {
      // Moving parts.
      this.gun.magazine.position.set(this.#magRest.x + s.mag[0], this.#magRest.y + s.mag[1], this.#magRest.z + s.mag[2]);
      this.gun.magazine.visible = !(state.action === 'reload' && s.mag[1] < -0.25);
      this.gun.bolt.position.set(this.#boltRest.x, this.#boltRest.y, this.#boltRest.z + M4A1_BOLT_TRAVEL * Math.max(boltLocked, cycle, s.charge));
      this.gun.chargingHandle.position.set(this.#chargeRest.x, this.#chargeRest.y, this.#chargeRest.z + M4A1_CHARGING_HANDLE_TRAVEL * s.charge);
      this.gun.boltCatch.quaternion.copy(this.#catchRest).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.25 * s.catchPress));

      // Hands: right on the grip; left on the handguard, the magazine or the bolt catch.
      this.root.updateMatrixWorld(true);
      const guard = this.gun.sockets.leftHandguard;
      const onMag = this.gun.magazine;
      const guardPos = guard.getWorldPosition(new Vector3());
      const guardQ = guard.getWorldQuaternion(new Quaternion());
      // The palm wraps the magazine from the front-left, slightly below its seat.
      const magPos = onMag.localToWorld(new Vector3(-0.012, -0.075, -0.01));
      const magQ = onMag.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(0, 0, -Math.PI / 2)));
      const catchPos = this.gun.boltCatch.localToWorld(new Vector3(-0.025, 0.0, 0.0));
      target.position.copy(guardPos).lerp(magPos, s.hand).lerp(catchPos, s.catchPress);
      target.quaternion.copy(guardQ).slerp(magQ, s.hand);
      this.arms.setGrip(1, s.hand > 0.3 && s.hand < 0.95 ? 0.5 : s.catchPress > 0.5 ? 0.3 : 1);
      right = this.gun.sockets.rightGrip;
    } else {
      right = this.#animateKit(kit, s, state, boltLocked, cycle);
    }

    // The frag in the support hand: held up while cooking, wound back and thrown on release.
    if (g) {
      const hold = new Vector3();
      if (g.phase === 'cook') hold.copy(FRAG_HOLD).add(new Vector3(0, Math.sin(this.#time * 2.1) * 0.004, 0));
      else if (g.time < FRAG_LETGO * 0.5) hold.copy(FRAG_HOLD).lerp(FRAG_WIND, ease(g.time / (FRAG_LETGO * 0.5)));
      else hold.copy(FRAG_WIND).lerp(FRAG_RELEASE, ease(Math.min(1, (g.time - FRAG_LETGO * 0.5) / (FRAG_LETGO * 0.5))));
      const w = g.phase === 'cook' ? lowered : 1 - ease(Math.min(1, Math.max(0, (g.time - FRAG_LETGO) / 0.15)));
      target.position.lerp(hold, w);
      target.quaternion.slerp(FRAG_PALM, w);
      if (!this.#frag) {
        this.#frag = buildFrag();
        this.root.add(this.#frag.root);
      }
      this.#frag.root.visible = g.phase === 'cook' || g.time < FRAG_LETGO;
      target.updateMatrixWorld(true);
      this.#frag.root.position.copy(target.localToWorld(FRAG_IN_PALM.clone()));
      this.#frag.root.quaternion.identity();
      if (w > 0.5) this.arms.setGrip(1, 0.85);
    } else if (this.#frag) {
      this.#frag.root.visible = false;
    }
    target.updateMatrixWorld(true);
    this.arms.solve(right, target);
    // Fully aimed through a scope the gun is out of the way: the overlay takes over.
    this.root.visible = state.alive && !(row.traits.sight === 'scope' && state.ads >= SCOPED_AT);
  }

  /** Moves a v2 weapon's parts and puts the support hand where the frame needs it; returns the right hand's target. */
  #animateKit(kit: KitGun, s: Sample, state: ViewmodelState, slideLocked: number, cycle: number): Object3D {
    const rig = kit.rig;
    const travel = rig.travel ?? 0;
    const mag = kit.part('mag');
    if (mag) {
      mag.node.position.set(mag.position.x + s.mag[0], mag.position.y + s.mag[1], mag.position.z + s.mag[2]);
      mag.node.visible = !(state.action === 'reload' && s.mag[1] < -0.25);
    }
    const slide = kit.part('slide');
    if (slide) slide.node.position.set(slide.position.x, slide.position.y, slide.position.z + travel * Math.max(slideLocked, cycle));
    const pump = kit.part('pump');
    if (pump) pump.node.position.set(pump.position.x, pump.position.y, pump.position.z + travel * s.pump);
    const bolt = kit.part('bolt');
    if (bolt) {
      bolt.node.quaternion.copy(bolt.quaternion).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.1 * s.boltLift));
      bolt.node.position.set(bolt.position.x, bolt.position.y, bolt.position.z + travel * s.boltPull);
    }
    // The support palm rides the pump.
    kit.sockets.support.position.copy(kit.supportRest).add(new Vector3(0, 0, rig.leftOnPump ? travel * s.pump : 0));
    this.root.updateMatrixWorld(true);

    const target = this.#leftTarget;
    const support = kit.sockets.support;
    target.position.copy(support.getWorldPosition(new Vector3()));
    target.quaternion.copy(support.getWorldQuaternion(new Quaternion()));
    if (s.hand > 0) {
      // To the magazine for a swap, or to the loading port with a shell.
      const reach = mag && rig.magGrab ? mag.node.localToWorld(new Vector3(...rig.magGrab)) : rig.loadingPort ? kit.root.localToWorld(new Vector3(...rig.loadingPort)) : null;
      if (reach) {
        const q = (mag ?? { node: kit.root }).node.getWorldQuaternion(new Quaternion()).multiply(new Quaternion().setFromEuler(new Euler(0, 0, -Math.PI / 2)));
        target.position.lerp(reach, s.hand);
        target.quaternion.slerp(q, s.hand);
      }
    }
    this.arms.setGrip(s.right > 0.5 ? 0.85 : 1, s.hand > 0.3 && s.hand < 0.95 ? 0.5 : 1);

    // On a bolt gun the right hand leaves the grip for the handle.
    const grip = kit.sockets.rightGrip;
    if (s.right <= 0 || !bolt) return grip;
    const gunQ = kit.root.getWorldQuaternion(new Quaternion());
    const palm = bolt.node.localToWorld(BOLT_KNOB.clone()).add(BOLT_PALM_FROM_KNOB.clone().applyQuaternion(gunQ));
    this.#rightTarget.position.copy(grip.getWorldPosition(new Vector3())).lerp(palm, s.right);
    this.#rightTarget.quaternion.copy(grip.getWorldQuaternion(new Quaternion())).slerp(gunQ.multiply(BOLT_PALM), s.right);
    this.#rightTarget.updateMatrixWorld(true);
    return this.#rightTarget;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeAuthored?.();
    this.#disposeAuthored = null;
    this.gun.dispose();
    for (const kit of this.#kits.values()) kit.dispose();
    this.#frag?.dispose();
    this.arms.dispose();
  }
}
