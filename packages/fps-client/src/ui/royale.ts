import { STATS, type BattleRoyaleState, type PlayerId, type Score, type Vec3 } from '@duty-shooter/fps-core';

/**
 * What the Battle Royale HUD reads off the match: where the Ring stands now,
 * the line under the compass, the compass itself and your placement. Plain
 * numbers, no DOM and no three.js, so the HUD, the island map and the wall in
 * the world all agree, and tests can check them.
 */

export interface RingCircle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** Where the wall stands at simulation time `time`: the Stage's circle while it holds, then closing on the next one. */
export function ringNow(state: BattleRoyaleState, time: number): RingCircle {
  const span = state.shrinkEnd - state.shrinkAt;
  const f = span <= 0 ? (time >= state.shrinkEnd ? 1 : 0) : Math.max(0, Math.min(1, (time - state.shrinkAt) / span));
  const { circle: a, next: b } = state;
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, radius: a.radius + (b.radius - a.radius) * f };
}

export type RingPhase = 'hold' | 'closing' | 'closed';

export interface RingStatus {
  readonly stage: number;
  readonly stages: number;
  /** Holding, closing on the next circle, or closed for good after the last Stage. */
  readonly phase: RingPhase;
  /** Seconds to the shrink (holding) or to its end (closing); null once closed. */
  readonly seconds: number | null;
  readonly outside: boolean;
  /** Metres to the wall from outside it; 0 inside. */
  readonly toSafety: number;
  /** Metres to the next circle's edge from outside it (to its point, for the last); 0 inside it, or with no position. */
  readonly toNext: number;
  /** HP a second outside it this Stage. */
  readonly damage: number;
}

/** How many Stages a Ring has. */
export const RING_STAGES = Object.keys(STATS.royale.ring).length;

/** The Ring line: which Stage, what the wall is doing and for how long, and whether `at` stands outside it. */
export function ringStatus(state: BattleRoyaleState, time: number, at: Vec3 | null): RingStatus {
  const phase: RingPhase = time < state.shrinkAt ? 'hold' : time < state.shrinkEnd ? 'closing' : state.stage >= RING_STAGES ? 'closed' : 'closing';
  const seconds = phase === 'hold' ? round(state.shrinkAt - time) : phase === 'closing' ? round(Math.max(0, state.shrinkEnd - time)) : null;
  const ring = ringNow(state, time);
  const out = at ? Math.hypot(at[0] - ring.x, at[2] - ring.z) - ring.radius : 0;
  const toNext = at ? Math.max(0, Math.hypot(at[0] - state.next.x, at[2] - state.next.z) - state.next.radius) : 0;
  return { stage: state.stage, stages: RING_STAGES, phase, seconds, outside: out > 0, toSafety: Math.max(0, out), toNext, damage: state.damage };
}

/** To a tenth of a second, so the HUD's string doesn't change faster than it can be read. */
const round = (s: number): number => Math.round(s * 10) / 10;

/** Degrees in [0, 360). */
const wrap = (deg: number): number => {
  const d = Math.round(deg * 1e6) / 1e6 % 360;
  return d < 0 ? d + 360 : d + 0;
};

/** A view's compass heading: degrees clockwise from north (-z), from the simulation's yaw (0 north, positive turning west). */
export function heading(yaw: number): number {
  return wrap((-yaw * 180) / Math.PI);
}

/** Compass bearing from one ground point (x, z) to another. */
export function bearing(from: readonly [number, number], to: readonly [number, number]): number {
  return wrap((Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI);
}

/** Signed degrees from `from` to `to`, in [-180, 180). */
const turn = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/** Where a bearing sits on a compass strip showing `span` degrees round `heading`: -0.5 (left edge) to 0.5, pinned to an edge out of view. */
export function compassOffset(headingDeg: number, target: number, span: number): { x: number; pinned: boolean } {
  const x = turn(headingDeg, target) / span;
  return Math.abs(x) <= 0.5 ? { x, pinned: false } : { x: x < 0 ? -0.5 : 0.5, pinned: true };
}

export interface CompassTick {
  /** -0.5 (left edge) to 0.5 across the strip. */
  readonly x: number;
  readonly label: string;
  /** One of the eight named points. */
  readonly point: boolean;
}

const POINTS: Readonly<Record<number, string>> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const TICK = 15;

/** The strip's ticks every 15 degrees across `span` round `heading`, the eight points named and the rest numbered. */
export function compassTicks(headingDeg: number, span: number): CompassTick[] {
  const ticks: CompassTick[] = [];
  const first = Math.ceil((headingDeg - span / 2) / TICK) * TICK;
  for (let deg = first; deg <= headingDeg + span / 2; deg += TICK) {
    const d = wrap(deg);
    ticks.push({ x: (deg - headingDeg) / span + 0, label: POINTS[d] ?? String(d), point: d in POINTS });
  }
  return ticks;
}

/** Your Squad's place out of the Squads that started, once it has gone out or won; null before then or without a seat. */
export function placement(scores: readonly Score[], selfId: PlayerId | null): { place: number; of: number } | null {
  const me = scores.find((s) => s.id === selfId);
  if (!me || me.place === undefined) return null;
  return { place: me.place, of: new Set(scores.map((s) => s.team)).size };
}
