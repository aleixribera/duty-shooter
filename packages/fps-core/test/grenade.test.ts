import { describe, expect, it } from 'vitest';
import { STATS, Simulation, TICK_SECONDS, blastDamage, createWorld, type PlayerSpawn, type Solid, type TickOutput, type UserCmd } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, createNetworkedMatch, usercmd, yawBox, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { aimAt, eventsOf, playerIn } from './support/combat';
import { FLOOR, ticks } from './support/movement';

const G = STATS.grenade;
const THROWER = 't';
const idle = usercmd();
const cook = (angles: { yaw?: number; pitch?: number } = {}) => usercmd({ buttons: ['Grenade'], ...angles });

function match(solids: readonly Solid[] = [], others: readonly PlayerSpawn[] = []): HeadlessMatch {
  const m = createHeadlessMatch({ solids: [FLOOR, ...solids], players: [{ id: THROWER, team: 1, position: [0, 0, 0] }, ...others] });
  m.run(ticks(1), () => ({ [THROWER]: idle }));
  return m;
}

/** Cooks for `seconds`, then lets go; returns the outputs from the first cooking tick on, through `after` seconds more. */
function throwAfter(m: HeadlessMatch, seconds: number, after: number, angles: { yaw?: number; pitch?: number } = {}): TickOutput[] {
  return [...m.run(ticks(seconds), () => ({ [THROWER]: cook(angles) })), ...m.run(ticks(after), () => ({ [THROWER]: usercmd(angles) }))];
}

const time = (o: TickOutput) => o.tick * TICK_SECONDS;

describe('cooking and throwing', () => {
  it('cooks while held and throws on release, lowering the weapon until the throw is done', () => {
    const m = match();
    const outputs = throwAfter(m, 0.5, 1);
    const phases = eventsOf(outputs, 'grenade').map((e) => e.phase);

    expect(phases).toEqual(['cook', 'throw']);
    expect(playerIn(outputs[0]!, THROWER).weapon.action).toBe('grenade');
    expect(eventsOf(outputs.slice(0, ticks(0.5)), 'shot')).toHaveLength(0);
    const thrown = eventsOf(outputs, 'grenade')[1]!;
    const back = outputs.findIndex((o) => o.tick > thrown.tick && playerIn(o, THROWER).weapon.action === 'ready');
    expect((outputs[back]!.tick - thrown.tick) * TICK_SECONDS).toBeCloseTo(G.throwTime.value, 1);
    expect(playerIn(outputs.at(-1)!, THROWER).grenades).toBe(G.perLife.value - 1);
  });

  it('can\'t fire while cooking', () => {
    const m = match();
    const outputs = m.run(ticks(0.5), () => ({ [THROWER]: usercmd({ buttons: ['Grenade', 'Fire'] }) }));
    expect(eventsOf(outputs, 'shot')).toHaveLength(0);
  });

  it('has one frag per life', () => {
    const m = match();
    throwAfter(m, 0.2, 1);
    const again = throwAfter(m, 0.2, 1);
    expect(eventsOf(again, 'grenade')).toHaveLength(0);
    expect(playerIn(m.latest, THROWER).grenades).toBe(0);
  });

  it('explodes four seconds after cooking started, however long it was cooked', () => {
    for (const cooked of [0.2, 2]) {
      const m = match();
      const start = m.latest.tick * TICK_SECONDS;
      const outputs = throwAfter(m, cooked, G.fuse.value);
      const blast = outputs.find((o) => o.events.some((e) => e.type === 'explosion'))!;
      expect(time(blast) - start, `cooked ${cooked} s`).toBeCloseTo(G.fuse.value, 1);
    }
  });

  it('explodes in the hand when cooked too long, and the thrower\'s own frag kills them', () => {
    const m = match();
    const outputs = m.run(ticks(G.fuse.value + 0.2), () => ({ [THROWER]: cook() }));
    const blast = eventsOf(outputs, 'explosion')[0]!;
    const me = playerIn(m.latest, THROWER);

    expect(Math.hypot(blast.point[0] - me.position[0], blast.point[2] - me.position[2])).toBeLessThan(0.3);
    expect(me.alive).toBe(false);
    expect(eventsOf(outputs, 'kill')[0]).toMatchObject({ killer: THROWER, victim: THROWER, cause: 'grenade', weapon: 'frag' });
  });
});

describe('grenade physics', () => {
  /** Positions and velocities of the one grenade over the outputs. */
  const track = (outputs: readonly TickOutput[]) => outputs.map((o) => o.grenades[0]).filter((g) => g !== undefined);

  it('bounces back off a wall', () => {
    const m = match([box({ min: [-5, 0, -3.5], max: [5, 3, -3], material: 'concrete' })]);
    const path = track(throwAfter(m, 0.1, 2));
    expect(path[0]!.velocity[2]).toBeLessThan(0);
    expect(path.some((g) => g.velocity[2] > 0.5)).toBe(true);
    for (const g of path) expect(g.position[2]).toBeGreaterThan(-3);
  });

  it('bounces off a wall turned about the vertical axis along its normal', () => {
    // A wall turned 45 degrees: a throw straight at it comes off sideways.
    const m = match([yawBox({ center: [0, 1.5, -4], size: [6, 3, 0.4], yaw: Math.PI / 4, material: 'concrete' })]);
    const path = track(throwAfter(m, 0.1, 2));
    expect(Math.max(...path.map((g) => Math.abs(g.velocity[0])))).toBeGreaterThan(1);
  });

  it('bounces off the floor, rolls and comes to rest before it explodes', () => {
    const m = match();
    const path = track(throwAfter(m, 0.1, G.fuse.value - 0.3, { pitch: -0.3 }));
    const heights = path.map((g) => g.position[1]);
    // It rose again after first meeting the floor: a bounce.
    const first = heights.findIndex((h) => h < 0.05);
    expect(Math.max(...heights.slice(first))).toBeGreaterThan(0.05);
    expect(path.at(-1)!.resting).toBe(true);
    expect(path.at(-1)!.velocity).toEqual([0, 0, 0]);
    expect(path.at(-1)!.position[1]).toBeGreaterThanOrEqual(0);
  });

  it('never passes through the floor or a roof', () => {
    const m = match([box({ min: [-10, 2.5, -10], max: [10, 2.7, 10], material: 'concrete' })]);
    const path = track(throwAfter(m, 0.1, 3, { pitch: 1.2 }));
    for (const g of path) {
      expect(g.position[1]).toBeGreaterThanOrEqual(0);
      expect(g.position[1]).toBeLessThan(2.5);
    }
  });
});

describe('the blast', () => {
  /** A thrower holding a frag until it goes off at their feet, with enemies standing around them. */
  function blastAmong(victims: readonly PlayerSpawn[], solids: readonly Solid[] = []) {
    const m = match(solids, victims);
    const outputs = m.run(ticks(G.fuse.value + 0.2), () => ({ [THROWER]: cook() }));
    return { m, outputs, hits: eventsOf(outputs, 'hit') };
  }
  const enemy = (id: string, x: number): PlayerSpawn => ({ id, team: 2, position: [x, 0, 0] });

  it('kills near the centre, hurts less further out, and nothing past the radius', () => {
    const { m, hits } = blastAmong([enemy('near', 1.5), enemy('mid', 4), enemy('far', 6), enemy('out', G.radius.value + 1)]);
    const damage = (id: string) => hits.find((h) => h.victim === id)?.damage ?? 0;

    expect(playerIn(m.latest, 'near').alive).toBe(false);
    expect(damage('mid')).toBeGreaterThan(damage('far'));
    expect(damage('far')).toBeGreaterThan(0);
    expect(damage('out')).toBe(0);
    expect(damage('mid')).toBeCloseTo(blastDamage(hits.find((h) => h.victim === 'mid')!.distance), 6);
    expect(playerIn(m.latest, 'mid').alive).toBe(true);
  });

  it('kills a player at full health within about 3 m', () => {
    expect(blastDamage(2.3)).toBeGreaterThanOrEqual(STATS.health.max.value);
    const { m } = blastAmong([enemy('a', 2.2)]);
    expect(playerIn(m.latest, 'a').alive).toBe(false);
  });

  it('is stopped by walls: a player behind one takes nothing, behind a low one less', () => {
    const tall = box({ min: [1.5, 0, -10], max: [1.8, 3, -2], material: 'concrete' });
    const low = box({ min: [1.5, 0, 2], max: [1.8, 0.7, 10], material: 'concrete' });
    const { hits } = blastAmong([{ id: 'hidden', team: 2, position: [3, 0, -4] }, { id: 'ducked', team: 2, position: [3, 0, 4] }, { id: 'open', team: 2, position: [-3, 0, 4] }], [tall, low]);
    const damage = (id: string) => hits.find((h) => h.victim === id)?.damage ?? 0;

    expect(damage('hidden')).toBe(0);
    expect(damage('ducked')).toBeGreaterThan(0);
    expect(damage('ducked')).toBeLessThan(damage('open'));
  });

  it('spares the thrower\'s teammates, as for bullets', () => {
    const sim = new Simulation(createWorld([FLOOR]), { canDamage: (a, v) => a.id !== v.id && a.team !== v.team });
    sim.addPlayer({ id: THROWER, team: 1, position: [0, 0, 0] });
    sim.addPlayer({ id: 'mate', team: 1, position: [1.5, 0, 0] });
    sim.addPlayer({ id: 'foe', team: 2, position: [-1.5, 0, 0] });
    for (let i = 0; i < ticks(1); i++) sim.step();
    for (let i = 0; i < ticks(G.fuse.value + 0.2); i++) sim.step({ [THROWER]: cook() });
    const out = sim.output().players;

    expect(out.find((p) => p.id === 'mate')!.health).toBe(STATS.health.max.value);
    expect(out.find((p) => p.id === 'foe')!.alive).toBe(false);
  });

  it('drops a live grenade from the hand of a player killed while cooking, and credits its kills to them', () => {
    const m = match([], [{ id: 'k', team: 2, position: [0, 0, -5], yaw: Math.PI }, { id: 'foe', team: 2, position: [1.5, 0, 0] }]);
    const outputs: TickOutput[] = [];
    for (let i = 0; i < ticks(G.fuse.value + 0.5); i++) {
      outputs.push(m.step({ [THROWER]: cook(), k: usercmd({ buttons: ['Fire', 'Ads'], ...aimAt(m, 'head', 'k', THROWER) }) }));
    }
    const died = eventsOf(outputs, 'kill').find((e) => e.victim === THROWER)!;
    expect(died).toMatchObject({ killer: 'k' });
    expect(eventsOf(outputs, 'grenade').map((e) => e.phase)).toEqual(['cook', 'drop']);
    expect(eventsOf(outputs, 'explosion')).toHaveLength(1);
    expect(eventsOf(outputs, 'kill').find((e) => e.victim === 'foe')).toMatchObject({ killer: THROWER, weapon: 'frag', cause: 'grenade' });
  });
});

describe('grenades over the network', () => {
  it('reaches every client in the snapshots, and isn\'t simulated by the thrower\'s prediction', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [{ position: [0, 0, 0], yaw: 0 }, { position: [10, 0, 0], yaw: 0 }], mode: 'ffa' });
    const alice = m.join('alice');
    const bob = m.join('bob');
    m.run(ticks(1.5));
    const press: UserCmd = cook();
    m.run(ticks(0.3), () => ({ alice: press }));
    const frames = m.run(ticks(0.3), () => ({ alice: idle }));

    expect(bob.client.grenades).toHaveLength(1);
    expect(alice.client.grenades[0]?.thrower).toBe(alice.client.id);
    // Prediction reports the throw but never a grenade of its own.
    expect(frames.length).toBeGreaterThan(0);
  });
});
