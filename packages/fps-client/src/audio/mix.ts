/**
 * The mix's arithmetic, kept apart from the audio graph so it can be tested without one: the
 * buses and their levels, and the ducking that makes room for gunfire over the music and for
 * the announcer over everything but the UI.
 */
import type { SoundEventName } from './types';

/** Where a sound sits in the mix: each bus has its own volume in Settings. */
export type BusName = 'music' | 'effects' | 'voice' | 'ui';

export const BUSES: readonly BusName[] = ['music', 'effects', 'voice', 'ui'];

/** The volumes a player sets, each 0..1: the master over everything, then one per bus. */
export interface MixLevels {
  readonly master: number;
  readonly music: number;
  readonly effects: number;
  readonly voice: number;
  readonly ui: number;
}

export const DEFAULT_MIX: MixLevels = { master: 0.8, music: 0.7, effects: 1, voice: 1, ui: 1 };

const level = (v: number | undefined, fallback: number): number => (v !== undefined && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** `next` laid over `base`, every level held to 0..1; anything missing or not a number keeps `base`'s. */
export function mergeMix(base: MixLevels, next: Partial<MixLevels>): MixLevels {
  return {
    master: level(next.master, base.master),
    music: level(next.music, base.music),
    effects: level(next.effects, base.effects),
    voice: level(next.voice, base.voice),
    ui: level(next.ui, base.ui),
  };
}

/** What a sound on `bus` is multiplied by before the limiter, ducking aside. */
export function busGain(mix: MixLevels, bus: BusName): number {
  return mix.master * mix[bus];
}

/** What the announcer's speech is said at: it is outside the audio graph, so it takes its two volumes as one number. */
export function speechVolume(mix: MixLevels): number {
  return Math.min(1, busGain(mix, 'voice'));
}

export const dbToLinear = (db: number): number => Math.pow(10, db / 20);

/** How fast a duck bites and lets go (time constants, s). */
export const DUCK = { attack: 0.012, release: 0.4 } as const;

/** How far (dB) and how long (s) the loudest of each kind pushes the music down. */
const MUSIC_DUCKERS: Partial<Record<SoundEventName, { readonly depth: number; readonly hold: number }>> = {
  gunshot: { depth: 9, hold: 0.22 },
  explosion: { depth: 14, hold: 0.7 },
  nukeBlast: { depth: 18, hold: 4 },
};

/** A duck shallower than this isn't worth the automation: a rifle past two hundred metres leaves the music alone. */
const LEAST_DUCK_DB = 1.5;

/**
 * How the music gives way to a sound: by how much (dB) and for how long (s) before it comes
 * back, or null when the sound doesn't duck it. `direct` is how much of the sound reaches the
 * listener (1 for your own gun, the distance law's gain for one placed in the world): a rifle
 * across the map barely moves the music, one beside you takes it right down.
 */
export function musicDuck(event: SoundEventName, direct: number): { depth: number; hold: number } | null {
  const d = MUSIC_DUCKERS[event];
  if (!d) return null;
  const depth = d.depth * Math.sqrt(Math.min(1, Math.max(0, direct)));
  return depth < LEAST_DUCK_DB ? null : { depth, hold: d.hold };
}

/** Under the announcer: everything but the UI comes down this far (dB) while a line is said. */
export const VOICE_DUCK_DB = 5;

/** About how long (s) a line takes to say, for holding the duck under it. */
export function speechSeconds(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return 0.35 + words * 0.38;
}

/**
 * One duck's envelope over time, mirroring what is scheduled on the gain: down to a floor
 * quickly, held, then back up. Triggers that land while it is still held are merged: the
 * deepest floor and the latest release win, so a burst of fire holds the music down once
 * rather than pumping it on every shot.
 */
export class DuckEnvelope {
  #floor = 1;
  #from = -Infinity;
  #releaseAt = -Infinity;
  /** The level it was at when the present duck began. */
  #start = 1;

  /** A sound at `time` (s) ducks to `floor` (a gain, 0..1) for `hold` s. Returns what to schedule: the floor and when to let go. */
  trigger(time: number, floor: number, hold: number): { floor: number; releaseAt: number } {
    const held = time < this.#releaseAt;
    const now = this.valueAt(time);
    this.#start = now;
    this.#floor = held ? Math.min(this.#floor, floor) : floor;
    this.#releaseAt = held ? Math.max(this.#releaseAt, time + hold) : time + hold;
    this.#from = time;
    return { floor: this.#floor, releaseAt: this.#releaseAt };
  }

  /** The duck's gain at `time`. */
  valueAt(time: number): number {
    // Never ducked yet: wide open.
    if (this.#from === -Infinity) return 1;
    if (time < this.#from) return this.#start;
    if (time < this.#releaseAt) return this.#floor + (this.#start - this.#floor) * Math.exp(-(time - this.#from) / DUCK.attack);
    const bottom = this.#floor + (this.#start - this.#floor) * Math.exp(-(this.#releaseAt - this.#from) / DUCK.attack);
    return 1 + (bottom - 1) * Math.exp(-(time - this.#releaseAt) / DUCK.release);
  }

  /** When it will have let go (s). */
  get releaseAt(): number {
    return this.#releaseAt;
  }
}
