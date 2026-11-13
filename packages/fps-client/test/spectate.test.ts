import { describe, expect, it } from 'vitest';
import { FOLLOW, Spectator, followCamera, withRoster, type Watchable } from '../src/spectate';

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

  it('while your Squad fights, steps only through your Squad, and round again (ticket 58)', () => {
    const s = new Spectator();
    expect(s.update(view)).toBe('p3');
    expect(s.order(view).map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(s.step(view, 1)).toBe('p2');
    expect(s.step(view, 1)).toBe('p3');
    expect(s.step(view, -1)).toBe('p2');
  });

  it('once your Squad is out, steps through everyone left', () => {
    const s = new Spectator();
    const out = { ...view, players: players.filter((p) => p.team !== 1) };
    expect(s.update(out)).toBe('p5');
    expect(s.order(out).map((p) => p.id)).toEqual(['p5', 'p9']);
    expect(s.step(out, 1)).toBe('p9');
    expect(s.step(out, 1)).toBe('p5');
  });

  it('keeps the one you stepped to while they stay in the fight', () => {
    const s = new Spectator();
    s.update(view);
    s.step(view, 1);
    expect(s.update(view)).toBe('p2');
    expect(s.lost).toBeNull();
  });

  it('moves on by itself when the one watched is out, and says who it was', () => {
    const s = new Spectator();
    s.update(view);
    const after = { ...view, players: players.map((p) => (p.id === 'p3' ? seat('p3', 1, false) : p)) };
    expect(s.update(after)).toBe('p2');
    expect(s.lost).toBe('p3');
    expect(s.update(after)).toBe('p2');
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
    const alone = { ...far, players: players.filter((p) => p.id !== 'p2') };
    expect(s.update(alone)).toBe('p7');
    expect(s.step(alone, 1)).toBe('p7');
    expect(withRoster('charge', [seat('p2', 1)], roster, 'p1').map((p) => p.id)).toEqual(['p2']);
  });
});

describe('the follow camera (ticket 110)', () => {
  const open = () => null;
  const at: [number, number, number] = [10, 0, 10];
  const eye = 1.6;

  it('stands behind and over the right shoulder, looking the way they look', () => {
    // Yaw 0 looks down -z, so behind is +z and the right shoulder is +x.
    const c = followCamera(open, at, eye, 0, 0);
    expect(c[0]).toBeCloseTo(10 + FOLLOW.side);
    expect(c[1]).toBeCloseTo(eye + FOLLOW.up);
    expect(c[2]).toBeCloseTo(10 + FOLLOW.back);
    // Turned a quarter left (yaw +π/2 looks down -x): behind is +x, the right shoulder -z.
    const t = followCamera(open, at, eye, Math.PI / 2, 0);
    expect(t[0]).toBeCloseTo(10 + FOLLOW.back);
    expect(t[2]).toBeCloseTo(10 - FOLLOW.side);
  });

  it('orbits with their aim: looking down it rises, looking up it drops', () => {
    expect(followCamera(open, at, eye, 0, -0.5)[1]).toBeGreaterThan(eye + FOLLOW.up + 1);
    expect(followCamera(open, at, eye, 0, 0.5)[1]).toBeLessThan(eye + FOLLOW.up - 1);
  });

  it('is pulled in short of a wall behind them, never through it', () => {
    // A wall across +z, 1 m behind the eye: everything going further back is cut there.
    const wall = (a: readonly number[], b: readonly number[]) => (b[2]! > 11 && a[2]! <= 11 ? (11 - a[2]!) / (b[2]! - a[2]!) : null);
    const c = followCamera(wall, at, eye, 0, 0);
    expect(c[2]).toBeLessThan(11);
    expect(c[2]).toBeCloseTo(11 - FOLLOW.margin);
    expect(c[0]).toBeCloseTo(10 + FOLLOW.side);
  });
});
