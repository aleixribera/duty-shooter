import type { Solid, Vec3 } from '@duty-shooter/fps-core';
import type { SoundEventName, SoundParams } from './audio';
import { SIREN_HOLD_SECONDS, SIREN_OVERLAP, SIREN_RISE_SECONDS } from './audio/countdown';
import { FINAL_TEN, LAST_MINUTE, countdownAct } from './audio/music/scene';

/** Scheduled this far ahead (s), so a slow frame doesn't open a gap. */
const LOOKAHEAD = 0.15;
/** With less than this left on the clock (s) the siren isn't started: it would wind down before it had wound up. */
const SIREN_LEAST = 4;

export interface CountdownCue {
  readonly event: SoundEventName;
  readonly params: SoundParams;
  /** Voices to fade out as this one starts: the siren's held note, under its wind-down. */
  readonly cut?: readonly SoundEventName[];
}

/** The siren while it winds up and holds, and everything the countdown plays. */
export const SIREN_VOICES: readonly SoundEventName[] = ['countdownSirenRise', 'countdownSirenHold'];
export const COUNTDOWN_VOICES: readonly SoundEventName[] = [...SIREN_VOICES, 'countdownSirenFall', 'geigerTick'];

/**
 * How often the counter ticks (a second) with `timeLeft` s on the clock: a slow chatter through
 * the last minute (one every two seconds, to three a second), then a rush through the final ten
 * (five a second to thirty), where single ticks run together into a buzz.
 */
export function geigerRate(timeLeft: number): number {
  if (!(timeLeft > 0) || timeLeft > LAST_MINUTE) return 0;
  if (timeLeft > FINAL_TEN) return 0.5 * Math.pow(3 / 0.5, (LAST_MINUTE - timeLeft) / (LAST_MINUTE - FINAL_TEN));
  return 5 * Math.pow(30 / 5, (FINAL_TEN - timeLeft) / FINAL_TEN);
}

/**
 * The last minute of a timed match, as it is heard: an air-raid siren far off at the map's edge
 * that winds up as the minute begins and holds (in overlapping segments) until the clock runs
 * out, then winds down; and a Geiger counter whose ticks come faster and faster. The same
 * clock drives the score's `lastMinute` and `final10` scenes. A match that is left, or whose
 * clock stands still, goes quiet with no wind-down (`hush`).
 */
export class CountdownSounds {
  readonly #random: () => number;
  /** When the siren's next segment starts (s); null while it is silent. */
  #siren: number | null = null;
  #tick: number | null = null;
  /** Whether anything has been asked for since the last `hush`. */
  #sounded = false;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  /** Whether the siren is sounding. */
  get wailing(): boolean {
    return this.#siren !== null;
  }

  /**
   * The cues due by `clock` (s, the page's clock) with `timeLeft` s on the match clock (null:
   * no countdown, all quiet) and the siren standing at `sirenAt`.
   */
  update(timeLeft: number | null, clock: number, sirenAt: Vec3): CountdownCue[] {
    const cues: CountdownCue[] = [];
    const when = (at: number) => Math.max(0, at - clock);
    const position: readonly [number, number, number] = [sirenAt[0], sirenAt[1], sirenAt[2]];
    if (countdownAct(timeLeft) === 'none' || timeLeft === null) {
      // The clock ran out (or the match ended early): the siren winds down now, its held note fading under it.
      if (this.#siren !== null) cues.push({ event: 'countdownSirenFall', params: { position }, cut: SIREN_VOICES });
      this.#siren = this.#tick = null;
      this.#sounded ||= cues.length > 0;
      return cues;
    }
    if (this.#siren === null && timeLeft >= SIREN_LEAST) {
      cues.push({ event: 'countdownSirenRise', params: { position } });
      this.#siren = clock + SIREN_RISE_SECONDS - SIREN_OVERLAP;
    }
    // A page that slept (a hidden tab) wakes with its next segment long past: it picks up from now.
    if (this.#siren !== null && this.#siren < clock - SIREN_HOLD_SECONDS) this.#siren = clock;
    while (this.#siren !== null && this.#siren <= clock + LOOKAHEAD) {
      cues.push({ event: 'countdownSirenHold', params: { position, when: when(this.#siren) } });
      this.#siren += SIREN_HOLD_SECONDS - SIREN_OVERLAP;
    }

    if (this.#tick === null || this.#tick < clock - 1) this.#tick = clock + this.#gap(timeLeft);
    while (this.#tick <= clock + LOOKAHEAD) {
      const left = timeLeft - (this.#tick - clock);
      if (left <= 0) break;
      cues.push({ event: 'geigerTick', params: { intensity: 0.45 + 0.55 * this.#random(), when: when(this.#tick) } });
      this.#tick += this.#gap(left);
    }
    this.#sounded ||= cues.length > 0;
    return cues;
  }

  /**
   * Goes quiet with no wind-down: the match was left, or (`paused`) its clock stands still, and
   * the siren takes up its held note again when `update` is next called. True when something may
   * still be sounding (`COUNTDOWN_VOICES`), for the caller to stop; once, not every frame.
   */
  hush(paused: boolean): boolean {
    const sounding = this.#sounded;
    this.#sounded = false;
    // A next segment long past is how a page that slept wakes: `update` picks the note up from then.
    this.#siren = paused && this.#siren !== null ? -Infinity : null;
    this.#tick = null;
    return sounding;
  }

  /** The wait to the next tick: random arrivals, as a counter's are, never two on top of each other. */
  #gap(timeLeft: number): number {
    const rate = Math.max(0.05, geigerRate(timeLeft));
    return Math.max(0.012, -Math.log(1 - this.#random() * 0.999) / rate);
  }
}

/** How far past the edge of what is built the siren stands (m), and how high. */
const SIREN_BEYOND = 70;
const SIREN_HEIGHT = 22;

/**
 * Where the countdown's siren stands: beyond the north-west edge of the map, up a mast. The
 * map's edge is taken from where its solids are, leaving out the few that reach far past the
 * rest (a ground slab, a far-off backdrop).
 */
export function sirenSpot(solids: readonly Pick<Solid, 'min' | 'max'>[]): Vec3 {
  if (solids.length === 0) return [-SIREN_BEYOND * 0.6, SIREN_HEIGHT, -SIREN_BEYOND * 0.8];
  const xs = solids.map((s) => (s.min[0] + s.max[0]) / 2).sort((a, b) => a - b);
  const zs = solids.map((s) => (s.min[2] + s.max[2]) / 2).sort((a, b) => a - b);
  const at = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] ?? 0;
  const [x0, x1, z0, z1] = [at(xs, 0.05), at(xs, 0.95), at(zs, 0.05), at(zs, 0.95)];
  const reach = Math.hypot(x1 - x0, z1 - z0) / 2 + SIREN_BEYOND;
  return [(x0 + x1) / 2 - 0.6 * reach, SIREN_HEIGHT, (z0 + z1) / 2 - 0.8 * reach];
}
