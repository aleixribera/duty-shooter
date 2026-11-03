import { describe, expect, it } from 'vitest';
import { softConcealment, SOFT_DEPTH, type SoftCover } from '../src/soft-cover';
import type { Vec3 } from '../src/math';

const bush: SoftCover = { x: 0, z: 0, radius: 1, bottom: 0, top: 1.6 };

describe('soft cover', () => {
  const cover = softConcealment([bush]);

  it('hides a crouched body behind a bush', () => {
    expect(cover.hides([-20, 1, 0], [6, 1, 0])).toBe(true);
  });

  it('hides nothing beside the bush, or over its top', () => {
    expect(cover.hides([-20, 1, 1.2], [6, 1, 1.2])).toBe(false);
    expect(cover.hides([-20, 2, 0], [6, 2, 0])).toBe(false);
  });

  it("lets a look through a bush's thin edge", () => {
    // A chord 2·√(1 − 0.95²) ≈ 0.62 m long: less than the depth that hides.
    expect(SOFT_DEPTH).toBeGreaterThan(0.65);
    expect(cover.hides([-20, 1, 0.95], [6, 1, 0.95])).toBe(false);
  });

  it('lets a bot crouched in a bush see out of it', () => {
    expect(cover.hides([0, 1, 0], [20, 1, 0])).toBe(false);
  });

  it('hides a body crouched deep in a bush', () => {
    expect(cover.hides([-20, 1, 0], [0.2, 1, 0])).toBe(true);
    expect(cover.hides([-20, 1, 0], [-0.7, 1, 0])).toBe(false);
  });

  it('adds up foliage along the look: two thin edges hide as one bush does', () => {
    const pair = softConcealment([
      { x: 0, z: 1.05, radius: 1, bottom: 0, top: 1.6 },
      { x: 3, z: 1.05, radius: 1, bottom: 0, top: 1.6 },
    ]);
    expect(pair.hides([-20, 1, 0.1], [20, 1, 0.1])).toBe(true);
    expect(softConcealment([{ x: 0, z: 1.05, radius: 1, bottom: 0, top: 1.6 }]).hides([-20, 1, 0.1], [20, 1, 0.1])).toBe(false);
  });

  it('counts only the part of a look that is down in the foliage', () => {
    // Down from a hill onto a body behind the bush: the look enters the bush's top late, and still crosses enough.
    expect(cover.hides([-6, 4, 0], [1.5, 0.8, 0])).toBe(true);
    // Steeply down, past the top of the bush: barely in it.
    expect(cover.hides([-1, 30, 0], [1.3, 1, 0])).toBe(false);
  });

  it('answers as testing every bush would, across a field of them', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const covers: SoftCover[] = Array.from({ length: 400 }, () => {
      const bottom = random() * 3;
      return { x: random() * 200 - 100, z: random() * 200 - 100, radius: 0.4 + random() * 1.6, bottom, top: bottom + 0.5 + random() * 2 };
    });
    const field = softConcealment(covers);
    const every = softConcealment(covers, { cell: 1000 });
    let hidden = 0;
    for (let i = 0; i < 2000; i++) {
      const from: Vec3 = [random() * 220 - 110, random() * 4, random() * 220 - 110];
      const to: Vec3 = [random() * 220 - 110, random() * 4, random() * 220 - 110];
      const h = field.hides(from, to);
      expect(h).toBe(every.hides(from, to));
      if (h) hidden++;
    }
    expect(hidden).toBeGreaterThan(100);
  });
});
