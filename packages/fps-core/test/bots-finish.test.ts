import { describe, expect, it } from 'vitest';
import { Bot, Simulation, botProfile, box, buildNavGraph, createWorld, type BotView, type PlayerOutput, type SimEvent, type TickOutput, type Vec3 } from '@duty-shooter/fps-core';
import { ticks } from './support/movement';

/** A 60 m floor; a wall across it at z = -20 hides whoever stands beyond it. */
const AREA: [number, number][] = [
  [-30, -30],
  [30, -30],
  [30, 30],
  [-30, 30],
];
const FLOOR = box({ min: [-30, -1, -30], max: [30, 0, 30], material: 'concrete' });
const WALL = box({ min: [-30, 0, -21], max: [30, 4, -20], material: 'brick' });
const world = createWorld([FLOOR, WALL]);
const nav = buildNavGraph(world, { area: AREA });

/**
 * Bot 'b' (Squad 2) faces 'ada' (Squad 1) 10 m off, at 1 HP, so its first hit Downs her. Her squadmate
 * 'bea' stands beyond the wall, out of sight, or (`beaInView`) in the open beside her.
 */
function scene(beaInView: boolean, profile = 'Vandal') {
  const sim = new Simulation(world, { canDamage: (a, v) => a.team !== v.team, downs: () => true });
  sim.addPlayer({ id: 'b', team: 2, position: [0, 0, 0], yaw: 0 });
  sim.addPlayer({ id: 'ada', team: 1, position: [0, 0, -10], yaw: Math.PI });
  sim.addPlayer({ id: 'bea', team: 1, position: beaInView ? [4, 0, -12] : [0, 0, -26], yaw: Math.PI });
  sim.setPlayerState({ ...sim.playerState('ada')!, health: 1 });
  const bot = new Bot('b', botProfile(profile), nav, world);
  let out: TickOutput = sim.output();
  let events: readonly SimEvent[] = [];
  const at: Vec3 = [0, 0, 0];
  const hits: { time: number; victim: string }[] = [];
  let downAt: number | null = null;
  let finishAt: number | null = null;
  for (let i = 0; i < ticks(20) && finishAt === null; i++) {
    const me = out.players.find((p) => p.id === 'b')!;
    const view: BotView = { tick: out.tick, time: sim.time, self: me, players: out.players, events, isEnemy: (o: PlayerOutput) => o.team !== me.team, objective: { position: at, radius: 1.5 } };
    out = sim.step({ b: bot.think(view) });
    events = out.events;
    for (const e of out.events) {
      if (e.type === 'hit' && e.shooter === 'b') hits.push({ time: sim.time, victim: e.victim });
      if (e.type === 'down' && e.victim === 'ada') downAt = sim.time;
      if (e.type === 'kill' && e.victim === 'ada') finishAt = sim.time;
    }
  }
  return { downAt, finishAt, hits, bot };
}

describe('a bot that Downs someone (ticket 40)', () => {
  it('lets the Downed seat lie a moment, watching for the squadmate who comes for it, before finishing it', () => {
    const { downAt, finishAt, hits } = scene(false);
    expect(downAt).not.toBeNull();
    const after = hits.filter((h) => h.victim === 'ada' && h.time > downAt! + 0.05);
    // Not a round into the body for the first second and a half.
    expect(after.filter((h) => h.time < downAt! + 1.5)).toEqual([]);
    // And then it does finish it, long before it would bleed out.
    expect(finishAt).not.toBeNull();
    expect(finishAt! - downAt!).toBeLessThan(10);
  });

  it('turns from the Downed seat to a squadmate of theirs standing in view', () => {
    const { downAt, hits } = scene(true);
    expect(downAt).not.toBeNull();
    const after = hits.filter((h) => h.time > downAt! + 0.05);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]!.victim).toBe('bea');
  });
});
