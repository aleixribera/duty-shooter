import { describe, expect, it } from 'vitest';
import { Bot, Simulation, botProfile, buildNavGraph, createWorld, skilledProfile, type PlayerOutput, type SimEvent } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { skillDuels, winRate } from '../src/harness/duel';
import { FLOOR, ticks } from './support/movement';

describe('bot skill', () => {
  const base = botProfile('Kestrel');

  it('leaves a Normal bot as it is', () => {
    expect(skilledProfile(base, 'normal')).toBe(base);
  });

  it('makes an Easy bot slower and looser, a Hard one quicker and tighter, and keeps who it is', () => {
    const easy = skilledProfile(base, 'easy');
    const hard = skilledProfile(base, 'hard');
    expect(easy.reaction).toBeGreaterThan(base.reaction);
    expect(easy.aimError).toBeGreaterThan(base.aimError);
    expect(hard.reaction).toBeLessThan(base.reaction);
    expect(hard.aimError).toBeLessThan(base.aimError);
    for (const p of [easy, hard]) {
      expect(p.style).toBe(base.style);
      expect(p.loadout).toEqual(base.loadout);
      expect(p.aggression).toBe(base.aggression);
      for (const share of [p.tracking, p.recoilControl, p.headshots]) expect(share).toBeLessThanOrEqual(1);
    }
  });

  // The same personalities and spots each way round, so only the skill differs.
  it('wins more fights the higher it is', () => {
    const rates = {
      hardOverNormal: winRate(skillDuels('hard', 'normal', 16)),
      normalOverEasy: winRate(skillDuels('normal', 'easy', 16)),
      hardOverEasy: winRate(skillDuels('hard', 'easy', 16)),
    };
    console.log(JSON.stringify(rates));
    expect(rates.hardOverNormal).toBeGreaterThan(0.6);
    expect(rates.normalOverEasy).toBeGreaterThan(0.6);
    expect(rates.hardOverEasy).toBeGreaterThan(0.75);
  });

  // A bolt-action holds its shot until the target moves steadily, judged from what the bot saw a moment back. An Easy
  // bot sees further back than a Normal one, so it must remember that far: with too short a memory it read a walk as
  // a sudden turn and never fired.
  it('lets an Easy sniper with slow eyes fire on a player moving steadily across its view', () => {
    const world = createWorld([FLOOR]);
    const nav = buildNavGraph(world, { area: [[-60, -60], [60, -60], [60, 60], [-60, 60]], spacing: 3 });
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'b', team: 1, position: [0, 0, 0], yaw: 0, loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag' } });
    sim.addPlayer({ id: 't', team: 2, position: [-15, 0, -45], yaw: Math.PI });
    const easy = { ...skilledProfile(botProfile('Rook'), 'easy'), perceptionLag: 0.28 };
    const bot = new Bot('b', easy, nav, world);
    let out = sim.output();
    let events: readonly SimEvent[] = [];
    let shots = 0;
    for (let i = 0; i < ticks(7); i++) {
      const self = out.players.find((p) => p.id === 'b')!;
      const cmd = bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events, grenades: out.grenades, isEnemy: (o: PlayerOutput) => o.team !== self.team });
      // Moving to its right the same way all along: as steady as a target gets.
      out = sim.step({ b: cmd, t: usercmd({ yaw: Math.PI, right: 1 }) });
      events = out.events;
      shots += events.filter((e) => e.type === 'shot' && e.shooter === 'b').length;
    }
    expect(shots).toBeGreaterThan(0);
  });
});
