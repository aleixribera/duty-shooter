import { describe, expect, it } from 'vitest';
import { STATS } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { hold, me, soloMatch, ticks, tolerance } from './support/movement';

const { fallDamage, health } = STATS;

/** Drops the player from `height` metres above the floor and returns every tick's outputs until well after landing. */
function fall(height: number) {
  const match = soloMatch({ position: [0, height, 0] });
  const outputs = hold(match, ticks(3), usercmd());
  return { match, outputs, last: me(match.latest) };
}

describe('fall damage', () => {
  it('starts at full health', () => {
    const match = soloMatch();
    expect(me(match.step()).health).toBe(health.max.value);
    expect(me(match.latest).alive).toBe(true);
  });

  it('does no damage below the minimum fall-damage height', () => {
    const height = fallDamage.minHeight.value - tolerance(fallDamage.minHeight);
    const { outputs, last } = fall(height);

    expect(last.health).toBe(health.max.value);
    const landings = outputs.filter((p) => p.landing !== null);
    expect(landings).toHaveLength(1);
    expect(landings[0]?.landing?.damage).toBe(0);
    expect(landings[0]?.landing?.fallHeight).toBeCloseTo(height, 9);
  });

  it('damages from just above the minimum height', () => {
    const { last } = fall(fallDamage.minHeight.value + tolerance(fallDamage.minHeight));

    expect(last.health).toBeLessThan(health.max.value);
    expect(last.alive).toBe(true);
  });

  it('takes half of max health halfway between the minimum and lethal heights (linear curve)', () => {
    const { last } = fall((fallDamage.minHeight.value + fallDamage.lethalHeight.value) / 2);

    expect(last.health).toBeCloseTo(health.max.value / 2, 6);
  });

  it('kills from the lethal height, and a dead player no longer moves', () => {
    const { match, last } = fall(fallDamage.lethalHeight.value + tolerance(fallDamage.lethalHeight));

    expect(last).toMatchObject({ health: 0, alive: false });
    const after = hold(match, ticks(1), usercmd({ forward: 1, buttons: ['Jump'] }));
    expect(after.at(-1)?.position).toEqual(last.position);
  });

  it('reports each landing once, on the tick it happens, with the height fallen', () => {
    const match = soloMatch();
    const outputs = hold(match, ticks(1.5), usercmd({ buttons: ['Jump'] }));

    const landings = outputs.filter((p) => p.landing !== null);
    expect(landings).toHaveLength(1);
    expect(landings[0]?.landing?.fallHeight).toBeCloseTo(Math.max(...outputs.map((p) => p.position[1])), 2);
    expect(landings[0]?.landing?.damage).toBe(0);
  });
});
