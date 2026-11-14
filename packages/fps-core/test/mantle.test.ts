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

  it('mantles onto a sloped roof of fine steps, ending on the highest step under the hull', () => {
    // A roof edge 1.8 m up (high climb), then 5 cm steps rising away from the player every 0.25 m.
    const face = -(stance.hullHalfWidth.value + mantle.reach.value / 2);
    const steps = Array.from({ length: 16 }, (_, i) =>
      box({ min: [-2, 0, face - 0.25 * (i + 1)], max: [2, 1.8 + 0.05 * i, face - 0.25 * i], material: 'wood', blocks: 'players' }),
    );
    const match = soloMatch({ solids: [FLOOR, ...steps] });
    const outputs = hold(match, ticks(2), jump);
    const last = me(match.latest);

    expect(outputs[0]).toMatchObject({ movement: 'mantle', mantle: 'highClimb' });
    expect(last.movement).toBe('walk');
    // Standing on the steps, no lower than the edge and within a step of it.
    expect(last.position[1]).toBeGreaterThan(1.8);
    expect(last.position[1]).toBeLessThanOrEqual(1.8 + movement.stepHeight.value);
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

  it('pulls up before it goes over: the feet clear the top before they pass the face (ticket 67)', () => {
    for (const { max } of bands) {
      const height = max.value - tolerance(max);
      const face = -(stance.hullHalfWidth.value + mantle.reach.value / 2);
      const { outputs } = jumpAt(height);
      const during = outputs.filter((p) => p.movement === 'mantle');
      // The hull's front edge past the face only once the feet are within a hand of the top.
      for (const p of during) if (p.position[2] - stance.hullHalfWidth.value < face) expect(p.position[1], `${max.value} m`).toBeGreaterThan(height - 0.25);
      // Rising from the start, and still moving on toward the ledge to the end.
      expect(during[0]!.velocity[1]).toBeGreaterThan(0);
      expect(during.at(-2)!.velocity[2]).toBeLessThan(0);
    }
  });

  it('does not mantle onto a ledge at its back: a face the hull leans on from the front is not ahead', () => {
    // Backed up against a waist-high car deck while looking away, as a bot that walks up to it looking round does.
    const height = mantle.waistMantleMaxHeight.value - tolerance(mantle.waistMantleMaxHeight);
    const behind = box({ min: [-2, 0, stance.hullHalfWidth.value], max: [2, height, stance.hullHalfWidth.value + 5], material: 'concrete' });
    const match = soloMatch({ solids: [FLOOR, behind] });

    const outputs = hold(match, ticks(1), jump);

    expect(outputs.some((p) => p.movement === 'mantle')).toBe(false);
    expect(outputs[0]?.movement).toBe('airborne');
    // The same face in front, touching the hull, is a ledge.
    expect(jumpAt(height, { gap: 0 }).outputs[0]).toMatchObject({ movement: 'mantle', mantle: 'waist' });
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

describe('a bot wedged at a ledge its route walks up (ticket 67)', () => {
  it('mantles it: the route took stairs that are not there, so it climbs where it stands', async () => {
    const { Bot, Simulation, botProfile, buildNavGraph, createWorld } = await import('@duty-shooter/fps-core');
    // A 1.2 m platform. The nav was built with steps up its front (0.3 m each, a walk, not a climb); the world has none.
    const platform = box({ min: [-3, 0, -12], max: [3, 1.2, -7.5], material: 'concrete' });
    const steps = [1, 2, 3].map((k) => box({ min: [-3, 0, -5.5 - k + 1], max: [3, k * 0.3, -4.5 - k + 1], material: 'concrete' }));
    const nav = buildNavGraph(createWorld([FLOOR, platform, ...steps]), { area: [[-10, -16], [10, -16], [10, 6], [-10, 6]], spacing: 1 });
    const world = createWorld([FLOOR, platform]);
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'b', team: 1, position: [0, 0, 2], yaw: 0 });
    const bot = new Bot('b', botProfile('Vandal'), nav, world);
    let out = sim.output();
    let mantled = false;
    for (let i = 0; i < ticks(8); i++) {
      const self = out.players[0]!;
      out = sim.step({ b: bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events: out.events, isEnemy: () => false, objective: { position: [0, 1.2, -10], radius: 1 } }) });
      if (out.players[0]!.movement === 'mantle') mantled = true;
    }
    expect(mantled).toBe(true);
    expect(out.players[0]!.position[1]).toBeCloseTo(1.2, 1);
  });
});
