import { describe, expect, it } from 'vitest';
import { STATS, type Stat, type UserCmd } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { FLOOR, durationWhile, expectStat, hold, me, soloMatch, ticks, tolerance } from './support/movement';

const { mantle, movement, stance } = STATS;

const jump = usercmd({ buttons: ['Jump'] });

/** A deep ledge of `height` ahead of the spawn (the player looks down -Z), its face `gap` metres from the player's hull. */
function ledge(height: number, gap = mantle.reach.value / 2) {
  const face = -(stance.hullHalfWidth.value + gap);
  return box({ min: [-2, 0, face - 5], max: [2, height, face], material: 'concrete' });
}

function jumpAt(height: number, options: { gap?: number; cmd?: UserCmd } = {}) {
  const match = soloMatch({ solids: [FLOOR, ledge(height, options.gap)] });
  const outputs = hold(match, ticks(2), options.cmd ?? jump);
  return { outputs, last: me(match.latest) };
}

const bands: { name: 'lowVault' | 'waist' | 'highClimb'; max: Stat; duration: Stat }[] = [
  { name: 'lowVault', max: mantle.lowVaultMaxHeight, duration: mantle.lowVaultDuration },
  { name: 'waist', max: mantle.waistMantleMaxHeight, duration: mantle.waistMantleDuration },
  { name: 'highClimb', max: mantle.highClimbMaxHeight, duration: mantle.highClimbDuration },
];

describe('mantle', () => {
  it.each(bands)('mantles onto a $name ledge in its duration and ends standing on top', ({ name, max, duration }) => {
    const height = max.value - tolerance(max);
    const { outputs, last } = jumpAt(height);

    expect(outputs[0]).toMatchObject({ movement: 'mantle', mantle: name });
    expectStat(durationWhile(outputs, 0, (p) => p.movement === 'mantle'), duration, `${name} duration`);
    expect(last.position[1]).toBeCloseTo(height, 9);
    expect(last.movement).toBe('walk');
    expect(last.mantle).toBeNull();
    // Fully onto the ledge: the hull's back edge is past the ledge face.
    expect(last.position[2]).toBeLessThanOrEqual(-(2 * stance.hullHalfWidth.value + mantle.reach.value / 2) + 1e-9);
  });

  it.each([
    { from: 'lowVault', to: 'waist', edge: mantle.lowVaultMaxHeight },
    { from: 'waist', to: 'highClimb', edge: mantle.waistMantleMaxHeight },
  ])('picks the $to band just above the top of the $from band', ({ to, edge }) => {
    const { outputs } = jumpAt(edge.value + tolerance(edge));

    expect(outputs[0]).toMatchObject({ movement: 'mantle', mantle: to });
  });

  it('starts the low vault just above the step height', () => {
    const { outputs } = jumpAt(movement.stepHeight.value + tolerance(movement.stepHeight));

    expect(outputs[0]).toMatchObject({ movement: 'mantle', mantle: 'lowVault' });
  });

  it('just jumps at a ledge above the highest band', () => {
    const top = mantle.highClimbMaxHeight;
    const { outputs, last } = jumpAt(top.value + tolerance(top));

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
    expect(outputs[0]?.movement).toBe('airborne');
    expect(last.position[1]).toBe(0);
  });

  it('just jumps when the ledge is out of reach', () => {
    const { outputs } = jumpAt(mantle.waistMantleMaxHeight.value, { gap: mantle.reach.value * 2 });

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
  });

  it('is committal: input during the mantle does not change it', () => {
    const height = mantle.waistMantleMaxHeight.value - tolerance(mantle.waistMantleMaxHeight);
    const plain = jumpAt(height);
    const fighting = soloMatch({ solids: [FLOOR, ledge(height)] });
    fighting.step({ p: jump });
    const outputs = hold(fighting, ticks(2), usercmd({ forward: -1, right: 1, buttons: ['Crouch', 'Sprint'] }));

    expect(durationWhile(outputs, 0, (p) => p.movement === 'mantle')).toBeCloseTo(
      durationWhile(plain.outputs, 1, (p) => p.movement === 'mantle'),
      9,
    );
    const atTop = outputs.find((p) => p.movement !== 'mantle');
    expect(atTop?.position[1]).toBeCloseTo(height, 9);
  });

  it('does not mantle when there is no room to stand on the ledge', () => {
    const height = mantle.lowVaultMaxHeight.value;
    const face = -(stance.hullHalfWidth.value + mantle.reach.value / 2);
    const lowCeiling = height + (stance.crouchHullHeight.value + stance.standHullHeight.value) / 2;
    const low = box({ min: [-2, lowCeiling, face - 5], max: [2, lowCeiling + 1, face], material: 'concrete' });
    const match = soloMatch({ solids: [FLOOR, ledge(height), low] });

    const outputs = hold(match, ticks(1), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
  });
});
