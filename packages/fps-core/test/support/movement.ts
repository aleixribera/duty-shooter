import { expect } from 'vitest';
import { TICK_SECONDS, type PlayerOutput, type Stat, type TickOutput, type UserCmd } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import type { Solid } from '@duty-shooter/fps-core';

/** A large flat concrete floor whose top surface is y = 0. */
export const FLOOR = box({ min: [-200, -1, -200], max: [200, 0, 200], material: 'concrete' });

/** A single-player match on the given solids (a flat floor by default), player 'p' at the origin facing -Z. */
export function soloMatch(options: { solids?: readonly Solid[]; position?: readonly [number, number, number]; yaw?: number } = {}): HeadlessMatch {
  return createHeadlessMatch({
    solids: options.solids ?? [FLOOR],
    players: [{ id: 'p', team: 1, position: options.position ?? [0, 0, 0], ...(options.yaw === undefined ? {} : { yaw: options.yaw }) }],
  });
}

/** The single player's outputs from a tick. */
export function me(output: TickOutput): PlayerOutput {
  const player = output.players[0];
  if (!player) throw new Error('no player in the match outputs');
  return player;
}

/** Number of whole ticks in `seconds`. */
export function ticks(seconds: number): number {
  return Math.round(seconds / TICK_SECONDS);
}

/** Steps `count` ticks with the same usercmd for 'p' and returns each tick's player outputs. */
export function hold(match: HeadlessMatch, count: number, cmd: UserCmd): PlayerOutput[] {
  return match.run(count, () => ({ p: cmd })).map(me);
}

/** Steps with the same usercmd until `done` is true for the player's outputs (inclusive), up to `maxTicks`. */
export function holdUntil(match: HeadlessMatch, cmd: UserCmd, done: (p: PlayerOutput) => boolean, maxTicks = ticks(30)): PlayerOutput[] {
  const outputs: PlayerOutput[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const p = me(match.step({ p: cmd }));
    outputs.push(p);
    if (done(p)) return outputs;
  }
  throw new Error(`condition not reached within ${maxTicks} ticks`);
}

/** Horizontal speed (m/s) from the reported velocity. */
export function horizontalSpeed(player: PlayerOutput): number {
  return Math.hypot(player.velocity[0], player.velocity[2]);
}

/** Horizontal distance (m) between two reported positions. */
export function horizontalDistance(a: PlayerOutput, b: PlayerOutput): number {
  return Math.hypot(b.position[0] - a.position[0], b.position[2] - a.position[2]);
}

/**
 * Average horizontal speed over the last second of `outputs`, measured from
 * reported positions so it checks real displacement, not just the velocity field.
 */
export function measuredSpeed(outputs: readonly PlayerOutput[]): number {
  const window = ticks(1);
  const end = outputs.at(-1);
  const start = outputs.at(-1 - window);
  if (!end || !start) throw new Error(`need more than ${window} ticks of outputs`);
  return horizontalDistance(start, end) / (window * TICK_SECONDS);
}

/** The test tolerance the stats file gives a value. Fails loudly if it has none. */
export function tolerance(stat: Stat): number {
  const t = stat.provenance.tolerance;
  if (t === undefined) throw new Error('this stat has no tolerance in the stats file, so a test cannot check it');
  return t;
}

/** Asserts `actual` is within the stat's tolerance of its value. */
export function expectStat(actual: number, stat: Stat, label = 'value'): void {
  const t = tolerance(stat);
  expect(actual, `${label} ${actual} should be ${stat.value} ± ${t} ${stat.unit}`).toBeGreaterThanOrEqual(stat.value - t);
  expect(actual, `${label} ${actual} should be ${stat.value} ± ${t} ${stat.unit}`).toBeLessThanOrEqual(stat.value + t);
}

/** Seconds covered by the run of consecutive outputs matching `predicate`, starting at index `from`. */
export function durationWhile(outputs: readonly PlayerOutput[], from: number, predicate: (p: PlayerOutput) => boolean): number {
  let count = 0;
  for (let i = from; i < outputs.length && predicate(outputs[i] as PlayerOutput); i++) count++;
  return count * TICK_SECONDS;
}
