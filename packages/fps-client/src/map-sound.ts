import { sightBlocked, type Vec3, type World } from '@duty-shooter/fps-core';
import type { SoundEventName, SoundParams } from './audio';
import { OVERLAP, RADIO_SECONDS, WIND_SECONDS } from './audio/ambience';

/** A box of the map that is indoors (a house, a garage), for the reverb. */
export interface SoundZone {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Which reverb a sound made at `p` rings with: indoors inside any of the map's indoor zones, outdoors everywhere else. */
export function environmentAt(zones: readonly SoundZone[], p: Vec3): 'indoor' | 'outdoor' {
  for (const z of zones) {
    if (p[0] >= z.min[0] && p[0] <= z.max[0] && p[1] >= z.min[1] && p[1] <= z.max[1] && p[2] >= z.min[2] && p[2] <= z.max[2]) return 'indoor';
  }
  return 'outdoor';
}

/**
 * Whether walls or floors stand between the listener and a sound at `source`,
 * so it reaches them muffled. Glass and open doorways don't block. The ray
 * aims a little above the source and stops short of it, so the floor under a
 * footstep or the wall a bullet hit doesn't count.
 */
export function muffled(world: World, listener: Vec3, source: Vec3): boolean {
  const to: Vec3 = [source[0], source[1] + 0.3, source[2]];
  const d = Math.hypot(to[0] - listener[0], to[1] - listener[1], to[2] - listener[2]);
  if (d < 0.6) return false;
  const k = (d - 0.3) / d;
  return sightBlocked(world, listener, [listener[0] + (to[0] - listener[0]) * k, listener[1] + (to[1] - listener[1]) * k, listener[2] + (to[2] - listener[2]) * k]);
}

/** Something the map makes heard: the wind everywhere, or birds, a sign or a radio at a place. */
export type AmbientSource = { readonly kind: 'wind' } | { readonly kind: 'birds' | 'sign' | 'radio'; readonly position: Vec3 };

/** One ambient sound to play now. */
export interface AmbientCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
}

/** How far ahead (s) sounds are queued, so a segment starts on time between frames. */
const LOOKAHEAD = 0.2;
/** Wind overlaps by its slow crossfade; the radio by the short one at its ends. */
const WIND_PERIOD = WIND_SECONDS - 1.2;
const RADIO_PERIOD = RADIO_SECONDS - OVERLAP;

interface Stream {
  /** A bed runs back to back from the start (wind, radio); the rest come and go. */
  readonly bed: boolean;
  due: number;
  readonly cue: (random: () => number) => AmbientCue;
  readonly period: (random: () => number) => number;
}

/**
 * Schedules the map's ambience: the wind as overlapping segments with no
 * gap, a bird from a random perch every few seconds, a sign creaking as the
 * wind takes it, and the radio playing on without a break. Feed it a clock;
 * it hands back what to play. After a stall (a hidden tab) it picks up from
 * now instead of playing everything it missed.
 */
export class Ambience {
  readonly #streams: Stream[] = [];
  readonly #random: () => number;
  #indoors = false;
  #started = false;

  constructor(sources: readonly AmbientSource[], random: () => number = Math.random) {
    this.#random = random;
    const range = (a: number, b: number) => (r: () => number) => a + (b - a) * r();
    if (sources.some((s) => s.kind === 'wind')) {
      this.#streams.push({
        bed: true,
        due: 0,
        cue: () => ({ event: 'ambientWind', params: { intensity: this.#indoors ? 0.3 : 1 } }),
        period: () => WIND_PERIOD,
      });
    }
    const perches = sources.flatMap((s) => (s.kind === 'birds' ? [s.position] : []));
    if (perches.length > 0) {
      this.#streams.push({
        bed: false,
        due: 0,
        cue: (r) => ({ event: 'ambientBirds', params: { position: perches[Math.floor(r() * perches.length)] ?? perches[0]! } }),
        period: range(4, 11),
      });
    }
    for (const s of sources) {
      if (s.kind === 'sign') this.#streams.push({ bed: false, due: 0, cue: (r) => ({ event: 'ambientCreak', params: { position: s.position, intensity: 0.5 + 0.5 * r() } }), period: range(2.5, 6) });
      if (s.kind === 'radio') this.#streams.push({ bed: true, due: 0, cue: () => ({ event: 'ambientRadio', params: { position: s.position } }), period: () => RADIO_PERIOD });
    }
  }

  /** What to start at `now` (s, any steady clock), with the listener indoors or not. */
  update(now: number, indoors: boolean): AmbientCue[] {
    this.#indoors = indoors;
    if (!this.#started) {
      this.#started = true;
      // The beds start at once; the occasional sounds a little later, at their own pace.
      for (const s of this.#streams) s.due = s.bed ? now : now + s.period(this.#random);
    }
    const cues: AmbientCue[] = [];
    for (const s of this.#streams) {
      if (s.due < now - 1) s.due = now;
      while (s.due <= now + LOOKAHEAD) {
        const c = s.cue(this.#random);
        cues.push({ event: c.event, params: { ...c.params, when: Math.max(0, s.due - now) } });
        s.due += s.period(this.#random);
      }
    }
    return cues;
  }
}
