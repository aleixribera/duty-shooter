/**
 * The sound system: owns the AudioContext, the master bus (compressor -> limiter -> soft clip),
 * the shared environment reverbs, spatialisation, voice caps and voice stealing. Voices only
 * ever see an input node; everything after it (distance filtering, panning, reverb send,
 * fade-out on steal, node cleanup) is done here, so a recorded sample registered later gets the
 * same treatment as the procedural voice it replaces.
 */
import { kitFor } from './kit';
import type { SoundEventName, SoundLogEntry, SoundParams, SoundSystem, Voice, VoiceExtras, VoiceParams } from './types';
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
  gunshot: { cap: 16, ref: 6, rolloff: 1, send: 1, indoorSend: 0.85 },
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
  grenadePin: handling,
  grenadeThrow: handling,
  grenadeBounce: { cap: 6, ref: 3, rolloff: 1.2, send: 0.1, indoorSend: 0.2 },
  // A frag carries like a gunshot and rings off the surroundings.
  explosion: { cap: 4, ref: 10, rolloff: 0.8, send: 0.9, indoorSend: 0.8 },
  impact: { cap: 16, ref: 4, rolloff: 1, send: 0.25, indoorSend: 0.3 },
  casing: { cap: 12, ref: 1.5, rolloff: 1.4, send: 0.03, indoorSend: 0.08, level: 0.6 },
  bulletCrack: { cap: 8, ref: 5, rolloff: 1, send: 0.35, indoorSend: 0.3 },
  hitMarker: { ...ui, level: 1.75 },
  killMarker: { ...ui, level: 1.15 },
  headshotMarker: { ...ui, cap: 3, level: 0.72 },
  damageTaken: { ...ui, cap: 3, level: 0.5 },
  // Heard across the whole town and far beyond: barely fades with distance, and rings off the desert.
  nukeSiren: { cap: 1, ref: 40, rolloff: 0.5, send: 0.5, indoorSend: 0.3, level: 0.5 },
  nukeBlast: { cap: 1, ref: 600, rolloff: 0.2, send: 0.6, indoorSend: 0.4 },
  // Ambience: the wind is a bed all round you; the rest come from where the map puts them, and fade fast.
  ambientWind: { cap: 2, ref: 1, rolloff: 1, send: 0, indoorSend: 0, level: 0.7 },
  ambientBirds: { cap: 3, ref: 6, rolloff: 1, send: 0.3, indoorSend: 0.3 },
  ambientCreak: { cap: 2, ref: 3, rolloff: 1.2, send: 0.15, indoorSend: 0.2 },
  ambientRadio: { cap: 2, ref: 1.5, rolloff: 1.4, send: 0.1, indoorSend: 0.35 },
};

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
  readonly world: GainNode;
  readonly local: GainNode;
  readonly reverbIn: Record<Environment, GainNode>;
}

function now(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() / 1000 : Date.now() / 1000;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

export function createSoundSystem(options?: { volume?: number }): SoundSystem {
  let ctx: AudioContext | null = null;
  let graph: Graph | null = null;
  let volume = Math.max(0, finiteOr(options?.volume, 0.8));
  let warned = false;
  const listener = { position: [0, 0, 0] as Vec3, forward: [0, 0, -1] as Vec3, up: [0, 1, 0] as Vec3 };
  const log: SoundLogEntry[] = [];
  const defaults = createDefaultVoices();
  const overrides = new Map<SoundEventName, Voice>();
  const active: ActiveVoice[] = [];

  const voiceFor = (event: SoundEventName): Voice => overrides.get(event) ?? defaults[event];

  function lifeOf(voice: Voice): number {
    const d = (voice as VoiceExtras).duration;
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : DEFAULT_LIFE;
  }

  function buildGraph(c: AudioContext): Graph {
    // Glue compressor: gentle, slow enough to let the transient through (punch), then a
    // fast brick-wall-ish limiter, then a soft clipper that only touches the last ~1 dB.
    const master = c.createGain();
    master.gain.value = volume;
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
    master.connect(comp).connect(limiter).connect(clip).connect(c.destination);

    const world = c.createGain();
    const local = c.createGain();
    world.connect(master);
    local.connect(master);

    const irs = kitFor(c).impulseResponses();
    const makeReverb = (ir: AudioBuffer): GainNode => {
      const input = c.createGain();
      const conv = c.createConvolver();
      conv.normalize = false;
      conv.buffer = ir;
      input.connect(conv).connect(master);
      return input;
    };
    return { master, world, local, reverbIn: { outdoor: makeReverb(irs.outdoor), indoor: makeReverb(irs.indoor) } };
  }

  function applyListener(): void {
    if (!ctx) return;
    const l = ctx.listener;
    const [px, py, pz] = listener.position;
    const [fx, fy, fz] = listener.forward;
    const [ux, uy, uz] = listener.up;
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = py;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = ux;
      l.upY.value = uy;
      l.upZ.value = uz;
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

  function steal(c: AudioContext, v: ActiveVoice): void {
    const t = c.currentTime;
    const g = v.input.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.015);
    v.end = t + 0.03;
    const i = active.indexOf(v);
    if (i >= 0) active.splice(i, 1);
    setTimeout(() => release(v), 60);
  }

  function makeRoom(c: AudioContext, event: SoundEventName): void {
    const t = c.currentTime;
    for (let i = active.length - 1; i >= 0; i--) {
      const v = active[i];
      if (v && v.end < t) release(v);
    }
    const cap = PROFILES[event].cap;
    let count = 0;
    for (const v of active) if (v.event === event) count++;
    while (count >= cap) {
      const oldest = active.find((v) => v.event === event);
      if (!oldest) break;
      steal(c, oldest);
      count--;
    }
    while (active.length >= GLOBAL_CAP) {
      const oldest = active[0];
      if (!oldest) break;
      steal(c, oldest);
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

    makeRoom(c, event);

    const input = c.createGain();
    input.gain.value = (profile.level ?? 1) * (positional && params.muffled ? MUFFLE_GAIN : 1);
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
      input.connect(g.local);
    }

    const sendLevel = reverbSend(event, env, distance ?? null);
    if (sendLevel > 0.001) {
      const send = c.createGain();
      send.gain.value = sendLevel;
      sendFrom.connect(send).connect(g.reverbIn[env]);
      nodes.push(send);
    }

    const life = lifeOf(voice);
    const entry: ActiveVoice = { event, input, nodes, end: startTime + life, released: false };
    active.push(entry);
    setTimeout(() => release(entry), (startTime + life - t0) * 1000 + 100);

    const vp: VoiceParams = distance === undefined ? params : { ...params, distance };
    voice.play(c, input, vp, startTime);
  }

  function warmAll(c: AudioContext): void {
    // Your own gunshot is rendered now (it must never hitch); everything else is rendered one
    // bank at a time between frames so the first footstep or remote shot doesn't stall a frame.
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
      const task = queue.shift();
      if (!task) return;
      try {
        task();
      } catch {
        // a broken custom voice must not stop the others warming
      }
      schedule(step);
    };
    schedule(step);
  }

  const system: SoundSystem = {
    async unlock() {
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
        const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => undefined);
        try {
          graph = buildGraph(ctx);
          applyListener();
          warmAll(ctx);
        } catch (err) {
          graph = null;
          console.warn('[audio] failed to build the audio graph', err);
        }
        await resumed;
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
      return ctx !== null && graph !== null && ctx.state === 'running';
    },

    play(event, params = {}) {
      log.push({ event, params, time: ctx ? ctx.currentTime : now() });
      if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
      if (!ctx || !graph || ctx.state !== 'running') return;
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
      volume = Math.max(0, finiteOr(master, volume));
      if (ctx && graph) graph.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },

    get log() {
      return log;
    },
  };
  return system;
}
