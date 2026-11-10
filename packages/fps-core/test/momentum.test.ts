import { describe, expect, it } from 'vitest';
import { STATS, TICK_SECONDS, type PlayerOutput } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { hold, holdUntil, horizontalSpeed, me, soloMatch, ticks } from './support/movement';

/**
 * Momentum (next-level ticket 21): speed earned in a slide is kept until the
 * feet give it back. A slide out of a full sprint starts faster than the
 * sprint, a jump out of it carries that speed through the air, a landing
 * taken crouched at a run becomes a slide, and none of it can be had by
 * hammering the crouch key.
 */

const { movement, slide } = STATS;

const run = usercmd({ forward: 1, buttons: ['Sprint'] });
const slideCmd = usercmd({ forward: 1, buttons: ['Sprint', 'Crouch'] });
const sprintSpeed = movement.sprintSpeed.value;
const kicked = sprintSpeed * slide.kick.value;

/** A match whose player has been sprinting for `seconds`. */
function sprinting(seconds = 1.5) {
  const match = soloMatch();
  hold(match, ticks(seconds), run);
  return match;
}

const airborne = (p: PlayerOutput) => p.movement === 'airborne';

describe('the slide has a kick', () => {
  it('starts faster than the sprint it came out of, and ends slower', () => {
    const match = sprinting();

    const outputs = hold(match, ticks(slide.duration.value), slideCmd);

    expect(horizontalSpeed(outputs[0]!)).toBeGreaterThan(sprintSpeed * 1.08);
    expect(horizontalSpeed(outputs[0]!)).toBeLessThanOrEqual(kicked + 1e-6);
    expect(horizontalSpeed(outputs.at(-1)!)).toBeLessThan(sprintSpeed * 0.75);
  });

  it('has none without a run-up: a sprint just begun slides at the speed it has', () => {
    const match = sprinting(slide.runUp.value / 2);
    const before = horizontalSpeed(me(match.latest));

    const first = me(match.step({ p: slideCmd }));

    expect(first.movement).toBe('slide');
    expect(horizontalSpeed(first)).toBeLessThanOrEqual(before + 1e-6);
  });

  it('cannot be had again by cancelling the slide and sliding straight away', () => {
    const match = sprinting();
    hold(match, ticks(slide.cancelWindowOpen.value) + 1, slideCmd);
    // Up out of it, a few steps, and down again.
    hold(match, 4, run);

    const again = hold(match, ticks(0.2), slideCmd);

    expect(again[0]!.movement).toBe('slide');
    for (const p of again) expect(horizontalSpeed(p)).toBeLessThanOrEqual(sprintSpeed + 1e-6);
  });

  it('comes back after the run-up has been run again', () => {
    const match = sprinting();
    holdUntil(match, slideCmd, (p) => p.movement !== 'slide');
    hold(match, ticks(slide.runUp.value) + ticks(0.3), run);

    const first = me(match.step({ p: slideCmd }));

    expect(horizontalSpeed(first)).toBeGreaterThan(sprintSpeed * 1.08);
  });

  it('is scaled with the weapon in hand, like the sprint', () => {
    // Nothing a weapon slows can slide faster than that weapon's own sprint, kicked.
    const match = sprinting();
    const sprintNow = horizontalSpeed(me(match.latest));

    const first = me(match.step({ p: slideCmd }));

    expect(horizontalSpeed(first)).toBeLessThanOrEqual(sprintNow * slide.kick.value + 1e-6);
  });
});

describe('a jump out of a slide', () => {
  it('carries the slide speed through the whole flight, faster than a sprint', () => {
    const match = sprinting();
    hold(match, ticks(slide.cancelWindowOpen.value) + 1, slideCmd);
    const sliding = horizontalSpeed(me(match.latest));
    expect(sliding).toBeGreaterThan(sprintSpeed);

    const takeoff = me(match.step({ p: usercmd({ forward: 1, buttons: ['Sprint', 'Crouch', 'Jump'] }) }));
    expect(takeoff.movement).toBe('airborne');
    const flight = [takeoff, ...holdUntil(match, run, (p) => !airborne(p)).slice(0, -1)];

    expect(flight.length).toBeGreaterThan(ticks(0.4));
    for (const p of flight) expect(horizontalSpeed(p)).toBeGreaterThan(sprintSpeed);
    // Nothing in the air takes speed away: what the slide had a tick later is what the flight ends with.
    expect(horizontalSpeed(flight.at(-1)!)).toBeGreaterThan(sliding - 0.15);
  });

  it('gives the speed back to the ground: a second of running later it is a sprint again', () => {
    const match = sprinting();
    hold(match, ticks(slide.cancelWindowOpen.value) + 1, slideCmd);
    match.step({ p: usercmd({ forward: 1, buttons: ['Sprint', 'Crouch', 'Jump'] }) });
    holdUntil(match, run, (p) => !airborne(p));

    const after = hold(match, ticks(1), run);

    expect(horizontalSpeed(after.at(-1)!)).toBeCloseTo(sprintSpeed, 1);
  });
});

describe('landing into a slide', () => {
  const jump = usercmd({ forward: 1, buttons: ['Sprint', 'Jump'] });
  const tucked = usercmd({ forward: 1, buttons: ['Sprint', 'Crouch'] });

  it('slides out of a running jump that is landed crouched, at the speed it landed with', () => {
    const match = sprinting();
    match.step({ p: jump });
    const flight = holdUntil(match, tucked, (p) => !airborne(p));
    const landed = flight.at(-1)!;

    const next = hold(match, 3, tucked);

    expect(next[0]!.movement).toBe('slide');
    expect(next[0]!.stance).toBe('crouch');
    // No kick: it keeps what it had and loses it from there.
    expect(horizontalSpeed(next[0]!)).toBeLessThanOrEqual(horizontalSpeed(landed) + 1e-6);
    expect(horizontalSpeed(next[0]!)).toBeGreaterThan(sprintSpeed * 0.9);
  });

  it('does not slide out of a walking jump landed crouched', () => {
    const match = soloMatch();
    hold(match, ticks(1), usercmd({ forward: 1 }));
    match.step({ p: usercmd({ forward: 1, buttons: ['Jump'] }) });
    holdUntil(match, usercmd({ forward: 1, buttons: ['Crouch'] }), (p) => !airborne(p));

    const next = hold(match, 5, usercmd({ forward: 1, buttons: ['Crouch'] }));

    expect(next.some((p) => p.movement === 'slide')).toBe(false);
  });

  it('does not slide out of a running jump landed standing', () => {
    const match = sprinting();
    match.step({ p: jump });
    holdUntil(match, run, (p) => !airborne(p));

    const next = hold(match, 5, run);

    expect(next.some((p) => p.movement === 'slide')).toBe(false);
  });
});

describe('air control', () => {
  it('lets a standing jump pick up most of a walk before it lands, and no more than a walk', () => {
    const match = soloMatch();
    hold(match, 5, usercmd({}));
    match.step({ p: usercmd({ forward: 1, buttons: ['Jump'] }) });

    const flight = holdUntil(match, usercmd({ forward: 1 }), (p) => !airborne(p)).slice(0, -1);

    const seconds = flight.length * TICK_SECONDS;
    const reached = horizontalSpeed(flight.at(-1)!);
    const walk = movement.walkSpeed.value;
    expect(reached).toBeCloseTo(Math.min(walk, movement.airAcceleration.value * walk * seconds), 0);
    expect(reached).toBeGreaterThan(walk * 0.75);
    expect(reached).toBeLessThanOrEqual(walk + 1e-6);
  });
});
