import { LAST_MINUTE, LAST_TEN } from './hud/match-clock';
import { LOW_HEALTH } from './audio/danger';

/**
 * The last minute away from the HUD (ticket 24): the light the picture takes
 * as the clock runs out, the beat on each of the last ten seconds, and what
 * the announcer says on the way. And low health's share of the picture
 * (ticket 12): how far the colour has drained.
 */

/**
 * How far the last minute's light has come: 0 before it, 1 with the clock at
 * nothing. It moves fastest at the start, so the minute is seen to begin, and
 * is half way there a third of the way in.
 */
export function lastMinuteLight(secondsLeft: number | null): number {
  if (secondsLeft === null || !(secondsLeft < LAST_MINUTE)) return 0;
  const left = Math.max(0, secondsLeft) / LAST_MINUTE;
  return 1 - left ** 1.6;
}

/** How long a beat takes to fall to about a third (s). */
const BEAT_FALL = 0.11;

/** The beat of the last ten seconds: 1 as each second turns, gone by the next. Nothing before them, or once the clock is out. */
export function lastTenBeat(secondsLeft: number | null): number {
  if (secondsLeft === null || secondsLeft > LAST_TEN || secondsLeft <= 0) return 0;
  return Math.exp(-(Math.ceil(secondsLeft) - secondsLeft) / BEAT_FALL);
}

export interface CountdownCall {
  /** Seconds left at which it is called. */
  readonly at: number;
  /** What the announcer says. */
  readonly say: string;
  /** What the HUD writes, or null where the clock itself says it. */
  readonly show: string | null;
}

/** What a map's clock runs out on: the bomb, Switchyard's freight train, or nothing of its own. */
export type MapEnding = 'nuke' | 'train' | null;

/** What the first call adds for the map: the last minute is the countdown to its ending, and says which. */
const ENDING_LINES: Readonly<Record<NonNullable<MapEnding>, string>> = {
  nuke: 'This site will be destroyed.',
  train: 'Clear the main line.',
};

export const COUNTDOWN_CALLS: readonly CountdownCall[] = [
  { at: 60, say: 'T minus sixty seconds', show: 'T-minus 60 seconds.' },
  { at: 30, say: 'Thirty seconds', show: null },
  { at: 10, say: 'Ten seconds', show: null },
];

/** A clock that moved more than this between two frames (s) was set, not run: nothing is called for what it skipped. */
const CLOCK_RUNS = 2;

/** The call the clock passed between two frames, or null. A clock first seen, set or standing still passes none. */
export function countdownCall(before: number | null, now: number | null): CountdownCall | null {
  if (before === null || now === null || !(now < before) || before - now > CLOCK_RUNS) return null;
  return COUNTDOWN_CALLS.find((c) => before > c.at && now <= c.at) ?? null;
}

/**
 * The clock to measure the next frame's against. A clock runs down; online it
 * also steps back a little whenever the estimate of the server's time is
 * corrected, and a mark it had passed would be passed again. So a small step
 * back is not followed: the lowest reading stands until the clock is under it
 * again. A clock that is set (a new match), or gone, starts afresh.
 */
export function clockRan(before: number | null, now: number | null): number | null {
  if (before === null || now === null) return now;
  return now > before && now - before <= CLOCK_RUNS ? before : now;
}

/** What the HUD writes for `call` on a map that ends in `ending`, or null where the clock itself says it. */
export function countdownLine(call: CountdownCall, ending: MapEnding): string | null {
  if (call.show === null) return null;
  return ending ? `${call.show} ${ENDING_LINES[ending]}` : call.show;
}

/** Health at which the colour is all but gone. */
const DRAINED_AT = 8;

/** How far low health has drained the picture's colour: 0 at 30 health and over (and dead), 1 at 8 and under. */
export function colourDrain(health: number | null): number {
  if (health === null || health <= 0 || health >= LOW_HEALTH) return 0;
  return Math.min(1, (LOW_HEALTH - health) / (LOW_HEALTH - DRAINED_AT));
}

/** `from` moved toward `to` at `rate` a second: what eases the picture's moods, so neither a hit nor a respawn snaps it. */
export function eased(from: number, to: number, rate: number, dt: number): number {
  const step = rate * Math.max(0, dt);
  return Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step;
}
