/**
 * What being nearly dead sounds like: under 30 health a heartbeat that quickens as health
 * drops, and the world heard through a low-pass that deepens with it. Only the arithmetic and
 * the beats' timing live here; the sound system owns the filter and plays the beats.
 */

/** Health (of 100) under which the danger state begins. */
export const LOW_HEALTH = 30;
/** Health at which it is as deep as it gets. */
const DEEPEST_HEALTH = 5;

/** How deep in danger `health` is: 0 at 30 and above (or with no player: null), 1 at 5 and under. */
export function dangerLevel(health: number | null): number {
  if (health === null || !Number.isFinite(health) || health <= 0 || health >= LOW_HEALTH) return 0;
  return Math.min(1, (LOW_HEALTH - health) / (LOW_HEALTH - DEEPEST_HEALTH));
}

/** The low-pass over the world, fully open, just under 30 health, and at the deepest (Hz). */
export const WORLD_OPEN_HZ = 20000;
const SHALLOW_HZ = 9000;
const DEEP_HZ = 1100;

/** The world's low-pass cutoff (Hz) at `health`: open at 30 and above, then closing from 9 kHz to 1.1 kHz. */
export function dangerCutoff(health: number | null): number {
  const k = dangerLevel(health);
  return k <= 0 ? WORLD_OPEN_HZ : SHALLOW_HZ * Math.pow(DEEP_HZ / SHALLOW_HZ, k);
}

/** Seconds between heartbeats at the edge of danger and at its deepest: 66 a minute rising to 140. */
const BEAT_GAP = [0.91, 0.43] as const;

/** Seconds from one heartbeat to the next at `health` (under 30). */
export function heartbeatGap(health: number): number {
  const k = dangerLevel(health);
  return BEAT_GAP[0] + (BEAT_GAP[1] - BEAT_GAP[0]) * k;
}

/**
 * How loud a beat is at `health`, 0..1: it comes in quietly and fills out. Even at its fullest
 * it sits well under the Preparation's heart (which has a silent world to itself): by the meters
 * about 8 dB under your own rifle, so a fight is still heard over it.
 */
export const HEARTBEAT_FULL = 0.45;
export function heartbeatLevel(health: number): number {
  return HEARTBEAT_FULL * (0.4 + 0.6 * dangerLevel(health));
}

/** Beats are queued this far ahead (s), so a slow frame doesn't drop one. */
const LOOKAHEAD = 0.15;

export interface Beat {
  /** Seconds from `clock` to the beat. */
  readonly when: number;
  readonly intensity: number;
}

/** When the heart beats: nothing above 30 health, then one beat after another, the gap following health as it changes. */
export class Heartbeat {
  #next: number | null = null;

  /** The beats due by `clock` (s, any steady clock) at `health` (null: no player, or dead). */
  update(health: number | null, clock: number): Beat[] {
    if (dangerLevel(health) <= 0 || health === null) {
      this.#next = null;
      return [];
    }
    // The first beat lands at once: the hit that put you here is the cue.
    if (this.#next === null || this.#next < clock - 1) this.#next = clock;
    const beats: Beat[] = [];
    while (this.#next <= clock + LOOKAHEAD) {
      beats.push({ when: Math.max(0, this.#next - clock), intensity: heartbeatLevel(health) });
      this.#next += heartbeatGap(health);
    }
    return beats;
  }
}

/** A close blast's ringing ears: how long the tone lasts, and how the world sits under it. */
export const TINNITUS = {
  seconds: 1.6,
  /** The tone (Hz) and a quieter partner just off it, so it beats like the real thing. */
  tones: [4150, 6230] as const,
  /** The tone's peak gain at full strength. */
  gain: 0.04,
  /** The world's gain and cutoff (Hz) the moment after the blast, and the time constant (s) they come back with. */
  worldGain: 0.22,
  worldCutoff: 450,
  recover: 0.55,
} as const;

/**
 * How hard a blast `distance` m off that did `damage` rings the ears, 0..1: nothing past 9 m or
 * without damage, everything at point blank.
 */
export function tinnitusStrength(distance: number, damage: number): number {
  if (!(damage > 0) || !Number.isFinite(distance)) return 0;
  const near = Math.min(1, Math.max(0, 1 - distance / 9));
  return near <= 0 ? 0 : Math.min(1, 0.35 + 0.65 * near) * Math.min(1, 0.4 + damage / 60);
}
