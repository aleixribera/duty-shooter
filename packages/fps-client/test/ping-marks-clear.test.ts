import { describe, expect, it } from 'vitest';
import type { AllyTag } from '../src/hud/ally-tags';
import { placePings, type PingScreenMark } from '../src/hud/ping-marks';

const tag = (over: Partial<AllyTag>): AllyTag => ({ id: 'a', name: 'Rook', mark: 'chevron', label: null, x: 1300, y: 500, edge: false, angle: 0, faded: false, hidden: false, ...over });
const mark = (over: Partial<PingScreenMark>): PingScreenMark => ({ id: 1, kind: 'enemy', name: 'Rook', x: 1296, y: 560, distance: 53, ...over });

describe('ping markers and ally tags', () => {
  it('lifts an enemy marker that would land on an ally tag until it sits over the tag', () => {
    const [m] = placePings([mark({})], [tag({})]);
    // The tag's name and chevron stand 39 px over its foot at 500; the marker's foot goes 4 px over that.
    expect(m!.y).toBe(500 - 39 - 4);
    expect(m!.x).toBe(1296);
  });

  it('leaves a marker alone when it is clear of every tag', () => {
    const far = mark({ x: 800 });
    const below = mark({ y: 640 });
    expect(placePings([far, below], [tag({})])).toEqual([far, below]);
  });

  it('clears a stack of tags one over another', () => {
    const [m] = placePings([mark({})], [tag({}), tag({ id: 'b', y: 461 - 4, name: null })]);
    // Over Rook's tag it would meet the bare chevron above, so it goes over that too.
    expect(m!.y).toBe(457 - 17 - 4);
  });

  it('keeps a lifted marker on the screen', () => {
    const [m] = placePings([mark({ y: 60 })], [tag({ y: 40 })]);
    expect(m!.y).toBe(60);
    const [n] = placePings([mark({ y: 120 })], [tag({ y: 100 })]);
    expect(n!.y).toBe(70);
  });

  it('never moves a marker near the top that is clear of the tags', () => {
    const high = mark({ y: 30 });
    expect(placePings([high], [tag({})])[0]).toBe(high);
  });

  it('holds a marker lifted last frame a little past the border, so it does not flicker', () => {
    // Its top 2 px under the tag's foot: left alone, unless it was lifted last frame.
    const edge = mark({ y: 500 + 62 + 2 });
    expect(placePings([edge], [tag({})])[0]).toBe(edge);
    expect(placePings([edge], [tag({})], new Set([1]))[0]!.y).toBe(500 - 39 - 4);
  });
});

describe('ping markers apart from each other', () => {
  // Review 2026-11-12g, 07: two ENEMY markers 64 px apart under the crosshair, the second's triangle on the first's label.
  const a = mark({ id: 1, x: 990, y: 540, distance: 20 });
  const b = mark({ id: 2, x: 1020, y: 552, distance: 24 });

  it('leaves the nearer on its point and stands the farther over it', () => {
    const [na, nb] = placePings([b, a], []).sort((p, q) => p.id - q.id);
    expect(na).toBe(a);
    expect(nb!.x).toBe(1020);
    expect(nb!.y).toBe(540 - 62 - 4);
  });

  it('keeps the order it was given', () => {
    expect(placePings([b, a], []).map((m) => m.id)).toEqual([2, 1]);
  });

  it('stacks three into a column, nearest lowest', () => {
    const c = mark({ id: 3, x: 1000, y: 545, distance: 40 });
    const ys = placePings([c, b, a], []).map((m) => m.y);
    expect(ys).toEqual([540 - 2 * (62 + 4), 540 - 62 - 4, 540]);
  });

  it('leaves markers side by side alone', () => {
    const far = mark({ id: 2, x: 990 + 73, y: 540, distance: 24 });
    expect(placePings([a, far], [])).toEqual([a, far]);
  });

  it('a lifted marker stays up until it is clearly the nearer', () => {
    const close = { ...b, distance: 19 };
    // Lifted last frame and now only a metre nearer: it holds its place over the other.
    expect(placePings([a, close], [], new Set([2]))[1]!.y).toBe(540 - 62 - 4);
    // Three metres nearer: it takes the point and the other goes over it.
    const nearer = { ...b, distance: 17 };
    const [pa, pb] = placePings([a, nearer], [], new Set([2]));
    expect(pb).toBe(nearer);
    expect(pa!.y).toBe(552 - 62 - 4);
  });

  it('holds a stack still frame after frame', () => {
    // As hud.ts runs it: the marks lifted last frame fed back in.
    const frames = (marks: PingScreenMark[], tags: AllyTag[]) => {
      let lifted = new Set<number>();
      const ys: number[][] = [];
      for (let f = 0; f < 3; f++) {
        const placed = placePings(marks, tags, lifted);
        lifted = new Set(placed.filter((m, i) => m !== marks[i]).map((m) => m.id));
        ys.push(placed.map((m) => m.y));
      }
      return ys;
    };
    const c = mark({ id: 3, x: 1000, y: 545, distance: 40 });
    const three = [540 - 2 * (62 + 4), 540 - 62 - 4, 540];
    expect(frames([c, b, a], [])).toEqual([three, three, three]);
    const withTag = [521 - 4, 521 - 4 - 62 - 4];
    expect(frames([a, b], [tag({ x: 1000, y: 560 })])).toEqual([withTag, withTag, withTag]);
  });

  it('clears an ally tag and the marker above it together', () => {
    // The tag's head at 560 - 39 = 521: the nearer marker goes over the tag, the farther over that marker.
    const [na, nb] = placePings([a, b], [tag({ x: 1000, y: 560 })]);
    expect(na!.y).toBe(521 - 4);
    expect(nb!.y).toBe(521 - 4 - 62 - 4);
  });
});
