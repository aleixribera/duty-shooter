import {
  STATS,
  TICK_SECONDS,
  Button,
  angleDelta,
  inSite,
  inZone,
  siteCentre,
  isShellReload,
  teamMode,
  raycastWorld,
  sightBlocked,
  viewDirection,
  type ChargeSite,
  type ChargeState,
  type KillWeapon,
  type Material,
  type ModeId,
  type PlayerId,
  type PlayerOutput,
  type UserCmd,
  type Vec3,
  type WeaponId,
  type World,
  type Zone,
} from '@duty-shooter/fps-core';
import { DEFUSE_RANGE } from '@duty-shooter/fps-core/modes';
import { ACESFilmicToneMapping, Vector3, type Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { ArsenalView } from './arsenal-view';
import type { SoundEventName, SoundParams, SoundSystem } from './audio';
import { FirstPersonCamera, shotPose } from './camera';
import { Effects } from './effects';
import { Hud, type ChargeHud, type HitKind, type ObjectiveMarker, type ZoneMarker } from './hud/hud';
import { TEAMS, chargeRoster } from './ui/model';
import { InputController } from './input';
import { FixedTickLoop } from './loop';
import { ChargeSounds } from './charge-sounds';
import { DETONATION, Nuke, nukeFrame, sinceMatchEnd } from './nuke';
import { TrainSounds } from './train';
import { Ambience, environmentAt, muffled } from './map-sound';
import { GamePipeline, PRESETS, effectivePreset } from './pipeline';
import { PlayersView } from './players-view';
import type { RenderBackend } from './renderer';
import type { GameDriver, PresentedEvent } from './session';
import { PAD_LAYOUTS, padButtonLabel } from './gamepad';
import { bindingLabel, verticalFov, type Settings } from './settings';
import { Viewmodel } from './viewmodel/viewmodel';
import { WorldView, type WorldContent } from './world-view';
import type { BakeFile } from './surfaces';
import { currentLighting } from './surface-materials';

/** The probes' ambient luminance on open ground (0.3 to 0.5 round the town), where the gun gets its full fill light. */
const OPEN_AMBIENT = 0.4;

const TICK_MS = TICK_SECONDS * 1000;
/** How far the nuke's shock shakes the ending's shot at its strongest (radians, peak to peak). */
const SHOT_SHAKE = 0.012;

export interface GameOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly backend: RenderBackend;
  readonly content: WorldContent;
  /** The map's baked lighting (see loadBake); the world draws unbaked until it arrives, or for good if it is null. */
  readonly bake?: Promise<BakeFile | null>;
  /** Collision world, for footstep surfaces, casings, blood splats and the range distance readout. */
  readonly world: World;
  readonly settings: Settings;
  readonly sound: SoundSystem;
  /** Where to look from while there is no local player (connecting, spectating). */
  readonly overview: { readonly position: Vec3; readonly yaw: number; readonly pitch: number };
  /** Builds a third-person rifle for other players, or null for none. */
  readonly thirdPersonWeapon?: (() => Object3D) | null;
  /** Where Use opens the loadout screen (the range's station), if the map has one. */
  readonly loadoutStation?: { readonly position: Vec3; readonly radius: number } | null;
  /** The range's firing lanes, west of this x, where the TTK overlay shows; null (the default) on a map without them. */
  readonly rangeLanesWestOf?: number | null;
}

/** Per-action timings for the weapon's foley, in seconds into the action. */
function foleyCues(self: PlayerOutput): readonly (readonly [number, SoundEventName])[] {
  const w = self.weapon;
  const row = STATS.weapons[w.id];
  if (w.action === 'reload') {
    const r = row.reload;
    if (isShellReload(r)) {
      // One shell going in at each add point; the reload ends when the tube is full, so later cues never come.
      return Array.from({ length: row.handling.magazineSize.value }, (_, k) => [r.start.value + k * r.perShell.value - 0.05, 'shellInsert'] as const);
    }
    const empty = w.reload === 'empty';
    const add = empty ? r.emptyAddAmmo.value : r.tacticalAddAmmo.value;
    const cues: [number, SoundEventName][] = [
      [0.32, 'reloadMagOut'],
      [add - (empty ? 0.55 : 0.22), 'reloadMagIn'],
    ];
    if (empty) cues.push([add - 0.08, w.id === 'm4a1' || w.id === 'pistol' ? 'reloadBoltRelease' : 'reloadChargingHandle']);
    return cues;
  }
  if (w.action === 'cycle') {
    const cycle = row.handling.cycleTime?.value ?? 0;
    if (row.traits.fireMode === 'pump') return [[cycle * 0.15, 'pumpRack']];
    return [[cycle * 0.12, 'boltOpen'], [cycle * 0.5, 'boltClose']];
  }
  if (w.action === 'draw') return [[0.02, 'weaponRaise']];
  if (w.action === 'inspect') return w.id === 'm4a1' ? [[0.45, 'inspectRattle'], [2.1, 'inspectRattle'], [3.6, 'reloadChargingHandle']] : [[0.45, 'inspectRattle'], [2.1, 'inspectRattle']];
  if (w.action === 'melee') return [[0.01, 'meleeSwing']];
  return [];
}

/** How a kill feed line names what did it. */
function killedWith(cause: string, weapon: KillWeapon | null): string {
  if (cause === 'melee') return 'Melee';
  if (weapon === 'frag') return 'Frag';
  return weapon ? STATS.weapons[weapon].traits.name : '';
}

/** How hard each gun kicks the camera, against the M4A1's 1. */
const CAMERA_KICK: Readonly<Record<WeaponId, number>> = { m4a1: 1, smg: 0.7, pistol: 0.9, shotgun: 2.6, sniper: 3 };

const STEP_LENGTH: Readonly<Record<string, number>> = { walk: 1.45, sprint: 1.75, tacticalSprint: 2.0, crouch: 1.1, prone: 0.9 };

interface Tracked {
  stepDistance: number;
  last: Vec3;
  /** The player as last seen, for their movement and weapon sounds (other players only). */
  seen: PlayerOutput | null;
}

interface Engagement {
  start: number;
  shots: number;
  hits: number;
}

/**
 * One running game in the page: the fixed-tick loop over a driver (offline
 * or online), the camera, viewmodel, other players, effects, sound and HUD,
 * all fed from the simulation's output and events.
 */
export class Game {
  readonly input: InputController;
  readonly hud: Hud;
  readonly #renderer: WebGPURenderer;
  readonly #backend: RenderBackend;
  readonly #canvas: HTMLCanvasElement;
  readonly #worldView: WorldView;
  readonly #world: World;
  readonly #camera = new FirstPersonCamera();
  readonly #viewmodel: Viewmodel;
  readonly #players: PlayersView;
  readonly #arsenal: ArsenalView;
  /** Explosions already shown (the server repeats important events in case a snapshot is lost). */
  readonly #explosions = new Set<number>();
  readonly #effects: Effects;
  readonly #pipeline: GamePipeline;
  readonly #loop = new FixedTickLoop();
  readonly #sound: SoundSystem;
  #overview: GameOptions['overview'];
  readonly #worldFlashes: Mesh[] = [];
  #nextWorldFlash = 0;
  #viewFlash: Mesh;
  #settings: Settings;
  #driver: GameDriver | null = null;
  #prev: PlayerOutput | null = null;
  #cur: PlayerOutput | null = null;
  #cmd: UserCmd | null = null;
  #others: readonly PlayerOutput[] = [];
  #lastFrame: number | null = null;
  #frameStart = 0;
  #fps = 60;
  #lastLook = { yaw: 0, pitch: 0 };
  #simTime = 0;
  readonly #tracked = new Map<PlayerId, Tracked>();
  readonly #engagements = new Map<PlayerId, Engagement>();
  #burstStart = -1;
  #paused = true;
  #message: string | null = null;
  readonly #loadoutStation: GameOptions['loadoutStation'];
  readonly #rangeLanesWestOf: number | null;
  /** The map's Outposts zones, for their markers. */
  readonly #zones: readonly Zone[];
  /** The map's Charge sites, for their markers. */
  readonly #sites: readonly ChargeSite[];
  /** The teammate a dead player watches in Charge, while they live. */
  #watching: PlayerId | null = null;
  /** Use held on the last tick, so a press opens the loadout screen once. */
  #useHeld = false;
  /**
   * Use pressed while dead (`death`) or at the range's loadout station
   * (`station`): the page opens the loadout screen.
   */
  onLoadout: ((from: 'death' | 'station') => void) | null = null;
  #resizeObserver: ResizeObserver;
  /** The mode this player voted for in the current intermission. */
  #myVote: ModeId | null = null;
  readonly #nukeAt: WorldContent['nuke'];
  readonly #indoorZones: WorldContent['indoorZones'];
  readonly #ambience: Ambience;
  /** Where the listener last was, for placing sounds made with no position. */
  #listener: Vec3 = [0, 0, 0];
  #nuke: Nuke | null = null;
  /** Which of the nuke's sounds this intermission has already started. */
  #nukeHeard = { siren: false, blast: false };
  readonly #trainSounds: TrainSounds | null;
  /**
   * Shows the map's end-of-match sequence (the nuke, the train) this many
   * seconds after a match ended while no match is on: for screenshots, and
   * for checking it from a dev build's console.
   */
  previewEnding: number | null = null;
  /** The ending's shot is on screen instead of the player's view (no crosshair or weapon HUD). */
  #inShot = false;
  readonly #chargeSounds = new ChargeSounds();
  readonly #onVoteKey = (e: KeyboardEvent) => {
    if (e.code === 'Digit1') this.#vote('tdm');
    else if (e.code === 'Digit2') this.#vote('ffa');
  };

  constructor(options: GameOptions) {
    this.#renderer = options.renderer;
    this.#backend = options.backend;
    this.#canvas = options.canvas;
    this.#settings = options.settings;
    this.#world = options.world;
    this.#sound = options.sound;
    this.#overview = options.overview;
    this.#nukeAt = options.content.nuke ?? null;
    this.#loadoutStation = options.loadoutStation ?? null;
    this.#rangeLanesWestOf = options.rangeLanesWestOf ?? null;
    this.#indoorZones = options.content.indoorZones;
    this.#zones = options.content.zones ?? [];
    this.#sites = options.content.sites ?? [];
    this.#ambience = new Ambience(options.content.ambience ?? []);
    this.#trainSounds = options.content.train ? new TrainSounds(options.content.train) : null;
    options.renderer.toneMapping = ACESFilmicToneMapping;
    options.renderer.toneMappingExposure = 0.7;
    options.renderer.shadowMap.enabled = true;
    this.#worldView = new WorldView(options.renderer, options.content, options.bake);
    this.#viewmodel = new Viewmodel(this.#worldView.scene.environment);
    const preset = effectivePreset(options.settings.preset, options.backend);
    this.#effects = new Effects(this.#worldView.scene, options.world, PRESETS[preset]);
    this.#effects.onCasingBounce = (position, material, intensity) => this.#play('casing', { position, material, intensity });
    this.#viewFlash = this.#effects.createFlash();
    this.#viewmodel.muzzle.add(this.#viewFlash);
    for (let i = 0; i < 4; i++) {
      const flash = this.#effects.createFlash();
      flash.scale.setScalar(1.4);
      this.#worldFlashes.push(flash);
      this.#worldView.scene.add(flash);
    }
    this.#players = new PlayersView(this.#worldView.scene, options.world, options.thirdPersonWeapon ?? null);
    this.#arsenal = new ArsenalView(this.#worldView.scene);
    this.#pipeline = new GamePipeline(options.renderer, this.#worldView.scene, this.#camera.camera, this.#viewmodel.scene, this.#viewmodel.camera);
    this.input = new InputController(options.canvas, options.settings);
    this.hud = new Hud(document.body);
    this.hud.visible = false;
    this.hud.onVote = (mode) => this.#vote(mode);
    this.input.onPadVote = (side) => this.#vote(side === 'left' ? 'tdm' : 'ffa');
    addEventListener('keydown', this.#onVoteKey);
    this.applySettings(options.settings);
    this.#resizeObserver = new ResizeObserver(() => this.#resize());
    this.#resizeObserver.observe(options.canvas);
    this.#resize();
  }

  /** Show the overview instead of the player's view (behind the lobby), even with a player to follow. */
  overviewOnly = false;

  /** Where the camera sits with no player to follow: the map's overview, a reference spot, or a benchmark path. */
  set overview(view: GameOptions['overview']) {
    this.#overview = view;
  }

  get overview(): GameOptions['overview'] {
    return this.#overview;
  }

  /** The preset actually in use (the WebGL2 fallback caps High at Normal). */
  get preset() {
    return this.#pipeline.preset;
  }

  get fps(): number {
    return this.#fps;
  }

  get driver(): GameDriver | null {
    return this.#driver;
  }

  /** The local player as of the latest tick, or null with none (for scripts and tests: read, never change). */
  get player(): PlayerOutput | null {
    return this.#cur;
  }

  /** Lets go of the driver without ending it, for the game on another map to take over. */
  releaseDriver(): GameDriver | null {
    const driver = this.#driver;
    this.#driver = null;
    this.setDriver(null);
    return driver;
  }

  /** Starts playing on `driver`, dropping any previous one. */
  setDriver(driver: GameDriver | null): void {
    this.#driver?.dispose();
    this.#driver = driver;
    this.#prev = null;
    this.#cur = null;
    this.#others = [];
    this.#tracked.clear();
    this.#engagements.clear();
    this.#loop.reset();
    this.hud.visible = driver !== null;
  }

  /** Paused: no input reaches the game (the simulation keeps running so online play stays in sync). */
  set paused(on: boolean) {
    this.#paused = on;
    this.input.enabled = !on;
  }

  get paused(): boolean {
    return this.#paused;
  }

  set message(text: string | null) {
    this.#message = text;
  }

  applySettings(settings: Settings): void {
    this.#settings = settings;
    this.input.settings = settings;
    this.#sound.setVolume(settings.volume);
    const preset = effectivePreset(settings.preset, this.#backend);
    if (preset !== this.#pipeline.preset || !this.#pipelineReady) {
      this.#pipeline.setPreset(preset);
      this.#pipelineReady = true;
      this.#worldView.setShadowQuality(PRESETS[preset].shadows);
      this.#effects.setFeatures(PRESETS[preset]);
      this.#nuke?.dispose();
      this.#nuke = this.#nukeAt ? new Nuke(this.#worldView.scene, this.#nukeAt.groundZero, preset) : null;
    }
  }

  #pipelineReady = false;

  /** Starts fetching every weapon's models (first- and third-person) and the frag, settling once all are in. */
  preload(): Promise<void> {
    return Promise.all([this.#viewmodel.prepare(), this.#players.prepare(), this.#arsenal.loaded]).then(() => undefined);
  }

  /**
   * Puts on show, for the warm-up frame, everything a match draws later: every
   * weapon, soldier, effect and the muzzle flashes, with the shadow map
   * redrawn so their shadow shaders compile too. Returns what puts them back.
   */
  #showSamples(): (() => void)[] {
    const flashes = [this.#viewFlash, this.#worldFlashes[0]!];
    for (const f of flashes) f.visible = true;
    this.#worldView.redrawShadow();
    return [
      this.#viewmodel.showAll(),
      this.#players.showSamples(this.#camera.camera),
      this.#arsenal.showSamples(this.#camera.camera),
      this.#effects.showSamples(),
      () => {
        for (const f of flashes) f.visible = false;
      },
    ];
  }

  /** Set by `prepare`: the next frame drawn shows everything a match shows later, then calls this. */
  #warmUp: (() => void) | null = null;

  /**
   * Gets the first moments of a match ready behind the loading screen: every
   * weapon (first-person and third-person) and the frag fetched, then one frame
   * drawn with all of them, soldiers in every look and the pieces a ragdoll
   * throws on show, so their shaders compile now rather than in the first
   * frames of play or at a first weapon switch or kill. Settles within a few
   * seconds even if no frame is drawn (a hidden tab), then waits for the GPU to
   * finish compiling (see `#gpuDone`).
   */
  async prepare(): Promise<void> {
    await this.preload();
    await new Promise<void>((done) => {
      const timeout = setTimeout(finish, 3000);
      function finish(): void {
        clearTimeout(timeout);
        done();
      }
      this.#warmUp = finish;
    });
    this.#warmUp = null;
    await this.#gpuDone(20_000);
  }

  /**
   * Waits (at most `limit` ms) until the GPU has finished the frames drawn so far.
   * The browser compiles shaders in the background after they are created, and
   * the first frame that needs one waits for it: without this, the hundreds
   * compiled behind the menu and the loading screen are still compiling when
   * play starts, and the first seconds freeze for that long instead.
   */
  async #gpuDone(limit: number): Promise<void> {
    const queue = (this.#renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device?.queue;
    if (!queue) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([queue.onSubmittedWorkDone(), new Promise<void>((done) => (timer = setTimeout(done, limit)))]);
    clearTimeout(timer);
  }

  #resize(): void {
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.#renderer.setSize(width, height, false);
    this.#pipeline.setViewport(width, height, window.devicePixelRatio);
    this.#camera.resize(width, height);
    this.#viewmodel.resize(width / height);
    this.#worldView.updateCascades();
  }

  #play(event: SoundEventName, params: SoundParams = {}): void {
    const at = params.position;
    // The nuke is heard through anything.
    const through = at !== undefined && !params.local && !event.startsWith('nuke') && muffled(this.#world, this.#listener, at);
    this.#sound.play(event, {
      ...params,
      environment: params.environment ?? environmentAt(this.#indoorZones, at ?? this.#listener),
      ...(through ? { muffled: true } : {}),
    });
  }

  #materialUnder(position: Vec3): Material {
    const hit = raycastWorld(this.#world, [position[0], position[1] + 0.1, position[2]], [position[0], position[1] - 0.5, position[2]]);
    return hit?.material ?? 'concrete';
  }

  #playerById(id: PlayerId): PlayerOutput | null {
    if (this.#cur && id === this.#driver?.selfId) return this.#cur;
    return this.#others.find((p) => p.id === id) ?? null;
  }

  #eyeOf(id: PlayerId): Vec3 | null {
    const p = this.#playerById(id);
    return p ? [p.position[0], p.position[1] + p.eyeHeight, p.position[2]] : null;
  }

  /** One rendered frame. Call from the renderer's animation loop. */
  frame(now: number, adjustResolution = true, render = true): void {
    const dt = this.#lastFrame === null ? 1 / 60 : Math.min(0.1, (now - this.#lastFrame) / 1000);
    this.#frameStart = this.#lastFrame ?? now - TICK_MS;
    this.#lastFrame = now;
    this.#fps = this.#fps * 0.95 + (1 / Math.max(1e-3, dt)) * 0.05;
    this.input.poll(now, dt);
    const driver = this.#driver;
    let alpha = 0;
    // A match that runs in the page holds still while paused; anything online keeps up with its server.
    if (driver && this.#paused && driver.pausesWithGame) this.#loop.reset();
    else if (driver) alpha = this.#loop.frame(now, (start, end) => this.#tick(driver, start, end));

    const self = this.#cur;
    const look = this.input.angles;
    let eye: Vec3;
    let forward: Vec3;
    if (driver && self && this.#prev && this.#cmd && !this.overviewOnly) {
      const pose = this.#camera.update(
        { prev: this.#prev, cur: self, alpha, look, cmd: { yaw: this.#cmd.yaw, pitch: this.#cmd.pitch }, correction: driver.correction, dt },
        this.#settings,
      );
      eye = pose.position;
      forward = viewDirection(pose.yaw, pose.pitch);
      this.input.aiming = self.weapon.ads > 0.5;
      this.input.pitchOffset = self.pitch - this.#cmd.pitch;
      this.input.setWeapon(self.weapon.slot, STATS.weapons[self.weapon.id].handling.zoom.value);
      const speed = Math.hypot(self.velocity[0], self.velocity[2]);
      const lookDelta = { yaw: angleDelta(this.#lastLook.yaw, look.yaw), pitch: look.pitch - this.#lastLook.pitch };
      this.#viewmodel.root.visible = self.alive;
      this.#viewmodel.update(
        {
          weapon: self.weapon.id,
          grenade: self.grenade,
          action: self.weapon.action,
          actionTime: self.weapon.actionTime + alpha * TICK_SECONDS,
          reload: self.weapon.reload,
          ammo: self.weapon.ammo,
          ads: self.weapon.ads,
          movement: self.movement,
          stance: self.stance,
          speed,
          grounded: self.movement !== 'airborne' && self.movement !== 'mantle',
          lookDelta,
          alive: self.alive,
        },
        dt,
        verticalFov(this.#settings.fov),
      );
      this.#worldView.follow(self.position);
      this.#lightViewmodel(eye, dt);
    } else {
      const o = this.#overview;
      const cam = this.#camera.camera;
      cam.position.set(o.position[0], o.position[1], o.position[2]);
      cam.rotation.set(o.pitch, o.yaw, 0);
      eye = o.position;
      forward = viewDirection(o.yaw, o.pitch);
      this.#viewmodel.root.visible = false;
      this.#worldView.follow(o.position);
    }
    const watched = this.#spectated();
    if (watched) {
      // Dead in Charge: the camera rides behind the watched teammate, pulled in short of any wall.
      const head: Vec3 = [watched.position[0], watched.position[1] + watched.eyeHeight + 0.35, watched.position[2]];
      const back = viewDirection(watched.yaw, 0);
      const want: Vec3 = [head[0] - back[0] * 2.6, head[1] + 0.4, head[2] - back[2] * 2.6];
      const hit = raycastWorld(this.#world, head, want);
      const t = hit ? Math.max(0, hit.t - 0.1) : 1;
      eye = [head[0] + (want[0] - head[0]) * t, head[1] + (want[1] - head[1]) * t, head[2] + (want[2] - head[2]) * t];
      const pitch = Math.max(-0.5, Math.min(0.4, watched.pitch)) - 0.12;
      const cam = this.#camera.camera;
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.rotation.set(pitch, watched.yaw, 0);
      forward = viewDirection(watched.yaw, pitch);
      this.#viewmodel.root.visible = false;
    }
    const shot = this.#nukeAt?.shot;
    const ending = shot ? this.#sinceMatchEnd(driver) : null;
    this.#inShot = ending !== null;
    if (shot && ending !== null) {
      // The map's ending plays as a shot of its own, like a cut scene: everyone watches the nuke, wherever they stood.
      const pose = shotPose(shot, ending);
      const shake = this.#nuke ? nukeFrame(ending, this.#nuke.distanceTo(pose.position)).shake * SHOT_SHAKE : 0;
      const cam = this.#camera.camera;
      cam.position.set(pose.position[0], pose.position[1], pose.position[2]);
      cam.rotation.set(pose.pitch + (Math.random() - 0.5) * shake, pose.yaw + (Math.random() - 0.5) * shake, 0);
      if (Math.abs(cam.fov - shot.fov) > 1e-4) {
        cam.fov = shot.fov;
        cam.updateProjectionMatrix();
      }
      eye = pose.position;
      forward = viewDirection(pose.yaw, pose.pitch);
      this.#viewmodel.root.visible = false;
      this.#worldView.follow(eye);
    }
    this.#lastLook = look;
    this.#sound.setListener(eye, forward, [0, 1, 0]);
    this.#listener = eye;
    for (const c of this.#ambience.update(performance.now() / 1000, environmentAt(this.#indoorZones, eye) === 'indoor')) this.#play(c.event, c.params);

    if (driver) {
      this.#others = driver.others(alpha);
      const teams = driver.match ? teamMode(driver.match.mode) : false;
      this.#players.update(this.#others, dt, { teams, self: teams ? (this.#cur?.team ?? null) : null, names: new Map(driver.scores.map((s) => [s.id, s.name])) });
      this.#arsenal.grenades(driver.grenades(), alpha);
      this.#arsenal.glints(this.#others, eye, this.#camera.camera);
    }
    this.#updateNuke(driver, eye);
    this.#updateTrain(driver, eye);
    // Charge's keypad, beeping and tools; the round's state stands through the intermission, so the last defuse is heard too.
    const objective = driver?.match?.objective;
    for (const c of this.#chargeSounds.update(objective?.kind === 'charge' ? objective : null, performance.now() / 1000, (id) => this.#playerById(id)?.position ?? null)) this.#play(c.event, c.params);
    this.#effects.update(dt, this.#camera.camera);
    this.#pipeline.bloomBoost = this.#effects.flashStrength * 0.5;
    this.#updateHud(dt, eye, forward);
    if (render) {
      const warm = this.#warmUp;
      const restore = warm ? this.#showSamples() : [];
      this.#worldView.lightMoving();
      this.#pipeline.render(dt, adjustResolution);
      for (const put of restore) put();
      if (warm) {
        this.#warmUp = null;
        warm();
      }
    }
  }

  /**
   * The end-of-match nuke, from the time since the match ended: the siren
   * as the intermission starts, then the flash, cloud, grade and shake, and
   * the blast (which the sound system delays by its distance, like the
   * shock). A player who joins part-way through sees it from that moment and
   * hears only what is still to come.
   */
  #updateNuke(driver: GameDriver | null, eye: Vec3): void {
    const t = this.#nuke ? this.#sinceMatchEnd(driver) : null;
    this.#nuke?.update(t);
    if (t === null || !this.#nuke || !this.#nukeAt) {
      this.#nukeHeard = { siren: false, blast: false };
      this.#pipeline.setNuke(0, 0);
      return;
    }
    if (!this.#nukeHeard.siren) {
      this.#nukeHeard.siren = true;
      if (t < 1.5) this.#play('nukeSiren', { position: this.#nukeAt.siren });
    }
    if (!this.#nukeHeard.blast && t > DETONATION - 0.1) {
      this.#nukeHeard.blast = true;
      if (t < DETONATION + 0.5) this.#play('nukeBlast', { position: this.#nukeAt.groundZero, when: Math.max(0, DETONATION - t) });
    }
    const f = nukeFrame(t, this.#nuke.distanceTo(eye));
    this.#pipeline.setNuke(f.flash, f.grade);
    if (f.shake > 0.02) {
      const s = f.shake * 0.5;
      this.#camera.kick((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 1.5);
    }
  }

  /** Seconds since the match ended, through the intermission (or the previewed moment, with no match on); null while one is played. */
  #sinceMatchEnd(driver: GameDriver | null): number | null {
    return driver ? sinceMatchEnd(driver.match, driver.serverTime) : this.previewEnding;
  }

  /** The end-of-match freight train, from the time since the match ended: where it is, and what it sounds like from here. */
  #updateTrain(driver: GameDriver | null, eye: Vec3): void {
    const t = this.#sinceMatchEnd(driver);
    this.#worldView.train?.update(t);
    for (const c of this.#trainSounds?.update(t, eye) ?? []) this.#play(c.event, c.params);
  }

  /** Votes for the next match's mode, while the vote is open. */
  #vote(mode: ModeId): void {
    const driver = this.#driver;
    if (!driver?.match || driver.match.phase !== 'vote') return;
    this.#myVote = mode;
    driver.vote(mode);
    this.#play('hitMarker');
  }

  #updateHud(dt: number, eye: Vec3, forward: Vec3): void {
    const driver = this.#driver;
    if (!driver) return;
    const match = driver.match;
    if (!match || match.phase === 'playing') this.#myVote = null;
    // The population sign: everyone in the lobby (at least you) and this match's kills.
    this.#worldView.setPopulation(Math.max(driver.scores.length, this.#cur ? 1 : 0), driver.scores.reduce((n, s) => n + s.kills, 0));
    const cam = this.#camera.camera;
    const pixelsPerDegree = this.#canvas.clientHeight / 2 / Math.tan((cam.fov * Math.PI) / 360) / (180 / Math.PI);
    const status = driver.status;
    const showOverlay = this.#settings.showRangeOverlay && this.#inRange();
    this.hud.update({
      self: this.#inShot ? null : this.#cur,
      pixelsPerDegree,
      fps: this.#fps,
      ping: driver.ping === null ? null : driver.ping * 1000,
      showFps: this.#settings.showFps,
      showPing: this.#settings.showPing,
      showOverlay,
      targetDistance: showOverlay ? this.#targetDistance(eye, forward) : null,
      scores: driver.scores,
      pings: driver.pings,
      selfId: driver.selfId,
      showScoreboard: this.input.scoreboard && driver.online,
      match: match
        ? {
            status: match,
            secondsLeft: match.objective?.kind === 'charge' && match.phase === 'playing' ? match.objective.remaining : match.phaseEnds === null ? null : match.phaseEnds - driver.serverTime,
            team: teamMode(match.mode) ? (this.#cur?.team ?? null) : null,
            myVote: this.#myVote,
          }
        : null,
      respawnIn: match && (match.phase !== 'playing' || match.objective?.kind === 'charge') ? null : driver.respawnIn,
      prompt: this.#prompt(),
      message: this.#message ?? (status === 'playing' ? null : status === 'connecting' ? 'Connecting…' : status),
      zones: this.#zoneMarkers(eye),
      charge: this.#chargeHud(eye),
      dt,
    });
  }

  /** The Charge round, while one is on. */
  get #charge(): ChargeState | null {
    const match = this.#driver?.match;
    return match?.phase === 'playing' && match.objective?.kind === 'charge' ? match.objective : null;
  }

  /** The button prompt: the loadout screen (dead, at the range's station, or in a round's freeze), or planting and defusing. */
  #prompt(): string | null {
    const self = this.#cur;
    const match = this.#driver?.match;
    if (!self || (match && match.phase !== 'playing')) return null;
    const charge = this.#charge;
    if (!self.alive || this.#atStation(self) || charge?.phase === 'freeze') return `${this.#useLabel()}  Loadout`;
    if (charge && !charge.action) {
      if (charge.phase === 'live' && charge.carrier === self.id && this.#sites.some((s) => inSite(s, self.position))) return `Hold ${this.#useLabel()}  Plant`;
      const p = charge.planted?.position;
      if (charge.phase === 'planted' && p && self.team !== charge.attackers && Math.hypot(self.position[0] - p[0], self.position[2] - p[2]) <= DEFUSE_RANGE) return `Hold ${this.#useLabel()}  Defuse`;
    }
    return null;
  }

  /** The living teammate a dead player watches in Charge (the same one while they live), or null. */
  #spectated(): PlayerOutput | null {
    const self = this.#cur;
    if (!self || self.alive || !this.#charge) {
      this.#watching = null;
      return null;
    }
    const mates = this.#others.filter((p) => p.alive && p.kind === 'player' && p.team === self.team).sort((a, b) => (a.id < b.id ? -1 : 1));
    const watched = mates.find((p) => p.id === this.#watching) ?? mates[0] ?? null;
    this.#watching = watched?.id ?? null;
    return watched;
  }

  /** The Charge round for the HUD: your side, who carries and acts, and markers over the sites and the charge. */
  #chargeHud(eye: Vec3): ChargeHud | null {
    const state = this.#charge;
    const driver = this.#driver;
    const self = this.#cur;
    if (!state || !driver || !self) return null;
    const attacking = self.team === state.attackers;
    const markers: ObjectiveMarker[] = [];
    const add = (key: string, label: string, kind: ObjectiveMarker['kind'], at: Vec3) => {
      const m = this.#project(at, eye);
      if (m) markers.push({ key, label, kind, ...m });
    };
    if (state.planted) add('planted', state.planted.site, 'planted', [state.planted.position[0], state.planted.position[1] + 0.6, state.planted.position[2]]);
    else
      for (const site of this.#sites) {
        const c = siteCentre(site);
        add(`site-${site.id}`, site.id, 'site', [c[0], c[1] + 2, c[2]]);
      }
    if (state.dropped && attacking) add('charge', '◆', 'charge', [state.dropped[0], state.dropped[1] + 0.6, state.dropped[2]]);
    const name = (id: PlayerId | null) => (id === null ? null : id === driver.selfId ? 'You' : driver.nameOf(id));
    const watched = this.#watching;
    return {
      state,
      attacking,
      carrier: name(state.carrier),
      actor: name(state.action?.player ?? null),
      carrying: state.carrier === driver.selfId,
      acting: state.action?.player === driver.selfId,
      spectating: watched === null ? null : driver.nameOf(watched),
      markers,
      roster: chargeRoster(driver.scores, [...this.#others, self], driver.selfId, self.team, state.carrier),
    };
  }

  /** Where a marker over world point `at` goes on screen, kept on screen when it is behind or off to the side, and how far it is. */
  #project(at: Vec3, eye: Vec3): { x: number; y: number; distance: number } | null {
    const cam = this.#camera.camera;
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    const margin = 32;
    const p = new Vector3(at[0], at[1], at[2]).project(cam);
    const behind = p.z > 1;
    let x = (((behind ? -p.x : p.x) + 1) / 2) * w;
    let y = behind ? h - margin : ((1 - p.y) / 2) * h;
    x = Math.min(w - margin, Math.max(margin, x));
    y = Math.min(h - margin, Math.max(margin + 24, y));
    return { x, y, distance: Math.hypot(at[0] - eye[0], at[2] - eye[2]) };
  }

  /** The Outposts zones with their state from the match, each projected to where its marker goes on screen. */
  #zoneMarkers(eye: Vec3): ZoneMarker[] {
    const objective = this.#driver?.match?.objective;
    const states = objective?.kind === 'outposts' ? objective.zones : null;
    if (!states || this.#zones.length === 0) return [];
    const cam = this.#camera.camera;
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    const margin = 32;
    return this.#zones.flatMap((zone) => {
      const s = states.find((x) => x.id === zone.id);
      if (!s) return [];
      const top: Vec3 = [zone.center[0], zone.center[1] + Math.min(zone.height, 2.4), zone.center[2]];
      const p = new Vector3(top[0], top[1], top[2]).project(cam);
      // Behind the camera the projection mirrors: flip it, and pin the marker to the bottom edge.
      const behind = p.z > 1;
      let x = ((behind ? -p.x : p.x) + 1) / 2 * w;
      let y = behind ? h - margin : ((1 - p.y) / 2) * h;
      x = Math.min(w - margin, Math.max(margin, x));
      y = Math.min(h - margin, Math.max(margin + 24, y));
      const distance = Math.hypot(zone.center[0] - eye[0], zone.center[2] - eye[2]);
      const inside = this.#cur?.alive === true && inZone(zone, this.#cur.position);
      return [{ id: zone.id, owner: s.owner, capturing: s.capturing, progress: s.progress, contested: s.contested, x, y, distance, inside }];
    });
  }

  /** Lights the gun like where the player stands: in the sun or not, and how bright the light round them is. */
  #lightViewmodel(eye: Vec3, dt: number): void {
    const d = currentLighting().sunDirection;
    const sun = sightBlocked(this.#world, eye, [eye[0] + d[0] * 80, eye[1] + d[1] * 80, eye[2] + d[2] * 80]) ? 0 : 1;
    const probe = this.#worldView.probes.sample(eye);
    const luma = probe ? 0.2126 * probe.ambient[0] + 0.7152 * probe.ambient[1] + 0.0722 * probe.ambient[2] : OPEN_AMBIENT;
    // Dark rooms get the same warm fill the walls do (see the surface materials' decode), so the gun matches them.
    const fill = 0.18 * Math.min(1, Math.max(0, (0.35 - luma) / 0.33));
    const ambient = Math.min(1.2, (luma + fill) / OPEN_AMBIENT);
    this.#viewmodel.setLighting(sun, ambient, dt);
  }

  /** The range overlay shows on the firing range and the sniping lane (west of the course), on the Practice Range only. */
  #inRange(): boolean {
    const p = this.#cur?.position;
    return !!p && this.#rangeLanesWestOf !== null && p[0] < this.#rangeLanesWestOf;
  }

  #atStation(self: PlayerOutput): boolean {
    const s = this.#loadoutStation;
    return !!s && Math.hypot(self.position[0] - s.position[0], self.position[2] - s.position[2]) <= s.radius;
  }

  /** A range dummy's report of one hit: the damage over the point it landed, and how far and how many pellets. */
  #damageNumber(point: Vec3, damage: number, head: boolean, distance: number, pellets: number, weapon: KillWeapon): void {
    const p = new Vector3(point[0], point[1] + 0.25, point[2]).project(this.#camera.camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return;
    const x = ((p.x + 1) / 2) * this.#canvas.clientWidth;
    const y = ((1 - p.y) / 2) * this.#canvas.clientHeight;
    const total = STATS.weapons[weapon as WeaponId]?.damage.pellets?.value ?? 1;
    const detail = [`${distance.toFixed(0)} m`, ...(total > 1 ? [`${pellets}/${total} pellets`] : [])].join(' · ');
    this.hud.damageNumber(x, y, Math.round(damage), head, detail);
  }

  /** How the Use button is written in prompts: the pad's button in pad mode, else the key. */
  #useLabel(): string {
    const pad = PAD_LAYOUTS[this.#settings.padLayout].use;
    return this.input.padMode && pad ? padButtonLabel(pad) : bindingLabel(this.#settings.bindings.use);
  }

  #targetDistance(eye: Vec3, forward: Vec3): number | null {
    const far: Vec3 = [eye[0] + forward[0] * 200, eye[1] + forward[1] * 200, eye[2] + forward[2] * 200];
    const hit = raycastWorld(this.#world, eye, far);
    let best = hit ? hit.t * 200 : Infinity;
    for (const p of this.#others) {
      if (!p.alive) continue;
      // Ray against a vertical capsule-ish cylinder around the body.
      const c: Vec3 = [p.position[0] - eye[0], p.position[1] + p.eyeHeight * 0.6 - eye[1], p.position[2] - eye[2]];
      const along = c[0] * forward[0] + c[1] * forward[1] + c[2] * forward[2];
      if (along <= 0) continue;
      const off = Math.hypot(c[0] - forward[0] * along, c[2] - forward[2] * along);
      const dy = Math.abs(c[1] - forward[1] * along);
      if (off < 0.35 && dy < p.eyeHeight * 0.6 && along < best) best = along;
    }
    return Number.isFinite(best) ? best : null;
  }

  #tick(driver: GameDriver, start: number, end: number): void {
    // A (re)spawn turns the view to the spawn's facing before this tick's usercmd is built.
    const facing = driver.takeSpawn();
    if (facing) this.input.setAngles(facing.yaw, facing.pitch);
    const sampled = this.input.sample(start, end);
    // A round's freeze holds you where you stand, free to look around (the server does the same).
    const frozen = this.#charge?.phase === 'freeze';
    const cmd: UserCmd = frozen ? { ...sampled, forward: 0, right: 0, buttons: sampled.buttons & Button.Use, firePresses: [] } : sampled;
    const result = driver.tick(cmd);
    this.#simTime += TICK_SECONDS;
    const before = this.#cur;
    const self = result.self;
    // Respawn or first spawn: skip interpolating across the map.
    if (self && (!before || (!before.alive && self.alive) || Math.hypot(self.position[0] - before.position[0], self.position[2] - before.position[2]) > 4)) this.#prev = self;
    else this.#prev = before;
    this.#cur = self;
    this.#cmd = cmd;
    const use = (cmd.buttons & Button.Use) !== 0;
    if (use && !this.#useHeld && self && (!self.alive || this.#atStation(self) || frozen)) this.onLoadout?.(self.alive ? 'station' : 'death');
    this.#useHeld = use;
    if (self && before) this.#selfFoley(before, self, cmd);
    for (const e of result.events) this.#present(e, start);
    if (driver.popped) this.#worldView.hideProps(driver.popped);
    this.#footsteps();
  }

  /** Sounds and camera reactions to the local player's own movement and weapon. */
  #selfFoley(before: PlayerOutput, self: PlayerOutput, cmd: UserCmd): void {
    const local = { local: true } as const;
    if (self.landing && self.alive) {
      this.#play('land', { ...local, material: this.#materialUnder(self.position), intensity: Math.min(1, self.landing.fallHeight / 6) });
      this.#camera.land(self.landing.fallHeight);
      this.#viewmodel.land(self.landing.fallHeight);
    }
    if (before.movement !== 'airborne' && self.movement === 'airborne' && self.velocity[1] > 1) this.#play('jump', local);
    if (before.movement !== 'slide' && self.movement === 'slide') this.#play('slide', { ...local, material: this.#materialUnder(self.position) });
    if (before.movement !== 'mantle' && self.movement === 'mantle') this.#play('mantle', local);
    if (before.stance !== self.stance && self.stance === 'prone') this.#play('prone', local);
    if (before.stance === 'stand' && self.stance === 'crouch' && self.movement !== 'slide') this.#play('crouch', local);
    const w = self.weapon;
    const pw = before.weapon;
    if (w.ads > pw.ads && pw.ads === 0) this.#play('adsIn', local);
    if (w.ads < pw.ads && pw.ads === 1) this.#play('adsOut', local);
    // Weapon foley at fixed points of each action.
    const sameAction = pw.action === w.action && w.actionTime >= pw.actionTime;
    const from = sameAction ? pw.actionTime : -1;
    for (const [t, event] of foleyCues(self)) if (t > from && t <= w.actionTime) this.#play(event, local);
    if (!self.alive) this.#viewmodel.root.visible = false;
  }

  /** Footsteps for everyone, the local player included; other players' movement and weapon sounds. */
  #footsteps(): void {
    const selfId = this.#driver?.selfId ?? null;
    const everyone = this.#cur ? [this.#cur, ...this.#others] : this.#others;
    for (const p of everyone) {
      const t = this.#tracked.get(p.id) ?? { stepDistance: 0, last: p.position, seen: null };
      const d = Math.hypot(p.position[0] - t.last[0], p.position[2] - t.last[2]);
      t.last = p.position;
      this.#tracked.set(p.id, t);
      if (p.id !== selfId) {
        if (t.seen && t.seen.alive && p.alive && d <= 1) this.#otherFoley(t.seen, p);
        t.seen = p;
      }
      const grounded = p.movement !== 'airborne' && p.movement !== 'mantle' && p.movement !== 'slide';
      if (!p.alive || !grounded || d > 1) continue;
      const mode = p.stance === 'prone' ? 'prone' : p.stance === 'crouch' ? 'crouch' : p.movement === 'sprint' || p.movement === 'tacticalSprint' ? p.movement : 'walk';
      t.stepDistance += d;
      const length = (STEP_LENGTH[mode] ?? 1.45) / 2;
      if (t.stepDistance >= length) {
        t.stepDistance = 0;
        const own = p.id === selfId;
        this.#play('footstep', {
          ...(own ? { local: true } : { position: p.position }),
          material: this.#materialUnder(p.position),
          movement: mode,
          intensity: Math.min(1, Math.hypot(p.velocity[0], p.velocity[2]) / 6),
        });
      }
    }
  }

  /** Another player's jumps, landings, slides, mantles and weapon handling, from how their state changed. */
  #otherFoley(before: PlayerOutput, p: PlayerOutput): void {
    const at = { position: p.position };
    if (before.movement === 'airborne' && p.movement !== 'airborne' && p.movement !== 'mantle') {
      const fall = p.landing?.fallHeight ?? Math.max(0, -before.velocity[1]) ** 2 / 20;
      this.#play('land', { ...at, material: this.#materialUnder(p.position), intensity: Math.min(1, fall / 6) });
    }
    if (before.movement !== 'airborne' && p.movement === 'airborne' && p.velocity[1] > 1) this.#play('jump', at);
    if (before.movement !== 'slide' && p.movement === 'slide') this.#play('slide', { ...at, material: this.#materialUnder(p.position) });
    if (before.movement !== 'mantle' && p.movement === 'mantle') this.#play('mantle', at);
    const w = p.weapon;
    const pw = before.weapon;
    const sameAction = pw.action === w.action && w.actionTime >= pw.actionTime;
    const from = sameAction ? pw.actionTime : -1;
    for (const [t, event] of foleyCues(p)) if (t > from && t <= w.actionTime) this.#play(event, at);
  }

  /** Seconds from now until a moment inside the tick that started at `start` (ms), keeping sub-tick spacing. */
  #when(start: number, fraction: number): number {
    return Math.max(0, (start + fraction * TICK_MS - this.#frameStart) / 1000);
  }

  #present(e: PresentedEvent, tickStart: number): void {
    const driver = this.#driver;
    if (!driver) return;
    const selfId = driver.selfId;
    switch (e.type) {
      case 'shot': {
        const own = e.shooter === selfId;
        if (own) {
          this.#play('gunshot', { local: true, weapon: e.weapon, when: this.#when(tickStart, e.fraction) });
          this.#viewmodel.fire();
          this.#effects.flash(this.#viewFlash);
          const kick = CAMERA_KICK[e.weapon];
          this.#camera.kick(0.35 * kick, (Math.random() - 0.5) * 0.25 * kick, (Math.random() - 0.5) * 0.6 * kick);
          const muzzle = this.#viewToWorld(this.#viewmodel.muzzle);
          this.#effects.shot(muzzle, e.direction);
          const cam = this.#camera.camera;
          const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
          const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
          const v = this.#cur?.velocity ?? [0, 0, 0];
          this.#effects.eject(this.#viewToWorld(this.#viewmodel.ejectionPort), [right.x, right.y, right.z], [up.x, up.y, up.z], v);
          const [yaw, pitch] = [Math.atan2(-e.direction[0], -e.direction[2]), Math.asin(Math.max(-1, Math.min(1, e.direction[1])))];
          this.hud.recordShot(yaw, pitch, e.index === 0 || this.#burstStart < 0);
          this.#burstStart = e.index === 0 ? this.#simTime : this.#burstStart;
          for (const eng of this.#engagements.values()) eng.shots += 1;
        } else {
          this.#play('gunshot', { position: e.origin, weapon: e.weapon, when: this.#when(tickStart, e.fraction) });
          this.#effects.shot(e.origin, e.direction);
          const flash = this.#worldFlashes[this.#nextWorldFlash] as Mesh;
          this.#nextWorldFlash = (this.#nextWorldFlash + 1) % this.#worldFlashes.length;
          flash.position.set(e.origin[0] + e.direction[0] * 0.9, e.origin[1] + e.direction[1] * 0.9 - 0.12, e.origin[2] + e.direction[2] * 0.9);
          flash.quaternion.copy(this.#camera.camera.quaternion);
          this.#effects.flash(flash);
          this.#crack(e.origin, e.direction);
        }
        break;
      }
      case 'impact':
        this.#effects.impact(e.point, e.normal, e.material);
        this.#play('impact', { position: e.point, material: e.material });
        break;
      case 'prop': {
        const head = this.#worldView.popProp(e.prop);
        if (head) {
          this.#effects.fall(head, e.direction);
          this.#play('impact', { position: e.point, material: 'plastic' });
        }
        break;
      }
      case 'hit': {
        const from = this.#eyeOf(e.shooter) ?? e.point;
        const d: Vec3 = [e.point[0] - from[0], e.point[1] - from[1], e.point[2] - from[2]];
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
        if (e.victim !== selfId) {
          this.#effects.blood(e.point, dir, e.zone === 'head');
          this.#players.hit(e.victim, dir, e.damage);
        }
        if (e.shooter === selfId && e.victim !== selfId) {
          const head = e.zone === 'head';
          const kind: HitKind = e.killed ? (head ? 'headshotKill' : 'kill') : head ? 'headshot' : 'hit';
          this.hud.hitMarker(kind);
          this.#play(e.killed ? 'killMarker' : head ? 'headshotMarker' : 'hitMarker');
          if (e.cause === 'melee') this.#play('meleeHit', { local: true });
          this.hud.setLastHit(e.damage, e.zone, e.distance);
          if (e.victim.startsWith('dummy')) this.#damageNumber(e.point, e.damage, e.zone === 'head', e.distance, e.pellets, e.weapon);
          // The TTK readout times gunfire: a frag or a melee kill is not an engagement.
          if (e.cause === 'bullet') {
            const travel = e.distance / STATS.weapons[e.weapon as WeaponId].handling.muzzleVelocity.value;
            const eng = this.#engagements.get(e.victim) ?? { start: this.#simTime - travel, shots: 1, hits: 0 };
            eng.hits += 1;
            this.#engagements.set(e.victim, eng);
            if (e.killed) {
              this.hud.setRangeStats(this.#simTime - eng.start, eng.shots, eng.hits);
              this.#engagements.delete(e.victim);
            } else this.hud.setRangeStats(null, eng.shots, eng.hits);
          } else if (e.killed) this.#engagements.delete(e.victim);
        }
        if (e.victim === selfId) {
          const attacker = this.#playerById(e.shooter);
          if (attacker && e.shooter !== selfId && this.#cur) {
            const yaw = Math.atan2(-(attacker.position[0] - this.#cur.position[0]), -(attacker.position[2] - this.#cur.position[2]));
            this.hud.damage(yaw);
          }
          this.#play('damageTaken', { local: true, intensity: Math.min(1, e.damage / 40) });
          if (e.cause === 'melee') this.#play('meleeHit', { local: true });
        }
        break;
      }
      case 'kill':
        if (!driver.online && e.killer === selfId && e.victim !== selfId) this.hud.eliminated(driver.nameOf(e.victim), e.zone === 'head');
        if (!driver.online) this.hud.killFeed(e.killer === null || e.killer === e.victim ? null : driver.nameOf(e.killer), driver.nameOf(e.victim), e.zone === 'head', e.killer === selfId || e.victim === selfId, {}, killedWith(e.cause, e.weapon));
        break;
      case 'killFeed':
        if (e.killer === selfId && e.victim !== selfId) this.hud.eliminated(e.victimName, e.headshot);
        this.hud.killFeed(
          e.killer === null || e.killer === e.victim ? null : e.killerName,
          e.victimName,
          e.headshot,
          e.killer === selfId || e.victim === selfId,
          {
            killer: driver.scores.some((s) => s.id === e.killer && s.bot),
            victim: driver.scores.some((s) => s.id === e.victim && s.bot),
          },
          killedWith(e.cause, e.weapon),
          teamMode(driver.match?.mode ?? 'ffa') ? { killer: driver.scores.find((s) => s.id === e.killer)?.team, victim: driver.scores.find((s) => s.id === e.victim)?.team } : {},
        );
        break;
      case 'grenade': {
        const own = e.player === selfId;
        const at = own ? { local: true } : { position: this.#eyeOf(e.player) ?? [0, 0, 0] as Vec3 };
        if (e.phase === 'cook') this.#play('grenadePin', at);
        else if (e.phase === 'throw') this.#play('grenadeThrow', at);
        break;
      }
      case 'bounce':
        this.#play('grenadeBounce', { position: e.point, intensity: Math.min(1, e.speed / 10) });
        break;
      case 'explosion': {
        if (this.#explosions.has(e.grenade)) break;
        this.#explosions.add(e.grenade);
        if (this.#explosions.size > 64) this.#explosions.delete(this.#explosions.values().next().value as number);
        this.#effects.explosion(e.point);
        this.#play('explosion', { position: e.point });
        const self = this.#cur;
        if (self?.alive) {
          // Close blasts shake the view.
          const d = Math.hypot(self.position[0] - e.point[0], self.position[1] - e.point[1], self.position[2] - e.point[2]);
          const shake = Math.max(0, 1 - d / 20);
          if (shake > 0) this.#camera.kick(2.5 * shake, (Math.random() - 0.5) * 3 * shake, (Math.random() - 0.5) * 4 * shake);
        }
        break;
      }
      case 'capture': {
        const team = TEAMS[e.team]?.name ?? 'A team';
        const lost = e.previous !== 0 ? ` from ${TEAMS[e.previous]?.name ?? 'the other team'}` : '';
        this.hud.objectiveFeed(`${team} took ${e.zone}${lost}`, e.team, this.#cur?.team === e.team || this.#cur?.team === e.previous);
        break;
      }
      case 'roundStart': {
        const attack = this.#cur?.team === e.attackers;
        this.hud.toast(`Round ${e.round}: you ${attack ? 'attack' : 'defend'}.`, 4);
        break;
      }
      case 'charge': {
        const driver = this.#driver;
        const who = e.player === null ? null : e.player === driver?.selfId ? 'You' : (driver?.nameOf(e.player) ?? 'Someone');
        const mine = this.#cur?.team === e.team;
        const text =
          e.action === 'pickup'
            ? `${who} picked up the charge`
            : e.action === 'drop'
              ? `${who} dropped the charge`
              : e.action === 'plant'
                ? `${who} planted the charge at ${e.site}`
                : e.action === 'defuse'
                  ? `${who} defused the charge`
                  : `The charge detonated at ${e.site}`;
        // Where the charge lies is the attackers' to know: defenders hear only of the plant and what follows.
        if (mine || e.action === 'plant' || e.action === 'defuse' || e.action === 'detonate') this.hud.objectiveFeed(text, e.team, e.player === driver?.selfId);
        if (e.action === 'detonate') {
          this.#effects.explosion(e.position);
          this.#play('explosion', { position: e.position });
        }
        break;
      }
      case 'matchEnd':
        this.hud.toast(e.winnerName ? `${e.winnerName} wins the match.` : 'Match over.');
        break;
      case 'matchStart':
        this.hud.toast('New match.', 3);
        this.#worldView.restoreProps();
        break;
    }
  }

  /** A supersonic crack when someone else's bullet passes close to the listener. */
  #crack(origin: Vec3, direction: Vec3): void {
    const self = this.#cur;
    if (!self || !self.alive) return;
    const eye: Vec3 = [self.position[0], self.position[1] + self.eyeHeight, self.position[2]];
    const c: Vec3 = [eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2]];
    const along = c[0] * direction[0] + c[1] * direction[1] + c[2] * direction[2];
    if (along < 8) return;
    const closest: Vec3 = [origin[0] + direction[0] * along, origin[1] + direction[1] * along, origin[2] + direction[2] * along];
    const miss = Math.hypot(closest[0] - eye[0], closest[1] - eye[1], closest[2] - eye[2]);
    if (miss < 3) this.#play('bulletCrack', { position: closest, intensity: 1 - miss / 3, when: along / STATS.weapon.muzzleVelocity.value });
  }

  /**
   * Maps a point on the viewmodel (drawn by its own camera at the origin) into
   * the world, as if the viewmodel camera sat at the world camera.
   */
  #viewToWorld(object: Object3D): Vec3 {
    const v = new Vector3();
    object.getWorldPosition(v);
    v.applyMatrix4(this.#viewmodel.camera.matrixWorldInverse);
    v.applyMatrix4(this.#camera.camera.matrixWorld);
    return [v.x, v.y, v.z];
  }

  dispose(): void {
    removeEventListener('keydown', this.#onVoteKey);
    this.setDriver(null);
    this.#resizeObserver.disconnect();
    this.input.dispose();
    this.hud.dispose();
    this.#pipeline.dispose();
    this.#effects.dispose();
    this.#players.dispose();
    this.#arsenal.dispose();
    this.#worldView.dispose();
  }
}
