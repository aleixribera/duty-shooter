import { describe, expect, it } from 'vitest';
import { barsShown } from '../src/hud/hud';
import { cornerHeight, pinMarker } from '../src/hud/markers';

describe('the Bottom bars', () => {
  it('show while you are in play, Downed included, and go once you are out (ticket 46)', () => {
    expect(barsShown({ alive: true })).toBe(true);
    expect(barsShown({ alive: false })).toBe(false);
    expect(barsShown(null)).toBe(false);
  });
});

describe('an edge marker', () => {
  const W = 1920;
  const H = 1080;

  it('behind you and to the left, sits over the health instead of on it (ticket 50)', () => {
    const m = pinMarker(-400, 0, true, W, H);
    expect(m.x).toBe(32);
    expect(m.y).toBe(H - cornerHeight(W));
  });

  it('behind you and to the right, sits over the ammo', () => {
    const m = pinMarker(W + 200, 0, true, W, H);
    expect(m.x).toBe(W - 32);
    expect(m.y).toBe(H - cornerHeight(W));
  });

  it('behind you in the middle, keeps to the bottom edge, where no bar is', () => {
    expect(pinMarker(W / 2, 0, true, W, H)).toEqual({ x: W / 2, y: H - 32 });
  });

  it('in view, stays where it is', () => {
    expect(pinMarker(800, 500, false, W, H)).toEqual({ x: 800, y: 500 });
    expect(pinMarker(100, 300, false, W, H)).toEqual({ x: 100, y: 300 });
  });

  it('on a phone, where the bars fill the bottom, never goes under the ping over them', () => {
    for (const x of [-50, 60, 195, 330, 500]) {
      const m = pinMarker(x, 900, false, 390, 844);
      expect(m.y).toBe(844 - cornerHeight(390));
    }
    expect(cornerHeight(390)).toBeGreaterThan(cornerHeight(W));
  });
});
