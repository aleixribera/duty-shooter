import { describe, expect, it } from 'vitest';
import { FramePacer, PICTURE, RefreshEstimator, FrameCap, keeps, shareOf } from '../src/quality';

describe('the picture', () => {
  // Ticket 35: one look on every machine. Nothing in it is thinned: no tier, no scale, no share of the grass.
  it('draws everything there is, every time', () => {
    expect(PICTURE).toMatchObject({ shadowMapSize: 2048, shadowDistance: 45, aoSamples: 8, particles: 1, scatterDensity: 1, scatterDistance: 1 });
    for (let i = 0; i < 100; i++) expect(keeps(i, PICTURE.scatterDensity)).toBe(true);
  });

  it('keep at least one of anything there was any of', () => {
    expect(shareOf(100, 0.4)).toBe(40);
    expect(shareOf(2, 0.1)).toBe(1);
    expect(shareOf(0, 0.5)).toBe(0);
  });
});

describe("the display's refresh", () => {
  const feed = (e: RefreshEstimator, intervals: number[], times = 1) => {
    for (let n = 0; n < times; n++) for (const i of intervals) e.tick(i);
  };

  it('is unknown before enough ticks', () => {
    const e = new RefreshEstimator();
    feed(e, [16.7], 10);
    expect(e.hz).toBeNull();
  });

  it('reads 60, 120 and 144 Hz from steady ticks', () => {
    for (const hz of [60, 120, 144]) {
      const e = new RefreshEstimator();
      feed(e, [1000 / hz + 0.05, 1000 / hz - 0.05], 60);
      expect(e.hz).toBe(hz);
    }
  });

  it('still reads 60 Hz while the game drops most frames, once it has seen the display tick freely', () => {
    const e = new RefreshEstimator();
    feed(e, [16.7], 60);
    feed(e, [33.3, 33.4, 50, 33.3], 60);
    expect(e.hz).toBe(60);
  });

  it('only goes up by itself, and reads a slower display once it is told to look again', () => {
    const e = new RefreshEstimator();
    feed(e, [1000 / 144], 120);
    feed(e, [16.7], 120);
    expect(e.hz).toBe(144);
    e.relearn();
    // The old rate stands until a full window of ticks has been seen.
    feed(e, [16.7], 30);
    expect(e.hz).toBe(144);
    feed(e, [16.7], 60);
    expect(e.hz).toBe(60);
    // And up again by itself, as before.
    feed(e, [1000 / 144], 60);
    expect(e.hz).toBe(144);
  });

  it('says nothing where ticks come faster than any display', () => {
    const e = new RefreshEstimator();
    feed(e, [1.2, 0.9, 1.4], 60);
    expect(e.hz).toBeNull();
  });

});

describe('the frame-rate cap', () => {
  const drawn = (fps: number, tickMs: number, seconds: number) => {
    const cap = new FrameCap();
    let frames = 0;
    for (let t = 0; t < seconds * 1000; t += tickMs) if (cap.due(t, fps)) frames++;
    return frames / seconds;
  };

  it('draws every tick with no cap', () => {
    expect(Math.abs(drawn(0, 1000 / 144, 2) - 144)).toBeLessThan(1);
  });

  it('averages its rate on a faster display, not a divisor of the display under it', () => {
    expect(drawn(60, 1000 / 144, 10)).toBeGreaterThan(58);
    expect(drawn(60, 1000 / 144, 10)).toBeLessThan(61.5);
    expect(drawn(30, 1000 / 60, 10)).toBeCloseTo(30, 0);
    expect(drawn(90, 1000 / 240, 10)).toBeGreaterThan(87);
    expect(drawn(90, 1000 / 240, 10)).toBeLessThan(92);
  });

  it('draws every tick where the display is slower than the cap', () => {
    expect(drawn(240, 1000 / 60, 5)).toBeCloseTo(60, 0);
  });

  it('picks up again after a stall instead of bursting to catch up', () => {
    const cap = new FrameCap();
    cap.due(0, 60);
    let frames = 0;
    for (let t = 5000; t < 5100; t += 1000 / 240) if (cap.due(t, 60)) frames++;
    expect(frames).toBeLessThanOrEqual(7);
  });
});

describe('the pacer', () => {
  /** Ticks for `seconds` every `tickMs`; returns the frames drawn. */
  const play = (p: FramePacer, tickMs: number, seconds: number, from = 0) => {
    let frames = 0;
    for (let t = from; t < from + seconds * 1000; t += tickMs) if (p.tick(t)) frames++;
    return frames;
  };

  it('draws under the cap, and every tick once the cap is lifted', () => {
    const p = new FramePacer(30, 60);
    const frames = play(p, 1000 / 60, 10);
    expect(frames).toBeGreaterThan(290);
    expect(frames).toBeLessThan(310);
    p.fpsCap = 0;
    let ticks = 0;
    let drawn = 0;
    for (let t = 10_000; t < 11_000; t += 1000 / 60, ticks++) if (p.tick(t)) drawn++;
    expect(drawn).toBe(ticks);
  });

  it("takes the display's rate as stated, or reads it from the ticks", () => {
    expect(new FramePacer(0, 144).refreshHz).toBe(144);
    const p = new FramePacer(0);
    expect(p.refreshHz).toBeNull();
    play(p, 1000 / 120, 3);
    expect(p.refreshHz).toBe(120);
  });

  it('caps nothing with a cap at the display rate: no tick is passed over on a display a hair faster than the cap', () => {
    const p = new FramePacer(60);
    let ticks = 0;
    let drawn = 0;
    for (let t = 0; t < 30_000; t += 1000 / 60.05) {
      ticks++;
      if (p.tick(t)) drawn++;
    }
    expect(p.refreshHz).toBe(60);
    expect(drawn).toBe(ticks);
  });

  it('reads a slower display once the window moves: one taken from a 144 Hz screen to a 60 Hz one is not held to the old rate', () => {
    const p = new FramePacer(0);
    play(p, 1000 / 144, 5);
    expect(p.refreshHz).toBe(144);
    p.displayMoved();
    play(p, 1000 / 60, 2, 5000);
    expect(p.refreshHz).toBe(60);
  });

  it('never takes a slow machine for a slow display: a 144 Hz screen ticked every other refresh for minutes is still 144 Hz', () => {
    const p = new FramePacer(120);
    play(p, 1000 / 144, 5);
    play(p, 2000 / 144, 300, 5000);
    expect(p.refreshHz).toBe(144);
  });
});
