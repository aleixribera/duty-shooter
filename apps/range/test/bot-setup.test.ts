import { describe, expect, it } from 'vitest';
import { MAX_BOTS_PER_TEAM } from '@duty-shooter/fps-core';
import { BotSetup, teamSize } from '../src/bot-setup';
import { MATCH_MAPS, TEAM_SIZES } from '../src/map/catalogue';

describe("Bot Match's setup", () => {
  it('fills each side to the map\'s team size for the mode', () => {
    const setup = new BotSetup();
    expect(setup.state.map).toBe(MATCH_MAPS[0]);
    expect(setup.state.bots).toBe(teamSize(MATCH_MAPS[0]!, 'tdm'));
    setup.pick({ map: 'switchyard', mode: 'ffa' });
    expect(setup.state.bots).toBe(Math.min(MAX_BOTS_PER_TEAM, TEAM_SIZES.switchyard.ffa ?? 0));
    expect(setup.mapId).toBe('switchyard');
  });

  it('keeps a size of your own until the map or mode changes', () => {
    const setup = new BotSetup();
    setup.pick({ bots: 1 });
    expect(setup.state).toMatchObject({ bots: 1, custom: true });
    setup.pick({ hvb: true });
    expect(setup.state).toMatchObject({ bots: 1, custom: true, hvb: true });
    setup.pick({ mode: 'ffa' });
    expect(setup.state.custom).toBe(false);
    expect(setup.state.bots).toBe(teamSize(setup.state.map, 'ffa'));
  });

  it('switching Bots back to fill drops your own size', () => {
    const setup = new BotSetup();
    setup.pick({ bots: 1 });
    setup.pick({ fill: true });
    expect(setup.state.custom).toBe(false);
  });

  it('keeps at least one bot a side, and no more than a side holds', () => {
    const setup = new BotSetup();
    setup.pick({ bots: 0 });
    expect(setup.state.bots).toBe(1);
    setup.pick({ bots: 99 });
    expect(setup.state.bots).toBe(MAX_BOTS_PER_TEAM);
  });

  it('picks a random next match on another map in another mode, at that map’s size, keeping humans vs bots and the skill', () => {
    const setup = new BotSetup();
    setup.pick({ hvb: true, bots: 1 });
    setup.skill = 'hard';
    for (const r of [0, 0.4, 0.99]) {
      setup.pickRandom({ map: 'survival-town', mode: 'tdm' }, () => r);
      const { map, mode, bots, custom, hvb } = setup.state;
      expect(map).not.toBe('survival-town');
      expect(mode).not.toBe('tdm');
      expect(MATCH_MAPS).toContain(map);
      expect(TEAM_SIZES[setup.mapId][mode]).toBeDefined();
      expect({ bots, custom, hvb }).toEqual({ bots: teamSize(map, mode), custom: false, hvb: true });
      expect(setup.skill).toBe('hard');
    }
  });

  it('shows the last match played, and your name or "You"', () => {
    const setup = new BotSetup();
    expect(setup.view('  ').names).toEqual({ you: 'You' });
    expect(setup.view('Ana').names).toEqual({ you: 'Ana' });
    setup.last = { mode: 'ffa', result: null, teamScores: null };
    expect(setup.view('Ana')).toMatchObject({ mode: 'ffa', offline: true, phase: 'lobby' });
  });
});
