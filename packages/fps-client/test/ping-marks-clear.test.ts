import { describe, expect, it } from 'vitest';
import type { AllyTag } from '../src/hud/ally-tags';
import { clearOfAllies, type PingScreenMark } from '../src/hud/ping-marks';

const tag = (over: Partial<AllyTag>): AllyTag => ({ id: 'a', name: 'Rook', mark: 'chevron', label: null, x: 1300, y: 500, edge: false, angle: 0, faded: false, hidden: false, ...over });
const mark = (over: Partial<PingScreenMark>): PingScreenMark => ({ id: 1, kind: 'enemy', name: 'Rook', x: 1296, y: 560, distance: 53, ...over });

describe('ping markers and ally tags', () => {
  it('lifts an enemy marker that would land on an ally tag until it sits over the tag', () => {
    const [m] = clearOfAllies([mark({})], [tag({})]);
    // The tag's name and chevron stand 39 px over its foot at 500; the marker's foot goes 4 px over that.
    expect(m!.y).toBe(500 - 39 - 4);
    expect(m!.x).toBe(1296);
  });

  it('leaves a marker alone when it is clear of every tag', () => {
    const far = mark({ x: 800 });
    const below = mark({ y: 640 });
    expect(clearOfAllies([far, below], [tag({})])).toEqual([far, below]);
  });

  it('clears a stack of tags one over another', () => {
    const [m] = clearOfAllies([mark({})], [tag({}), tag({ id: 'b', y: 461 - 4, name: null })]);
    // Over Rook's tag it would meet the bare chevron above, so it goes over that too.
    expect(m!.y).toBe(457 - 17 - 4);
  });

  it('keeps a lifted marker on the screen', () => {
    const [m] = clearOfAllies([mark({ y: 60 })], [tag({ y: 40 })]);
    expect(m!.y).toBe(60);
    const [n] = clearOfAllies([mark({ y: 120 })], [tag({ y: 100 })]);
    expect(n!.y).toBe(70);
  });

  it('never moves a marker near the top that is clear of the tags', () => {
    const high = mark({ y: 30 });
    expect(clearOfAllies([high], [tag({})])[0]).toBe(high);
  });

  it('holds a marker lifted last frame a little past the border, so it does not flicker', () => {
    // Its top 2 px under the tag's foot: left alone, unless it was lifted last frame.
    const edge = mark({ y: 500 + 62 + 2 });
    expect(clearOfAllies([edge], [tag({})])[0]).toBe(edge);
    expect(clearOfAllies([edge], [tag({})], new Set([1]))[0]!.y).toBe(500 - 39 - 4);
  });
});
