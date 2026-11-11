/**
 * What the score is doing and why, with no audio in it: the scenes, which one a match's state
 * calls for, what each scene plays, and how the menu theme is arranged from one cycle to the
 * next. The player (player.ts) turns these plans into buffer sources.
 */

/**
 * The score's scenes. `menu` is the theme; `match` is silence that still lets stings through
 * (players need their ears); `lastMinute` and `final10` are the countdown's bed and its last
 * rise; `finalStage` is a Battle Royale's last Ring; `victory` and `defeat` are stings;
 * `silence` stops everything, stings too.
 */
export type MusicScene = 'menu' | 'match' | 'lastMinute' | 'final10' | 'finalStage' | 'victory' | 'defeat' | 'silence';

export const MUSIC_SCENES: readonly MusicScene[] = ['menu', 'match', 'lastMinute', 'final10', 'finalStage', 'victory', 'defeat', 'silence'];

/** The one-shots: a match opening, the Ring starting to close, and the two endings. */
export type Sting = 'matchStart' | 'ringClosing' | 'victory' | 'defeat';

/** Every rendered piece of the score, by its bank's name. */
export type Stem = 'pad' | 'leadA' | 'leadB' | 'siren' | 'bed' | 'riser' | Sting;

/** The match's last act begins this many seconds from its end, and its final rise this many. */
export const LAST_MINUTE = 60;
export const FINAL_TEN = 10;

/** Which part of the countdown `timeLeft` (s; null: the match has no clock, or isn't being played) falls in. */
export type CountdownAct = 'none' | 'lastMinute' | 'final10';

export function countdownAct(timeLeft: number | null): CountdownAct {
  if (timeLeft === null || !Number.isFinite(timeLeft) || timeLeft <= 0 || timeLeft > LAST_MINUTE) return 'none';
  return timeLeft <= FINAL_TEN ? 'final10' : 'lastMinute';
}

/** What the game knows of a match at one moment, as the score needs it. */
export interface MatchMoment {
  /** The match's phase; null with no match (the range, walking a map alone). */
  readonly phase: 'playing' | 'nuke' | 'vote' | 'lobby' | null;
  /** Seconds left on the match clock while it is played; null without a clock. */
  readonly timeLeft: number | null;
  /** A Battle Royale on its last Stage. */
  readonly finalStage: boolean;
  /** Once the match has a result: whether the local player (or their side) won; null before, or when watching. */
  readonly won: boolean | null;
}

/** The scene a match at this moment calls for. */
export function matchScene(m: MatchMoment): MusicScene {
  if (m.phase === null) return 'match';
  if (m.phase === 'lobby') return 'menu';
  if (m.phase === 'playing') {
    const act = countdownAct(m.timeLeft);
    if (act !== 'none') return act;
    return m.finalStage ? 'finalStage' : 'match';
  }
  return m.won === null ? 'match' : m.won ? 'victory' : 'defeat';
}

/** How long (s) each scene takes to come in, and to go when another replaces it. */
const FADES: Readonly<Record<MusicScene, { readonly in: number; readonly out: number }>> = {
  menu: { in: 2.5, out: 1.2 },
  match: { in: 0, out: 0 },
  lastMinute: { in: 4, out: 0.6 },
  final10: { in: 0.25, out: 0.12 },
  finalStage: { in: 5, out: 2 },
  victory: { in: 0, out: 1.5 },
  defeat: { in: 0, out: 1.5 },
  silence: { in: 0, out: 0 },
};

/**
 * How tight the bed is wound `timeLeft` s from the end: its tape speed (one semitone up by the
 * final ten) and how far its filter has opened (Hz). The player ramps between these.
 */
export function tension(timeLeft: number): { rate: number; cutoff: number } {
  const p = Math.min(1, Math.max(0, (LAST_MINUTE - timeLeft) / (LAST_MINUTE - FINAL_TEN)));
  return { rate: Math.pow(2, p / 12), cutoff: 420 * Math.pow(2600 / 420, p) };
}

/** A looping stem in a scene: its level, and where its tape speed and filter stand and are heading. */
export interface LoopPlan {
  readonly stem: Stem;
  readonly gain: number;
  /** Tape speed now, and (when it winds up) the speed it reaches after `over` s. */
  readonly rate: number;
  readonly rateTo?: number;
  /** Low-pass now and where it opens to after `over` s (Hz); absent for none. */
  readonly cutoff?: number;
  readonly cutoffTo?: number;
  readonly over?: number;
}

/** A stem played once in a scene, from `offset` s into it. */
export interface ShotPlan {
  readonly stem: Stem;
  readonly gain: number;
  readonly offset: number;
}

/** Everything a scene plays. */
export interface ScenePlan {
  readonly scene: MusicScene;
  readonly fadeIn: number;
  readonly loops: readonly LoopPlan[];
  readonly shots: readonly ShotPlan[];
  /** The menu theme's own arrangement runs on top (see MenuArranger). */
  readonly arranged: boolean;
  /** A sting let off as the scene begins. */
  readonly sting: Sting | null;
  /** Whether stings already ringing are stopped with the scene before. */
  readonly hush: boolean;
  /** Laid over the scene before it, which plays on (the final rise over the bed). */
  readonly joins: boolean;
}

/** Each stem's place in the mix, as a gain on its buffer (set against the meters: see .scratch/next-level/audio). */
export const STEM_GAIN: Readonly<Record<Stem, number>> = {
  pad: 0.45,
  leadA: 0.25,
  leadB: 0.25,
  siren: 0.15,
  bed: 0.42,
  riser: 0.85,
  matchStart: 0.55,
  ringClosing: 0.42,
  victory: 0.55,
  defeat: 0.45,
};

/** The riser's length (s): it is cut to end with the match. */
export const RISER_SECONDS = FINAL_TEN;

/** What `scene` plays, entered with `timeLeft` s on the match clock (for the countdown's scenes). */
export function planScene(scene: MusicScene, timeLeft: number | null = null): ScenePlan {
  const base = { scene, fadeIn: FADES[scene].in, loops: [], shots: [], arranged: false, sting: null, hush: false, joins: false } satisfies ScenePlan;
  switch (scene) {
    case 'menu':
      return { ...base, loops: [{ stem: 'pad', gain: STEM_GAIN.pad, rate: 1 }], arranged: true };
    case 'lastMinute': {
      const left = Math.min(LAST_MINUTE, Math.max(FINAL_TEN, timeLeft ?? LAST_MINUTE));
      const now = tension(left);
      const end = tension(FINAL_TEN);
      // Wound up by the final ten, the bed holds there under the rise. It is the match ending that stops it (the next
      // scene), not a time set from here: a match's clock can run slower than the audio's on a machine that is struggling.
      return { ...base, loops: [{ stem: 'bed', gain: STEM_GAIN.bed, rate: now.rate, rateTo: end.rate, cutoff: now.cutoff, cutoffTo: end.cutoff, over: left - FINAL_TEN }] };
    }
    case 'final10': {
      // The rise grows out of the bed rather than replacing it: joined cold (no last minute before it), it brings the bed along.
      const left = Math.min(FINAL_TEN, Math.max(0, timeLeft ?? FINAL_TEN));
      const end = tension(FINAL_TEN);
      return { ...base, loops: [{ stem: 'bed', gain: STEM_GAIN.bed, rate: end.rate, cutoff: end.cutoff }], shots: [{ stem: 'riser', gain: STEM_GAIN.riser, offset: RISER_SECONDS - left }] };
    }
    case 'finalStage':
      // The countdown's bed a semitone down and half closed: the same dread, without the clock.
      return { ...base, loops: [{ stem: 'bed', gain: STEM_GAIN.bed * 0.8, rate: Math.pow(2, -1 / 12), cutoff: 900 }] };
    case 'victory':
    case 'defeat':
      return { ...base, sting: scene };
    case 'silence':
      return { ...base, hush: true };
    case 'match':
      return base;
  }
}

/**
 * The score's state machine: which scene is on, and what changing it does. `setScene` answers
 * with the plan to start and how fast the scene before it goes, or null when nothing changes
 * (it is called every frame).
 */
export class MusicDirector {
  #scene: MusicScene = 'silence';

  get scene(): MusicScene {
    return this.#scene;
  }

  setScene(scene: MusicScene, timeLeft: number | null = null): { plan: ScenePlan; fadeOut: number } | null {
    if (scene === this.#scene) return null;
    const from = this.#scene;
    this.#scene = scene;
    const plan = planScene(scene, timeLeft);
    // The rise comes in over the bed already playing; anything else lets the old scene go at its own pace.
    if (scene === 'final10' && from === 'lastMinute') return { plan: { ...plan, loops: [], joins: true }, fadeOut: 0 };
    return { plan, fadeOut: scene === 'silence' ? 0.4 : FADES[from].out };
  }

  /** Forgets the scene (the page was hidden and everything stopped), so the next `setScene` starts it afresh. */
  reset(): void {
    this.#scene = 'silence';
  }
}

/** The menu theme's loop: 8 bars of 4 beats at 60 a minute, one beat a second like the clock it stands for. */
export const BEAT = 1;
export const BAR = 4 * BEAT;
const LOOP_BARS = 8;
export const LOOP = LOOP_BARS * BAR;

/** One pass of the menu theme: which lead phrase is played over the pad (if any), the far siren, and the Geiger ticks. */
export interface MenuCycle {
  readonly lead: 'leadA' | 'leadB' | null;
  /** Seconds into the cycle the siren motif starts; null for none. */
  readonly siren: number | null;
  /** Seconds into the cycle of each Geiger tick, with how hard it clicks (0..1). */
  readonly ticks: readonly { readonly at: number; readonly level: number }[];
}

/**
 * Arranges the menu theme, a cycle at a time: the pad alone first with the counter warming up,
 * then the motif; after it the answering phrase or a cycle of rest with the siren far off. The
 * motif always returns within two cycles and never plays three times running.
 */
export class MenuArranger {
  readonly #random: () => number;
  #cycle = 0;
  #last: MenuCycle['lead'] = null;
  #run = 0;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  get cycle(): number {
    return this.#cycle;
  }

  next(): MenuCycle {
    const n = this.#cycle++;
    const r = this.#random;
    let lead: MenuCycle['lead'];
    if (n === 0) lead = null;
    else if (n === 1 || this.#last === null) lead = 'leadA';
    else if (this.#last === 'leadA') lead = this.#run >= 2 ? 'leadB' : r() < 0.55 ? 'leadB' : r() < 0.5 ? null : 'leadA';
    else lead = r() < 0.7 ? 'leadA' : null;
    this.#run = lead !== null && lead === this.#last ? this.#run + 1 : 1;
    this.#last = lead;
    // The siren answers a rest, and sometimes sits under the second phrase; it enters on the Dm or the Gm.
    const siren = n > 0 && (lead === null ? r() < 0.85 : lead === 'leadB' && r() < 0.3) ? (r() < 0.5 ? 0 : 4 * BAR) : null;
    return { lead, siren, ticks: geigerTicks(r, n === 0 ? 0.25 : 0.55, n === 0) };
  }
}

/**
 * A counter's ticks over one cycle: random arrivals at `rate` a second, in loose clusters the
 * way a real one chatters. `warming` starts from nothing and builds over the cycle.
 */
export function geigerTicks(random: () => number, rate: number, warming = false): { at: number; level: number }[] {
  const ticks: { at: number; level: number }[] = [];
  let t = 0;
  for (;;) {
    // Exponential gaps make a Poisson stream; now and then a second particle follows the first.
    t += -Math.log(1 - random() * 0.999) / rate;
    if (t >= LOOP) break;
    if (warming && random() > t / LOOP) continue;
    ticks.push({ at: t, level: 0.5 + 0.5 * random() });
    if (random() < 0.22 && t + 0.09 < LOOP) ticks.push({ at: t + 0.04 + random() * 0.05, level: 0.35 + 0.3 * random() });
  }
  return ticks;
}
