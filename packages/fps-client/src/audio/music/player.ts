/**
 * Plays the score: turns a scene's plan (scene.ts) into buffer sources on the music bus. Every
 * stem is a buffer rendered ahead of time (score.ts), so a scene costs a handful of sources and
 * a gain; the menu theme's arrangement is laid down one 32 s cycle at a time, a couple of
 * seconds before it is due, on the audio clock.
 */
import { GEIGER_BANK, GEIGER_VARIANTS, geigerTick } from '../countdown';
import type { Kit } from '../kit';
import { LOOP, MenuArranger, MusicDirector, STEM_GAIN, type LoopPlan, type MusicScene, type ScenePlan, type Stem, type Sting } from './scene';
import { STEM_RENDER, STEMS, stemId } from './score';

/** What the score is doing, for scripts and the debug overlay. */
export interface MusicState {
  /** The scene asked for last. */
  readonly scene: MusicScene;
  /** The scene sounding: 'silence' until the stems are in and the page is in view. */
  readonly sounding: MusicScene;
  /** Whether every stem is rendered. */
  readonly ready: boolean;
  /** Whether the page is hidden (the score stops while it is). */
  readonly hidden: boolean;
  /** Buffer sources alive. */
  readonly sources: number;
  /** Cycles of the menu theme arranged since it last began. */
  readonly cycle: number;
  /** Every sting let off, oldest first (the last 20). */
  readonly stings: readonly Sting[];
  /** Main-thread time spent scheduling the score: calls that did any work, their total and the worst (ms). */
  readonly scheduling: { readonly calls: number; readonly ms: number; readonly worst: number };
}

/** The score's controls. Safe to call every frame: nothing happens until the scene changes. */
export interface Music {
  /** The scene the game is in; `timeLeft` (s on the match clock) places the countdown's scenes. */
  setScene(scene: MusicScene, timeLeft?: number | null): void;
  /** Lets off a one-shot over whatever is playing (not in 'silence'). */
  sting(sting: Sting): void;
  readonly scene: MusicScene;
  readonly state: MusicState;
}

/** The menu theme's next cycle is laid down this long before it starts (s), checked this often (ms). */
const LOOKAHEAD = 2;
const TICK_MS = 250;
/** How loud the counter's ticks sit under the theme. */
const GEIGER_GAIN = 0.08;

interface Group {
  readonly scene: MusicScene;
  readonly gain: GainNode;
  /** When the menu theme's next cycle starts (context time); null for scenes without an arrangement. */
  nextCycle: number | null;
  readonly arranger: MenuArranger | null;
}

export interface MusicPlayerOptions {
  /** Render a stem the moment it is first needed (offline renders); otherwise nothing plays until `ready()`. */
  readonly sync?: boolean;
  /** The arranger's dice. */
  readonly random?: () => number;
  /** Run the arranger's timer and watch the page's visibility (off for offline renders). */
  readonly timers?: boolean;
  /** How far ahead the menu theme is laid down (s): an offline render lays down all of it at once. */
  readonly lookahead?: number;
}

export interface MusicPlayer extends Music {
  /** The stems are rendered (or offered by the worker): the scene asked for starts. */
  ready(): void;
  /** Lays down every menu cycle that starts before `until` (context time). */
  arrange(until: number): void;
  /** Stops everything at once and forgets the scene. */
  stop(): void;
}

const msNow = (): number => (globalThis as { performance?: { now(): number } }).performance?.now() ?? Date.now();

export function createMusicPlayer(ctx: BaseAudioContext, out: AudioNode, kit: Kit, options: MusicPlayerOptions = {}): MusicPlayer {
  const director = new MusicDirector();
  const random = options.random ?? Math.random;
  const stemRate = ctx.sampleRate / 2;
  const lookahead = options.lookahead ?? LOOKAHEAD;
  let ready = options.sync === true;
  let hidden = false;
  let wanted: { scene: MusicScene; timeLeft: number | null } = { scene: 'silence', timeLeft: null };
  let group: Group | null = null;
  /** Scenes still playing under the one that joined them. */
  const under: Group[] = [];
  let live = 0;
  let cycles = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const stings: Sting[] = [];
  const scheduling = { calls: 0, ms: 0, worst: 0 };

  const stingBus = ctx.createGain();
  stingBus.connect(out);

  function timed(work: () => void): void {
    const t0 = msNow();
    work();
    const ms = msNow() - t0;
    scheduling.calls++;
    scheduling.ms += ms;
    if (ms > scheduling.worst) scheduling.worst = ms;
  }

  const stem = (name: Stem): AudioBuffer => kit.bank(stemId(name), 1, STEM_RENDER[name], { keepLength: true, sampleRate: stemRate })[0] as AudioBuffer;

  /** One buffer source into `to`, counted while it lives and unhooked when it ends. */
  function source(buffer: AudioBuffer, to: AudioNode, gain: number, extra: AudioNode[] = []): { src: AudioBufferSourceNode; level: GainNode } {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const level = ctx.createGain();
    level.gain.value = gain;
    let node: AudioNode = src;
    for (const n of extra) node = node.connect(n);
    node.connect(level).connect(to);
    live++;
    src.onended = () => {
      src.onended = null;
      live--;
      for (const n of [src, ...extra, level]) {
        try {
          n.disconnect();
        } catch {
          // already gone
        }
      }
    };
    return { src, level };
  }

  const sources = new Map<Group, AudioBufferSourceNode[]>();

  function shot(g: Group, buffer: AudioBuffer, gain: number, at: number, offset = 0): void {
    if (offset >= buffer.duration) return;
    const { src } = source(buffer, g.gain, gain);
    src.start(at, Math.max(0, offset));
    sources.get(g)?.push(src);
  }

  function loop(g: Group, plan: LoopPlan, at: number): void {
    const filter = plan.cutoff === undefined ? null : ctx.createBiquadFilter();
    if (filter && plan.cutoff !== undefined) {
      filter.type = 'lowpass';
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(plan.cutoff, at);
      if (plan.cutoffTo !== undefined && plan.over && plan.over > 0) filter.frequency.exponentialRampToValueAtTime(plan.cutoffTo, at + plan.over);
    }
    const { src } = source(stem(plan.stem), g.gain, plan.gain, filter ? [filter] : []);
    src.loop = true;
    src.playbackRate.setValueAtTime(plan.rate, at);
    if (plan.rateTo !== undefined && plan.over && plan.over > 0) src.playbackRate.linearRampToValueAtTime(plan.rateTo, at + plan.over);
    src.start(at);
    sources.get(g)?.push(src);
  }

  function arrange(until: number): void {
    const g = group;
    if (!g || g.nextCycle === null || !g.arranger) return;
    for (let at: number = g.nextCycle; at < until; at = g.nextCycle) {
      const cycle = g.arranger.next();
      cycles = g.arranger.cycle;
      if (cycle.lead) shot(g, stem(cycle.lead), STEM_GAIN[cycle.lead], at);
      if (cycle.siren !== null) shot(g, stem('siren'), STEM_GAIN.siren, at + cycle.siren);
      for (const tick of cycle.ticks) shot(g, kit.pick(GEIGER_BANK, GEIGER_VARIANTS, geigerTick), GEIGER_GAIN * tick.level, at + tick.at);
      g.nextCycle = at + LOOP;
    }
  }

  function letGo(g: Group, fade: number): void {
    const t = ctx.currentTime;
    const end = t + Math.max(0.02, fade);
    g.gain.gain.cancelScheduledValues(t);
    g.gain.gain.setValueAtTime(g.gain.gain.value, t);
    g.gain.gain.linearRampToValueAtTime(0, end);
    for (const src of sources.get(g) ?? []) {
      try {
        src.stop(end + 0.02);
      } catch {
        // never started, or already stopped
      }
    }
    sources.delete(g);
    const gain = g.gain;
    if (options.timers !== false) setTimeout(() => gain.disconnect(), (end - t) * 1000 + 200);
  }

  function hushStings(fade: number): void {
    const t = ctx.currentTime;
    stingBus.gain.cancelScheduledValues(t);
    stingBus.gain.setValueAtTime(stingBus.gain.value, t);
    stingBus.gain.linearRampToValueAtTime(0, t + fade);
    stingBus.gain.setValueAtTime(1, t + fade + 0.05);
    for (const src of stingSources.splice(0)) {
      try {
        src.stop(t + fade + 0.02);
      } catch {
        // already over
      }
    }
  }

  const stingSources: AudioBufferSourceNode[] = [];

  function playSting(name: Sting): void {
    const { src } = source(stem(name), stingBus, STEM_GAIN[name]);
    src.start(ctx.currentTime + 0.02);
    stingSources.push(src);
    if (stingSources.length > 4) stingSources.shift();
    stings.push(name);
    if (stings.length > 20) stings.shift();
  }

  function begin(plan: ScenePlan, fadeOut: number): void {
    if (plan.joins) {
      if (group) under.push(group);
    } else {
      if (group) letGo(group, fadeOut);
      for (const g of under.splice(0)) letGo(g, fadeOut);
    }
    group = null;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (plan.hush) hushStings(0.4);
    if (plan.sting) playSting(plan.sting);
    if (plan.loops.length === 0 && plan.shots.length === 0 && !plan.arranged) return;

    const t = ctx.currentTime + 0.03;
    const gain = ctx.createGain();
    if (plan.fadeIn > 0) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + plan.fadeIn);
    }
    gain.connect(out);
    const g: Group = { scene: plan.scene, gain, nextCycle: plan.arranged ? t : null, arranger: plan.arranged ? new MenuArranger(random) : null };
    sources.set(g, []);
    group = g;
    for (const l of plan.loops) loop(g, l, t);
    for (const s of plan.shots) shot(g, stem(s.stem), s.gain, t, s.offset);
    if (plan.arranged) {
      cycles = 0;
      arrange(t + lookahead);
      if (options.timers !== false) timer = setInterval(() => (ctx.currentTime + lookahead > (group?.nextCycle ?? Infinity) ? timed(() => arrange(ctx.currentTime + lookahead)) : undefined), TICK_MS);
    }
  }

  function apply(): void {
    if (!ready || hidden) return;
    const change = director.setScene(wanted.scene, wanted.timeLeft);
    if (change) timed(() => begin(change.plan, change.fadeOut));
  }

  function stop(): void {
    if (group) letGo(group, 0.08);
    for (const g of under.splice(0)) letGo(g, 0.08);
    group = null;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    hushStings(0.08);
  }

  // A hidden page plays nothing. Back in view, a scene that was sounding starts afresh on the game's next call
  // (it calls every frame, with the clock as it stands then); a sting that was let off stays let off.
  const doc = (globalThis as { document?: Document }).document;
  if (doc && options.timers !== false) {
    doc.addEventListener('visibilitychange', () => {
      hidden = doc.visibilityState === 'hidden';
      if (hidden) {
        const sounding = group !== null;
        stop();
        if (sounding) director.reset();
      }
    });
    hidden = doc.visibilityState === 'hidden';
  }

  return {
    setScene(scene, timeLeft = null) {
      wanted = { scene, timeLeft };
      apply();
    },
    sting(name) {
      if (!ready || hidden || director.scene === 'silence') return;
      timed(() => playSting(name));
    },
    ready() {
      if (ready) return;
      ready = true;
      apply();
    },
    arrange,
    stop() {
      stop();
      director.reset();
    },
    get scene() {
      return wanted.scene;
    },
    get state(): MusicState {
      return { scene: wanted.scene, sounding: ready && !hidden ? director.scene : 'silence', ready, hidden, sources: live, cycle: cycles, stings: [...stings], scheduling: { ...scheduling } };
    },
  };
}

/** Renders every stem now, one at a time through `schedule` (idle slices): for pages without a worker. */
export function renderStems(ctx: BaseAudioContext, kit: Kit, schedule: (fn: () => void) => void, done: () => void): void {
  const queue = [...STEMS];
  const step = (): void => {
    const name = queue.shift();
    if (name === undefined) return done();
    try {
      kit.bank(stemId(name), 1, STEM_RENDER[name], { keepLength: true, sampleRate: ctx.sampleRate / 2 });
    } catch {
      // a stem that fails to render is one the score goes without
    }
    schedule(step);
  };
  schedule(step);
}
