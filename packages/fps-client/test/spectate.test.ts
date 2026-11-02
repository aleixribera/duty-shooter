import { describe, expect, it } from 'vitest';
import { Spectator, type Watchable } from '../src/spectate';

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
