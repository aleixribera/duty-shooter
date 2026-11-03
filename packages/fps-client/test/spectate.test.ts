import { describe, expect, it } from 'vitest';
import { Spectator, withRoster, type Watchable } from '../src/spectate';

const seat = (id: string, team: number, alive = true, downed = false): Watchable => ({ id, team, alive, downed, kind: 'player' });

describe('who a dead player watches', () => {
  it('watches nobody while alive, between matches, or in a mode with respawns', () => {
    const s = new Spectator();
    const players = [seat('p2', 1), seat('p3', 2)];
    expect(s.update({ mode: 'battle-royale', playing: true, self: seat('p1', 1), players, killer: null })).toBeNull();
    expect(s.update({ mode: 'battle-royale', playing: false, self: seat('p1', 1, false), players, killer: null })).toBeNull();
    expect(s.update({ mode: 'tdm', playing: true, self: seat('p1', 1, false), players, killer: null })).toBeNull();
  });

  it('in Charge, watches a living teammate and stays on them while they live', () => {
    const s = new Spectator();
    const self = seat('p1', 1, false);
    expect(s.update({ mode: 'charge', playing: true, self, players: [seat('p4', 1), seat('p2', 2), seat('p3', 1)], killer: 'p2' })).toBe('p3');
    expect(s.update({ mode: 'charge', playing: true, self, players: [seat('p4', 1), seat('p2', 2), seat('p3', 1)], killer: 'p2' })).toBe('p3');
    expect(s.update({ mode: 'charge', playing: true, self, players: [seat('p4', 1), seat('p2', 2), seat('p3', 1, false)], killer: 'p2' })).toBe('p4');
  });

  it('in a Battle Royale, watches a standing squadmate first, then a Downed one', () => {
    const s = new Spectator();
    const self = seat('p1', 1, false);
    expect(s.update({ mode: 'battle-royale', playing: true, self, players: [seat('p2', 1, true, true), seat('p3', 1), seat('p9', 4)], killer: 'p9' })).toBe('p3');
    expect(new Spectator().update({ mode: 'battle-royale', playing: true, self, players: [seat('p2', 1, true, true), seat('p9', 4)], killer: 'p9' })).toBe('p2');
  });

  it('in Solos or once the Squad is out, watches the killer, then whoever is left when the killer dies', () => {
    const s = new Spectator();
    const self = seat('p1', 1, false);
    expect(s.update({ mode: 'battle-royale', playing: true, self, players: [seat('p5', 5), seat('p9', 9)], killer: 'p9' })).toBe('p9');
    expect(s.update({ mode: 'battle-royale', playing: true, self, players: [seat('p5', 5), seat('p9', 9, false)], killer: 'p9' })).toBe('p5');
  });

  it('gives a late arrival with no seat someone to watch', () => {
    expect(new Spectator().update({ mode: 'battle-royale', playing: true, self: null, players: [seat('p7', 7, false), seat('p8', 8)], killer: null })).toBe('p8');
  });
});

describe('switching who you watch (ticket 32)', () => {
  const self = seat('p1', 1, false);
  const players = [seat('p9', 4), seat('p3', 1), seat('p5', 5), seat('p2', 1, true, true)];
  const view = { mode: 'battle-royale' as const, playing: true, self, players, killer: null };

  it('steps through your Squad first, then everyone else, and round again', () => {
    const s = new Spectator();
    expect(s.update(view)).toBe('p3');
    expect(s.order(view).map((p) => p.id)).toEqual(['p2', 'p3', 'p5', 'p9']);
    expect(s.step(view, 1)).toBe('p5');
    expect(s.step(view, 1)).toBe('p9');
    expect(s.step(view, 1)).toBe('p2');
    expect(s.step(view, -1)).toBe('p9');
  });

  it('keeps the one you stepped to while they stay in the fight', () => {
    const s = new Spectator();
    s.update(view);
    s.step(view, 1);
    expect(s.update(view)).toBe('p5');
    expect(s.lost).toBeNull();
  });

  it('moves on by itself when the one watched is out, and says who it was', () => {
    const s = new Spectator();
    s.update(view);
    s.step(view, 1);
    const after = { ...view, players: players.map((p) => (p.id === 'p5' ? seat('p5', 5, false) : p)) };
    expect(s.update(after)).toBe('p3');
    expect(s.lost).toBe('p5');
    expect(s.update(after)).toBe('p3');
    expect(s.lost).toBeNull();
  });

  it('in Charge, steps only through your living teammates', () => {
    const s = new Spectator();
    const charge = { mode: 'charge' as const, playing: true, self, players: [seat('p4', 1), seat('p2', 2), seat('p3', 1), seat('p6', 1, false)], killer: null };
    expect(s.update(charge)).toBe('p3');
    expect(s.step(charge, 1)).toBe('p4');
    expect(s.step(charge, 1)).toBe('p3');
  });

  it('a late arrival steps through everyone in the fight', () => {
    const s = new Spectator();
    const late = { mode: 'battle-royale' as const, playing: true, self: null, players: [seat('p8', 8), seat('p7', 7), seat('p6', 6, false)], killer: null };
    expect(s.update(late)).toBe('p7');
    expect(s.step(late, 1)).toBe('p8');
    expect(s.step(late, 1)).toBe('p7');
  });

  it('does nothing with nobody to watch', () => {
    const s = new Spectator();
    expect(s.step({ ...view, self: seat('p1', 1) }, 1)).toBeNull();
  });

  it('in a Battle Royale, steps on to seats too far away to be sent, from the scoreboard', () => {
    const s = new Spectator();
    const roster = [
      { id: 'p1', team: 1, deaths: 1 },
      { id: 'p2', team: 1, deaths: 0 },
      { id: 'p7', team: 7, deaths: 0 },
      { id: 'p8', team: 8, deaths: 1 },
    ];
    const players = withRoster('battle-royale', [seat('p2', 1)], roster, 'p1');
    expect(players.map((p) => [p.id, p.alive])).toEqual([['p2', true], ['p7', true], ['p8', false]]);
    const far = { mode: 'battle-royale' as const, playing: true, self: seat('p1', 1, false), players, killer: null };
    expect(s.update(far)).toBe('p2');
    expect(s.step(far, 1)).toBe('p7');
    expect(s.update(far)).toBe('p7');
    expect(withRoster('charge', [seat('p2', 1)], roster, 'p1').map((p) => p.id)).toEqual(['p2']);
  });
});
