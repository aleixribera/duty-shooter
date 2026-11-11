import { describe, expect, it } from 'vitest';
import type { BattleRoyaleState, Score } from '@duty-shooter/fps-core';
import { mapPoint, paintIsland, terrainBounds } from '../src/ui/island-map';
import { endSummary, winVerb } from '../src/ui/model';
import { bearing, compassOffset, compassTicks, heading, killLeaderLine, placement, ringNow, ringStatus, squadWipedLine, victoryCard } from '../src/ui/royale';

/** Stage 2 of 6: holding at a 300 m circle round the origin until t = 100, shrinking to 100 m round (100, 0) by t = 150. */
const state = (over: Partial<BattleRoyaleState> = {}): BattleRoyaleState => ({
  kind: 'battle-royale',
  squadSize: 1,
  stage: 2,
  circle: { x: 0, z: 0, radius: 300 },
  next: { x: 100, z: 0, radius: 100 },
  shrinkAt: 100,
  shrinkEnd: 150,
  damage: 2,
  alive: 40,
  squads: 40,
  ...over,
});

describe('where the Ring stands', () => {
  it('holds at the Stage circle until the shrink, then closes on the next one', () => {
    expect(ringNow(state(), 50)).toEqual({ x: 0, z: 0, radius: 300 });
    expect(ringNow(state(), 125)).toEqual({ x: 50, z: 0, radius: 200 });
    expect(ringNow(state(), 150)).toEqual({ x: 100, z: 0, radius: 100 });
    expect(ringNow(state(), 999)).toEqual({ x: 100, z: 0, radius: 100 });
  });
});

describe('the way to the next circle (ticket 68)', () => {
  it('is how far its edge is from where you stand outside it, 0 inside', () => {
    // The next circle is 100 m round (100, 0): (-100, 0) is 100 m out of it, inside the Ring.
    expect(ringStatus(state(), 50, [-100, 0, 0]).toNext).toBeCloseTo(100);
    expect(ringStatus(state(), 50, [150, 0, 0]).toNext).toBe(0);
    expect(ringStatus(state(), 50, null).toNext).toBe(0);
  });

  it('runs to the last point once the last circle closes on one', () => {
    const last = state({ stage: 6, circle: { x: 0, z: 0, radius: 40 }, next: { x: 50, z: 0, radius: 0 } });
    expect(ringStatus(last, 50, [0, 0, 0]).toNext).toBeCloseTo(50);
  });
});

describe('the Ring line under the compass', () => {
  it('counts down to the shrink while it holds', () => {
    const s = ringStatus(state(), 58.2, [0, 0, 0]);
    expect(s).toMatchObject({ stage: 2, stages: 6, phase: 'hold', seconds: 41.8, outside: false, toSafety: 0, toNext: 0, damage: 2 });
  });

  it('counts down to the end of the shrink while it moves', () => {
    expect(ringStatus(state(), 130, null)).toMatchObject({ phase: 'closing', seconds: 20, outside: false });
  });

  it('says how far outside you stand and what it costs', () => {
    // At t = 125 the wall is a 200 m circle round (50, 0): (300, 0) is 50 m out.
    const s = ringStatus(state(), 125, [300, 4, 0]);
    expect(s.outside).toBe(true);
    expect(s.toSafety).toBeCloseTo(50);
    expect(s.damage).toBe(2);
  });

  it('is closed for good after the last Stage', () => {
    expect(ringStatus(state({ stage: 6, circle: { x: 5, z: 5, radius: 20 }, next: { x: 5, z: 5, radius: 0 } }), 160, null)).toMatchObject({ phase: 'closed', seconds: null });
  });
});

describe('the compass', () => {
  it('reads headings clockwise from north, with yaw 0 looking north (-z) and a positive yaw turning west', () => {
    expect(heading(0)).toBe(0);
    expect(heading(Math.PI / 2)).toBe(270);
    expect(heading(-Math.PI / 2)).toBe(90);
    expect(heading(Math.PI)).toBe(180);
  });

  it('gives the bearing from one spot to another', () => {
    expect(bearing([0, 0], [0, -10])).toBe(0);
    expect(bearing([0, 0], [10, 0])).toBe(90);
    expect(bearing([0, 0], [0, 10])).toBe(180);
    expect(bearing([0, 0], [-10, 0])).toBe(270);
  });

  it('places a bearing across the strip, pinned to the edge when it is out of view', () => {
    expect(compassOffset(350, 20, 90)).toEqual({ x: 30 / 90, pinned: false });
    expect(compassOffset(90, 0, 90)).toEqual({ x: -0.5, pinned: true });
    expect(compassOffset(0, 180, 90).pinned).toBe(true);
  });

  it('lays ticks every 15 degrees with the eight points named', () => {
    const ticks = compassTicks(0, 90);
    expect(ticks.map((t) => t.label)).toEqual(['NW', '330', '345', 'N', '15', '30', 'NE']);
    expect(ticks.find((t) => t.label === 'N')?.x).toBe(0);
    expect(ticks[0]!.x).toBe(-0.5);
  });
});

const score = (id: string, team: number, place?: number): Score => ({ id, team, name: id, kills: 0, deaths: 0, score: 0, assists: 0, ...(place === undefined ? {} : { place }) });

describe('placement', () => {
  it("is your Squad's place out of the Squads that started", () => {
    const scores = [score('a', 1), score('b', 1), score('c', 2, 3), score('d', 2, 3), score('e', 3, 1), score('f', 3, 1)];
    expect(placement(scores, 'c')).toEqual({ place: 3, of: 3 });
    expect(placement(scores, 'e')).toEqual({ place: 1, of: 3 });
  });

  it('is unknown while your Squad is still in, or for someone without a seat', () => {
    const scores = [score('a', 1), score('b', 2, 2)];
    expect(placement(scores, 'a')).toBeNull();
    expect(placement(scores, null)).toBeNull();
  });
});

describe('the island map', () => {
  // A 10 x 10 m grid: sea in the west half, a flat meadow and a slope in the east half.
  const columns = 10;
  const rows = 10;
  const heights = Array.from({ length: 121 }, (_, k) => {
    const i = k % 11;
    return i < 5 ? -2 : i < 8 ? 1 : 1 + (i - 7) * 2;
  });
  const data = { origin: [0, -5] as const, cell: 1, columns, rows, heights, palette: ['grass' as const] };
  const at = (p: Uint8ClampedArray, n: number, x: number, z: number) => {
    const [px, py] = mapPoint(terrainBounds(data), n, x, z).map(Math.floor) as [number, number];
    return [...p.slice((py * n + px) * 4, (py * n + px) * 4 + 3)];
  };

  it('puts the north-west corner top left and the south-east bottom right', () => {
    const b = terrainBounds(data);
    expect(mapPoint(b, 100, 0, -5)).toEqual([0, 0]);
    expect(mapPoint(b, 100, 10, 5)).toEqual([100, 100]);
  });

  it('paints the sea blue, the land in its colour, and a slope turned toward the light brighter', () => {
    const p = paintIsland(data, [0x60a040], 20);
    const [r, , bl] = at(p, 20, 1, 0);
    expect(bl).toBeGreaterThan(r!);
    const flat = at(p, 20, 6, 0);
    expect(flat[1]).toBeGreaterThan(flat[0]!);
    // The slope rises to the east, so it faces west, toward the north-west light.
    const slope = at(p, 20, 9, 0);
    expect(slope[1]).toBeGreaterThan(flat[1]! * 1.1);
  });
});

describe('the end of a Battle Royale', () => {
  const scores = [score('a', 1, 1), score('b', 1, 1), score('c', 2, 2)];

  it('names the winning Squad, and says you won when it was yours', () => {
    const result = { winner: 1, winnerName: 'a and b', winners: 2, draw: false, reason: 'lastSquad' as const };
    expect(endSummary(result, 'battle-royale', scores, 'b').headline).toEqual({ kind: 'player', name: 'a and b', you: true, verb: 'win' });
    expect(endSummary(result, 'battle-royale', scores, 'c').headline).toEqual({ kind: 'player', name: 'a and b', you: false, verb: 'win' });
  });

  it('says "wins" for a Squad of one, and "win" for two or three (ticket 42)', () => {
    expect(winVerb({})).toBe('wins');
    expect(winVerb({ winners: 2 })).toBe('win');
    expect(winVerb({ winners: 3 })).toBe('win');
    const solo = { winner: 2, winnerName: 'c', draw: false, reason: 'lastSquad' as const };
    expect(endSummary(solo, 'battle-royale', scores, 'a').headline).toEqual({ kind: 'player', name: 'c', you: false, verb: 'wins' });
  });

  it('is no draw when it ended for want of people', () => {
    expect(endSummary({ winner: null, winnerName: null, draw: false, reason: 'noHumans' }, 'battle-royale', scores, 'c').headline).toEqual({ kind: 'unknown' });
  });
});

describe("the match's big moments (ticket 69)", () => {
  it('a wiped Squad: who, by whom, and how many Squads are left', () => {
    const two = squadWipedLine({ names: ['Ada', 'Mate'], by: 'Joan', squadsLeft: 7 });
    expect(two).toContain('Ada and Mate');
    expect(two).toContain('Joan');
    expect(two).toMatch(/\b7 Squads\b/);
    const alone = squadWipedLine({ names: ['Ada'], by: null, squadsLeft: 2 });
    expect(alone).toContain('Ada');
    expect(alone).toMatch(/\b2 Squads\b/);
    const three = squadWipedLine({ names: ['Ada', 'Mate', 'Joan'], by: 'Bo', squadsLeft: 1 });
    expect(three).toContain('Ada, Mate and Joan');
    expect(three).toContain('Bo');
    expect(three).toMatch(/\b1 Squad\b(?!s)/);
  });

  it('a new Kill Leader, by name or as you', () => {
    const them = killLeaderLine('Ada', 4, false);
    expect(them).toContain('Ada');
    expect(them).toContain('4');
    const you = killLeaderLine('Ada', 3, true);
    expect(you).not.toContain('Ada');
    expect(you).toContain('3');
  });

  it("the victory card: the winners' own, or who won for everyone else", () => {
    const scores = [
      { id: 'a', team: 1, place: 1 },
      { id: 'b', team: 1, place: 1 },
      { id: 'c', team: 2, place: 2 },
      { id: 'd', team: 3, place: 3 },
    ] as unknown as Score[];
    const result = { winner: 1, winnerName: 'Ada and Bo', draw: false, reason: 'lastSquad' as const };
    expect(victoryCard(result, scores, 'a')).toEqual({ yours: true, names: 'Ada and Bo', of: 3 });
    expect(victoryCard(result, scores, 'c')).toEqual({ yours: false, names: 'Ada and Bo', of: 3 });
    expect(victoryCard(result, scores, null)).toEqual({ yours: false, names: 'Ada and Bo', of: 3 });
    expect(victoryCard({ ...result, winner: null, winnerName: null, reason: 'noHumans' }, scores, 'a')).toBeNull();
    expect(victoryCard(null, scores, 'a')).toBeNull();
  });
});
