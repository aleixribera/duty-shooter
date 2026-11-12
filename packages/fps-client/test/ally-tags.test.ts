import { describe, expect, it } from 'vitest';
import type { PlayerOutput } from '@duty-shooter/fps-core';
import { AllySight, NAME_RANGE, allyTag, allyTags, alliesOf, type AllySeen } from '../src/hud/ally-tags';
import { cornerHeight } from '../src/hud/markers';

const W = 1920;
const H = 1080;

function ally(over: Partial<AllySeen> = {}): AllySeen {
  return { id: 'p2', name: 'Bea', distance: 12, downed: false, inReach: false, seen: true, x: 600, y: 400, behind: false, ...over };
}

describe('an ally tag (ticket 52)', () => {
  it('near and in sight: the name over their head, with the chevron under it', () => {
    const t = allyTag(ally(), W, H);
    expect(t).toMatchObject({ id: 'p2', name: 'Bea', mark: 'chevron', edge: false, x: 600, y: 400, faded: false });
  });

  it('beyond the name range, only the chevron', () => {
    expect(allyTag(ally({ distance: NAME_RANGE + 1 }), W, H).name).toBeNull();
    expect(allyTag(ally({ distance: NAME_RANGE - 1 }), W, H).name).toBe('Bea');
  });

  it('behind a wall, the name still says who it is, on a dimmer tag; past the name range, only the chevron', () => {
    const near = allyTag(ally({ seen: false, distance: NAME_RANGE - 1 }), W, H);
    expect(near).toMatchObject({ name: 'Bea', mark: 'chevron', edge: false, hidden: true });
    expect(allyTag(ally(), W, H).hidden).toBe(false);
    expect(allyTag(ally({ seen: false, distance: NAME_RANGE + 1 }), W, H)).toMatchObject({ name: null, mark: 'chevron' });
  });

  it('off screen to the right, the chevron holds the right edge and points out', () => {
    const t = allyTag(ally({ x: W + 600, y: H / 2 }), W, H);
    expect(t.edge).toBe(true);
    // At the edge the mark is labelled: a bare chevron says nothing of who it points at.
    expect(t.name).toBe('Bea');
    expect(t.x).toBeLessThan(W);
    expect(t.x).toBeGreaterThan(W - 60);
    // 0 points down; to the right is a quarter turn back.
    expect(t.angle).toBeCloseTo(-90, 0);
  });

  it('behind you, on the bottom edge pointing down', () => {
    const t = allyTag(ally({ x: 900, y: 300, behind: true }), W, H);
    expect(t.edge).toBe(true);
    expect(t.y).toBeGreaterThan(H - 60);
    expect(t.angle).toBeCloseTo(0, 0);
  });

  it('over the crosshair, it fades so it never hides what you aim at', () => {
    // The tag stands on the point over the head and reaches up from it: here it covers the centre.
    expect(allyTag(ally({ x: W / 2 + 20, y: H / 2 + 10 }), W, H).faded).toBe(true);
    expect(allyTag(ally({ x: W / 2 - 40, y: H / 2 + 50 }), W, H).faded).toBe(true);
    // Off to the side, or well above the crosshair (aiming at the ally's body), it stays.
    expect(allyTag(ally({ x: W / 2 + 300, y: H / 2 + 10 }), W, H).faded).toBe(false);
    expect(allyTag(ally({ x: W / 2, y: H / 2 - 30 }), W, H).faded).toBe(false);
  });

  it('Downed: its own mark with how far, at any range and through walls, and Revive once in reach', () => {
    const far = allyTag(ally({ downed: true, distance: 80, seen: false }), W, H);
    expect(far.mark).toBe('downed');
    expect(far.label).toBe('80 m');
    const near = allyTag(ally({ downed: true, distance: 1.5, inReach: true }), W, H);
    expect(near.mark).toBe('downed');
    expect(near.name).toBe('Bea');
    expect(near.label).toBe('Revive');
    expect(allyTag(ally(), W, H).label).toBeNull();
  });
});

describe('tags that would lie on each other (design audit 2026-11-10)', () => {
  it('two allies behind you at the same spot: the second tag steps up the edge instead of lying on the first', () => {
    const tags = allyTags([ally({ id: 'a', name: 'Rook', x: 20, y: 900, behind: true }), ally({ id: 'b', name: 'Ember', x: 24, y: 900, behind: true })], W, H);
    expect(tags.map((t) => t.edge)).toEqual([true, true]);
    expect(Math.abs(tags[0]!.y - tags[1]!.y)).toBeGreaterThanOrEqual(42);
    expect(tags[1]!.y).toBeLessThan(tags[0]!.y);
    // Three: each on its own step.
    const three = allyTags(['a', 'b', 'c'].map((id) => ally({ id, x: -50, y: 500 })), W, H);
    expect(new Set(three.map((t) => t.y)).size).toBe(3);
  });

  it('edge tags apart from each other stay where they are', () => {
    const tags = allyTags([ally({ id: 'a', x: -50, y: 300 }), ally({ id: 'b', x: -50, y: 600 }), ally({ id: 'c', x: W + 50, y: 300 })], W, H);
    expect(tags.map((t) => t.y)).toEqual([300, 600, 300]);
  });

  it('an edge tag stands clear over the health and the ammo, foot and all', () => {
    for (const x of [-50, 20, 200, W - 200, W + 50]) {
      const t = allyTag(ally({ x, y: H - 10 }), W, H);
      // The tag reaches 20px under its centre: that foot is at the corner's top or over it.
      expect(t.y + 20).toBeLessThanOrEqual(H - cornerHeight(W));
    }
    // Mid-height on a side, nothing moves it.
    expect(allyTag(ally({ x: -50, y: 400 }), W, H).y).toBe(400);
  });

  it('two names over heads that overlap: the nearer ally keeps the name, the other is down to its chevron', () => {
    const tags = allyTags([ally({ id: 'far', name: 'Briar', distance: 30, x: 700, y: 300 }), ally({ id: 'near', name: 'Ember', distance: 8, x: 740, y: 310 })], W, H);
    expect(tags.map((t) => t.name)).toEqual([null, 'Ember']);
    // Apart, both keep theirs.
    expect(allyTags([ally({ id: 'a', x: 500, y: 300 }), ally({ id: 'b', x: 700, y: 300 })], W, H).map((t) => t.name)).toEqual(['Bea', 'Bea']);
  });

  it('on touch a tag that steps up the left edge goes round the Pause and scoreboard column', () => {
    const tags = allyTags(['a', 'b', 'c', 'd'].map((id) => ally({ id, x: -50, y: 250 })), 844, 390, true);
    // As a single tag does: it is the tag's foot that the column is measured against.
    expect(tags.some((t) => t.y + 20 <= 176)).toBe(true);
    for (const t of tags) if (t.y + 20 <= 176) expect(t.x).toBeGreaterThanOrEqual(104);
    const spots = tags.map((t) => `${t.x},${t.y}`);
    expect(new Set(spots).size).toBe(4);
  });
});

describe('who gets a tag', () => {
  const seat = (id: string, team: number, over: Record<string, unknown> = {}) => ({ id, team, kind: 'player', alive: true, ...over }) as unknown as PlayerOutput;
  const field = [seat('me', 1), seat('mate', 1), seat('downed', 1, { downed: { bleedOut: 20, revive: 0 } }), seat('dead', 1, { alive: false }), seat('foe', 2), seat('dummy', 1, { kind: 'dummy' })];

  it('Battle Royale squadmates do, which is what the owner was missing (they were team modes only)', () => {
    expect(alliesOf(field, 'me', 1, 'battle-royale').map((p) => p.id)).toEqual(['mate', 'downed']);
  });

  it('teammates in the team modes do; enemies never', () => {
    expect(alliesOf(field, 'me', 1, 'tdm').map((p) => p.id)).toEqual(['mate', 'downed']);
    expect(alliesOf(field, 'foe', 2, 'tdm').map((p) => p.id)).toEqual([]);
  });

  it('nobody does in the modes without allies', () => {
    expect(alliesOf(field, 'me', 1, 'ffa')).toEqual([]);
    expect(alliesOf(field, 'me', 1, 'gungame')).toEqual([]);
    expect(alliesOf(field, 'me', null, 'tdm')).toEqual([]);
  });
});

describe('sight lines to allies', () => {
  it('looks again only after a tenth of a second', () => {
    const sight = new AllySight();
    let looks = 0;
    const look = () => (looks++, true);
    expect(sight.seen('p2', 0, look)).toBe(true);
    expect(sight.seen('p2', 50, () => false)).toBe(true);
    expect(sight.seen('p2', 101, () => false)).toBe(false);
    expect(looks).toBe(1);
  });

  it('forgets every ally when a new match starts (ticket 60)', () => {
    const sight = new AllySight();
    sight.seen('p2', 0, () => true);
    sight.seen('p3', 0, () => true);
    expect(sight.size).toBe(2);
    sight.clear();
    expect(sight.size).toBe(0);
    expect(sight.seen('p2', 10, () => false)).toBe(false);
  });
});
