import {
  STATS,
  heldRow,
  kitInHand,
  moddedRow,
  reloadPace,
  TICK_SECONDS,
  Button,
  angleDelta,
  inSite,
  inZone,
  siteCentre,
  isShellReload,
  teamMode,
  INTERMISSION,
  raycastWorld,
  sightBlocked,
  wading,
  viewDirection,
  type ChargeSite,
  type BattleRoyaleState,
  type ChargeState,
  type KillWeapon,
  type MatchStatus,
  type Material,
  type ModeId,
  type PlayerId,
  type PlayerOutput,
  type Score,
  type TeamId,
  type UserCmd,
  type MuzzleId,
  type Vec3,
  type TrapKind,
  type WeaponId,
  type World,
  type Zone,
  type GrenadeOutput,
  type SmokeCloud,
  hasPerk,
} from '@duty-shooter/fps-core';
import { DEFUSE_RANGE, standProps } from '@duty-shooter/fps-core/modes';
import { ACESFilmicToneMapping, Vector3, type Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { ArsenalView } from './arsenal-view';
import type { SoundEventName, SoundParams, SoundSystem } from './audio';
import { tinnitusStrength } from './audio/danger';
import { speechVolume } from './audio/mix';
import { matchScene } from './audio/music/scene';
import { SIREN_OVERLAP } from './audio/countdown';
import { clockRan, clockSpeaks, colourDrain, countdownCall, countdownLine, countdownVoice, eased, lastMinuteLight, lastTenBeat, type MapEnding } from './last-minute';
import { grenadeWarnings } from './hud/grenade-warnings';
import { COUNTDOWN_VOICES, CountdownSounds, sirenSpot } from './countdown-sounds';
import { FirstPersonCamera, shotPose } from './camera';
import { Effects } from './effects';
import { Tracers } from './tracers';
import { Hud, hitKind, type ChargeHud, type ObjectiveMarker, type ZoneMarker } from './hud/hud';
import { chargeRoster } from './ui/model';
import { InputController } from './input';
import { AUTO_FIRE_IDLE, BODY_RADIUS, aimAt, aimSlowdown, autoFire, autoFireRange, type AimRead, type AutoFireState } from './touch/logic';
import { hintLine, hintState, stepHints, type HintLine, type HintNames } from './hints';
import { hintMemory, hintMemoryCleared, saveHintMemory } from './hint-store';
import { FixedTickLoop } from './loop';
import { ChargeSounds } from './charge-sounds';
import { DETONATION, Nuke, nukeFrame, sinceMatchEnd, victoryTime } from './nuke';
import { TrainSounds } from './train';
import { Ambience, environmentAt, muffled } from './map-sound';
import { GamePipeline } from './pipeline';
import { STEP_LENGTH } from './motion';
import { useColourVision } from './team-colours';
import { pipelinesReady } from './renderer';
import { PlayersView } from './players-view';
import type { GameDriver, PresentedEvent } from './session';
import { PAD_LAYOUTS, padActuator, padButtonLabel } from './gamepad';
import { aimSees } from './aim-sight';
import { Rumbler, blastRumble, hitRumble, hurtRumble, landRumble, shotRumble, type Rumble } from './rumble';
import { bindingLabel, mixOf, verticalFov, type Settings } from './settings';
import { Viewmodel } from './viewmodel/viewmodel';
import { WorldView, type WorldContent } from './world-view';
import { ZoneRings } from './zone-rings';
import { RingWall } from './ring-wall';
import { SupplyDropView } from './supply-drop-view';
import { RebootView } from './reboot-view';
import { RingSounds } from './ring-sounds';
import { preparationShot, preparationTime, type PreparationShot, type PreparationTime } from './preparation-shot';
import { PreparationSounds } from './preparation-sounds';
import { Spectator, withRoster, type SpectateView } from './spectate';
import { spectatorNotice, type SpectatorPanelState } from './hud/spectator-panel';
import type { MatchCardState } from './hud/match-card';
import { GAIN_RANK_UP_AT } from './hud/match-gain';
import { scoreFeedEntry } from './hud/score-feed';
import { WORDY, eventWords, killedWith, type EventWords } from './hud/event-words';
import { MatchKeeper, type ProfileStore } from './profile';
import { CourseRun, courseGrade, type CourseGates } from './course-run';
import { CourseClockView, RESULT_SECONDS, type CourseFace } from './hud/course-clock';
import { MatchLog, type RecapLookup } from './ui/recap';
import type { SpectateInput } from './input';
import type { RoyaleHudState } from './hud/royale-hud';
import { pinMarker } from './hud/markers';
import { AllySight, alliesOf, allyTags, type AllySeen, type AllyTag } from './hud/ally-tags';
import { RING_STAGES, heading, placement, ringNow, ringStatus, victoryCard, type RingPhase } from './ui/royale';
import { terrainBounds, type MapBounds } from './ui/island-map';
import { dropMarks, dropPrompt, gridCell } from './ui/supply-drop';
import { cardNote, rebootMarks, rebootPrompt } from './ui/reboot';
import { PingBoard, aimPing } from './ui/pings';
import type { PingScreenMark } from './hud/ping-marks';
import type { BakeFile, EndingShot } from './surfaces';
import { currentLighting, setHaze } from './surface-materials';
import { cloudySky } from './surface-sky';
import { Announcer, LeadCalls, browserSpeaker, closesRange, leadOf, leftLine, liveLine, loadRangeControl } from './announcer';
import { VOICE_LINES, VOICE_ON_THE_SECOND, type VoiceLineId } from './voice-lines';

/** The probes' ambient luminance on open ground (0.3 to 0.5 round the town), where the gun gets its full fill light. */
const OPEN_AMBIENT = 0.4;

const TICK_MS = TICK_SECONDS * 1000;
/** How far the nuke's shock shakes the ending's shot at its strongest (radians, peak to peak). */
const SHOT_SHAKE = 0.012;
/** A spectator switching to someone nearer than this (m) glides there; farther, it cuts. */
const SPECTATE_GLIDE = 40;
/** How long (ms) the death recap stays on the spectator's panel once you're out (ticket 73); the map keeps its mark. */
const RECAP_OUT_MS = 20_000;
/** How long (ms) the spectator's notice of who put out the one watched stays up. */
const SPECTATE_NOTICE_MS = 4000;
/** A binding as a short key cap for the spectator's panel. */
const shortKey = (code: string): string => (code === 'Mouse0' ? 'LMB' : code === 'Mouse2' ? 'RMB' : code === 'Mouse1' ? 'MMB' : bindingLabel(code));

export interface GameOptions {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
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
  /** This browser's Profile: a match played to its end is banked in it. Without one, nothing is kept. */
  readonly profile?: ProfileStore | null;
  /** The map's timed movement Course (the Practice Range's), clocked while no match is on; null (the default) for none. */
  readonly course?: CourseGates | null;
}

/**
 * How far into its action a player's weapon is, for the animation: a reload
 * with an extended or speed magazine runs slower or faster than the stock
 * one, so its hands play the stock track at that pace.
 */
function animTime(p: PlayerOutput, alpha: number): number {
  const t = p.weapon.actionTime + alpha * TICK_SECONDS;
  return p.weapon.action === 'reload' ? t / reloadPace(kitInHand(p.loadout, p.weapon)) : t;
}

/** Per-action timings for the weapon's foley, in seconds into the action. */
function foleyCues(self: PlayerOutput): readonly (readonly [number, SoundEventName])[] {
  const w = self.weapon;
  const row = heldRow(self);
  if (w.action === 'reload') {
    const r = row.reload;
    if (isShellReload(r)) {
      // One shell going in at each add point; the reload ends when the tube is full, so later cues never come.
      return Array.from({ length: row.handling.magazineSize.value }, (_, k) => [r.start.value + k * r.perShell.value - 0.05, 'shellInsert'] as const);
    }
    const empty = w.reload === 'empty';
    const add = empty ? r.emptyAddAmmo.value : r.tacticalAddAmmo.value;
    // A belt and a cylinder are reloads of their own; these are the times of their hands (the tracks in viewmodel.ts).
    if (row.traits.reload === 'belt') {
      const shut = add - (empty ? 0.62 : 0.06);
      const belt: [number, SoundEventName][] = [[0.5, 'coverOpen'], [1.32, 'reloadMagOut'], [shut * 0.79 - 0.09, 'reloadMagIn'], [shut - 0.09, 'coverShut']];
      if (empty) belt.push([shut + 0.26, 'reloadChargingHandle']);
      return belt;
    }
    if (row.traits.reload === 'cylinder') return [[0.16 * (add / 2), 'cylinderOpen'], [(1.56 * add) / 2 - 0.15, 'cylinderLoad'], [add - 0.035, 'cylinderShut']];
    const cues: [number, SoundEventName][] = [
      [0.32, 'reloadMagOut'],
      [add - (empty ? 0.55 : 0.22), 'reloadMagIn'],
    ];
    // An empty gun is made ready its own way: the .308's bolt worked by hand, a catch or slide stop let go, a handle racked.
    if (empty && w.id === 'sniper') cues.push([add - 0.34, 'boltOpen'], [add - 0.08, 'boltClose']);
    else if (empty) cues.push([add - 0.08, w.id === 'm4a1' || w.id === 'pistol' || w.id === 'dmr' || w.id === 'burst' ? 'reloadBoltRelease' : 'reloadChargingHandle']);
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

/** How hard each gun kicks the camera, against the M4A1's 1. */
const CAMERA_KICK: Readonly<Record<WeaponId, number>> = { m4a1: 1, smg: 0.7, pistol: 0.9, shotgun: 2.6, sniper: 3, lmg: 0.85, dmr: 1.8, burst: 0.8, revolver: 2 };

/** Each sound trap's sound (ticket 72). */
const TRAP_SOUNDS: Readonly<Record<TrapKind, SoundEventName>> = { birds: 'trapBirds', metal: 'trapMetal', gravel: 'trapGravel' };
/** The guns whose rounds crack past the listener, and how near (m) a miss must pass to be heard cracking. */
const SUPERSONIC: ReadonlySet<WeaponId> = new Set<WeaponId>(['m4a1', 'sniper', 'lmg', 'dmr', 'burst']);
const CRACK_MISS = 5;

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

/** The least time between one soldier's grunts (s): another's, and your own; and the damage one hit has to do before your own body says anything. */
const GRUNT_EVERY = 0.7;
const OWN_GRUNT_EVERY = 1.4;
const OWN_GRUNT_FROM = 25;

/** How fast the picture's moods move, a second: the colour drains and returns in a third of one, the last minute's light follows its clock and leaves over two. */
const MOOD_RATES = { drain: 3, dreadIn: 4, dreadOut: 0.5 } as const;

/**
 * One running game in the page: the fixed-tick loop over a driver (offline
 * or online), the camera, viewmodel, other players, effects, sound and HUD,
 * all fed from the simulation's output and events.
 */
/** The smoke clouds standing among `grenades`: each smoke that has popped (ticket 20). */
function smokeCloudsOf(grenades: readonly GrenadeOutput[]): SmokeCloud[] {
  const out: SmokeCloud[] = [];
  for (const g of grenades) if (g.kind === 'smoke' && g.popped !== undefined) out.push({ id: g.id, at: g.position, popped: g.popped });
  return out;
}

export class Game {
  readonly input: InputController;
  readonly hud: Hud;
  readonly #renderer: WebGPURenderer;
  readonly #canvas: HTMLCanvasElement;
  readonly #worldView: WorldView;
  readonly #world: World;
  readonly #camera = new FirstPersonCamera();
  /** When each ally was last checked for a clear line from the eye, and whether it had one. */
  readonly #allySight = new AllySight();
  readonly #viewmodel: Viewmodel;
  readonly #players: PlayersView;
  readonly #arsenal: ArsenalView;
  /** Explosions already shown (the server repeats important events in case a snapshot is lost). */
  readonly #explosions = new Set<number>();
  /** A flash in your eyes (ticket 20): when (s, page clock), for how long, and how hard; null when you can see. */
  #blind: { at: number; duration: number; strength: number } | null = null;
  readonly #effects: Effects;
  /** Every bullet's tracer, and the sniper's smoke trail. */
  readonly #tracers: Tracers;
  /** The circles on the ground at the Outposts zones. */
  readonly #zoneRings: ZoneRings;
  #pipeline: GamePipeline;
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
  /** Touch's auto-fire: how long the crosshair has rested on an enemy, and whether its trigger is down. */
  #autoFire: AutoFireState = AUTO_FIRE_IDLE;
  /** The first-match hints (ticket 26): their state, the clear of the memory it was built on, and whether the loadout screen opened since the last frame. */
  #hints = hintState(hintMemory());
  #hintsCleared = hintMemoryCleared();
  #loadoutOpened = false;
  #lastFrame: number | null = null;
  #frameStart = 0;
  #fps = 60;
  #lastLook = { yaw: 0, pitch: 0 };
  #simTime = 0;
  readonly #tracked = new Map<PlayerId, Tracked>();
  readonly #engagements = new Map<PlayerId, Engagement>();
  #burstStart = -1;
  #paused = true;
  /** The pad's motors (ticket 13). */
  readonly #rumbler = new Rumbler(padActuator);
  #message: string | null = null;
  readonly #loadoutStation: GameOptions['loadoutStation'];
  readonly #rangeLanesWestOf: number | null;
  readonly #course: { readonly gates: CourseGates; readonly run: CourseRun; readonly clock: CourseClockView } | null;
  readonly #profileStore: ProfileStore | null;
  /** The Course's best time as this session knows it (the Profile's, or the session's own without one). */
  #courseBest: number | null = null;
  /** A finished run's result while it is held up, and the sim time it goes. */
  #courseResult: { readonly face: CourseFace; readonly until: number } | null = null;
  /** The map's Outposts zones, for their markers. */
  readonly #zones: readonly Zone[];
  /** The map's Charge sites, for their markers. */
  readonly #sites: readonly ChargeSite[];
  /** Who a player out of the fight watches (Charge, Battle Royale), and where the camera following them stood last frame. */
  readonly #spectator = new Spectator();
  #follow: { eye: Vec3; yaw: number; pitch: number; id: PlayerId; eyes: boolean } | null = null;
  /** Who last put the local player out, for the spectator. */
  #killer: PlayerId | null = null;
  /** Behind the one watched, or through their eyes (ticket 32); kept from one watched to the next. */
  #spectateView: 'follow' | 'eyes' = 'follow';
  /** Who put each seat out (by name), from the kill feed, for the spectator's notice. */
  readonly #outBy = new Map<PlayerId, string | null>();
  /** This match as the death recap and the match card tell it (ticket 73); kept in the page, dropped at the next match. */
  readonly #log = new MatchLog();
  /** The spectator's notice of who put out the one watched, and until when (performance.now ms). */
  #spectateNotice: { readonly text: string; readonly until: number } | null = null;
  /** The watched player's view last frame, for the movement of their weapon in your hands. */
  #eyesLook: { readonly id: PlayerId; readonly yaw: number; readonly pitch: number } | null = null;
  /** The spectator's panel as last shown, held while a seat stepped to is on its way. */
  #lastPanel: SpectatorPanelState | null = null;
  /** The Battle Royale's wall in the world and its sound (Zero Island only), and what the Ring was doing last frame. */
  readonly #ringWall: RingWall | null;
  /** The Supply Drops and the weapons on the ground (island maps only). */
  readonly #supplyDrops: SupplyDropView | null;
  /** The Reboot Beacons and the Cards lying on the island (island maps only). */
  readonly #rebootView: RebootView | null;
  /** The island map's square, for saying where a crate lands. */
  readonly #islandBounds: MapBounds | null;
  /** The Squad's pings standing now (ticket 66). */
  readonly #pingBoard = new PingBoard();
  /** Which crates and Beacons each world (the shown one, and prediction's) stands as solids. */
  readonly #propsKeys = new WeakMap<World, string>();
  readonly #ringSounds = new RingSounds();
  #ringPhase: RingPhase | null = null;
  /** The announcer (ticket 72), and the Squads left when it last looked (null outside a Battle Royale). */
  readonly #announcer: Announcer;
  readonly #leadCalls = new LeadCalls();
  /** When each soldier last grunted (s). */
  readonly #grunted = new Map<PlayerId, number>();
  #squadsLeft: number | null = null;
  /** The last minute's siren and counter (ticket 24), where the siren stands on this map, and whether the match was under way a frame ago (null: no match). */
  readonly #countdownSounds = new CountdownSounds();
  #sirenAt: Vec3 | null = null;
  #matchLive: boolean | null = null;
  /** The picture's moods as they stand (eased, so neither snaps): low health's drained colour and the last minute's light. */
  #drain = 0;
  #dread = 0;
  /** The match clock a frame ago, for the calls it passes. */
  #clockWas: number | null = null;
  /** A Battle Royale's Preparation: its sound, and the camera's shot this frame (null outside one). */
  readonly #prepSounds = new PreparationSounds();
  #prepShot: PreparationShot | null = null;
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
  /** The map's ending as a shot of its own (the nuke's, or the train's), or null to stay on the player's view. */
  readonly #endingShot: EndingShot | null;
  /** What the map's clock runs out on, for what the last minute's first call says. */
  readonly #ending: MapEnding;
  readonly #indoorZones: WorldContent['indoorZones'];
  readonly #ambience: Ambience;
  /** Where the listener last was, for placing sounds made with no position. */
  #listener: Vec3 = [0, 0, 0];
  readonly #nuke: Nuke | null;
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
  /** Your own match on its way into the Profile; what it gave, once banked, is on the end panel and the match card. */
  readonly #keeper: MatchKeeper;
  /** Seconds the gain has been on screen, for the sounds that go with it. */
  #gainShown = 0;
  readonly #onVoteKey = (e: KeyboardEvent) => {
    if (e.code === 'Digit1') this.#vote('tdm');
    else if (e.code === 'Digit2') this.#vote('ffa');
  };

  constructor(options: GameOptions) {
    this.#renderer = options.renderer;
    this.#canvas = options.canvas;
    this.#settings = options.settings;
    this.#world = options.world;
    this.#sound = options.sound;
    loadRangeControl(this.#sound.speech);
    this.#announcer = new Announcer(this.#sound.speech, browserSpeaker(), (seconds) => this.#sound.duckForVoice(seconds));
    this.#overview = options.overview;
    this.#nukeAt = options.content.nuke ?? null;
    this.#endingShot = this.#nukeAt?.shot ?? options.content.train?.shot ?? null;
    this.#ending = this.#nukeAt ? 'nuke' : options.content.train ? 'train' : null;
    this.#loadoutStation = options.loadoutStation ?? null;
    this.#rangeLanesWestOf = options.rangeLanesWestOf ?? null;
    this.#keeper = new MatchKeeper(options.profile ?? null);
    this.#profileStore = options.profile ?? null;
    this.#courseBest = this.#profileStore?.profile.courseBest ?? null;
    this.#indoorZones = options.content.indoorZones;
    this.#zones = options.content.zones ?? [];
    this.#sites = options.content.sites ?? [];
    this.#ambience = new Ambience(options.content.ambience ?? []);
    this.#trainSounds = options.content.train ? new TrainSounds(options.content.train) : null;
    options.renderer.toneMapping = ACESFilmicToneMapping;
    options.renderer.toneMappingExposure = 0.7;
    options.renderer.shadowMap.enabled = true;
    this.#worldView = new WorldView(options.renderer, options.content, options.bake);
    this.#viewmodel = new Viewmodel(this.#worldView.scene.environment, options.content.lighting);
    this.#effects = new Effects(this.#worldView.scene, options.world, options.content.fires);
    this.#tracers = new Tracers(this.#worldView.scene, options.world);
    this.#effects.onCasingBounce = (position, material, intensity) => this.#play('casing', { position, material, intensity });
    this.#viewFlash = this.#effects.createFlash();
    this.#viewmodel.muzzle.add(this.#viewFlash);
    for (let i = 0; i < 4; i++) {
      const flash = this.#effects.createFlash();
      flash.scale.setScalar(1.4);
      this.#worldFlashes.push(flash);
      this.#worldView.scene.add(flash);
    }
    this.#zoneRings = new ZoneRings(this.#worldView.scene, this.#zones);
    this.#ringWall = options.content.places && options.content.terrain ? new RingWall(this.#worldView.scene, options.world.terrain, cloudySky) : null;
    this.#players = new PlayersView(this.#worldView.scene, options.world, options.thirdPersonWeapon ?? null);
    this.#arsenal = new ArsenalView(this.#worldView.scene);
    const island = Boolean(options.content.places && options.content.terrain);
    this.#supplyDrops = island ? new SupplyDropView(this.#worldView.scene, (id) => this.#players.gunMesh(id)) : null;
    this.#rebootView = island ? new RebootView(this.#worldView.scene) : null;
    this.#islandBounds = options.content.places && options.content.terrain ? terrainBounds(options.content.terrain) : null;
    this.#pipeline = new GamePipeline(options.renderer, this.#worldView.scene, this.#camera.camera, this.#viewmodel.scene, this.#viewmodel.camera);
    this.#nuke = this.#nukeAt ? new Nuke(this.#worldView.scene, this.#nukeAt.groundZero) : null;
    this.input = new InputController(options.canvas, options.settings);
    this.hud = new Hud(document.body);
    this.#course = options.course ? { gates: options.course, run: new CourseRun(options.course), clock: new CourseClockView(this.hud.root) } : null;
    if (options.content.places && options.content.terrain) this.hud.setIsland({ terrain: options.content.terrain, colors: options.content.terrainColors ?? [0x808080], places: options.content.places });
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

  get fps(): number {
    return this.#fps;
  }

  /** Tracers fired and in flight, and sniper smoke pieces in the air, for scripts that screenshot them. */
  get tracers(): { readonly fired: number; readonly flying: number; readonly smoke: number } {
    return { fired: this.#tracers.fired, flying: this.#tracers.flying, smoke: this.#tracers.smoke };
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
    this.#newMatch();
    // The picture's moods belong to the game that was left: the menu's backdrop, and the next game, start without them.
    this.#drain = 0;
    this.#dread = 0;
    this.#clockWas = null;
    this.#pipeline.setMood(0, 0, 0);
    // Range Control was talking to the game that was left: it stops mid-word, and the next game's first frame is not this one's last.
    this.#announcer.stop();
    this.#matchLive = null;
    this.#leadCalls.reset();
    this.#grunted.clear();
    this.hud.visible = driver !== null;
  }

  /** Paused: no input reaches the game (the simulation keeps running so online play stays in sync). */
  set paused(on: boolean) {
    this.#paused = on;
    this.input.enabled = !on;
    if (on) this.#rumbler.stop();
  }

  /** Feels `r` on the pad, if the pad is the input in use and the player's play is live. */
  #rumble(r: Rumble | null): void {
    if (this.input.padMode && !this.#paused && !this.#inShot) this.#rumbler.play(r, this.#settings.padRumble);
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
    const mix = mixOf(settings);
    this.#sound.setMix(mix);
    // The recorded voice has its bus; the stand-in speaks outside the audio graph, and takes the bus's level and the master as one volume.
    this.#announcer.volume = speechVolume(mix);
    // The team colours and the enemy marker's: the HUD follows at once, the world as its soldiers and rings are next built.
    useColourVision(settings.colourVision);
    this.hud.crosshair = settings.crosshair;
    this.hud.scale = settings.hudScale;
    if (!settings.captions) this.hud.caption(null);
  }

  /** The view as last drawn (vertical FOV in degrees, angles in radians): for scripts checking what the motion settings do. */
  get view(): { readonly fov: number; readonly pitch: number; readonly roll: number; readonly y: number } {
    const cam = this.#camera.camera;
    return { fov: cam.fov, pitch: cam.rotation.x, roll: cam.rotation.z, y: cam.position.y };
  }

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

  /**
   * Puts on show, for compiling, what only appears later and far from the
   * camera: the map's ending and the Outposts rings. Compiling culls to the
   * camera, so culling goes off with them. Returns what puts them back.
   */
  #showEnding(): () => void {
    // Lighting a material changes its shader, so it goes first.
    this.#worldView.lightMoving();
    const pieces: Object3D[] = [...this.#zoneRings.meshes];
    if (this.#ringWall) pieces.push(this.#ringWall.mesh);
    if (this.#nuke) pieces.push(this.#nuke.root);
    if (this.#worldView.train) pieces.push(this.#worldView.train.root);
    const restore: (() => void)[] = [];
    for (const piece of pieces) {
      piece.traverse((o) => {
        const { visible, frustumCulled } = o;
        restore.push(() => {
          o.visible = visible;
          o.frustumCulled = frustumCulled;
        });
        o.visible = true;
        o.frustumCulled = false;
      });
    }
    return () => {
      for (const put of restore) put();
    };
  }

  /** Set by `prepare`: the next frame drawn shows everything a match shows later, then calls this. */
  #warmUp: (() => void) | null = null;

  /**
   * Gets the first moments of a match ready behind the loading screen: every
   * weapon (first-person and third-person) and the frag fetched, then one frame
   * drawn with all of them and soldiers in every look on show, so their
   * shaders compile now rather than in the first frames of play or at a
   * first weapon switch or kill. Settles within a few
   * seconds even if no frame is drawn (a hidden tab), then waits for those
   * shaders (see `#gpuDone`). The map's shaders go first, in small pieces with
   * nothing drawn until they are in, so that menus stay live throughout. Done
   * once: later calls wait for the same work. The frame with everything on show
   * can't be split up, so it waits for `moment`, when that is given, and
   * each piece before it for `breath`.
   */
  prepare(moment?: () => Promise<void>, breath?: () => Promise<void>): Promise<void> {
    this.#prepared ??= this.#prepare(moment, breath);
    return this.#prepared;
  }

  /** `prepare` is waiting for a frame to draw; a game kept ready off screen gets one from `frame` then. */
  get warming(): boolean {
    return this.#warmUp !== null;
  }

  /** `frame` draws: not while `prepare` builds shaders, when a frame's time says nothing of the picture's cost. */
  get drawing(): boolean {
    return !this.#holding;
  }

  #prepared: Promise<void> | null = null;

  /** Shaders are building: nothing is drawn, or the frame would build them all at once itself. */
  #holding = false;

  async #prepare(moment?: () => Promise<void>, breath?: () => Promise<void>): Promise<void> {
    this.#holding = true;
    // Compiling takes its list of objects at once, so the models have to be in it.
    await this.#worldView.modelsIn;
    const restore = this.#showEnding();
    const compiled = this.#pipeline.compile(breath).catch(() => undefined);
    restore();
    await compiled;
    this.#holding = false;
    await this.preload();
    await moment?.();
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
   * Waits (at most `limit` ms) until the shaders asked for so far have compiled
   * and the GPU has finished the frames drawn so far. Nothing freezes without
   * this, but what lacks a shader is left out of the picture until it has one.
   */
  async #gpuDone(limit: number): Promise<void> {
    const queue = (this.#renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device?.queue;
    if (!queue) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([pipelinesReady(this.#renderer).then(() => queue.onSubmittedWorkDone()), new Promise<void>((done) => (timer = setTimeout(done, limit)))]);
    clearTimeout(timer);
  }

  #resize(): void {
    const width = this.#canvas.clientWidth;
    const height = this.#canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.#renderer.setSize(width, height, false);
    this.#pipeline.setViewport(window.devicePixelRatio);
    this.#camera.resize(width, height);
    this.#viewmodel.resize(width / height);
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
  frame(now: number, render = true): void {
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
      this.input.setWeapon(self.weapon.slot, heldRow(self).handling.zoom.value);
      const speed = Math.hypot(self.velocity[0], self.velocity[2]);
      const lookDelta = { yaw: angleDelta(this.#lastLook.yaw, look.yaw), pitch: look.pitch - this.#lastLook.pitch };
      this.#viewmodel.root.visible = self.alive;
      this.#viewmodel.update(
        {
          weapon: self.weapon.id,
          grenade: self.grenade,
          action: self.weapon.action,
          actionTime: animTime(self, alpha),
          reload: self.weapon.reload,
          ammo: self.weapon.ammo,
          ads: self.weapon.ads,
          movement: self.movement,
          stance: self.stance,
          speed,
          grounded: self.movement !== 'airborne' && self.movement !== 'mantle' && self.movement !== 'ladder',
          lookDelta,
          velocity: self.velocity,
          yaw: pose.yaw,
          motion: this.#settings.cameraMotion,
          // Downed or Reviving, the hands are on neither gun nor frag.
          alive: self.alive && !self.downed && self.reviving === null,
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
    const prepTime = this.preparation;
    const prep = (this.#prepShot = prepTime && self && !this.overviewOnly ? this.#preparationShot(prepTime, self) : null);
    if (prep) {
      // The Preparation's shot: the island, your Squad, then the dive to your eyes.
      const cam = this.#camera.camera;
      cam.position.set(prep.position[0], prep.position[1], prep.position[2]);
      cam.rotation.set(prep.pitch, prep.yaw, 0);
      eye = prep.position;
      forward = viewDirection(prep.yaw, prep.pitch);
      this.#viewmodel.root.visible = false;
      this.#worldView.follow(prep.stage === 'island' ? [prep.position[0], 0, prep.position[2]] : self!.position);
    }
    this.#effects.keyLight = prep?.light ?? null;
    setHaze(prep?.haze ?? 1);
    for (const c of this.#prepSounds.update(prep ? prepTime : null, performance.now() / 1000)) this.#play(c.event, c.params);
    const presses = this.input.takeSpectate();
    const watched = this.overviewOnly || prep ? null : this.#spectated(presses);
    const eyes = watched !== null && this.#spectateView === 'eyes';
    if (watched) {
      // Out of the fight: the camera rides behind the watched player, pulled in short of any wall, and eases after them;
      // or it looks through their eyes, with their weapon in hand and their crosshair (ticket 32).
      const head: Vec3 = [watched.position[0], watched.position[1] + watched.eyeHeight + 0.35, watched.position[2]];
      let target: Vec3;
      let targetPitch: number;
      if (eyes) {
        target = [watched.position[0], watched.position[1] + watched.eyeHeight, watched.position[2]];
        targetPitch = watched.pitch;
      } else {
        const back = viewDirection(watched.yaw, 0);
        const want: Vec3 = [head[0] - back[0] * 2.6, head[1] + 0.4, head[2] - back[2] * 2.6];
        const hit = raycastWorld(this.#world, head, want);
        const t = hit ? Math.max(0, hit.t - 0.1) : 1;
        target = [head[0] + (want[0] - head[0]) * t, head[1] + (want[1] - head[1]) * t, head[2] + (want[2] - head[2]) * t];
        targetPitch = Math.max(-0.5, Math.min(0.4, watched.pitch)) - 0.12;
      }
      // The same player is followed smoothly; a switch glides to someone near and cuts to someone far; their eyes are exact.
      const was = this.#follow;
      const same = was?.id === watched.id && was.eyes === eyes ? was : null;
      const glide = !same && was && !eyes && Math.hypot(target[0] - was.eye[0], target[1] - was.eye[1], target[2] - was.eye[2]) < SPECTATE_GLIDE ? was : null;
      const from = same ?? glide ?? { eye: target, yaw: watched.yaw, pitch: targetPitch };
      const k = same || glide ? 1 - Math.exp(-dt * (eyes ? 30 : glide ? 6 : 12)) : 1;
      eye = eyes ? target : [from.eye[0] + (target[0] - from.eye[0]) * k, from.eye[1] + (target[1] - from.eye[1]) * k, from.eye[2] + (target[2] - from.eye[2]) * k];
      const yaw = from.yaw + angleDelta(from.yaw, watched.yaw) * k;
      const pitch = from.pitch + (targetPitch - from.pitch) * k;
      this.#follow = { eye, yaw, pitch, id: watched.id, eyes };
      const cam = this.#camera.camera;
      cam.position.set(eye[0], eye[1], eye[2]);
      cam.rotation.set(pitch, yaw, 0);
      forward = viewDirection(yaw, pitch);
      if (eyes) this.#theirWeapon(watched, eye, yaw, pitch, alpha, dt);
      else {
        this.#viewmodel.root.visible = false;
        this.#eyesLook = null;
      }
      this.#worldView.follow(watched.position);
    } else if (this.#follow && this.#spectator.watching !== null && !this.overviewOnly && !prep) {
      // Stepped to someone too far to have been sent: hold the shot until the server, told whom you watch, sends them.
      const f = this.#follow;
      const cam = this.#camera.camera;
      cam.position.set(f.eye[0], f.eye[1], f.eye[2]);
      cam.rotation.set(f.pitch, f.yaw, 0);
      eye = f.eye;
      forward = viewDirection(f.yaw, f.pitch);
      this.#viewmodel.root.visible = false;
    } else {
      this.#follow = null;
      this.#eyesLook = null;
    }
    const shot = this.#endingShot;
    const ending = shot ? this.#sinceMatchEnd(driver) : null;
    this.#inShot = ending !== null;
    if (shot && ending !== null) {
      // The map's ending plays as a shot of its own, like a cut scene: everyone watches the nuke or the train, wherever they stood.
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
      // Your own soldier stands with your Squad while the Preparation's camera is on them.
      // Through someone's eyes, their own body would fill the view.
      const shown = prep && prep.stage !== 'dive' && this.#cur ? [...this.#others, this.#cur] : eyes ? this.#others.filter((p) => p.id !== watched.id) : this.#others;
      // Each soldier at its distance's level from the camera (full near, cheap mid, instanced far), nearer through a scope.
      const zoom = Math.tan(verticalFov(this.#settings.fov) / 2) / Math.tan((this.#camera.camera.fov * Math.PI) / 360);
      this.#players.update(shown, dt, { teams, self: teams ? (this.#cur?.team ?? null) : null }, eye, zoom);
      this.#worldView.zoom(zoom);
      this.#arsenal.grenades(driver.grenades(), alpha);
      this.#effects.smokeClouds(smokeCloudsOf(driver.grenades()), driver.serverTime, dt);
      this.#arsenal.glints(this.#others, eye, this.#camera.camera);
      this.#supplyDrops?.update(this.#royale, driver.serverTime, this.#camera.camera, dt);
      this.#rebootView?.update(this.#royale, driver.serverTime, dt);
      this.#standProps(driver);
      this.#sendPings(driver, eye, forward);
    }
    this.#updateNuke(driver, eye);
    this.#updateTrain(driver, eye);
    // Charge's keypad, beeping and tools; the round's state stands through the intermission, so the last defuse is heard too.
    const objective = driver?.match?.objective;
    for (const c of this.#chargeSounds.update(objective?.kind === 'charge' ? objective : null, performance.now() / 1000, (id) => this.#playerById(id)?.position ?? null)) this.#play(c.event, c.params);
    this.#zoneRings.update(driver?.match?.phase === 'playing' && objective?.kind === 'outposts' ? objective.zones : null, performance.now() / 1000);
    this.#updateRing(driver, eye);
    this.#updateScore(driver, dt);
    this.#effects.update(dt, this.#camera.camera);
    this.#tracers.update(dt, this.#camera.camera);
    this.#pipeline.bloomBoost = this.#effects.flashStrength * 0.5;
    this.#updateHud(dt, eye, forward);
    if (render && !this.#holding) {
      const warm = this.#warmUp;
      const restore = warm ? this.#showSamples() : [];
      this.#worldView.frame();
      this.#worldView.lightMoving();
      this.#pipeline.render();
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
    // The match card's time alive and route: a Battle Royale in play, past its Preparation, while you're in the fight.
    this.#log.self = driver.selfId;
    const inFight = this.#royale !== null && driver.match?.preparation === null && this.#cur?.alive === true && !this.#inShot;
    this.#log.sample(dt, inFight ? this.#cur!.position : null);
    const match = driver.match;
    if (!match || match.phase === 'playing') this.#myVote = null;
    this.#keepProfile(dt, driver);
    this.#course?.clock.paint(this.#courseFace());
    // The population sign: everyone in the lobby (at least you) and this match's kills.
    this.#worldView.setPopulation(Math.max(driver.scores.length, this.#cur ? 1 : 0), driver.scores.reduce((n, s) => n + s.kills, 0));
    const cam = this.#camera.camera;
    const pixelsPerDegree = this.#canvas.clientHeight / 2 / Math.tan((cam.fov * Math.PI) / 360) / (180 / Math.PI);
    const status = driver.status;
    const showOverlay = this.#settings.showRangeOverlay && this.#inRange();
    const action = this.#action();
    // While a crate opens or a Reboot runs, its bar says so in the prompt's place.
    const prompt = action ? null : this.#prompt();
    this.#aimHelp(eye, forward);
    this.#rumbler.update();
    const hint = this.#hint(dt);
    const playing = !match || match.phase === 'playing';
    this.input.touchContext = {
      state: !playing || this.#inShot ? 'over' : this.#cur?.alive ? 'fight' : this.#lastPanel ? 'spectate' : 'wait',
      use: prompt !== null || action !== null,
      board: driver.online && driver.scores.length > 0,
      ping: match !== null && match !== undefined && playing && (teamMode(match.mode) || match.mode === 'battle-royale'),
      map: this.#royale !== null,
      mapOpen: this.input.mapOpen,
      grenades: this.#cur?.grenades ?? 0,
      tactical: this.#cur?.loadout.tactical ?? null,
      tacticals: this.#cur?.tacticals ?? 0,
    };
    this.hud.update({
      self: this.#inShot ? null : this.#cur,
      allies: this.#allyTags(eye),
      spectator: this.#spectatorPanel(),
      spectatorAim: this.#follow?.eyes && !this.#inShot ? (this.#playerById(this.#follow.id) ?? null) : null,
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
            // Through the opening countdown the clock stands at the full time limit.
            secondsLeft:
              match.objective?.kind === 'charge' && match.phase === 'playing'
                ? match.objective.remaining
                : match.phaseEnds === null
                  ? null
                  : match.phase === 'playing' && match.timeLimit !== null
                    ? Math.min(match.timeLimit, match.phaseEnds - driver.serverTime)
                    : match.phaseEnds - driver.serverTime,
            countdown: match.countdownEnds === null || match.countdownEnds === undefined ? null : match.countdownEnds - driver.serverTime,
            team: teamMode(match.mode) ? (this.#cur?.team ?? null) : null,
            myVote: this.#myVote,
          }
        : null,
      respawnIn: match && (match.phase !== 'playing' || match.objective?.kind === 'charge') ? null : driver.respawnIn,
      prompt,
      hint,
      message: this.#message ?? (status === 'playing' ? null : status === 'connecting' ? 'Connecting…' : status === 'reconnecting' ? 'Reconnecting…' : status),
      zones: this.#zoneMarkers(eye),
      charge: this.#chargeHud(eye),
      royale: this.#royaleHud(forward),
      victory: victoryTime(driver.match, driver.serverTime) === null ? null : victoryCard(driver.match?.result, driver.scores, driver.selfId),
      matchCard: this.#matchCard(),
      gain: this.#keeper.gain,
      recap: this.#royale && this.#cur?.alive && this.#cur.downed ? this.#log.recap : null,
      pingMarks: { marks: this.#pingMarks(eye), wheel: this.input.pingWheel },
      tactical: this.#cur?.loadout.tactical ?? null,
      blinded: this.#blindness(),
      grenades: grenadeWarnings(this.#cur, driver.grenades(), driver.serverTime, match !== null && match !== undefined && (teamMode(match.mode) || match.mode === 'battle-royale')),
      action,
      dt,
    });
  }

  /** How white a flash has turned your view (0 to 1): white out through most of the first half, then clearing. */
  #blindness(): number {
    const b = this.#blind;
    if (!b) return 0;
    const t = performance.now() / 1000 - b.at;
    if (t >= b.duration || !this.#cur?.alive) {
      this.#blind = null;
      return 0;
    }
    const hold = b.duration * 0.45;
    const clear = t < hold ? 1 : Math.pow(1 - (t - hold) / (b.duration - hold), 1.4);
    return clear * Math.min(1, 0.55 + 0.6 * b.strength);
  }

  /** The crates landed and the Beacons as solids, in the world drawn and in prediction's, so you walk round them as the server has you do. */
  #standProps(driver: GameDriver): void {
    const state = this.#royale;
    for (const world of new Set([this.#world, driver.prediction ?? this.#world])) {
      const key = this.#propsKeys.get(world) ?? '';
      const next = standProps(world, state, driver.serverTime, key);
      if (next !== key) this.#propsKeys.set(world, next);
    }
  }

  /** Sends the pings asked for since the last frame: what the crosshair is on, or the wheel's choice there. */
  #sendPings(driver: GameDriver, eye: Vec3, forward: Vec3): void {
    const asked = this.input.takePings();
    const self = this.#cur;
    if (asked.length === 0 || !self?.alive || driver.match?.phase !== 'playing' || this.#inShot) return;
    const reach = STATS.ping.reach.value;
    const hit = raycastWorld(this.#world, eye, [eye[0] + forward[0] * reach, eye[1] + forward[1] * reach, eye[2] + forward[2] * reach]);
    const teams = teamMode(driver.match.mode);
    const enemies = this.#others
      .filter((p) => p.alive && (!teams || p.team !== self.team))
      .map((p) => ({ id: p.id, at: [p.position[0], p.position[1] + p.eyeHeight * 0.75, p.position[2]] as Vec3 }));
    for (const kind of asked) {
      const ping = aimPing({ eye, forward, hit: hit?.point ?? null, enemies, royale: this.#royale, team: self.team }, kind);
      if (ping) driver.mark(ping);
    }
  }

  /** The pings standing, each where it shows on the screen; none while the island map is open or a shot plays. */
  #pingMarks(eye: Vec3): PingScreenMark[] {
    const driver = this.#driver;
    if (!driver || this.#inShot || this.input.mapOpen) return [];
    return this.#pingBoard.live(driver.serverTime).flatMap((m) => {
      const at: Vec3 = [m.position[0], m.position[1] + (m.kind === 'enemy' ? 0.6 : 0.4), m.position[2]];
      const s = this.#project(at, eye);
      return s ? [{ id: m.id, kind: m.kind, name: m.name, ...s }] : [];
    });
  }

  /** The bar over the prompt while you open a crate or reboot at a Beacon. */
  #action(): { label: string; share: number } | null {
    const state = this.#royale;
    const driver = this.#driver;
    const selfId = driver?.selfId;
    if (!state || !driver || !selfId) return null;
    const share = (since: number, of: number) => Math.max(0, Math.min(1, (driver.serverTime - since) / of));
    const drop = state.drops?.find((d) => d.opening?.by === selfId);
    // The prompt's own words (who is being rebooted, the seconds left) go over the bar.
    if (drop?.opening) return { label: this.#prompt() ?? 'Opening Supply Drop', share: share(drop.opening.since, STATS.royale.supplyDrop.openTime.value) };
    const beacon = state.beacons?.find((b) => b.channel?.by === selfId);
    if (beacon?.channel) return { label: this.#prompt() ?? 'Rebooting', share: share(beacon.channel.since, STATS.royale.reboot.channel.value) };
    return null;
  }

  /** A tag over each ally (ticket 52). Sight lines to them are checked ten times a second, not every frame. */
  #allyTags(eye: Vec3): AllyTag[] {
    const driver = this.#driver;
    const match = driver?.match;
    const self = this.#cur;
    if (!driver || !match || match.phase !== 'playing' || !self || this.#inShot) return [];
    const watched = this.#spectator.watching === null ? null : this.#playerById(this.#spectator.watching);
    const view = self.alive ? self : (watched ?? self);
    const allies = alliesOf(this.#others, view.id, self.team, match.mode);
    if (allies.length === 0) return [];
    const cam = this.#camera.camera;
    const w = this.#canvas.clientWidth;
    const h = this.#canvas.clientHeight;
    const now = performance.now();
    const reach = STATS.royale.reviveReach.value;
    const canRevive = self.alive && !self.downed;
    const seenAllies = allies.map((p): AllySeen => {
      const top = p.position[1] + p.eyeHeight;
      const seen = this.#allySight.seen(p.id, now, () => !sightBlocked(this.#world, eye, [p.position[0], top, p.position[2]]));
      const v = new Vector3(p.position[0], top + 0.55, p.position[2]).project(cam);
      // Behind the camera the projection mirrors: flip it back.
      const behind = v.z > 1;
      const flat = Math.hypot(p.position[0] - view.position[0], p.position[2] - view.position[2]);
      const inReach = p.downed !== null && canRevive && flat <= reach && Math.abs(p.position[1] - self.position[1]) <= reach;
      return { id: p.id, name: driver.nameOf(p.id), distance: flat, downed: p.downed !== null, inReach, seen, x: (((behind ? -v.x : v.x) + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind };
    });
    return allyTags(seenAllies, w, h, this.input.touchMode);
  }

  /** The Charge round, while one is on. */
  get #charge(): ChargeState | null {
    const match = this.#driver?.match;
    return match?.phase === 'playing' && match.objective?.kind === 'charge' ? match.objective : null;
  }

  /** The button prompt: the loadout screen (dead, at the range's station, or in a round's freeze), planting and defusing, or a Revive. */
  #prompt(): string | null {
    const self = this.#cur;
    const match = this.#driver?.match;
    if (!self || (match && match.phase !== 'playing')) return null;
    const charge = this.#charge;
    if (!self.alive && match?.mode === 'battle-royale') return null;
    if (!self.alive || this.#atStation(self) || charge?.phase === 'freeze' || this.#counting()) return `${this.#useLabel()}  Loadout`;
    if (charge && !charge.action) {
      if (charge.phase === 'live' && charge.carrier === self.id && this.#sites.some((s) => inSite(s, self.position))) return `Hold ${this.#useLabel()}  Plant`;
      const p = charge.planted?.position;
      if (charge.phase === 'planted' && p && self.team !== charge.attackers && Math.hypot(self.position[0] - p[0], self.position[2] - p[2]) <= DEFUSE_RANGE) return `Hold ${this.#useLabel()}  Defuse`;
    }
    const mate = this.#revivable(self);
    if (mate) return `Hold ${this.#useLabel()}  Revive ${this.#driver?.nameOf(mate.id) ?? ''}`;
    const royale = this.#royale;
    const driver = this.#driver;
    const reboot = royale && driver ? rebootPrompt(self, royale, driver.serverTime, this.#useLabel(), (id) => driver.nameOf(id)) : null;
    if (reboot) return reboot;
    return royale && this.#driver ? dropPrompt(self, royale, this.#driver.serverTime, self.loadout?.primary ?? null, this.#useLabel()) : null;
  }

  /** The Downed squadmate a Revive would start on (the nearest in reach nobody is at yet), as the simulation picks it. */
  #revivable(self: PlayerOutput): PlayerOutput | null {
    if (self.downed || self.reviving !== null) return null;
    const reach = STATS.royale.reviveReach.value;
    let best: PlayerOutput | null = null;
    let nearest = Infinity;
    for (const p of this.#others) {
      if (!p.downed || p.downed.revive > 0 || p.team !== self.team) continue;
      const flat = Math.hypot(p.position[0] - self.position[0], p.position[2] - self.position[2]);
      if (flat > reach || Math.abs(p.position[1] - self.position[1]) > reach || flat >= nearest) continue;
      best = p;
      nearest = flat;
    }
    return best;
  }

  /**
   * Who a player out of the fight watches (see Spectator), or null. Charge's dead wait for the next round; Battle Royale's are out for the match.
   * Fire and Aim step to the next and previous player, Jump changes the view; when the one watched is put out, it moves on and says who did it.
   */
  #spectated(presses: readonly SpectateInput[]): PlayerOutput | null {
    const driver = this.#driver;
    const match = driver?.match;
    const mode = match?.mode ?? null;
    const playing = match?.phase === 'playing' && (mode !== 'charge' || this.#charge !== null);
    const view = this.#spectateChoice(mode, playing);
    let id = this.#spectator.update(view);
    const lost = this.#spectator.lost;
    if (lost !== null && driver) this.#spectateNotice = { text: spectatorNotice(driver.nameOf(lost), this.#outBy.get(lost) ?? null), until: performance.now() + SPECTATE_NOTICE_MS };
    if (id !== null)
      for (const press of presses) {
        if (press === 'view') this.#spectateView = this.#spectateView === 'follow' ? 'eyes' : 'follow';
        else id = this.#spectator.step(view, press === 'next' ? 1 : -1);
      }
    driver?.watch(id);
    return id === null ? null : (this.#others.find((p) => p.id === id) ?? null);
  }

  /** What the spectator chooses from: the seats in view and, in Battle Royale, the rest of the match from the scoreboard. */
  #spectateChoice(mode: ModeId | null, playing: boolean): SpectateView {
    const driver = this.#driver;
    return { mode, playing, self: this.#cur, players: withRoster(mode, this.#others, driver?.scores ?? [], driver?.selfId ?? null), killer: this.#killer };
  }

  /** Watching through someone's eyes: their weapon in your hands as it moves in theirs, lit where they stand. */
  #theirWeapon(p: PlayerOutput, eye: Vec3, yaw: number, pitch: number, alpha: number, dt: number): void {
    const last = this.#eyesLook?.id === p.id ? this.#eyesLook : null;
    const lookDelta = last ? { yaw: angleDelta(last.yaw, yaw), pitch: pitch - last.pitch } : { yaw: 0, pitch: 0 };
    this.#eyesLook = { id: p.id, yaw, pitch };
    this.#viewmodel.root.visible = true;
    this.#viewmodel.update(
      {
        weapon: p.weapon.id,
        grenade: p.grenade,
        action: p.weapon.action,
        actionTime: animTime(p, alpha),
        reload: p.weapon.reload,
        ammo: p.weapon.ammo,
        ads: p.weapon.ads,
        movement: p.movement,
        stance: p.stance,
        speed: Math.hypot(p.velocity[0], p.velocity[2]),
        grounded: p.movement !== 'airborne' && p.movement !== 'mantle' && p.movement !== 'ladder',
        lookDelta,
        velocity: p.velocity,
        yaw,
        motion: this.#settings.cameraMotion,
        alive: p.alive && !p.downed && p.reviving === null,
      },
      dt,
      verticalFov(this.#settings.fov),
    );
    this.#lightViewmodel(eye, dt);
  }

  /** The spectator's panel: who you watch, their health, weapon and side, and the keys (ticket 32). */
  #spectatorPanel(): SpectatorPanelState | null {
    const driver = this.#driver;
    const id = this.#spectator.watching;
    const watched = id === null || this.#inShot ? null : this.#playerById(id);
    if (!driver || id === null || this.#inShot || this.#cur?.alive || !this.#follow) return (this.#lastPanel = null);
    if (!watched) {
      // Stepped to someone not sent yet: the panel names them while the shot holds.
      const held = this.#lastPanel;
      if (!held) return null;
      const order = this.#spectator.order(this.#spectateChoice(driver.match?.mode ?? null, true));
      return { ...held, name: driver.nameOf(id), bot: driver.scores.some((s) => s.id === id && s.bot), index: order.findIndex((p) => p.id === id) + 1, of: order.length };
    }
    const mode = driver.match?.mode ?? null;
    const scores = driver.scores;
    const side = scores.filter((s) => s.team === watched.team && s.id !== watched.id);
    const solo = mode === 'battle-royale' ? side.length === 0 : !teamMode(mode ?? 'ffa');
    const mates = solo
      ? []
      : side.map((s) => {
          const p = s.id === driver.selfId ? this.#cur : this.#others.find((o) => o.id === s.id);
          return { name: s.id === driver.selfId ? 'You' : driver.nameOf(s.id), state: !p?.alive ? ('out' as const) : p.downed ? ('downed' as const) : ('up' as const) };
        });
    const order = this.#spectator.order(this.#spectateChoice(mode, true));
    const pad = this.input.padMode;
    const b = this.#settings.bindings;
    const notice = this.#spectateNotice && performance.now() < this.#spectateNotice.until ? this.#spectateNotice.text : null;
    return (this.#lastPanel = {
      recap: mode === 'battle-royale' && driver.scores.some((s) => s.id === driver.selfId) ? this.#recapFor(RECAP_OUT_MS) : null,
      name: driver.nameOf(watched.id),
      bot: scores.some((s) => s.id === watched.id && s.bot),
      health: watched.health,
      downed: watched.downed !== null,
      weapon: STATS.weapons[watched.weapon.id].traits.name,
      group: solo ? null : mode === 'battle-royale' ? 'Squad' : 'Team',
      mates,
      index: order.findIndex((p) => p.id === watched.id) + 1,
      of: order.length,
      view: this.#spectateView,
      notice,
      // On touch the three are buttons on the glass, named by what is drawn on them.
      keys: this.input.touchMode ? { prev: '\u2039', next: '\u203a', view: '\u25c9' } : pad ? { prev: 'LT', next: 'RT', view: 'A' } : { prev: shortKey(b.ads), next: shortKey(b.fire), view: shortKey(b.jump) },
    });
  }

  /** A Battle Royale's Preparation, where it is now, while it runs (online, in the match's opening). */
  get preparation(): PreparationTime | null {
    const driver = this.#driver;
    const match = driver?.match;
    const prep = match?.phase === 'playing' ? match.preparation : null;
    if (!driver || !prep || match?.countdownEnds === null || match?.countdownEnds === undefined) return null;
    return preparationTime(prep.start, match.countdownEnds, driver.serverTime);
  }

  /** The Preparation's camera from where you and your Squad stand, kept short of anything solid between it and them. */
  #preparationShot(time: PreparationTime, self: PlayerOutput): PreparationShot | null {
    const state = this.#royale;
    if (!state) return null;
    const squad = [self, ...this.#others.filter((p) => p.kind === 'player' && p.team === self.team && p.id !== self.id)];
    const eye: Vec3 = [self.position[0], self.position[1] + self.eyeHeight, self.position[2]];
    const shot = preparationShot({ island: state.circle, eye, yaw: self.yaw, squad: squad.map((p) => p.position) }, time);
    if (shot.stage !== 'squad') return shot;
    const hit = raycastWorld(this.#world, eye, shot.position);
    if (!hit) return shot;
    const t = Math.max(0.15, hit.t - 0.05);
    const position: Vec3 = [eye[0] + (shot.position[0] - eye[0]) * t, eye[1] + (shot.position[1] - eye[1]) * t, eye[2] + (shot.position[2] - eye[2]) * t];
    return { ...shot, position };
  }

  /** The Battle Royale in play, or null. */
  get #royale(): BattleRoyaleState | null {
    const match = this.#driver?.match;
    return match?.phase === 'playing' && match.objective?.kind === 'battle-royale' ? match.objective : null;
  }

  /** The Ring's wall where it stands now, its hum and crackle round the listener, and its warning as it starts to close. */
  #updateRing(driver: GameDriver | null, listener: Vec3): void {
    if (!this.#ringWall) return;
    const state = this.#royale;
    const ring = state && driver ? ringNow(state, driver.serverTime) : null;
    const now = performance.now() / 1000;
    this.#ringWall.update(ring, now);
    this.#ringWall.strength = this.#prepShot?.ring ?? 1;
    for (const c of this.#ringSounds.update(ring, now, listener)) this.#play(c.event, c.params);
    const phase = state && driver ? ringStatus(state, driver.serverTime, null).phase : null;
    if (phase === 'closing' && this.#ringPhase === 'hold') {
      this.#play('ringShift');
      this.#sound.music.sting('ringClosing');
      this.hud.toast('The Ring is closing.', 3);
      this.#say('ringClosing', true);
    }
    this.#ringPhase = phase;
    const left = state ? leftLine(this.#squadsLeft, state.squads, state.squadSize === 1) : null;
    if (left) this.#say(left);
    this.#squadsLeft = state ? state.squads : null;
  }

  /**
   * What a hit forces out of whoever took it: a grunt, or the last breath. A kill through the head makes no sound at
   * all, a target dummy has no voice, and one soldier does not grunt at every round of a burst.
   */
  #voice(victim: PlayerId, own: boolean, killed: boolean, head: boolean, damage: number, point: Vec3): void {
    if (victim.startsWith('dummy')) return;
    const at = own ? { local: true } : { position: point };
    if (killed) {
      this.#grunted.delete(victim);
      if (!head) this.#play('death', at);
      return;
    }
    const now = performance.now() / 1000;
    if (now - (this.#grunted.get(victim) ?? -Infinity) < (own ? OWN_GRUNT_EVERY : GRUNT_EVERY)) return;
    // Your own body's hits are already felt (the thump, the red, the flinch): it speaks up only for the heavy ones.
    if (own && damage < OWN_GRUNT_FROM) return;
    this.#grunted.set(victim, now);
    if (this.#grunted.size > 64) this.#grunted.delete(this.#grunted.keys().next().value as PlayerId);
    this.#play('pain', { ...at, intensity: Math.min(1, damage / 50) });
  }

  /**
   * Range Control says a line, and everything but the UI makes room under it. `written`: the HUD is writing the same
   * words as it speaks (a toast), so no caption repeats them.
   */
  /** A Charge round opens: which side you are on this time. Someone with no side is told nothing. */
  #round(round: number, attackers: TeamId): void {
    const team = this.#driver ? this.#team(this.#driver) : null;
    if (team === null) return;
    const attack = team === attackers;
    this.hud.toast(`Round ${round}: you ${attack ? 'attack' : 'defend'}.`, 4);
    this.#say(attack ? 'roundAttack' : 'roundDefend');
  }

  /** Your team in the match, or null with none (every player for themselves, or only watching). */
  #team(driver: GameDriver): TeamId | null {
    return driver.scores.find((s) => s.id === driver.selfId)?.team ?? null;
  }

  #say(line: VoiceLineId, written = false): void {
    const seconds = this.#announcer.say(line);
    // The caption does not wait on the voice: it is there for whoever cannot hear it, or has it turned down. The last
    // five seconds are counted on the clock itself.
    if (this.#settings.captions && !written && !VOICE_ON_THE_SECOND.includes(line)) this.hud.caption(VOICE_LINES[line], seconds);
  }

  /**
   * The score, the countdown and the danger state follow the match (tickets 12, 15 and 24):
   * its phase and clock choose the music's scene, its last minute brings the siren and the
   * counter, and your own health the heartbeat. With no game running the menus own the scene
   * (the app's frame loop).
   */
  #updateScore(driver: GameDriver | null, dt: number): void {
    const self = this.#cur;
    const match = driver?.match ?? null;
    // A clock that stands still (a Bot Match paused) holds the sounds that run on it.
    const frozen = driver !== null && this.#paused && driver.pausesWithGame === true;
    // The heart and the dulled world belong to the fight: not to the scoreboard, the vote or a paused game.
    const fighting = driver !== null && !frozen && !this.#inShot && (match === null || match.phase === 'playing');
    this.#sound.setHealth(fighting && self?.alive ? self.health : null);
    const kind = match?.objective?.kind;
    // One clock to run out: Charge is played in rounds, and a Battle Royale ends with its last Squad.
    const timeLeft =
      driver && match && match.phase === 'playing' && match.timeLimit !== null && match.phaseEnds !== null && kind !== 'charge' && kind !== 'battle-royale'
        ? Math.min(match.timeLimit, match.phaseEnds - driver.serverTime)
        : null;
    // The picture's share: the colour drains with your health, and the last minute changes the light. Both ease, so a
    // hit, a respawn and the match's end move the picture instead of cutting it.
    this.#drain = eased(this.#drain, fighting && self?.alive ? colourDrain(self.health) : 0, MOOD_RATES.drain, dt);
    const light = lastMinuteLight(timeLeft);
    this.#dread = eased(this.#dread, light, light > this.#dread ? MOOD_RATES.dreadIn : MOOD_RATES.dreadOut, dt);
    this.#pipeline.setMood(this.#drain, this.#dread, frozen ? 0 : lastTenBeat(timeLeft));
    // What the announcer says on the way down: at a minute, at half of one, at ten seconds, then each of the last five.
    const call = frozen ? null : countdownCall(this.#clockWas, timeLeft);
    this.#clockWas = clockRan(this.#clockWas, timeLeft);
    if (call) {
      const line = countdownLine(call, this.#ending);
      this.#say(countdownVoice(call, this.#ending), line !== null);
      if (line) this.hud.toast(line, 4);
    }
    if (!driver || frozen) {
      // Left, or paused: no siren over the menu, and none winding on against a clock that isn't running.
      if (this.#countdownSounds.hush(frozen)) this.#sound.stop(COUNTDOWN_VOICES, 0.2);
    } else {
      // Where the siren stands is worked out when a clock first needs it: most modes' matches never do.
      const sirenAt = timeLeft !== null ? (this.#sirenAt ??= sirenSpot(this.#world.solids)) : (this.#sirenAt ?? ([0, 0, 0] as const));
      for (const c of this.#countdownSounds.update(timeLeft, performance.now() / 1000, sirenAt)) {
        if (c.cut) this.#sound.stop(c.cut, SIREN_OVERLAP);
        this.#play(c.event, c.params);
      }
    }
    if (!driver) {
      this.#matchLive = null;
      this.#leadCalls.reset();
      return;
    }
    // The opening countdown running out is the match's first note; joining a match already under way is not.
    const live = match !== null && match.phase === 'playing' && !(match.countdownEnds !== null && match.countdownEnds > driver.serverTime);
    const opened = live && this.#matchLive === false;
    // Stopped with time still on the clock (a limit reached, the last round won): Range Control closes the range. A
    // clock that ran out needs no telling, and a Battle Royale ends on its own beat.
    const stopped = this.#matchLive === true && match !== null && (match.phase === 'nuke' || match.phase === 'vote') && closesRange(match.mode, match.result?.reason ?? null);
    this.#matchLive = match ? live : null;
    if (opened && match) {
      const line = liveLine(match.mode);
      if (line) this.#say(line);
      // Charge opens round by round, and the mode only announces the rounds after the first.
      else if (match.objective?.kind === 'charge') this.#round(match.objective.round, match.objective.attackers);
    }
    if (stopped) this.#say('ceaseFire');
    // Who is ahead, as it changes hands.
    if (!live || !match) this.#leadCalls.reset();
    else if (!frozen && !clockSpeaks(timeLeft)) {
      const team = this.#team(driver);
      const lead = this.#leadCalls.update(leadOf(match.mode, match.teamScores, driver.scores, driver.selfId, team), driver.serverTime);
      if (lead) this.#say(lead);
    }
    const royale = this.#royale;
    this.#sound.music.setScene(matchScene({ phase: match?.phase ?? null, timeLeft, finalStage: royale !== null && royale.stage >= RING_STAGES, won: this.#won(driver) }), timeLeft);
    // After the scene is set: a sting asked of a score that is still silent is dropped.
    if (opened) this.#sound.music.sting('matchStart');
  }

  /** How the match ended for you: won or lost; null while it is played, on a draw, or when you only watched. */
  #won(driver: GameDriver): boolean | null {
    const match = driver.match;
    const me = driver.scores.find((s) => s.id === driver.selfId);
    if (!match || !me || (match.phase !== 'nuke' && match.phase !== 'vote')) return null;
    return this.#wonBy(match, me, driver.selfId);
  }

  /** Whether the seat of row `me` won `match` as it stands: a Battle Royale by its place, anything else by the result; null with neither yet, or on a draw. */
  #wonBy(match: MatchStatus, me: Score, selfId: PlayerId | null): boolean | null {
    if (match.mode === 'battle-royale') return me.place === undefined ? null : me.place === 1;
    const result = match.result;
    if (!result || result.draw || result.winner === null) return null;
    return teamMode(match.mode) ? me.team === result.winner : result.winner === selfId;
  }

  /** What the log looks up as it records: names, bots, the seats as last sent, weapon names. */
  readonly #lookup: RecapLookup = {
    nameOf: (id) => this.#driver?.nameOf(id) ?? id,
    isBot: (id) => this.#driver?.scores.some((s) => s.id === id && s.bot) ?? false,
    seat: (id) => {
      const p = this.#others.find((o) => o.id === id);
      return p?.alive ? p : null;
    },
    weaponName: (cause, weapon) => killedWith(cause, weapon as KillWeapon | null) || null,
  };

  /** A match begins, or the game is left: nothing of the last one is carried over. */
  #newMatch(): void {
    this.#course?.run.reset();
    this.#courseResult = null;
    this.#keeper.begin();
    this.#gainShown = 0;
    this.hud.clearScore();
  }

  /**
   * The Profile's side of a match (ticket 17): its time counts while you are
   * in it, and it is banked once, when it ends, or in a Battle Royale as soon
   * as your Squad has its place. Only what the server scored is kept: the
   * Practice Range and a map walked alone bank nothing, nor does a match this
   * page joined after its end or left before it.
   */
  #keepProfile(dt: number, driver: GameDriver): void {
    const match = driver.match;
    const me = driver.scores.find((s) => s.id === driver.selfId);
    if (!driver.online || !match || !me) return;
    const over = match.phase === 'nuke' || match.phase === 'vote';
    this.#keeper.update(dt, {
      playing: match.phase === 'playing' && me.place === undefined,
      over: me.place !== undefined || (over && match.result !== null && match.result !== undefined),
      about: () => ({ mode: match.mode, won: this.#wonBy(match, me, driver.selfId) === true, place: me.place ?? null, row: me }),
    });
    // The strip's sounds, timed to its Rank bar: they wait for the end panel or the card to be up.
    const gain = this.#keeper.gain;
    if (!gain || !over || victoryTime(match, driver.serverTime) !== null) return;
    const before = this.#gainShown;
    const now = (this.#gainShown += dt);
    if (before < 0.5 && now >= 0.5 && gain.challenges.some((c) => c.completed)) this.#play('challengeDone');
    if (before < GAIN_RANK_UP_AT && now >= GAIN_RANK_UP_AT && gain.rankUp) this.#play('rankUp');
  }

  /** Your own match on one card, at a Battle Royale's end, after the victory beat (ticket 73). */
  #matchCard(): MatchCardState | null {
    const driver = this.#driver;
    const match = driver?.match;
    if (!driver || !match || match.mode !== 'battle-royale' || !driver.scores.some((s) => s.id === driver.selfId)) return null;
    const ending = match.phase === 'nuke' || (match.phase === 'vote' && match.lobby !== null);
    if (!ending || victoryTime(match, driver.serverTime) !== null) return null;
    const left = Math.max(0, (match.phaseEnds ?? driver.serverTime) - driver.serverTime) + (match.phase === 'nuke' ? INTERMISSION.scoreboard : 0);
    const winners = victoryCard(match.result, driver.scores, driver.selfId);
    const me = driver.scores.find((s) => s.id === driver.selfId);
    return {
      card: this.#cardFor(placement(driver.scores, driver.selfId), me?.kills ?? 0),
      winners: winners?.names ?? null,
      yours: winners?.yours ?? false,
      next: match.lobby ? `Back to the lobby in ${Math.ceil(left)} s` : `Next match in ${Math.ceil(left)} s`,
      score: me?.score ?? 0,
      gain: this.#keeper.gain,
    };
  }

  /** The card, made once for what it shows: a fresh object would redraw its island every frame. */
  #cardFor(place: { place: number; of: number } | null, kills: number) {
    const key = `${place?.place}/${place?.of}/${kills}`;
    if (this.#cardKey !== key || !this.#cardMade) {
      this.#cardKey = key;
      this.#cardMade = this.#log.card(place, kills);
    }
    return this.#cardMade;
  }

  /** The recap while it is fresh, so out of the fight the spectator's panel gets its room back. */
  #recapFor(ms: number): MatchLog['recap'] {
    const r = this.#log.recap;
    if (r !== this.#recapSeen) {
      this.#recapSeen = r;
      this.#recapAt = performance.now();
    }
    return r && performance.now() - this.#recapAt < ms ? r : null;
  }

  #recapSeen: MatchLog['recap'] = null;
  #recapAt = 0;
  #cardKey = '';
  #cardMade: ReturnType<MatchLog['card']> | null = null;

  /** The Battle Royale HUD: the Ring, the compass from where the view stands, the count, your placement and who you watch. */
  #royaleHud(forward: Vec3): RoyaleHudState | null {
    const state = this.#royale;
    const driver = this.#driver;
    if (!state || !driver) return null;
    const self = this.#cur;
    const watched = this.#spectator.watching === null ? null : this.#playerById(this.#spectator.watching);
    const view = self?.alive ? self : watched;
    const team = self?.team ?? null;
    const mates = team === null ? [] : this.#others.filter((p) => p.alive && p.kind === 'player' && p.team === team && p.id !== view?.id);
    return {
      status: ringStatus(state, driver.serverTime, self?.alive ? self.position : null),
      ring: ringNow(state, driver.serverTime),
      next: state.next,
      alive: state.alive,
      squads: state.squads,
      kills: driver.scores.find((s) => s.id === driver.selfId)?.kills ?? 0,
      heading: heading(Math.atan2(-forward[0], -forward[2])),
      at: view ? { x: view.position[0], z: view.position[2] } : null,
      mates: mates.map((p) => ({ name: driver.nameOf(p.id), x: p.position[0], z: p.position[2], downed: Boolean(p.downed) })),
      drops: dropMarks(state, driver.serverTime, this.#islandBounds),
      reboot: rebootMarks(state, driver.scores.find((s) => s.id === driver.selfId)?.team ?? team, driver.serverTime, (id) => driver.nameOf(id)),
      carrying: Boolean(self?.alive && state.cards?.some((c) => c.carrier === self.id)),
      card: self && !self.alive && driver.selfId ? cardNote(driver.selfId, state, driver.serverTime, (id) => driver.nameOf(id)) : null,
      placement: placement(driver.scores, driver.selfId),
      out: !self?.alive,
      seated: driver.scores.some((s) => s.id === driver.selfId),
      watching: watched ? driver.nameOf(watched.id) : null,
      // On touch the map and the menu are buttons on the glass: no key to name.
      mapKey: this.input.touchMode ? '' : bindingLabel(this.#settings.bindings.map),
      menuKey: this.input.touchMode ? '' : 'Esc',
      mapOpen: this.input.mapOpen,
      pings: this.#pingBoard.live(driver.serverTime).map((m) => ({ kind: m.kind, x: m.position[0], z: m.position[2] })),
      leader: state.leader ? { name: state.leader.name, kills: state.leader.kills, you: state.leader.id === driver.selfId } : null,
      attacker: this.#attackerMark(),
    };
  }

  /** Where whoever put you Downed or out stood, for the map, while you're Downed or out. */
  #attackerMark(): { name: string; x: number; z: number } | null {
    const r = this.#log.recap;
    if (!r?.at || !r.name || (this.#cur?.alive && !this.#cur.downed)) return null;
    return { name: r.name, x: r.at[0], z: r.at[1] };
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
    const watched = this.#spectator.watching;
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
    const p = new Vector3(at[0], at[1], at[2]).project(cam);
    const behind = p.z > 1;
    const { x, y } = pinMarker((((behind ? -p.x : p.x) + 1) / 2) * w, ((1 - p.y) / 2) * h, behind, w, h, this.input.touchMode);
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
    return this.#zones.flatMap((zone) => {
      const s = states.find((x) => x.id === zone.id);
      if (!s) return [];
      const top: Vec3 = [zone.center[0], zone.center[1] + Math.min(zone.height, 2.4), zone.center[2]];
      const p = new Vector3(top[0], top[1], top[2]).project(cam);
      // Behind the camera the projection mirrors: flip it, and pin the marker to the bottom edge.
      const behind = p.z > 1;
      const { x, y } = pinMarker((((behind ? -p.x : p.x) + 1) / 2) * w, ((1 - p.y) / 2) * h, behind, w, h, this.input.touchMode);
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

  /** The Course's clock, a tick at a time: only with no match on, and only for a living body. */
  #timeCourse(driver: GameDriver, self: PlayerOutput | null): void {
    const course = this.#course;
    if (!course) return;
    if (driver.match) {
      course.run.reset();
      return;
    }
    const event = course.run.update(self?.alive ? self.position : null, this.#simTime);
    if (event?.type !== 'finish') return;
    const before = this.#profileStore ? this.#profileStore.bankCourse(event.seconds) : this.#courseBest;
    if (before === null || event.seconds < before) this.#courseBest = event.seconds;
    const grade = courseGrade(event.seconds, course.gates.par);
    this.#courseResult = { face: { kind: 'result', seconds: event.seconds, grade, before }, until: this.#simTime + RESULT_SECONDS };
    this.#play(before === null || event.seconds < before ? 'medal' : 'hitMarker');
  }

  /** What the Course clock shows now: a result while it is held, the run under way, or ready on the start pad. */
  #courseFace(): CourseFace | null {
    const course = this.#course;
    if (!course || this.#driver?.match || this.#inShot) return null;
    if (this.#courseResult && this.#simTime < this.#courseResult.until) return this.#courseResult.face;
    this.#courseResult = null;
    const seconds = course.run.elapsed(this.#simTime);
    if (seconds !== null) return { kind: 'running', seconds, best: this.#courseBest };
    const p = this.#cur?.alive ? this.#cur.position : null;
    const pad = course.gates.start;
    if (p && p[0] >= pad.min[0] && p[0] <= pad.max[0] && p[1] >= pad.min[1] && p[1] <= pad.max[1] && p[2] >= pad.min[2] && p[2] <= pad.max[2]) return { kind: 'ready', best: this.#courseBest, par: course.gates.par };
    return null;
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

  /** In a match's opening Countdown: held at the spawn, free to change the loadout (a Battle Royale's Preparation has its own picker). */
  #counting(): boolean {
    const driver = this.#driver;
    const match = driver?.match;
    return !!driver && !!match && match.phase === 'playing' && match.mode !== 'battle-royale' && match.countdownEnds !== null && match.countdownEnds !== undefined && match.countdownEnds > driver.serverTime;
  }

  /**
   * The first-match hint to show this frame (`hints.ts`), or null. The facts
   * are read off the same state the HUD draws; what the browser has learned
   * is saved the moment it changes, and Settings' "Show them again" starts
   * the state over.
   */
  #hint(dt: number): HintLine | null {
    const driver = this.#driver;
    const input = this.input;
    if (hintMemoryCleared() !== this.#hintsCleared) {
      this.#hintsCleared = hintMemoryCleared();
      this.#hints = hintState(hintMemory());
    }
    const opened = this.#loadoutOpened;
    this.#loadoutOpened = false;
    if (!driver) return null;
    const self = this.#cur;
    const match = driver.match;
    const playing = !match || match.phase === 'playing';
    const royale = match?.mode === 'battle-royale';
    const held = this.#paused || this.#inShot || !playing || this.#counting() || (match?.preparation ?? null) !== null || this.#charge?.phase === 'freeze';
    const fighting = !held && self !== null && self.alive && !self.downed;
    const w = self?.weapon;
    const size = self && w ? heldRow(self).handling.magazineSize.value : undefined;
    const before = this.#hints.memory;
    this.#hints = stepHints(
      this.#hints,
      {
        fighting,
        // The loadout can be changed while dead wherever there is a next life; the range has no deaths, and no hint for it.
        waiting: !this.#paused && !this.#inShot && playing && self !== null && !self.alive && !royale,
        moving: self !== null && Math.hypot(self.velocity[0], self.velocity[2]) > 2,
        sprinting: self?.movement === 'sprint' || self?.movement === 'slide',
        aiming: (w?.ads ?? 0) > 0.5,
        reloading: w?.action === 'reload',
        magazine: w && size ? w.ammo / size : 1,
        weapon: w?.id ?? '',
        grenades: self?.grenades ?? 0,
        throwing: self !== null && (self.grenade ?? null) !== null,
        loadoutOpened: opened,
        board: driver.online && driver.scores.length > 0,
        scoreboard: input.scoreboard,
        thumbs: input.touchMode,
        firing: input.touchFiring,
      },
      dt,
    );
    if (this.#hints.memory !== before) saveHintMemory(this.#hints.memory);
    const id = this.#hints.current;
    if (id === null) return null;
    return hintLine(id, input.touchMode ? 'touch' : input.padMode ? 'pad' : 'keys', this.#hintNames(), this.#settings.touchAutoFire);
  }

  /** What this player's keys, or their pad's buttons, are called in a hint. */
  #hintNames(): HintNames {
    const b = this.#settings.bindings;
    const key = (code: string) => shortKey(code).replace(/ (Left|Right)$/, '');
    if (this.input.padMode) {
      const pad = PAD_LAYOUTS[this.#settings.padLayout];
      const name = (action: keyof typeof pad, fallback: string) => (pad[action] ? padButtonLabel(pad[action]!) : key(fallback));
      return {
        move: ['Left stick'],
        fire: name('fire', b.fire),
        ads: name('ads', b.ads),
        sprint: name('sprint', b.sprint),
        crouch: name('crouch', b.crouch),
        reload: name('reload', b.reload),
        switchWeapon: name('switchWeapon', b.switchWeapon),
        grenade: name('grenade', b.grenade),
        use: name('use', b.use),
        scoreboard: name('scoreboard', b.scoreboard),
      };
    }
    const move = [b.forward, b.left, b.back, b.right].map(key);
    return {
      // Four letters read as one cap ("WASD"); anything longer keeps its own.
      move: move.every((k) => k.length === 1) ? [move.join('')] : move,
      fire: key(b.fire),
      ads: key(b.ads),
      sprint: key(b.sprint),
      crouch: key(b.crouch),
      reload: key(b.reload),
      switchWeapon: key(b.switchWeapon),
      grenade: key(b.grenade),
      use: key(b.use),
      scoreboard: key(b.scoreboard),
    };
  }

  /** How the Use button is written in prompts: the pad's button in pad mode, else the key. */
  #useLabel(): string {
    // On touch it is the button that says Use, lit while there is something to use.
    if (this.input.touchMode) return 'Use';
    const pad = PAD_LAYOUTS[this.#settings.padLayout].use;
    return this.input.padMode && pad ? padButtonLabel(pad) : bindingLabel(this.#settings.bindings.use);
  }

  /**
   * The aim helps, from where the view points this frame. Touch has two
   * (ticket 23): a drag slows while the crosshair is on or beside an enemy,
   * and the trigger pulls itself once it has rested on one inside the
   * weapon's range. The pad has the first (ticket 13): the look stick slows
   * the same way. All are the player's own client: the view only ever turns
   * by their own drag or stick, and what the simulation gets is a view angle
   * and the fire button, as from a mouse, so they are fair online too. The
   * mouse gets none.
   */
  #aimHelp(eye: Vec3, forward: Vec3): void {
    const input = this.input;
    const self = this.#cur;
    const s = this.#settings;
    const match = this.#driver?.match;
    const live = self !== null && self.alive && !self.downed && !this.#inShot && !this.#paused && (!match || match.phase === 'playing');
    const touch = live && input.touchMode && (s.touchAutoFire || s.touchAimAssist);
    const pad = live && input.padMode && s.padAimAssist;
    if (!touch) {
      input.touchAssist(1, false, false);
      this.#autoFire = AUTO_FIRE_IDLE;
    }
    if (!pad) input.padAssist(1);
    if ((!touch && !pad) || !self) return;
    // Enemies: everyone else, less your own side where there are sides. Downed seats are left to the player's own trigger.
    const sided = match ? teamMode(match.mode) || match.mode === 'battle-royale' : false;
    // The enemy nearest the crosshair that the helps may know of. One behind a wall, in a bush or inside a smoke is
    // no target (the sight line to its chest decides), and it leaves the help to a seen one beside it. Only those
    // near enough the crosshair to matter are looked for.
    const driver = this.#driver;
    let clouds: SmokeCloud[] | null = null;
    let aim: AimRead | null = null;
    for (const p of this.#others) {
      if (!p.alive || p.downed || (sided && p.kind === 'player' && p.team === self.team)) continue;
      const read = aimAt(eye, forward, p.position, p.eyeHeight);
      if (!read || aimSlowdown(read) >= 1 || (aim && read.miss >= aim.miss)) continue;
      clouds ??= driver ? smokeCloudsOf(driver.grenades()) : [];
      if (aimSees(this.#world, clouds, driver?.serverTime ?? 0, eye, [p.position[0], p.position[1] + p.eyeHeight * 0.75, p.position[2]])) aim = read;
    }
    if (pad) input.padAssist(aimSlowdown(aim));
    if (!touch) return;
    const w = self.weapon;
    const row = heldRow(self);
    const range = autoFireRange(Object.values(row.damage.bands).map((band) => band.range?.value));
    // A scoped rifle from the hip hits nothing: auto-fire waits for the glass.
    const sighted = row.traits.sight !== 'scope' || w.ads >= 0.9;
    const onTarget = aim !== null && aim.miss <= BODY_RADIUS && aim.along <= range && sighted;
    const ready = s.touchAutoFire && w.ammo > 0 && (w.action === 'ready' || w.action === 'cycle') && self.grenade === null && self.reviving === null && self.movement !== 'mantle' && self.movement !== 'ladder';
    const out = autoFire(this.#autoFire, { now: performance.now(), onTarget, ready, auto: row.traits.fireMode === 'auto', interval: 60000 / row.handling.fireRate.value });
    this.#autoFire = out.state;
    input.touchAssist(s.touchAimAssist ? aimSlowdown(aim) : 1, out.hold, out.press);
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
    // A latched sprint ends with the life: dead or downed, and again at a (re)spawn.
    if (facing || (this.#cur && (!this.#cur.alive || this.#cur.downed))) this.input.endSprint();
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
    this.#timeCourse(driver, self);
    const firePressed = cmd.firePresses.length > 0 || ((cmd.buttons & Button.Fire) !== 0 && ((this.#cmd?.buttons ?? 0) & Button.Fire) === 0);
    this.#cmd = cmd;
    const use = (cmd.buttons & Button.Use) !== 0;
    // Out of a Battle Royale there is no next life to change the loadout for.
    const respawns = driver.match?.mode !== 'battle-royale';
    // The opening Countdown is the same offer as a round's freeze: held at the spawn, the loadout a press away.
    if (use && !this.#useHeld && self && ((!self.alive && respawns) || this.#atStation(self) || frozen || this.#counting())) {
      this.#loadoutOpened = true;
      this.onLoadout?.(self.alive ? 'station' : 'death');
    }
    this.#useHeld = use;
    if (self && before) this.#selfFoley(before, self, firePressed);
    for (const e of result.events) this.#present(e, start);
    if (driver.popped) this.#worldView.hideProps(driver.popped);
    this.#footsteps();
  }

  /** Sounds and camera reactions to the local player's own movement and weapon. */
  #selfFoley(before: PlayerOutput, self: PlayerOutput, firePressed: boolean): void {
    const local = { local: true } as const;
    if (self.landing && self.alive) {
      this.#play('land', { ...local, material: this.#materialUnder(self.position), intensity: Math.min(1, self.landing.fallHeight / 6) });
      this.#camera.land(self.landing.fallHeight);
      this.#viewmodel.land(self.landing.fallHeight);
      this.#rumble(landRumble(self.landing.fallHeight));
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
    // A fresh pull of the trigger on an empty gun falls on nothing; a trigger held as the magazine runs out is not a pull.
    if (firePressed && self.alive && before.alive && pw.ammo === 0 && pw.action === 'ready' && pw.id === w.id) this.#play('dryFire', { ...local, weapon: w.id });
    // Weapon foley at fixed points of each action.
    const sameAction = pw.action === w.action && w.actionTime >= pw.actionTime;
    const from = sameAction ? pw.actionTime : -1;
    for (const [t, event] of foleyCues(self)) if (t > from && t <= w.actionTime) this.#play(event, { ...local, weapon: w.id });
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
      const grounded = p.movement !== 'airborne' && p.movement !== 'mantle' && p.movement !== 'slide' && p.movement !== 'ladder';
      if (!p.alive || !grounded || d > 1) continue;
      const mode = p.stance === 'prone' ? 'prone' : p.stance === 'crouch' ? 'crouch' : p.movement === 'sprint' ? 'sprint' : 'walk';
      t.stepDistance += d;
      const length = STEP_LENGTH[mode] / 2;
      if (t.stepDistance >= length) {
        t.stepDistance = 0;
        const own = p.id === selfId;
        if (own) {
          // The bob lands with the sound.
          this.#camera.footfall();
          this.#viewmodel.footfall();
        }
        this.#play('footstep', {
          ...(own ? { local: true } : { position: p.position }),
          material: this.#materialUnder(p.position),
          movement: mode,
          intensity: Math.min(1, Math.hypot(p.velocity[0], p.velocity[2]) / 6),
          // Soft Soles (ticket 20): someone else's steps carry half as far.
          ...(!own && hasPerk(p.loadout, 'softSoles') ? { quieter: STATS.perks.softSoles.value } : {}),
          ...(wading(this.#world, p.position) ? { wading: true } : {}),
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
    for (const [t, event] of foleyCues(p)) if (t > from && t <= w.actionTime) this.#play(event, { ...at, weapon: w.id });
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
        this.#log.shot(e.shooter, e.origin);
        const own = e.shooter === selfId;
        // The gun's muzzle device, heard and seen by everyone (ticket 19).
        const device = e.muzzle ? { muzzle: e.muzzle } : {};
        if (!own && this.#follow?.eyes && this.#follow.id === e.shooter) {
          // Through their eyes, their shot is fired from your hands.
          this.#play('gunshot', { local: true, weapon: e.weapon, ...device, when: this.#when(tickStart, e.fraction) });
          this.#viewmodel.fire();
          this.#effects.flash(this.#viewFlash, e.weapon, e.muzzle);
          const muzzle = this.#viewToWorld(this.#viewmodel.muzzle);
          this.#effects.shot(muzzle, e.direction, e.weapon, e.muzzle);
          this.#tracer(e, muzzle);
        } else if (own) {
          this.#play('gunshot', { local: true, weapon: e.weapon, ...device, when: this.#when(tickStart, e.fraction) });
          this.#viewmodel.fire();
          this.#effects.flash(this.#viewFlash, e.weapon, e.muzzle);
          const kick = CAMERA_KICK[e.weapon];
          this.#camera.kick(0.35 * kick, (Math.random() - 0.5) * 0.25 * kick, (Math.random() - 0.5) * 0.6 * kick);
          this.#rumble(shotRumble(kick));
          const muzzle = this.#viewToWorld(this.#viewmodel.muzzle);
          this.#effects.shot(muzzle, e.direction, e.weapon, e.muzzle);
          this.#tracer(e, muzzle);
          const cam = this.#camera.camera;
          const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
          const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
          const v = this.#cur?.velocity ?? [0, 0, 0];
          // A revolver keeps its spent cases until the cylinder is emptied by hand (the reload shows them fall).
          if (STATS.weapons[e.weapon].traits.reload !== 'cylinder') this.#effects.eject(this.#viewToWorld(this.#viewmodel.ejectionPort), [right.x, right.y, right.z], [up.x, up.y, up.z], v);
          const [yaw, pitch] = [Math.atan2(-e.direction[0], -e.direction[2]), Math.asin(Math.max(-1, Math.min(1, e.direction[1])))];
          this.hud.recordShot(yaw, pitch, e.index === 0 || this.#burstStart < 0);
          this.#burstStart = e.index === 0 ? this.#simTime : this.#burstStart;
          for (const eng of this.#engagements.values()) eng.shots += 1;
        } else {
          this.#play('gunshot', { position: e.origin, weapon: e.weapon, ...device, when: this.#when(tickStart, e.fraction) });
          this.#effects.shot(e.origin, e.direction, e.weapon, e.muzzle);
          const flash = this.#worldFlashes[this.#nextWorldFlash] as Mesh;
          this.#nextWorldFlash = (this.#nextWorldFlash + 1) % this.#worldFlashes.length;
          flash.position.set(e.origin[0] + e.direction[0] * 0.9, e.origin[1] + e.direction[1] * 0.9 - 0.12, e.origin[2] + e.direction[2] * 0.9);
          flash.quaternion.copy(this.#camera.camera.quaternion);
          this.#effects.flash(flash, e.weapon, e.muzzle);
          this.#tracer(e, [flash.position.x, flash.position.y, flash.position.z]);
          this.#crack(e.origin, e.direction, e.weapon, e.muzzle);
        }
        break;
      }
      case 'impact':
        if (e.side === 'entry') this.#tracers.land(e.shooter, e.point);
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
        this.#log.hit(e, driver.serverTime, this.#cur?.alive ? this.#cur.position : null);
        if (e.cause === 'bullet') this.#tracers.land(e.shooter, e.point);
        const from = this.#eyeOf(e.shooter) ?? e.point;
        const d: Vec3 = [e.point[0] - from[0], e.point[1] - from[1], e.point[2] - from[2]];
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
        // A seat in its first second Downed takes nothing: no blood, and its own screen stays calm (ticket 54).
        const landed = e.damage > 0 || e.killed;
        if (e.victim !== selfId && landed) {
          this.#effects.blood(e.point, dir, e.zone === 'head');
          this.#players.hit(e.victim, dir, e.damage);
        }
        if (landed) this.#voice(e.victim, e.victim === selfId, e.killed, e.zone === 'head', e.damage, e.point);
        if (e.shooter === selfId && e.victim !== selfId) {
          const head = e.zone === 'head';
          const kind = hitKind(e.killed, head, e.damage);
          this.hud.hitMarker(kind);
          this.#rumble(hitRumble(kind));
          if (kind !== 'shielded') this.#play(e.killed ? (head ? 'headshotKill' : 'killMarker') : head ? 'headshotMarker' : 'hitMarker');
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
        if (e.victim === selfId && landed) {
          const attacker = this.#playerById(e.shooter);
          if (attacker && e.shooter !== selfId && this.#cur) {
            const yaw = Math.atan2(-(attacker.position[0] - this.#cur.position[0]), -(attacker.position[2] - this.#cur.position[2]));
            this.hud.damage(yaw);
          }
          this.#play('damageTaken', { local: true, intensity: Math.min(1, e.damage / 40) });
          this.#rumble(hurtRumble(e.damage));
          // A blast that hurt and was survived leaves the ears ringing (a grenade's hit carries its distance from the blast).
          if (e.cause === 'grenade' && !e.killed) this.#sound.tinnitus(tinnitusStrength(e.distance, e.damage));
          if (e.cause === 'melee') this.#play('meleeHit', { local: true });
        }
        break;
      }
      case 'down':
        this.#log.down(e, this.#lookup, e.victim === selfId ? (this.#cur?.position ?? null) : null);
        break;
      case 'kill':
        this.#log.kill(e, this.#lookup, e.victim === selfId ? (this.#cur?.position ?? null) : null);
        break;
      case 'killFeed':
        if (e.victim === selfId && !e.down) this.#killer = e.killer === selfId ? null : e.killer;
        if (!e.down) this.#outBy.set(e.victim, e.killer === null || e.killer === e.victim ? null : e.killer === selfId ? 'You' : e.killerName);
        if (e.victim === selfId && !e.down) this.#keeper.died();
        break;
      case 'revive':
        this.#log.revive(e);
        break;
      case 'grenade': {
        const own = e.player === selfId;
        const at = own ? { local: true } : { position: this.#eyeOf(e.player) ?? [0, 0, 0] as Vec3 };
        if (e.phase === 'cook') this.#play('grenadePin', at);
        else if (e.phase === 'throw') this.#play('grenadeThrow', at);
        break;
      }
      case 'pop': {
        if (this.#explosions.has(e.grenade)) break;
        this.#explosions.add(e.grenade);
        if (this.#explosions.size > 64) this.#explosions.delete(this.#explosions.values().next().value as number);
        if (e.kind === 'flash') {
          this.#effects.flashPop(e.point);
          this.#play('flashBang', { position: e.point });
          const me = this.#cur;
          if (me?.alive) this.#rumble(blastRumble(Math.hypot(me.position[0] - e.point[0], me.position[1] - e.point[1], me.position[2] - e.point[2]), 12));
        } else {
          this.#play('smokePop', { position: e.point });
        }
        break;
      }
      case 'flashed': {
        if (e.player !== selfId) break;
        // The same flash told twice (a resent tick) blinds once.
        const key = -1 - e.grenade;
        if (this.#explosions.has(key)) break;
        this.#explosions.add(key);
        this.#blind = { at: performance.now() / 1000, duration: e.duration, strength: e.strength };
        this.#sound.tinnitus(0.45 + 0.55 * e.strength, e.duration);
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
          this.#rumble(blastRumble(d));
          if (shake > 0) this.#camera.kick(2.5 * shake, (Math.random() - 0.5) * 3 * shake, (Math.random() - 0.5) * 4 * shake);
        }
        break;
      }
      case 'drop':
        if (e.action === 'announce') this.#say('supplyDrop', true);
        break;
      case 'card':
      case 'reboot':
        if (e.type === 'reboot' && e.action === 'done') this.#log.reboot(e);
        break;
      case 'ping': {
        const mine = e.player === selfId;
        // The same ping told twice (a resent tick) is called out once.
        if (!this.#pingBoard.add(e, mine ? 'You' : driver.nameOf(e.player), mine)) return;
        this.#play(e.kind === 'enemy' ? 'pingEnemy' : 'ping', { local: true });
        break;
      }
      case 'trap':
        // Someone ran past a sound trap: the birds, the metal or the gravel, from where it lies.
        this.#play(TRAP_SOUNDS[e.kind], { position: e.position });
        break;
      case 'roundStart':
        this.#round(e.round, e.attackers);
        break;
      case 'charge': {
        if (e.action === 'plant') this.#say('chargePlanted');
        else if (e.action === 'defuse') this.#say('chargeDefused');
        if (e.action === 'detonate') {
          this.#effects.explosion(e.position);
          this.#play('explosion', { position: e.position });
        }
        break;
      }
      case 'score': {
        // Score you earned (the server tells only you): the stack beside the crosshair, and the match's tally for the Profile.
        if (e.player !== selfId) break;
        this.#keeper.score(e.lines);
        const entry = scoreFeedEntry(e.lines, (id) => driver.nameOf(id));
        this.hud.score(entry);
        if (entry.medal !== null) this.#play('medal');
        // A seat put Downed is confirmed as a kill is: the hit that did it was not a killing one.
        if (e.lines.some((line) => line.reason === 'down')) this.#play('killMarker');
        break;
      }
      case 'matchEnd':
        // Nothing to say here: the end panel's headline (a Battle Royale's victory beat) already says who won, big. A toast said it twice, and showed through the scoreboard on a phone.
        break;
      case 'matchStart':
        this.#log.reset(selfId);
        this.#newMatch();
        this.#cardMade = null;
        this.#killer = null;
        this.#outBy.clear();
        this.#spectateNotice = null;
        this.#allySight.clear();
        this.#pingBoard.clear();
        this.#worldView.restoreProps();
        break;
    }
    if (!WORDY.has(e.type)) return;
    this.#tell(
      eventWords(e, {
        selfId,
        online: driver.online,
        mode: driver.match?.mode ?? null,
        scores: driver.scores,
        self: this.#cur,
        nameOf: (id) => driver.nameOf(id),
        cell: (at) => (this.#islandBounds ? gridCell(this.#islandBounds, at[0], at[2]) : ''),
        useLabel: this.#useLabel(),
        serverTime: driver.serverTime,
        dropLands: (stage) => this.#royale?.drops?.find((d) => d.stage === stage)?.lands,
      }),
    );
  }

  /** Puts what an event says on the HUD. */
  #tell(words: EventWords): void {
    if (words.eliminated) this.hud.eliminated(words.eliminated.victim, words.eliminated.headshot);
    const k = words.kill;
    if (k) this.hud.killFeed(k.killer, k.victim, k.headshot, k.mine, k.bots, k.weapon, k.teams, k.down);
    const f = words.feed;
    if (f) this.hud.objectiveFeed(f.text, f.team, f.mine, f.tail);
    if (words.toast) this.hud.toast(words.toast.text, words.toast.seconds);
  }

  /**
   * The shot's tracers from `muzzle` (one per pellet), onto the path the
   * simulation flies from the eye, stopping where it would: in the world or
   * in a soldier as drawn, not in a teammate.
   */
  #tracer(e: Extract<PresentedEvent, { type: 'shot' }>, muzzle: Vec3): void {
    const mode = this.#driver?.match?.mode ?? 'ffa';
    const team = mode === 'ffa' || mode === 'gungame' ? null : (this.#playerById(e.shooter)?.team ?? null);
    const self = this.#cur && this.#driver?.selfId !== e.shooter ? this.#cur : null;
    if (e.pellets) for (const d of e.pellets) this.#tracers.fire(e.shooter, e.weapon, e.origin, d, muzzle, this.#others, team, self, e.muzzle);
    else this.#tracers.fire(e.shooter, e.weapon, e.origin, e.direction, muzzle, this.#others, team, self, e.muzzle);
  }

  /** A supersonic crack when someone else's rifle round passes close to the listener (the slower guns' rounds don't crack). */
  #crack(origin: Vec3, direction: Vec3, weapon: WeaponId | undefined, device?: MuzzleId): void {
    if (!SUPERSONIC.has(weapon ?? 'm4a1')) return;
    const self = this.#cur;
    if (!self || !self.alive) return;
    const eye: Vec3 = [self.position[0], self.position[1] + self.eyeHeight, self.position[2]];
    const c: Vec3 = [eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2]];
    const along = c[0] * direction[0] + c[1] * direction[1] + c[2] * direction[2];
    if (along < 8) return;
    const closest: Vec3 = [origin[0] + direction[0] * along, origin[1] + direction[1] * along, origin[2] + direction[2] * along];
    const miss = Math.hypot(closest[0] - eye[0], closest[1] - eye[1], closest[2] - eye[2]);
    if (miss < CRACK_MISS) this.#play('bulletCrack', { position: closest, intensity: 1 - miss / CRACK_MISS, when: along / moddedRow(weapon ?? 'm4a1', device ? { muzzle: device } : undefined).handling.muzzleVelocity.value });
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
    this.#course?.clock.dispose();
    this.hud.dispose();
    this.#pipeline.dispose();
    this.#effects.dispose();
    this.#tracers.dispose();
    this.#zoneRings.dispose();
    this.#ringWall?.dispose();
    this.#supplyDrops?.dispose();
    this.#rebootView?.dispose();
    this.#players.dispose();
    this.#arsenal.dispose();
    this.#worldView.dispose();
  }
}
