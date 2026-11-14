import { STATS, type Attachments, type OpticId, type WeaponId } from '@duty-shooter/fps-core';
import { ACESFilmicToneMapping, Box3, DirectionalLight, Group, PerspectiveCamera, PMREMGenerator, Scene, Vector2, Vector3, WebGPURenderer, type Mesh, type Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GunStage } from './ui/menu';
import { attachAuthoredM4 } from './viewmodel/authored-m4a1';
import { buildKitGun, type KitGun } from './viewmodel/kit';
import { buildM4A1 } from './viewmodel/m4a1';
import type { CamoId, Reticles } from './customize';
import { dressGun, dressedNow, type DressableGun } from './viewmodel/fittings';
import { IRON_NODES, OPTIC_MOUNTS, SIGHT_WINDOW, mountOptic, opticTemplate, setReticles } from './viewmodel/optics';

/** One full turn takes this long (s): slow enough to read the gun as it goes round. */
const TURN_SECONDS = 24;
/** Frames a second at most: the menu is still, and the toaster draws the map behind it as well. */
const FPS = 30;
/** The lens's vertical field of view (degrees): long, so the gun reads flat like a product shot. */
const FOV = 24;

/**
 * Takes a magnified sight's window out of `root` (`addSightWindow`): it clears the first-person picture to the world,
 * and this canvas has no world behind it, only the page, which showed through as a dark patch round the optic.
 */
function noWindows(root: Object3D): void {
  const windows: Object3D[] = [];
  root.traverse((o) => o.name === SIGHT_WINDOW && windows.push(o));
  for (const w of windows) w.visible = false;
}

/** A gun on the stage: its model, and the optic on it now. */
interface StagedGun {
  readonly root: Object3D;
  readonly kit: KitGun | null;
  readonly loaded: Promise<void>;
  optic: { readonly id: OpticId; node: Object3D | null; readonly ready: Promise<void> } | null;
  /** The gun as its fittings and camo see it. */
  readonly dress: DressableGun;
  /** Its shaders made, once asked for: by the first show, or ahead of it by `warm`. */
  compiled: Promise<void> | null;
}

/**
 * The Loadout screen's gun in 3D (PLAN item 7): the gun's own Blender model
 * with its optic on, turning slowly on the page's dark. Its own small
 * renderer on its own canvas, made the first time the screen opens and kept
 * for the page after, drawn only while the screen is up.
 */
export class LoadoutGunStage implements GunStage {
  readonly element: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  #renderer: WebGPURenderer | null = null;
  #starting: Promise<void> | null = null;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(FOV, 16 / 9, 0.05, 50);
  /** Turns; the gun sits in it with its middle on the axis. */
  readonly #turntable = new Group();
  readonly #guns = new Map<WeaponId, StagedGun>();
  #shown: WeaponId | null = null;
  /** Half the gun's length and half its height (m), which frame it side on. */
  #half = new Vector2(0.4, 0.12);
  #angle = 0;
  #frame = 0;
  #last = 0;
  #drawn = 0;
  /** Guns whose shaders are being made: nothing is drawn meanwhile. */
  #compiling = 0;
  readonly #size = new Vector2();

  readonly #forceWebGL: boolean;
  /** A gun is asked for and the screen is up: the frame loop runs only while this holds. */
  #wanted = false;

  /** `forceWebGL`: the WebGL2 backend, as the game's own renderer was asked for (`?webgl`). */
  constructor(options: { readonly forceWebGL?: boolean } = {}) {
    this.#forceWebGL = options.forceWebGL ?? false;
    this.element = document.createElement('div');
    this.element.className = 'ds-stage';
    this.element.setAttribute('role', 'img');
    this.#canvas = document.createElement('canvas');
    this.element.append(this.#canvas);
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(1.5, 2.5, 2);
    const rim = new DirectionalLight(0xffe2b8, 1.6);
    rim.position.set(-2, 0.8, -2.5);
    this.#scene.add(key, rim, this.#turntable);
  }

  show(id: WeaponId, kit: Attachments | undefined, camo: CamoId | null = null, reticles?: Reticles): void {
    this.element.setAttribute('aria-label', STATS.weapons[id].traits.name);
    const gun = this.#dress(id, kit, camo, reticles);
    if (this.#shown !== id) {
      for (const [other, g] of this.#guns) g.root.visible = other === id && this.#frameable(g);
      this.#shown = id;
      void Promise.all([gun.loaded, this.#start()]).then(async () => {
        if (this.#shown !== id) return;
        this.#place(gun);
        // Its shaders made off the frame before it first shows, so the menu doesn't stall on them.
        this.#compiling += 1;
        try {
          await this.#compile(gun);
        } finally {
          this.#compiling -= 1;
        }
      });
    }
    this.#wanted = true;
    void this.#start().then(() => this.#run());
  }

  /**
   * Gets the gun the screen will open on ready ahead of it, drawing nothing: the renderer, the gun's model, optic
   * and fittings, and its shaders, the slow part of a first open (5 to 10 s on this PC). Settles when done, or at once
   * once the screen has shown a gun (it would undo a preview on show); `wanted` false (a match started) ends it early.
   */
  async warm(id: WeaponId, kit: Attachments | undefined, camo: CamoId | null = null, reticles?: Reticles, wanted: () => boolean = () => true): Promise<void> {
    if (this.#shown !== null) return;
    const gun = this.#dress(id, kit, camo, reticles);
    await Promise.all([gun.loaded, gun.optic?.ready, dressedNow(gun.root), this.#start()]);
    if (!wanted() || !this.#renderer) return;
    this.#measure(gun);
    await this.#compile(gun);
    // For a scripted look: which gun is ready.
    this.element.dataset['warm'] = id;
  }

  /** `id`'s gun, with `kit`'s optic and fittings and `camo` on (once they are in). */
  #dress(id: WeaponId, kit: Attachments | undefined, camo: CamoId | null, reticles: Reticles | undefined): StagedGun {
    if (reticles) setReticles(reticles);
    const gun = this.#gun(id);
    this.#fitOptic(id, gun, kit?.optic ?? null);
    dressGun(gun.dress, kit, camo);
    return gun;
  }

  /**
   * Makes `gun`'s shaders off the frame, once: only that gun, lit by the stage, seen as the camera will frame it
   * (`compileAsync` skips what is hidden or out of view). An optic or fitting put on later compiles when first drawn.
   */
  #compile(gun: StagedGun): Promise<void> {
    gun.compiled ??= (async () => {
      const renderer = this.#renderer;
      if (!renderer || !this.#frameable(gun)) return;
      const w = this.#canvas.clientWidth;
      const h = this.#canvas.clientHeight;
      this.#aim(gun.root.userData['half'] as Vector2, w > 1 && h > 1 ? w / h : 16 / 9);
      // Shown for the call only: it gathers what it will make before its first wait.
      const shown = gun.root.visible;
      gun.root.visible = true;
      const made = renderer.compileAsync(gun.root, this.#camera, this.#scene);
      gun.root.visible = shown;
      await made.catch(() => undefined);
    })();
    return gun.compiled;
  }

  stop(): void {
    this.#wanted = false;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** Whether `gun`'s model is in and placed. */
  #frameable(gun: StagedGun): boolean {
    return gun.root.userData['placed'] === true;
  }

  #gun(id: WeaponId): StagedGun {
    let gun = this.#guns.get(id);
    if (gun) return gun;
    if (id === 'm4a1') {
      const m4 = buildM4A1({ detail: 'high' });
      const loaded = new GLTFLoader()
        .loadAsync(new URL('./viewmodel/assets/m4a1-details.glb', import.meta.url).href)
        .then(({ scene }) => void attachAuthoredM4(m4, scene))
        .catch((error: unknown) => console.warn('Unable to load the M4A1 details for the Loadout screen:', error));
      gun = { root: m4.root, kit: null, loaded, optic: null, compiled: null, dress: { id, root: m4.root, loaded, magazine: () => m4.magazine, rest: () => null } };
    } else {
      const kit = buildKitGun(id);
      void kit.loaded.then(() => noWindows(kit.root));
      gun = { root: kit.root, kit, loaded: kit.loaded, optic: null, compiled: null, dress: { id, root: kit.root, loaded: kit.loaded, magazine: () => kit.part('mag')?.node ?? null, rest: (name) => kit.part(name) } };
    }
    gun.root.visible = false;
    this.#turntable.add(gun.root);
    this.#guns.set(id, gun);
    return gun;
  }

  /** Puts `optic` on `gun` once both are in, folding its irons; or takes it off. */
  #fitOptic(id: WeaponId, gun: StagedGun, optic: OpticId | null): void {
    const mount = OPTIC_MOUNTS[id];
    const want = mount && optic ? optic : null;
    if ((gun.optic?.id ?? null) === want) return;
    gun.optic?.node?.removeFromParent();
    gun.optic = null;
    const irons = (shown: boolean) => gun.root.traverse((o) => {
      if (IRON_NODES.includes(o.name)) o.visible = shown;
    });
    irons(true);
    if (!want || !mount) return;
    const ready = Promise.all([opticTemplate(want), gun.loaded]).then(([template]) => {
      if (gun.optic !== entry || !template) return;
      const part = mount.on && gun.kit ? gun.kit.part(mount.on) : null;
      entry.node = mountOptic(gun.root, template, want, mount, part);
      noWindows(entry.node);
      irons(false);
    });
    const entry = { id: want, node: null as Object3D | null, ready };
    gun.optic = entry;
  }

  /** Centres the loaded `gun` on the turntable's axis and frames it, so the whole gun stays in view as it turns. */
  #place(gun: StagedGun): void {
    this.#measure(gun);
    this.#half.copy(gun.root.userData['half'] as Vector2);
    // Each gun comes on side on, then turns.
    this.#angle = 0;
    gun.root.visible = this.#shown !== null && this.#guns.get(this.#shown) === gun;
  }

  /** Centres the loaded `gun` on the turntable's axis and keeps its size (`half`), once. */
  #measure(gun: StagedGun): void {
    if (!this.#frameable(gun)) {
      // Measured in the turntable's own space, at rest.
      const turned = this.#turntable.rotation.clone();
      this.#turntable.rotation.set(0, 0, 0);
      gun.root.position.set(0, 0, 0);
      this.#turntable.updateMatrixWorld(true);
      // Only what shows: a reload's loose rounds and the sockets stay out of the frame.
      const box = new Box3();
      const part = new Box3();
      // Without its optic, which may or may not be on yet: the same frame whatever sits on the rail.
      const shown = gun.root.visible;
      const optic = gun.optic?.node ?? null;
      if (optic) optic.visible = false;
      gun.root.visible = true;
      // Without its fittings too, which come and go.
      const fittings: Object3D[] = [];
      gun.root.traverse((o) => o.name.startsWith('fitting:') && o.visible && fittings.push(o));
      for (const f of fittings) f.visible = false;
      gun.root.traverseVisible((o) => {
        const geometry = (o as Mesh).isMesh ? (o as Mesh).geometry : null;
        if (!geometry) return;
        geometry.boundingBox ?? geometry.computeBoundingBox();
        if (geometry.boundingBox) box.union(part.copy(geometry.boundingBox).applyMatrix4(o.matrixWorld));
      });
      gun.root.visible = shown;
      if (optic) optic.visible = true;
      for (const f of fittings) f.visible = true;
      const centre = box.getCenter(gun.root.position).negate();
      gun.root.position.copy(centre);
      this.#turntable.rotation.copy(turned);
      gun.root.userData['placed'] = true;
      const size = box.getSize(new Vector3());
      gun.root.userData['half'] = new Vector2(Math.max(size.x, size.z) / 2, size.y / 2);
    }
  }

  /** The renderer, made once: the room's light for reflections, and a clear background so the page shows through. */
  #start(): Promise<void> {
    this.#starting ??= (async () => {
      const renderer = new WebGPURenderer({ canvas: this.#canvas, antialias: true, alpha: true, forceWebGL: this.#forceWebGL });
      await renderer.init();
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.85;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      const pmrem = new PMREMGenerator(renderer);
      this.#scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.#scene.environmentIntensity = 0.45;
      pmrem.dispose();
      this.#renderer = renderer;
    })().catch((error: unknown) => {
      console.warn('The Loadout screen draws no gun:', error);
    });
    return this.#starting;
  }

  #run(): void {
    if (this.#frame || !this.#renderer || !this.#wanted) return;
    this.#last = performance.now();
    const tick = (now: number) => {
      this.#frame = 0;
      // Closed, or hidden with the menu: the loop ends, and the next show starts it again.
      if (!this.#wanted || !this.element.isConnected || this.element.clientWidth === 0) return;
      this.#frame = requestAnimationFrame(tick);
      if (now - this.#drawn < 1000 / FPS - 2) return;
      this.#drawn = now;
      const dt = Math.min(0.1, (now - this.#last) / 1000);
      this.#last = now;
      this.#angle = (this.#angle + (dt * Math.PI * 2) / TURN_SECONDS) % (Math.PI * 2);
      this.#draw();
    };
    this.#frame = requestAnimationFrame(tick);
  }

  /** Frames a gun of `half` size on a canvas of `aspect`. */
  #aim(half: Vector2, aspect: number): void {
    this.#camera.aspect = aspect;
    const across = Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * aspect);
    const up = (FOV / 2) * (Math.PI / 180);
    // Side on, its length a little inside the width and its height inside the height; turned, its ends come nearer and grow a little.
    const distance = Math.max(half.x / Math.tan(across), half.y / Math.tan(up)) * 1.3 + half.x * 0.5;
    this.#camera.position.set(0, half.x * 0.12, distance);
    this.#camera.lookAt(0, 0, 0);
    this.#camera.updateProjectionMatrix();
  }

  #draw(): void {
    const renderer = this.#renderer;
    if (!renderer || this.#compiling > 0) return;
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const size = renderer.getSize(this.#size);
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    // Side on to start (the muzzle to the right), turning about the upright axis.
    this.#turntable.rotation.set(0, -Math.PI / 2 + this.#angle, 0);
    this.#aim(this.#half, w / h);
    renderer.render(this.#scene, this.#camera);
    // Which gun is on the stage once drawn, for a scripted look (`data-drawn`).
    const gun = this.#shown ? this.#guns.get(this.#shown) : undefined;
    const drawn = gun?.root.visible ? `${this.#shown}${gun.optic?.node ? `+${gun.optic.id}` : ''}` : '';
    if (this.element.dataset['drawn'] !== drawn) this.element.dataset['drawn'] = drawn;
  }
}
