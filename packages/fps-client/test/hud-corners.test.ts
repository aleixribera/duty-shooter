import { describe, expect, it } from 'vitest';
import { barsShown } from '../src/hud/hud';
import { cornerHeight, MARKER_ROOM, pinMarker, spreadMarkers, TOUCH_GROUND } from '../src/hud/markers';

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

  it("while you're out, sits over the spectator's panel instead of on its health (review 2026-11-14a, 23-kill-1b)", () => {
    const panel = { width: 460, height: 320 };
    // The dropped charge behind you and to the left: it pinned over the 124 px health corner, onto the panel's readouts.
    expect(pinMarker(-400, 0, true, W, H, false, panel)).toEqual({ x: 32, y: H - 320 });
    // Low on the left in view, and with a phone's touch controls, likewise.
    expect(pinMarker(300, 900, false, W, H, false, panel)).toEqual({ x: 300, y: H - 320 });
    expect(pinMarker(100, 800, false, 844, 390, true, { width: 300, height: 260 }).y).toBe(390 - 260);
    // A marker whose box reaches past the panel's right edge is lifted; one clear of it, or above it, stays where it would be without it.
    expect(pinMarker(470, 900, false, W, H, false, panel)).toEqual({ x: 470, y: H - 320 });
    expect(pinMarker(460 + MARKER_ROOM.width / 2, 900, false, W, H, false, panel)).toEqual({ x: 460 + MARKER_ROOM.width / 2, y: 900 });
    expect(pinMarker(100, 500, false, W, H, false, panel)).toEqual({ x: 100, y: 500 });
  });

  it("on a short screen, where the spectator's panel reaches the top, sits beside it instead", () => {
    // 844 x 390: the panel took 334 px of the height, and markers clamped to its top still lay on its name.
    expect(pinMarker(18, 100, false, 844, 390, false, { width: 300, height: 334 })).toEqual({ x: 300 + MARKER_ROOM.width / 2, y: 100 });
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

  describe('with the touch controls on the glass (ticket 23)', () => {
    const TW = 844;
    const TH = 390;
    const g = TOUCH_GROUND;

    it('behind you and to the right, sits over the fire cluster, not on it', () => {
      const m = pinMarker(TW + 200, 0, true, TW, TH, true);
      expect(m).toEqual({ x: TW - 32, y: TH - g.cluster.height });
    });

    it('behind you and to the left, sits over the stick', () => {
      expect(pinMarker(-300, 0, true, TW, TH, true)).toEqual({ x: 32, y: TH - g.stick.height });
    });

    it('behind you in the middle, sits over the health and the ammo', () => {
      expect(pinMarker(TW / 2, 0, true, TW, TH, true)).toEqual({ x: TW / 2, y: TH - g.plates });
    });

    it('at the top corners, moves in from Pause and from Ping', () => {
      expect(pinMarker(-50, 20, false, TW, TH, true)).toEqual({ x: g.menu.width, y: 56 });
      expect(pinMarker(TW + 50, 20, false, TW, TH, true)).toEqual({ x: TW - g.ping.width, y: 56 });
    });

    it('in view between the thumbs, stays where it is', () => {
      expect(pinMarker(420, 150, false, TW, TH, true)).toEqual({ x: 420, y: 150 });
    });

    it('is never under a control, wherever the point is', () => {
      for (let x = -100; x <= TW + 100; x += 37) {
        for (let y = -100; y <= TH + 100; y += 29) {
          for (const behind of [false, true]) {
            const m = pinMarker(x, y, behind, TW, TH, true);
            const inCluster = m.x >= TW - g.cluster.width && m.y > TH - g.cluster.height;
            const inStick = m.x <= g.stick.width && m.y > TH - g.stick.height;
            const inMenu = m.x < g.menu.width && m.y <= g.menu.height;
            const inPing = m.x > TW - g.ping.width && m.y <= g.ping.height;
            expect(inCluster || inStick || inMenu || inPing || m.y > TH - g.plates).toBe(false);
          }
        }
      }
    });
  });
});

describe('objective markers', () => {
  const W = 1920;
  const H = 1080;
  const covers = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < MARKER_ROOM.width && Math.abs(a.y - b.y) < MARKER_ROOM.height;

  it('two zones pinned to the same edge stand one over the other, not on top of each other (review 2026-11-13b)', () => {
    const a = { id: 'A', ...pinMarker(-300, 505, false, W, H) };
    const b = { id: 'B', ...pinMarker(-900, 515, false, W, H) };
    expect(covers(a, b)).toBe(true);
    const [sa, sb] = spreadMarkers([a, b]);
    expect(sa).toBe(a);
    expect(covers(sa!, sb!)).toBe(false);
    expect(sb!.x).toBe(a.x);
    expect(sb!.y).toBeLessThan(a.y);
  });

  it('three on one edge make a column, none covering another', () => {
    const marks = ['A', 'B', 'C'].map((id, i) => ({ id, ...pinMarker(-200 - i * 100, 500 + i * 8, false, W, H) }));
    const placed = spreadMarkers(marks);
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(covers(placed[i]!, placed[j]!)).toBe(false);
  });

  it('at the top edge, the second goes under the first instead of off the screen', () => {
    const a = { id: 'A', ...pinMarker(W + 100, 0, false, W, H) };
    const b = { id: 'B', ...pinMarker(W + 400, 10, false, W, H) };
    const [sa, sb] = spreadMarkers([a, b]);
    expect(sa).toBe(a);
    expect(sb!.y).toBeGreaterThan(a.y);
    expect(covers(sa!, sb!)).toBe(false);
  });

  it('markers apart stay on their points', () => {
    const marks = [
      { id: 'A', x: 400, y: 500 },
      { id: 'B', x: 1200, y: 500 },
    ];
    expect(spreadMarkers(marks)).toEqual(marks);
  });
});
