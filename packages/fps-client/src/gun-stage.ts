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

/**
 * The gun sways this far (radians) either side of side on, never end on: a full turn showed a sliver of muzzle half
 * the time (review 2026-11-14b). Dragging turns it any way round.
 */
const SWAY = (32 * Math.PI) / 180;
/** One sway, there and back (s). */
const SWAY_SECONDS = 16;
/** Turn (radians) per pixel dragged. */
const DRAG_TURN = 0.012;
/** Let go this long (ms), a dragged gun turns back to side on, the short way, by this much a second (1/s). */
const RETURN_AFTER = 2500;
const RETURN_RATE = 2.5;
/** Side on, the gun's length fills this much of the stage's width. */
const FILL = 0.86;
/** Frames a second at most: the menu is still, and the toaster draws the map behind it as well. */
const FPS = 30;
/** The longest the page's background shader work waits on a gun asked for (ms, `busy`): one that never draws can't hold it back. */
const BUSY_MS = 8000;
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

/**
 * Each gun's still, side on in its stock build (`apps/range/scripts/gun-stills.mjs` makes them from this stage):
 * shown the moment the screen asks for a gun, until its model is drawn, which on a fresh page waits seconds on shaders.
 */
const STILLS: Readonly<Record<WeaponId, URL>> = {
  m4a1: new URL('./viewmodel/assets/stills/m4a1.webp', import.meta.url),
  smg: new URL('./viewmodel/assets/stills/smg.webp', import.meta.url),
  shotgun: new URL('./viewmodel/assets/stills/shotgun.webp', import.meta.url),
  sniper: new URL('./viewmodel/assets/stills/sniper.webp', import.meta.url),
  pistol: new URL('./viewmodel/assets/stills/pistol.webp', import.meta.url),
  lmg: new URL('./viewmodel/assets/stills/lmg.webp', import.meta.url),
  dmr: new URL('./viewmodel/assets/stills/dmr.webp', import.meta.url),
  burst: new URL('./viewmodel/assets/stills/burst.webp', import.meta.url),
  revolver: new URL('./viewmodel/assets/stills/revolver.webp', import.meta.url),
};
const still = (id: WeaponId): string => STILLS[id].href;

/** One shown mesh of each look under `root`: its materials and the attributes its vertices carry, which pick its shader. */
function looks(root: Object3D): Iterable<Mesh> {
  const one = new Map<string, Mesh>();
  root.traverseVisible((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const { attributes, index } = mesh.geometry;
    const layout = Object.keys(attributes).sort().map((name) => `${name}${attributes[name]!.itemSize}${attributes[name]!.normalized ? 'n' : ''}`);
    const key = `${materials.map((m) => m.uuid).join()}|${layout.join()}|${index ? 'i' : ''}|${mesh.matrixWorld.determinant() < 0 ? 'm' : ''}|${mesh.type}`;
    if (!one.has(key)) one.set(key, mesh);
  });
  return one.values();
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
  /** Drawn on the stage at least once: its still is no longer needed. */
  drawn: boolean;
}

/**
 * The Loadout screen's gun in 3D (PLAN item 7): the gun's own Blender model
 * with its optic on, swaying slowly on the page's dark, turned by dragging. Its
 * own small renderer on its own canvas, made the first time the screen opens
 * and kept for the page after, drawn only while the screen is up. Until a gun's
 * model is drawn, its still stands in.
 */
export class LoadoutGunStage implements GunStage {
  readonly element: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #still: HTMLImageElement;
  #renderer: WebGPURenderer | null = null;
  #starting: Promise<void> | null = null;
  /** The renderer could not be made: no gun will be drawn. */
  #failed = false;
  /** When the gun on show was asked for (ms, `performance.now`). */
  #asked = 0;
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(FOV, 16 / 9, 0.05, 50);
  /** Turns; the gun sits in it with its middle on the axis. */
  readonly #turntable = new Group();
  readonly #guns = new Map<WeaponId, StagedGun>();
  #shown: WeaponId | null = null;
  /** Half the gun's length and half its height (m), which frame it side on. */
  #half = new Vector2(0.4, 0.12);
  /** Seconds of sway drawn since the gun came on: 0 is side on, as its still. */
  #time = 0;
  /** Turned by dragging (radians). */
  #spin = 0;
  /** A drag is on, or when the last one ended (ms, `performance.now`). */
  #dragging = false;
  #released = 0;
  /** The player asks for less motion. */
  readonly #calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
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
    this.#still = document.createElement('img');
    this.#still.alt = '';
    this.#still.hidden = true;
    this.element.append(this.#still, this.#canvas);
    this.#dragToTurn();
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
      this.#asked = performance.now();
      this.#showStill(id, gun);
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

  /**
   * `id`'s still until its model is drawn; `data-shown` names the gun once either is on the screen. A gun drawn before
   * shows at once, unless another gun's shaders are being made, which holds every frame: its still stands in meanwhile.
   */
  #showStill(id: WeaponId, gun: StagedGun): void {
    if (gun.drawn && this.#compiling === 0) {
      this.#still.hidden = true;
      this.element.dataset['shown'] = id;
      return;
    }
    delete this.element.dataset['shown'];
    const src = still(id);
    this.#still.hidden = false;
    if (this.#still.getAttribute('src') !== src) this.#still.src = src;
    void this.#still
      .decode()
      .then(() => {
        if (this.#shown === id && !this.#still.hidden) this.element.dataset['shown'] = id;
      })
      .catch(() => undefined);
  }

  /** A drag across the stage turns the gun; a vertical swipe on a phone still scrolls the page (`touch-action`). */
  #dragToTurn(): void {
    let from: number | null = null;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      from = e.clientX;
      this.#dragging = true;
      this.element.setPointerCapture(e.pointerId);
    });
    this.element.addEventListener('pointermove', (e) => {
      if (from === null) return;
      this.#spin += (e.clientX - from) * DRAG_TURN;
      from = e.clientX;
    });
    const end = () => {
      from = null;
      this.#dragging = false;
      this.#released = performance.now();
      // Within half a turn of side on, so it comes back the short way.
      this.#spin = Math.atan2(Math.sin(this.#spin), Math.cos(this.#spin));
    };
    this.element.addEventListener('pointerup', end);
    this.element.addEventListener('pointercancel', end);
    // The screen redrawn mid-drag takes the stage out of the page, and the capture with it.
    this.element.addEventListener('lostpointercapture', end);
  }

  /**
   * The stage's picture of the gun on it now, side on, as a WebP with a clear background: how its still is made
   * (`apps/range/scripts/gun-stills.mjs`). Null until that gun is drawn.
   */
  snapshot(): string | null {
    const gun = this.#shown ? this.#guns.get(this.#shown) : undefined;
    if (!gun?.drawn) return null;
    const [time, spin] = [this.#time, this.#spin];
    this.#time = 0;
    this.#spin = 0;
    this.#render();
    this.#time = time;
    this.#spin = spin;
    return this.#canvas.toDataURL('image/webp', 0.9);
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
   * One call per look (material and vertex layout), all at once: a single call makes its pipelines one after another,
   * about half a second each on a fresh page here, 4 s for the M4A1's nine (review 2026-11-14c), where the browser
   * makes several side by side.
   */
  #compile(gun: StagedGun): Promise<void> {
    gun.compiled ??= (async () => {
      const renderer = this.#renderer;
      if (!renderer || !this.#frameable(gun)) return;
      const w = this.#canvas.clientWidth;
      const h = this.#canvas.clientHeight;
      this.#aim(gun.root.userData['half'] as Vector2, w > 1 && h > 1 ? w / h : 16 / 9);
      // Shown for the calls only: each gathers what it will make before its first wait.
      const shown = gun.root.visible;
      gun.root.visible = true;
      this.#turntable.updateMatrixWorld(true);
      const made = Promise.allSettled([...looks(gun.root)].map((mesh) => renderer.compileAsync(mesh, this.#camera, this.#scene)));
      gun.root.visible = shown;
      await made;
    })();
    return gun.compiled;
  }

  get busy(): boolean {
    if (!this.#wanted || this.#shown === null || this.#failed || performance.now() - this.#asked > BUSY_MS) return false;
    return this.#compiling > 0 || this.#guns.get(this.#shown)?.drawn !== true;
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
      gun = { root: m4.root, kit: null, loaded, optic: null, compiled: null, drawn: false, dress: { id, root: m4.root, loaded, magazine: () => m4.magazine, rest: () => null } };
    } else {
      const kit = buildKitGun(id);
      void kit.loaded.then(() => noWindows(kit.root));
      gun = { root: kit.root, kit, loaded: kit.loaded, optic: null, compiled: null, drawn: false, dress: { id, root: kit.root, loaded: kit.loaded, magazine: () => kit.part('mag')?.node ?? null, rest: (name) => kit.part(name) } };
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
    // Each gun comes on side on, as its still, then sways.
    this.#time = 0;
    this.#spin = 0;
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
      this.#failed = true;
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
      // The sway runs only while the gun is drawn, so it comes on side on, as its still, however long its shaders took.
      if (this.#draw()) this.#time = (this.#time + dt) % SWAY_SECONDS;
      if (!this.#dragging && this.#spin !== 0 && now - this.#released > RETURN_AFTER) {
        this.#spin *= Math.exp(-RETURN_RATE * dt);
        if (Math.abs(this.#spin) < 1e-3) this.#spin = 0;
      }
    };
    this.#frame = requestAnimationFrame(tick);
  }

  /** Frames a gun of `half` size on a canvas of `aspect`. */
  #aim(half: Vector2, aspect: number): void {
    this.#camera.aspect = aspect;
    const across = Math.atan(Math.tan((FOV / 2) * (Math.PI / 180)) * aspect);
    const up = (FOV / 2) * (Math.PI / 180);
    // Side on, its length `FILL` of the width and its height inside the height. Swayed, it is shorter across, and its
    // nearer end grows by less than that (the lens is long), so side on is its widest.
    const distance = Math.max(half.x / Math.tan(across) / FILL, half.y / Math.tan(up) / 0.8);
    this.#camera.position.set(0, half.x * 0.12, distance);
    this.#camera.lookAt(0, 0, 0);
    this.#camera.updateProjectionMatrix();
  }

  /** Draws a frame, unless shaders are being made; whether it drew the gun asked for. */
  #draw(): boolean {
    if (this.#compiling > 0 || !this.#render()) return false;
    // Which gun is on the stage once drawn, for a scripted look (`data-drawn`).
    const gun = this.#shown ? this.#guns.get(this.#shown) : undefined;
    const on = gun?.root.visible === true;
    const drawn = on ? `${this.#shown}${gun.optic?.node ? `+${gun.optic.id}` : ''}` : '';
    if (this.element.dataset['drawn'] !== drawn) this.element.dataset['drawn'] = drawn;
    if (on && this.#shown) {
      gun.drawn = true;
      // The model is on: its still goes in the same frame.
      this.#still.hidden = true;
      this.element.dataset['shown'] = this.#shown;
    }
    return on;
  }

  /** Renders the stage as it stands; false without a renderer or a canvas to draw on. */
  #render(): boolean {
    const renderer = this.#renderer;
    if (!renderer) return false;
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    if (w < 2 || h < 2) return false;
    const size = renderer.getSize(this.#size);
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    // Side on at rest (the muzzle to the right), swaying about the upright axis, and turned as dragged.
    // Held side on for a player who asks for less motion; dragging still turns it.
    const sway = this.#calm?.matches ? 0 : SWAY * Math.sin((this.#time / SWAY_SECONDS) * Math.PI * 2);
    this.#turntable.rotation.set(0, -Math.PI / 2 + sway + this.#spin, 0);
    this.#aim(this.#half, w / h);
    renderer.render(this.#scene, this.#camera);
    return true;
  }
}
