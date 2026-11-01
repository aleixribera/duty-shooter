import { describe, expect, it } from 'vitest';
import { STATS, Simulation, box, createWorld, type PlayerSpawn, type SimEvent, type Vec3 } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';

const FLOOR = box({ min: [-400, -1, -400], max: [400, 0, 400], material: 'concrete' });
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
/** Enough for the first weapon to come up, and the sights after it. */
const READY = 120;

/** 60 seats on one ground plane: `shooter` at the origin facing -z, the rest wherever `place` puts them. */
function crowd(place: (i: number) => Vec3): HeadlessMatch {
  const players: PlayerSpawn[] = [{ id: 'shooter', team: 1, position: [0, 0, 0], yaw: 0 }];
  for (let i = 0; i < 59; i++) players.push({ id: `s${i}`, team: 2, position: place(i), yaw: 0 });
  return createHeadlessMatch({ solids: [FLOOR], players });
}

const victims = (events: readonly SimEvent[]) => events.flatMap((e) => (e.type === 'hit' ? [e.victim] : []));

/** One aimed round along `yaw`, sights up, and everything that came of it. `others` are the rest of the seats' usercmds. */
function shot(match: HeadlessMatch, yaw: number, viewTick?: number, others: () => Record<string, ReturnType<typeof usercmd>> = () => ({})): SimEvent[] {
  const events = [...match.step({ ...others(), shooter: usercmd({ yaw, pitch: 0, buttons: ['Ads', 'Fire'], ...(viewTick === undefined ? {} : { viewTick }) }) }).events];
  for (let i = 0; i < 40; i++) events.push(...match.step({ ...others(), shooter: usercmd({ yaw, pitch: 0, buttons: ['Ads'] }) }).events);
  return events;
}

const steady = (match: HeadlessMatch, yaw: number, others: () => Record<string, ReturnType<typeof usercmd>> = () => ({})) => match.run(READY, () => ({ ...others(), shooter: usercmd({ yaw, pitch: 0, buttons: ['Ads'] }) }));

describe('bullets among 60 seats', () => {
  it('hit the first body along the line, wherever the crowd stands', () => {
    // A rank down the line of fire, and everyone else off it, on both sides of the origin.
    const match = crowd((i) => (i < 20 ? [0, 0, -30 - i * 7] : [(i % 2 ? 1 : -1) * (6 + i), 0, (i - 40) * 9]));
    steady(match, 0);
    expect(victims(shot(match, 0))).toEqual(['s0']);
  });

  it('reach a body far down a long lane, past cells with nobody in them', () => {
    const match = crowd((i) => (i === 7 ? [0, 0, -180] : [50 + i, 0, 100 + i]));
    steady(match, 0);
    expect(victims(shot(match, 0))).toEqual(['s7']);
  });

  it('find a body whose feet lie off the line but whose hitbox crosses it', () => {
    // The feet a hand's width beside the line of fire, just past a grid cell's edge.
    const match = crowd((i) => (i === 3 ? [0.08, 0, -16.1] : [80, 0, 80 + i]));
    steady(match, 0);
    expect(victims(shot(match, 0))).toEqual(['s3']);
  });
});

describe('lag compensation among 60 seats', () => {
  /** s0 runs across the line of fire while the rest stand about. */
  const crossing = () => crowd((i) => (i === 0 ? [-1, 0, -20] : [60 + i, 0, 60]));
  const running = () => ({ s0: usercmd({ yaw: Math.PI / 2, forward: 1 }) });
  const at = (match: HeadlessMatch) => match.latest.players.find((p) => p.id === 's0')!.position;

  it('a shot from behind hits where the target was then, not where it stands now', () => {
    const match = crossing();
    steady(match, 0, running);
    const then = at(match);
    const seen = match.latest.tick;
    const aim = yawTo(then[0], then[2]);
    match.run(12, () => ({ ...running(), shooter: usercmd({ yaw: aim, pitch: 0, buttons: ['Ads'] }) }));
    expect(Math.abs(at(match)[0] - then[0])).toBeGreaterThan(0.5);
    expect(victims(shot(match, aim, seen, running))).toEqual(['s0']);
  });

  it('the same shot without the rewind misses', () => {
    const match = crossing();
    steady(match, 0, running);
    const then = at(match);
    const aim = yawTo(then[0], then[2]);
    match.run(12, () => ({ ...running(), shooter: usercmd({ yaw: aim, pitch: 0, buttons: ['Ads'] }) }));
    expect(victims(shot(match, aim, undefined, running))).toEqual([]);
  });

  it('a rewound shot does not hit a body at its present place', () => {
    const match = crossing();
    steady(match, 0, running);
    const seen = match.latest.tick;
    match.run(12, () => ({ ...running(), shooter: usercmd({ yaw: 0, pitch: 0, buttons: ['Ads'] }) }));
    const now = at(match);
    const aim = yawTo(now[0], now[2]);
    match.run(1, () => ({ ...running(), shooter: usercmd({ yaw: aim, pitch: 0, buttons: ['Ads'] }) }));
    expect(victims(shot(match, aim, seen, running))).toEqual([]);
  });
});

describe('a frag among 60 seats', () => {
  it('reaches those in its radius and nobody past it', () => {
    const radius = STATS.grenade.radius.value;
    // A long rank the frag lands somewhere along, a metre between each.
    const rank = (i: number): Vec3 => [1.5, 0, -2 - i];
    const match = crowd(rank);
    match.run(READY);
    const events: SimEvent[] = [...match.step({ shooter: usercmd({ yaw: 0, pitch: 0, buttons: ['Grenade'] }) }).events];
    for (let i = 0; i < (STATS.grenade.fuse.value + 1) * 60; i++) events.push(...match.step({ shooter: usercmd({ yaw: 0, pitch: 0 }) }).events);
    const blast = events.find((e) => e.type === 'explosion');
    if (blast?.type !== 'explosion') throw new Error('no blast');
    const hit = new Set(events.flatMap((e) => (e.type === 'hit' && e.cause === 'grenade' ? [e.victim] : [])));
    const flat = (i: number) => Math.hypot(rank(i)[0] - blast.point[0], rank(i)[2] - blast.point[2]);
    const seats = Array.from({ length: 59 }, (_, i) => i);
    expect(seats.filter((i) => flat(i) < radius - 1).every((i) => hit.has(`s${i}`))).toBe(true);
    expect(seats.filter((i) => flat(i) > radius + 1).some((i) => hit.has(`s${i}`))).toBe(false);
    expect(hit.size).toBeGreaterThan(0);
  });
});

describe('the output of a tick', () => {
  it('shows a respawn made after the step', () => {
    const sim = new Simulation(createWorld([FLOOR]));
    sim.addPlayer({ id: 'a', team: 1, position: [0, 0, 0] });
    sim.step();
    sim.respawn('a', [5, 0, 5], 0);
    expect(sim.output().players[0]!.position).toEqual([5, 0, 5]);
  });
});
