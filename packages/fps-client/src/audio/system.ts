/**
 * The sound system: owns the AudioContext, the mix (a bus each for music, effects, the
 * announcer's voice and the UI, then the master: compressor -> limiter -> soft clip), the
 * shared environment reverbs, spatialisation, voice caps and voice stealing. Voices only
 * ever see an input node; everything after it (distance filtering, panning, reverb send,
 * fade-out on steal, node cleanup) is done here, so a recorded sample registered later gets the
 * same treatment as the procedural voice it replaces.
 *
 *   the score -> music duck (under gunfire) -> music bus ------------.
 *   placed sounds -> panner -.                                       |
 *   reverb returns ----------+-> world -> low-health low-pass        +-> under the announcer -> master
 *                                 -> blast low-pass -> blast duck -. |
 *   your own gun and body -> local --------------------------------+-> effects bus
 *   the recorded voice -> voice bus ----------------------------------------------------------> master
 *   UI sounds -> UI bus ----------------------------------------------------------------------> master
 */
import { Heartbeat, TINNITUS, WORLD_OPEN_HZ, dangerCutoff, dangerLevel } from './danger';
import { kitFor } from './kit';
import { DEFAULT_MIX, DUCK, DuckEnvelope, VOICE_DUCK_DB, dbToLinear, mergeMix, musicDuck, type BusName, type MixLevels } from './mix';
import { createMusicPlayer, renderStems, type Music, type MusicPlayer, type MusicState } from './music/player';
import type { MusicScene } from './music/scene';
import { rememberSampleRate, startPrerender } from './prerender';
import { createSpeech } from './speech';
import type { SoundEventName, SoundLogEntry, SoundParams, SoundState, SoundSystem, Voice, VoiceExtras, VoiceParams } from './types';
import { createDefaultVoices } from './voices';

type Vec3 = readonly [number, number, number];
type Environment = 'outdoor' | 'indoor';

interface Profile {
  /** Max simultaneous voices of this event (oldest is stolen beyond it). */
  readonly cap: number;
  /** PannerNode inverse-distance reference distance (m) and rolloff. */
  readonly ref: number;
  readonly rolloff: number;
  /** Reverb send at the reference distance, per environment. */
  readonly send: number;
  readonly indoorSend: number;
  /** Always non-positional, never reverberated. */
  readonly ui?: boolean;
  /** Which bus it plays on: the UI's for a `ui` sound unless said otherwise, effects for everything else. */
  readonly bus?: BusName;
  /** The event's place in the mix, as a gain on the voice (default 1). */
  readonly level?: number;
}

const body: Profile = { cap: 4, ref: 2.5, rolloff: 1.2, send: 0.05, indoorSend: 0.12 };
const handling: Profile = { cap: 4, ref: 2, rolloff: 1.4, send: 0.04, indoorSend: 0.1, level: 0.7 };
const ui: Profile = { cap: 4, ref: 1, rolloff: 1, send: 0, indoorSend: 0, ui: true };

/**
 * Every event's spatial and mix settings. The mix, loudest first (measure it
 * with apps/range/scripts/sound-levels.mjs): your own gunshot; other guns up
 * close; the nuke; cracks and impacts; enemy movement (clearly heard within
 * about 15 m); hit and kill markers; reload and handling; ambience.
 */
const PROFILES: Record<SoundEventName, Profile> = {
  // A gun's tail is its own, baked per weapon and per place (gunshot.ts): the shared reverb only adds a faint bloom.
  gunshot: { cap: 16, ref: 6, rolloff: 1, send: 0.03, indoorSend: 0.05 },
  dryFire: { ...handling, cap: 3 },
  footstep: { cap: 16, ref: 2.5, rolloff: 1.2, send: 0.04, indoorSend: 0.12 },
  jump: body,
  land: body,
  slide: body,
  mantle: body,
  prone: body,
  crouch: body,
  reloadMagOut: handling,
  reloadMagIn: handling,
  reloadBoltRelease: handling,
  reloadChargingHandle: handling,
  weaponRaise: handling,
  inspectRattle: handling,
  adsIn: handling,
  adsOut: handling,
  meleeSwing: { ...body, send: 0.06, indoorSend: 0.15 },
  meleeHit: { ...body, send: 0.06, indoorSend: 0.15 },
  pumpRack: handling,
  boltOpen: handling,
  boltClose: handling,
  shellInsert: handling,
  coverOpen: handling,
  coverShut: handling,
  cylinderOpen: handling,
  cylinderLoad: handling,
  cylinderShut: handling,
  grenadePin: handling,
  grenadeThrow: handling,
  grenadeBounce: { cap: 6, ref: 3, rolloff: 1.2, send: 0.1, indoorSend: 0.2 },
  // A frag carries like a gunshot and rings off the surroundings.
  explosion: { cap: 4, ref: 10, rolloff: 0.8, send: 0.9, indoorSend: 0.8 },
  smokePop: { cap: 4, ref: 4, rolloff: 1.1, send: 0.3, indoorSend: 0.5 },
  flashBang: { cap: 3, ref: 10, rolloff: 0.8, send: 0.9, indoorSend: 0.9 },
  impact: { cap: 16, ref: 4, rolloff: 1, send: 0.25, indoorSend: 0.3 },
  casing: { cap: 12, ref: 1.5, rolloff: 1.4, send: 0.03, indoorSend: 0.08, level: 0.6 },
  bulletCrack: { cap: 8, ref: 5, rolloff: 1, send: 0.35, indoorSend: 0.3 },
  hitMarker: { ...ui, level: 1.75 },
  killMarker: { ...ui, level: 1.15 },
  headshotMarker: { ...ui, cap: 3, level: 0.72 },
  headshotKill: { ...ui, cap: 3, level: 0.95 },
  // A Medal speaks over the kill confirm it came with; the end screen's two have the floor to themselves.
  medal: { ...ui, cap: 2, level: 0.9 },
  rankUp: { ...ui, cap: 1 },
  challengeDone: { ...ui, cap: 2, level: 0.9 },
  damageTaken: { ...ui, cap: 3, level: 0.5, bus: 'effects' },
  // A voice carries less far than the gun that caused it: close work is heard, a firefight across the map is not a chorus.
  pain: { cap: 4, ref: 2.5, rolloff: 1.3, send: 0.06, indoorSend: 0.14, level: 0.8 },
  death: { cap: 3, ref: 3, rolloff: 1.2, send: 0.08, indoorSend: 0.16, level: 0.85 },
  // Heard across the whole town and far beyond: barely fades with distance, and rings off the desert.
  nukeSiren: { cap: 1, ref: 40, rolloff: 0.5, send: 0.5, indoorSend: 0.3, level: 0.5 },
  nukeBlast: { cap: 1, ref: 600, rolloff: 0.2, send: 0.6, indoorSend: 0.4 },
  // Ambience: the wind is a bed all round you; the rest come from where the map puts them, and fade fast.
  ambientWind: { cap: 2, ref: 1, rolloff: 1, send: 0, indoorSend: 0, level: 0.7 },
  ambientBirds: { cap: 3, ref: 6, rolloff: 1, send: 0.3, indoorSend: 0.3 },
  ambientCreak: { cap: 2, ref: 3, rolloff: 1.2, send: 0.15, indoorSend: 0.2 },
  ambientRadio: { cap: 2, ref: 1.5, rolloff: 1.4, send: 0.1, indoorSend: 0.35 },
  // The far horn comes from out on the plain; the couplings from beyond the yard's wall; a lamp's hum is heard only close by.
  ambientHorn: { cap: 1, ref: 300, rolloff: 0.3, send: 0.5, indoorSend: 0.3 },
  ambientCouplings: { cap: 2, ref: 20, rolloff: 0.6, send: 0.4, indoorSend: 0.3 },
  ambientHum: { cap: 4, ref: 1.5, rolloff: 1.6, send: 0.05, indoorSend: 0.15 },
  // The freight train: heard all over the yard, and loud.
  trainHorn: { cap: 2, ref: 60, rolloff: 0.5, send: 0.5, indoorSend: 0.3 },
  trainRumble: { cap: 4, ref: 15, rolloff: 0.8, send: 0.4, indoorSend: 0.3 },
  trainClack: { cap: 8, ref: 8, rolloff: 1, send: 0.3, indoorSend: 0.3 },
  // Charge: the keypad and tools are heard close by; the beep carries across a site.
  chargeKey: { cap: 3, ref: 2, rolloff: 1.2, send: 0.05, indoorSend: 0.12 },
  chargeArmed: { cap: 2, ref: 3, rolloff: 1, send: 0.1, indoorSend: 0.2 },
  chargeBeep: { cap: 2, ref: 4, rolloff: 0.8, send: 0.2, indoorSend: 0.3 },
  chargeTool: { cap: 3, ref: 2, rolloff: 1.2, send: 0.05, indoorSend: 0.12 },
  chargeDisarmed: { cap: 2, ref: 3, rolloff: 1, send: 0.1, indoorSend: 0.2 },
  // The Ring: a wall of power heard from well off, louder than the wind but under the guns.
  ringHum: { cap: 3, ref: 12, rolloff: 0.6, send: 0.3, indoorSend: 0.3 },
  ringCrackle: { cap: 4, ref: 8, rolloff: 0.8, send: 0.4, indoorSend: 0.3 },
  ringShift: ui,
  ping: ui,
  pingEnemy: ui,
  // Sound traps: carry well past the runner's own steps (a fight's distance), and ring off the island.
  trapBirds: { cap: 2, ref: 10, rolloff: 0.8, send: 0.3, indoorSend: 0.3 },
  trapMetal: { cap: 2, ref: 8, rolloff: 0.8, send: 0.3, indoorSend: 0.3 },
  trapGravel: { cap: 2, ref: 6, rolloff: 0.9, send: 0.2, indoorSend: 0.3 },
  // The Preparation: the moment's own sound, not the island's.
  prepDrone: { ...ui, bus: 'effects' },
  heartbeat: { ...ui, bus: 'effects' },
  // The last minute: the siren carries in from the map's edge like the town's own; the counter is in your hand.
  countdownSirenRise: { cap: 1, ref: 60, rolloff: 0.5, send: 0.14, indoorSend: 0.12, level: 0.18 },
  countdownSirenHold: { cap: 2, ref: 60, rolloff: 0.5, send: 0.14, indoorSend: 0.12, level: 0.18 },
  countdownSirenFall: { cap: 1, ref: 60, rolloff: 0.5, send: 0.14, indoorSend: 0.12, level: 0.18 },
  geigerTick: { ...ui, cap: 12, level: 0.7, bus: 'effects' },
};

/** The bus an event plays on. */
export function busOf(event: SoundEventName): BusName {
  const p = PROFILES[event];
  return p.bus ?? (p.ui ? 'ui' : 'effects');
}

/**
 * How much of an event's direct sound reaches a listener `distance` m away
 * (the panner's inverse law); 1 for a sound that isn't placed in the world.
 */
export function distanceGain(event: SoundEventName, distance: number | null): number {
  const p = PROFILES[event];
  if (distance === null || p.ui) return 1;
  return p.ref / (p.ref + p.rolloff * (Math.max(distance, p.ref) - p.ref));
}

/** An event's place in the mix: the gain its voice is played at. */
export function mixLevel(event: SoundEventName): number {
  return PROFILES[event].level ?? 1;
}

/**
 * How much of an event goes to the reverb: its send level for the
 * environment, falling off with the square root of the direct sound's
 * distance law (so distant sounds are quieter but relatively more
 * reverberant); `distance` null for a sound that isn't placed in the world.
 */
export function reverbSend(event: SoundEventName, environment: Environment, distance: number | null): number {
  const p = PROFILES[event];
  const level = environment === 'indoor' ? p.indoorSend : p.send;
  return distance === null ? level : level * Math.sqrt(distanceGain(event, distance));
}

/** A sound heard through a wall: everything above this (Hz) is cut, and it is this much quieter. */
const MUFFLE_CUTOFF = 1200;
const MUFFLE_GAIN = 0.5;

/** Hard cap on simultaneous voices across all events. */
const GLOBAL_CAP = 64;
/** Routing-node lifetime when a registered voice doesn't declare its duration. */
const DEFAULT_LIFE = 2;
const SPEED_OF_SOUND = 343;
const LOG_CAP = 200;

/** Air absorption: full bandwidth up close, crack gone past ~60 m, a dull thud at 150 m+. */
function airCutoff(distance: number): number {
  return Math.min(20000, Math.max(700, 18000 * Math.exp(-Math.max(0, distance - 15) / 40)));
}

interface ActiveVoice {
  readonly event: SoundEventName;
  readonly input: GainNode;
  readonly nodes: AudioNode[];
  end: number;
  released: boolean;
}

interface Graph {
  readonly master: GainNode;
  /** Sounds placed in the world, and the reverbs' returns. */
  readonly world: GainNode;
  /** Your own gun and body: effects that the low-health filter leaves alone. */
  readonly local: GainNode;
  readonly reverbIn: Record<Environment, GainNode>;
  readonly buses: Record<BusName, GainNode>;
  /** Where the score plays in: ducked under gunfire before its bus. */
  readonly musicDuck: GainNode;
  /** Music and effects on their way to the master: ducked under the announcer. */
  readonly underVoice: GainNode;
  /** Over the world: the low-pass that follows low health, and the low-pass and duck after a close blast. */
  readonly dangerFilter: BiquadFilterNode;
  readonly blastFilter: BiquadFilterNode;
  readonly blastDuck: GainNode;
}

function now(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() / 1000 : Date.now() / 1000;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

/** How long (ms) a first press's sound waits for the worker before rendering on the page instead. */
const WORKER_WAIT_MS = 2000;

export interface SoundSystemOptions {
  /** The master volume (0..1); the same as `mix.master`. */
  readonly volume?: number;
  readonly mix?: Partial<MixLevels>;
  /**
   * Run on this context instead of opening one: an OfflineAudioContext, to render what the
   * system would play (measuring, tests in a browser). Ready at once, renders its sounds as
   * they are first played, and starts no workers or timers.
   */
  readonly context?: BaseAudioContext;
  /** Leave the master's compressor, limiter and clipper out, to measure what goes into them. */
  readonly bareMaster?: boolean;
}

const NO_MUSIC: MusicState = { scene: 'silence', sounding: 'silence', ready: false, hidden: false, sources: 0, cycle: 0, stings: [], scheduling: { calls: 0, ms: 0, worst: 0 } };

export function createSoundSystem(options?: SoundSystemOptions): SoundSystem {
  const offline = options?.context !== undefined;
  let ctx: AudioContext | null = (options?.context as AudioContext | undefined) ?? null;
  let graph: Graph | null = null;
  let mix = mergeMix(mergeMix(DEFAULT_MIX, options?.volume === undefined ? {} : { master: options.volume }), options?.mix ?? {});
  let warned = false;
  const listener = { position: [0, 0, 0] as Vec3, forward: [0, 0, -1] as Vec3, up: [0, 1, 0] as Vec3 };
  const log: SoundLogEntry[] = [];
  const defaults = createDefaultVoices();
  const overrides = new Map<SoundEventName, Voice>();
  const active: ActiveVoice[] = [];
  let peakVoices = 0;
  const prerendering = offline ? Promise.resolve(false) : startPrerender();
  const musicRendering = offline ? Promise.resolve(false) : startPrerender('music');
  let player: MusicPlayer | null = null;
  let scene: { scene: MusicScene; timeLeft: number | null } = { scene: 'silence', timeLeft: null };
  const musicEnvelope = new DuckEnvelope();
  const voiceEnvelope = new DuckEnvelope();
  const heart = new Heartbeat();
  let lowHealth: number | null = null;
  let worldCutoff = WORLD_OPEN_HZ;
  let rung = 0;

  /** Whether sound can be made now: the context is running (an offline one always counts). */
  const running = (): boolean => ctx !== null && graph !== null && (offline || ctx.state === 'running');

  const voiceFor = (event: SoundEventName): Voice => overrides.get(event) ?? defaults[event];

  function lifeOf(voice: Voice): number {
    const d = (voice as VoiceExtras).duration;
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : DEFAULT_LIFE;
  }

  function buildGraph(c: AudioContext): Graph {
    // Glue compressor: gentle, slow enough to let the transient through (punch), then a
    // fast brick-wall-ish limiter, then a soft clipper that only touches the last ~1 dB.
    const master = c.createGain();
    master.gain.value = mix.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const clip = c.createWaveShaper();
    const n = 2049;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = Math.abs(x);
      curve[i] = Math.sign(x) * (a < 0.85 ? a : 0.85 + 0.15 * Math.tanh((a - 0.85) / 0.15));
    }
    clip.curve = curve;
    if (options?.bareMaster) master.connect(c.destination);
    else master.connect(comp).connect(limiter).connect(clip).connect(c.destination);

    const gain = (value: number, to: AudioNode): GainNode => {
      const g = c.createGain();
      g.gain.value = value;
      g.connect(to);
      return g;
    };
    const underVoice = gain(1, master);
    const buses: Record<BusName, GainNode> = {
      music: gain(mix.music, underVoice),
      effects: gain(mix.effects, underVoice),
      // The recorded voice (speech.ts): over the duck it asks of everything else.
      voice: gain(mix.voice, master),
      ui: gain(mix.ui, master),
    };
    const musicDuck = gain(1, buses.music);
    const blastDuck = gain(1, buses.effects);
    const lowpass = (to: AudioNode): BiquadFilterNode => {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = WORLD_OPEN_HZ;
      f.Q.value = 0.6;
      f.connect(to);
      return f;
    };
    const blastFilter = lowpass(blastDuck);
    const dangerFilter = lowpass(blastFilter);
    const world = gain(1, dangerFilter);
    const local = gain(1, buses.effects);

    const irs = kitFor(c).impulseResponses();
    const makeReverb = (ir: AudioBuffer): GainNode => {
      const input = c.createGain();
      const conv = c.createConvolver();
      conv.normalize = false;
      conv.buffer = ir;
      input.connect(conv).connect(world);
      return input;
    };
    return { master, world, local, reverbIn: { outdoor: makeReverb(irs.outdoor), indoor: makeReverb(irs.indoor) }, buses, musicDuck, underVoice, dangerFilter, blastFilter, blastDuck };
  }

  /** The score's player, made with the graph: it starts the scene the game is already in once its stems are rendered. */
  function startMusic(c: AudioContext, g: Graph): void {
    const kit = kitFor(c);
    const p = createMusicPlayer(c, g.musicDuck, kit, offline ? { sync: true, timers: false, lookahead: (c as unknown as OfflineAudioContext).length / c.sampleRate } : {});
    player = p;
    p.setScene(scene.scene, scene.timeLeft);
    if (offline) return;
    // Each stem becomes a buffer between frames (a copy of what the worker rendered, or the render itself where there is
    // no worker), so that no scene's first bar has it to do: the last minute starts in the middle of a fight.
    void musicRendering.then((rendered) => renderStems(c, kit, (fn) => setTimeout(fn, rendered ? 4 : 30), () => p.ready()));
  }

  /** The listener pose last written to `ctx` (position, forward, up), or null before the first. */
  let applied: number[] | null = null;

  function applyListener(): void {
    if (!ctx) return;
    const l = ctx.listener;
    const [px, py, pz] = listener.position;
    const [fx, fy, fz] = listener.forward;
    const [ux, uy, uz] = listener.up;
    if (l.positionX) {
      // Each AudioParam write costs the browser a message to the audio thread (half a millisecond a frame for all
      // nine), so only what moved is written: never `up`, and nothing while the player stands and looks still.
      const pose = [px, py, pz, fx, fy, fz, ux, uy, uz];
      const params = [l.positionX, l.positionY, l.positionZ, l.forwardX, l.forwardY, l.forwardZ, l.upX, l.upY, l.upZ];
      const last = (applied ??= pose.map(() => NaN));
      for (let i = 0; i < 9; i++) {
        if (Math.abs(last[i]! - pose[i]!) < 1e-4) continue;
        params[i]!.value = pose[i]!;
        last[i] = pose[i]!;
      }
    } else {
      // Older Firefox / Safari
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  function release(v: ActiveVoice): void {
    if (v.released) return;
    v.released = true;
    for (const node of v.nodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
    const i = active.indexOf(v);
    if (i >= 0) active.splice(i, 1);
  }

  function steal(c: AudioContext, v: ActiveVoice, at = c.currentTime): void {
    const t = at;
    const g = v.input.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.015);
    v.end = t + 0.03;
    const i = active.indexOf(v);
    if (i >= 0) active.splice(i, 1);
    if (!offline) setTimeout(() => release(v), 60);
  }

  /** Frees a slot for a voice of `event` starting at `at`: an offline render has no clock yet, so it goes by when the new voice starts. */
  function makeRoom(c: AudioContext, event: SoundEventName, at: number): void {
    const t = offline ? at : c.currentTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const v = active[i];
      if (!v || v.end >= t) continue;
      // Nothing has been rendered yet offline: a voice that will be over by then keeps its nodes, and only gives up its slot.
      if (offline) active.splice(i, 1);
      else release(v);
    }
    const cap = PROFILES[event].cap;
    let count = 0;
    for (const v of active) if (v.event === event) count++;
    while (count >= cap) {
      const oldest = active.find((v) => v.event === event);
      if (!oldest) break;
      steal(c, oldest, t);
      count--;
    }
    while (active.length >= GLOBAL_CAP) {
      const oldest = active[0];
      if (!oldest) break;
      steal(c, oldest, t);
    }
  }

  function start(c: AudioContext, g: Graph, event: SoundEventName, params: SoundParams): void {
    const profile = PROFILES[event];
    const voice = voiceFor(event);
    const t0 = c.currentTime;
    const when = Math.max(0, finiteOr(params.when, 0));
    const env: Environment = params.environment === 'indoor' ? 'indoor' : 'outdoor';
    const pos = params.position;
    const positional = pos !== undefined && params.local !== true && profile.ui !== true;

    let distance: number | undefined;
    if (positional) {
      const dx = pos[0] - listener.position[0];
      const dy = pos[1] - listener.position[1];
      const dz = pos[2] - listener.position[2];
      distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(distance)) return;
    }
    const startTime = t0 + when + (distance ?? 0) / SPEED_OF_SOUND;

    makeRoom(c, event, startTime);

    // Gunfire and blasts push the music down, by how much of them reaches you.
    const duck = musicDuck(event, distanceGain(event, distance ?? null) * (positional && params.muffled ? MUFFLE_GAIN : 1));
    if (duck) {
      const { floor, releaseAt } = musicEnvelope.trigger(startTime, dbToLinear(-duck.depth), duck.hold);
      const level = g.musicDuck.gain;
      level.cancelScheduledValues(startTime);
      level.setTargetAtTime(floor, startTime, DUCK.attack);
      level.setTargetAtTime(1, releaseAt, DUCK.release);
    }

    const input = c.createGain();
    input.gain.value = (profile.level ?? 1) * (positional && params.muffled ? MUFFLE_GAIN : 1) * Math.min(1, Math.max(0, params.quieter ?? 1));
    const nodes: AudioNode[] = [input];
    let sendFrom: AudioNode = input;
    if (positional && pos && distance !== undefined) {
      let node: AudioNode = input;
      const cutoff = Math.min(airCutoff(distance), params.muffled ? MUFFLE_CUTOFF : Infinity);
      if (cutoff < 16000) {
        const air = c.createBiquadFilter();
        air.type = 'lowpass';
        air.frequency.value = cutoff;
        air.Q.value = 0.6;
        node.connect(air);
        node = air;
        nodes.push(air);
      }
      const panner = c.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = profile.ref;
      panner.rolloffFactor = profile.rolloff;
      panner.maxDistance = 10000;
      if (panner.positionX) {
        panner.positionX.value = pos[0];
        panner.positionY.value = pos[1];
        panner.positionZ.value = pos[2];
      } else {
        panner.setPosition(pos[0], pos[1], pos[2]);
      }
      node.connect(panner).connect(g.world);
      nodes.push(panner);
      sendFrom = node;
    } else {
      input.connect(busOf(event) === 'ui' ? g.buses.ui : g.local);
    }

    const sendLevel = reverbSend(event, env, distance ?? null);
    if (sendLevel > 0.001) {
      const send = c.createGain();
      send.gain.value = sendLevel;
      sendFrom.connect(send).connect(g.reverbIn[env]);
      nodes.push(send);
    }

    const vp: VoiceParams = distance === undefined ? params : { ...params, distance };
    const length = (voice as VoiceExtras).lengthOf?.(vp);
    const life = length !== undefined && Number.isFinite(length) && length > 0 ? Math.min(length, lifeOf(voice)) : lifeOf(voice);
    const entry: ActiveVoice = { event, input, nodes, end: startTime + life, released: false };
    active.push(entry);
    if (active.length > peakVoices) peakVoices = active.length;
    if (!offline) setTimeout(() => release(entry), (startTime + life - t0) * 1000 + 100);

    voice.play(c, input, vp, startTime);
  }

  function warmAll(c: AudioContext): void {
    // Your own gunshot is ready now (it must never hitch). Everything else comes from the worker:
    // its banks become buffers between frames, so the first footstep or remote shot costs nothing.
    // Without a worker they are rendered here, one bank at a time.
    const queue: Array<() => void> = [];
    for (const event of Object.keys(PROFILES) as SoundEventName[]) {
      const voice = voiceFor(event) as VoiceExtras;
      const tasks = voice.warmTasks?.(c) ?? (voice.warm ? [() => voice.warm?.(c)] : []);
      if (event === 'gunshot') {
        tasks.shift()?.();
        queue.unshift(...tasks);
      } else {
        queue.push(...tasks);
      }
    }
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const schedule = (fn: () => void): void => {
      if (idle) idle(fn, { timeout: 200 });
      else setTimeout(fn, 0);
    };
    const step = (): void => {
      const until = performance.now() + 2;
      while (queue.length > 0 && performance.now() < until) {
        try {
          queue.shift()?.();
        } catch {
          // a broken custom voice must not stop the others warming
        }
      }
      if (queue.length > 0) schedule(step);
    };
    void prerendering.then(() => schedule(step));
  }

  /**
   * Ringing ears: a high tone that fades over a second and a half, and the world dropped and
   * dulled under it, coming back as the tone goes. The blast's own bang gets out first.
   */
  function ring(c: AudioContext, g: Graph, k: number, seconds?: number): void {
    const t = c.currentTime + 0.09;
    // A flash holds the world under for most of the time it blinds; a blast for a breath.
    const long = seconds !== undefined && seconds > 0 ? seconds : null;
    const hold = long === null ? 0.25 + 0.35 * k : long * 0.6;
    const ringing = long === null ? TINNITUS.seconds : long + 0.8;
    // A second blast while the first still rings takes each from where it has got to: dropped mid-ramp, it would jump back and click.
    const takeUp = (param: AudioParam): void => {
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t);
      else {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
      }
    };
    const level = g.blastDuck.gain;
    takeUp(level);
    level.setTargetAtTime(1 - (1 - TINNITUS.worldGain) * k, t, 0.03);
    level.setTargetAtTime(1, t + hold, TINNITUS.recover);
    const cutoff = WORLD_OPEN_HZ * Math.pow(TINNITUS.worldCutoff / WORLD_OPEN_HZ, k);
    const f = g.blastFilter.frequency;
    takeUp(f);
    f.setTargetAtTime(cutoff, t, 0.03);
    // Opened an octave at a time rather than a hertz at a time, or it would be open again in a blink.
    f.setValueAtTime(cutoff, t + hold);
    f.exponentialRampToValueAtTime(WORLD_OPEN_HZ, t + hold + TINNITUS.recover * 2.4);

    const out = c.createGain();
    out.gain.setValueAtTime(0, t - 0.04);
    out.gain.linearRampToValueAtTime(TINNITUS.gain * k, t);
    out.gain.setTargetAtTime(0, t + 0.12, ringing / 4.6);
    out.connect(g.buses.effects);
    const end = t + ringing + 0.3;
    TINNITUS.tones.forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const part = c.createGain();
      part.gain.value = i === 0 ? 1 : 0.35;
      osc.connect(part).connect(out);
      osc.start(t - 0.04);
      osc.stop(end);
      osc.onended = () => {
        osc.onended = null;
        osc.disconnect();
        part.disconnect();
        if (i === 0) out.disconnect();
      };
    });
  }

  /** The score failing (a stem that will not render) costs the music, never a frame of the game. */
  const score = (play: (p: MusicPlayer) => void): void => {
    if (!player || !running()) return;
    try {
      play(player);
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn('[audio] the score failed', err);
      }
    }
  };

  const speech = createSpeech({
    context: () => ctx,
    out: () => graph?.buses.voice ?? null,
    running,
    duck: (seconds) => system.duckForVoice(seconds),
  });

  const music: Music = {
    setScene(next, timeLeft = null) {
      scene = { scene: next, timeLeft };
      score((p) => p.setScene(next, timeLeft));
    },
    sting(sting) {
      score((p) => p.sting(sting));
    },
    get scene() {
      return scene.scene;
    },
    get state() {
      return player?.state ?? { ...NO_MUSIC, scene: scene.scene };
    },
  };

  const system: SoundSystem = {
    async unlock() {
      if (offline) return;
      if (!ctx) {
        const Ctor =
          (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
          (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        try {
          ctx = new Ctor({ latencyHint: 'interactive' });
        } catch {
          ctx = null;
          return;
        }
        rememberSampleRate(ctx.sampleRate);
        speech.attach();
        const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
        // The context has to start inside the press, but rendering here would hold that press up: with the worker's samples in, the rest is copies.
        const c = ctx;
        await Promise.all([
          resumed,
          Promise.race([prerendering, new Promise((done) => setTimeout(done, WORKER_WAIT_MS))]).then(() => {
            try {
              graph = buildGraph(c);
              applied = null;
              applyListener();
              warmAll(c);
              startMusic(c, graph);
            } catch (err) {
              graph = null;
              console.warn('[audio] failed to build the audio graph', err);
            }
          }),
        ]);
        return;
      }
      if (ctx.state !== 'running') {
        try {
          await ctx.resume();
        } catch {
          // stays locked; a later gesture can retry
        }
      }
    },

    get unlocked() {
      return running();
    },

    play(event, params = {}) {
      log.push({ event, params, time: ctx ? ctx.currentTime : now() });
      if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
      if (!ctx || !graph || !running()) return;
      try {
        start(ctx, graph, event, params);
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn(`[audio] failed to play '${event}'`, err);
        }
      }
    },

    setListener(position, forward, up) {
      listener.position = [position[0], position[1], position[2]];
      listener.forward = [forward[0], forward[1], forward[2]];
      listener.up = [up[0], up[1], up[2]];
      try {
        applyListener();
      } catch {
        // non-finite input; keep the last good pose in the context
      }
    },

    register(event, voice) {
      overrides.set(event, voice);
      if (ctx) {
        try {
          (voice as VoiceExtras).warm?.(ctx);
        } catch {
          // warm-up is optional
        }
      }
    },

    setVolume(master) {
      system.setMix({ master });
    },

    setMix(next) {
      const before = mix;
      mix = mergeMix(mix, next);
      if (!ctx || !graph) return;
      const t = ctx.currentTime;
      if (mix.master !== before.master) graph.master.gain.setTargetAtTime(mix.master, t, 0.02);
      for (const bus of ['music', 'effects', 'voice', 'ui'] as const) if (mix[bus] !== before[bus]) graph.buses[bus].gain.setTargetAtTime(mix[bus], t, 0.02);
    },

    music,

    speech,

    setHealth(health) {
      lowHealth = dangerLevel(health) > 0 ? health : null;
      if (!ctx || !graph || !running()) return;
      const t = ctx.currentTime;
      const cutoff = dangerCutoff(lowHealth);
      if (Math.abs(cutoff - worldCutoff) > worldCutoff * 0.01) {
        // The world closes in with the hit and opens again slowly as health comes back.
        graph.dangerFilter.frequency.setTargetAtTime(cutoff, t, cutoff < worldCutoff ? 0.12 : 0.5);
        worldCutoff = cutoff;
      }
      for (const beat of heart.update(lowHealth, t)) system.play('heartbeat', { intensity: beat.intensity, when: beat.when });
    },

    tinnitus(strength, seconds) {
      const k = Math.min(1, Math.max(0, finiteOr(strength, 0)));
      if (k < 0.05 || !ctx || !graph || !running()) return;
      rung++;
      try {
        ring(ctx, graph, k, seconds);
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn('[audio] failed to ring', err);
        }
      }
    },

    duckForVoice(seconds) {
      if (!ctx || !graph || !running() || !(seconds > 0)) return;
      const t = ctx.currentTime;
      const { floor, releaseAt } = voiceEnvelope.trigger(t, dbToLinear(-VOICE_DUCK_DB), seconds);
      const level = graph.underVoice.gain;
      level.cancelScheduledValues(t);
      level.setTargetAtTime(floor, t, 0.04);
      level.setTargetAtTime(1, releaseAt, 0.25);
    },

    stop(events, fade = 0.015) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const over = Math.max(0.005, finiteOr(fade, 0.015));
      for (let i = active.length - 1; i >= 0; i--) {
        const v = active[i]!;
        if (!events.includes(v.event)) continue;
        // Its input closes for good, so a voice still waiting for its start is never heard either.
        const g = v.input.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + over);
        v.end = t + over;
        active.splice(i, 1);
        if (!offline) setTimeout(() => release(v), over * 1000 + 60);
      }
    },

    get state(): SoundState {
      const t = ctx ? ctx.currentTime : 0;
      let voices = 0;
      for (const v of active) if (v.end >= t) voices++;
      return {
        unlocked: running(),
        voices,
        peakVoices,
        voiceCap: GLOBAL_CAP,
        mix,
        musicDuck: musicEnvelope.valueAt(t),
        voiceDuck: voiceEnvelope.valueAt(t),
        worldCutoff,
        lowHealth,
        tinnitus: rung,
        music: music.state,
        speech: speech.state,
      };
    },

    get log() {
      return log;
    },
  };

  if (offline && ctx) {
    graph = buildGraph(ctx);
    applyListener();
    startMusic(ctx, graph);
  }
  return system;
}
