import { afterEach, describe, expect, it } from 'vitest';
import { DynamicResolution, FrameCap, QUALITY, QUALITY_TIERS, QualityGovernor, RefreshEstimator, SCALE_FLOOR, TierSearch, currentQuality, forcePixelCap, pixelCap, shareOf, sharpenFor, targetFrameMs, tierBy, tierFromHints, tierOf, useQuality, type AdapterHints, type GovernorSettings, type QualityProfile, type QualityTier } from '../src/quality';

describe('the quality tiers', () => {
  it('cost no less at each step up: nothing a tier turns on is off in the tier above it', () => {
    const rising: (keyof QualityProfile)[] = ['renderScale', 'megapixels', 'shadowMapSize', 'shadowDistance', 'shadowRate', 'aoSamples', 'viewmodelSamples', 'particles', 'scatterDensity', 'scatterDistance', 'anisotropy'];
    const switches: (keyof QualityProfile)[] = ['shafts', 'bloom', 'shimmer', 'dust'];
    for (let i = 1; i < QUALITY_TIERS.length; i++) {
      const under = QUALITY[QUALITY_TIERS[i - 1]!];
      const over = QUALITY[QUALITY_TIERS[i]!];
      for (const key of rising) expect(over[key] as number, `${key} at ${over.tier}`).toBeGreaterThanOrEqual(under[key] as number);
      for (const key of switches) expect(Number(over[key]), `${key} at ${over.tier}`).toBeGreaterThanOrEqual(Number(under[key]));
    }
  });

  it('keep High as the picture the game had before tiers', () => {
    expect(QUALITY.high).toMatchObject({ renderScale: 1, megapixels: 3.7, shadowMapSize: 2048, shadowDistance: 45, aoSamples: 8, antialias: 'taa', shafts: true, bloom: true, particles: 1, scatterDensity: 1, scatterDistance: 1 });
  });

  it('name themselves and never render under the dynamic floor', () => {
    for (const tier of QUALITY_TIERS) {
      expect(QUALITY[tier].tier).toBe(tier);
      expect(QUALITY[tier].renderScale).toBeGreaterThanOrEqual(SCALE_FLOOR);
      expect(QUALITY[tier].renderScale).toBeLessThanOrEqual(1);
    }
  });

  it('draw the chosen tier, or under Auto the one it found', () => {
    expect(tierOf('ultra', 'low')).toBe('ultra');
    expect(tierOf('auto', 'low')).toBe('low');
    expect(tierOf('auto', null)).toBe('medium');
    expect(tierOf('auto', null, 'high')).toBe('high');
    expect(tierBy('low', -1)).toBe('low');
    expect(tierBy('high', 1)).toBe('ultra');
    expect(tierBy('ultra', 1)).toBe('ultra');
  });

  it('keep at least one of anything there was any of', () => {
    expect(shareOf(100, 0.4)).toBe(40);
    expect(shareOf(2, 0.1)).toBe(1);
    expect(shareOf(0, 0.5)).toBe(0);
  });
});

describe("the adapter's hints", () => {
  const webgpu = { backend: 'webgpu', software: false, mobile: false } as const;

  it('keep a software rasteriser on Low', () => {
    expect(tierFromHints({ ...webgpu, adapter: 'google swiftshader' })).toEqual({ start: 'low', ceiling: 'low' });
    expect(tierFromHints({ ...webgpu, adapter: '', software: true })).toEqual({ start: 'low', ceiling: 'low' });
  });

  it('start a phone on Low, an integrated GPU or WebGL2 on Medium and a discrete card on High', () => {
    expect(tierFromHints({ ...webgpu, adapter: 'qualcomm adreno 740', mobile: true }).start).toBe('low');
    expect(tierFromHints({ ...webgpu, adapter: 'intel gen-12lp iris xe' }).start).toBe('medium');
    expect(tierFromHints({ backend: 'webgl2', adapter: 'ANGLE (NVIDIA GeForce RTX 3070)', software: false, mobile: false })).toEqual({ start: 'medium', ceiling: 'high' });
    expect(tierFromHints({ ...webgpu, adapter: 'nvidia ampere geforce rtx 3070' })).toEqual({ start: 'high', ceiling: 'ultra' });
    expect(tierFromHints({ ...webgpu, adapter: 'amd radeon rx 6700 xt' }).start).toBe('high');
    expect(tierFromHints({ ...webgpu, adapter: 'amd radeon(tm) graphics' }).start).toBe('medium');
    expect(tierFromHints({ ...webgpu, adapter: '' }).start).toBe('medium');
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
    expect(targetFrameMs(0, e.hz)).toBeCloseTo(1000 / 60);
  });

  it("holds the cap's frame time where there is one, never faster than the display", () => {
    expect(targetFrameMs(0, 144)).toBeCloseTo(1000 / 144);
    expect(targetFrameMs(60, 144)).toBeCloseTo(1000 / 60);
    expect(targetFrameMs(240, 60)).toBeCloseTo(1000 / 60);
    expect(targetFrameMs(30, null)).toBeCloseTo(1000 / 30);
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

/**
 * A machine: its frame takes `fixed` ms plus `perPixel` ms at full scale times
 * the scale squared, and never less than one refresh of its display.
 */
function machine(fixed: number, perPixel: number, refreshMs = 0) {
  return (scale: number) => {
    const work = fixed + perPixel * scale * scale;
    return refreshMs > 0 ? Math.ceil(work / refreshMs - 1e-9) * refreshMs : work;
  };
}

/** Runs the controller on a machine for `seconds`, returning every scale it rendered at over time. */
function run(controller: DynamicResolution, cost: (scale: number) => number, targetMs: number, seconds: number): number[] {
  const scales: number[] = [];
  let t = 0;
  while (t < seconds * 1000) {
    const ms = cost(controller.scale);
    scales.push(controller.scale);
    controller.frame(ms, targetMs);
    t += ms;
  }
  return scales;
}

const changes = (scales: readonly number[]) => scales.filter((s, i) => i > 0 && s !== scales[i - 1]).length;

describe('dynamic resolution', () => {
  const TARGET = 1000 / 60;

  it('stays at full scale on a machine that holds the target', () => {
    const c = new DynamicResolution();
    const scales = run(c, machine(4, 8), TARGET, 30);
    expect(new Set(scales)).toEqual(new Set([1]));
  });

  it('drops within a second to a scale that holds the target, and stays near it', () => {
    const c = new DynamicResolution();
    // 4 ms fixed and 26 ms of pixels at full scale: 30 ms a frame, and 16.7 at a scale of about 0.7.
    const cost = machine(4, 26);
    const scales = run(c, cost, TARGET, 60);
    const firstSecond = scales.slice(0, Math.ceil(1000 / 20));
    expect(Math.min(...firstSecond)).toBeLessThan(0.8);
    const settled = scales.slice(Math.floor(scales.length / 2));
    for (const s of settled) {
      expect(s).toBeGreaterThanOrEqual(0.6);
      expect(s).toBeLessThanOrEqual(0.75);
    }
    expect(cost(c.scale)).toBeLessThanOrEqual(TARGET * 1.08);
  });

  it('does not pump at the edge of what the machine can do: each failed step up doubles the wait for the next', () => {
    const c = new DynamicResolution();
    const scales = run(c, machine(4, 26), TARGET, 300);
    // Five minutes at the edge: the first drop, then a step up and back at 2, 4, 8... seconds, then once a minute.
    expect(changes(scales)).toBeLessThanOrEqual(24);
    const lastMinute = scales.slice(-Math.floor(60_000 / TARGET));
    expect(changes(lastMinute)).toBeLessThanOrEqual(2);
  });

  it('works under v-sync, where a missed frame takes two whole refreshes', () => {
    const c = new DynamicResolution();
    const cost = machine(3, 22, TARGET);
    const scales = run(c, cost, TARGET, 120);
    expect(cost(c.scale)).toBeCloseTo(TARGET);
    expect(changes(scales.slice(-Math.floor(30_000 / TARGET)))).toBeLessThanOrEqual(2);
  });

  it('climbs back to full scale when the load goes', () => {
    const c = new DynamicResolution();
    run(c, machine(4, 26), TARGET, 20);
    expect(c.scale).toBeLessThan(0.8);
    run(c, machine(4, 8), TARGET, 60);
    expect(c.scale).toBe(1);
  });

  it('never leaves its floor and ceiling', () => {
    const c = new DynamicResolution();
    const scales = run(c, machine(40, 60), TARGET, 30);
    expect(Math.min(...scales)).toBe(SCALE_FLOOR);
    const narrow = new DynamicResolution({ floor: 0.7, ceiling: 0.9 });
    const within = [...run(narrow, machine(40, 60), TARGET, 20), ...run(narrow, machine(1, 1), TARGET, 60)];
    expect(Math.min(...within)).toBe(0.7);
    expect(Math.max(...within)).toBe(0.9);
  });

  it('takes a stall for what it is: one long frame moves nothing', () => {
    const c = new DynamicResolution();
    run(c, machine(4, 8), TARGET, 5);
    c.frame(900, TARGET);
    c.frame(400, TARGET);
    run(c, machine(4, 8), TARGET, 5);
    expect(c.scale).toBe(1);
  });

  it('judges long frames that come in a row: a picture at four frames a second is no stall', () => {
    const c = new DynamicResolution();
    for (let i = 0; i < 12; i++) c.frame(280, TARGET);
    expect(c.scale).toBeLessThan(1);
  });

  it('leaves a hitch out of the picture: a frame in ten four times too long moves nothing', () => {
    const c = new DynamicResolution();
    let n = 0;
    const scales = run(c, () => (++n % 12 === 0 ? 70 : 9), TARGET, 30);
    expect(Math.min(...scales)).toBe(1);
  });

  it('still drops for a picture that misses one refresh in four', () => {
    const c = new DynamicResolution();
    let n = 0;
    run(c, () => (++n % 4 === 0 ? TARGET * 2 : TARGET), TARGET, 5);
    expect(c.scale).toBeLessThan(1);
  });

  it('moves in whole steps', () => {
    const c = new DynamicResolution();
    for (const s of run(c, machine(4, 26), TARGET, 30)) expect(Math.abs(s * 20 - Math.round(s * 20))).toBeLessThan(1e-6);
  });

  it('starts again from the top on reset', () => {
    const c = new DynamicResolution();
    run(c, machine(4, 26), TARGET, 10);
    c.reset();
    expect(c.scale).toBe(1);
    c.reset(0.72);
    expect(c.scale).toBe(0.7);
  });

  it('sharpens more the further the picture is stretched', () => {
    expect(sharpenFor(1)).toBeCloseTo(0.5);
    expect(sharpenFor(0.75)).toBeGreaterThan(sharpenFor(1));
    expect(sharpenFor(SCALE_FLOOR)).toBeGreaterThan(sharpenFor(0.75));
    expect(sharpenFor(0.2)).toBe(sharpenFor(SCALE_FLOOR));
  });
});

describe("Auto's search for a tier", () => {
  const TARGET = 1000 / 60;
  /** Frame time (ms) of each tier on a machine. */
  const find = (cost: Record<string, number>, start: 'low' | 'medium' | 'high' | 'ultra', ceiling: 'low' | 'medium' | 'high' | 'ultra' = 'ultra') => {
    const search = new TierSearch(start, ceiling);
    const drawn: string[] = [];
    for (let i = 0; i < 20_000 && !search.found; i++) {
      if (drawn[drawn.length - 1] !== search.tier) drawn.push(search.tier);
      search.frame(cost[search.tier]!, TARGET);
    }
    return { found: search.found, drawn };
  };

  it('climbs while tiers hold the target and ends on the highest that did', () => {
    expect(find({ low: 5, medium: 8, high: 12, ultra: 15 }, 'medium')).toEqual({ found: 'ultra', drawn: ['medium', 'high', 'ultra'] });
    expect(find({ low: 5, medium: 8, high: 12, ultra: 24 }, 'medium')).toEqual({ found: 'high', drawn: ['medium', 'high', 'ultra'] });
  });

  it('drops while tiers miss it and ends on the first that holds', () => {
    expect(find({ low: 9, medium: 15, high: 26, ultra: 40 }, 'high')).toEqual({ found: 'medium', drawn: ['high', 'medium'] });
    expect(find({ low: 40, medium: 60, high: 80, ultra: 99 }, 'high')).toEqual({ found: 'low', drawn: ['high', 'medium', 'low'] });
  });

  it('fails a tier whose every frame takes over a second, instead of waiting for frames it can judge', () => {
    expect(find({ low: 12, medium: 1400, high: 2000, ultra: 3000 }, 'high')).toEqual({ found: 'low', drawn: ['high', 'medium', 'low'] });
  });

  it('takes one frame of over a second for a stall', () => {
    const search = new TierSearch('high', 'high');
    for (let i = 0; i < 400 && !search.found; i++) search.frame(i % 50 === 49 ? 1500 : 10, TARGET);
    expect(search.found).toBe('high');
  });

  it('never goes over the ceiling the hints set', () => {
    expect(find({ low: 2, medium: 3, high: 4, ultra: 5 }, 'medium', 'high').found).toBe('high');
    expect(find({ low: 2, medium: 3, high: 4, ultra: 5 }, 'ultra', 'low')).toEqual({ found: 'low', drawn: ['low'] });
  });

  it('leaves out the frames right after a change of tier, when shaders rebuild', () => {
    const search = new TierSearch('high');
    // A second of stalls, then a tier that holds.
    for (let i = 0; i < 4; i++) search.frame(240, TARGET);
    for (let i = 0; i < 400 && search.tier === 'high'; i++) search.frame(10, TARGET);
    expect(search.tier).toBe('ultra');
  });
});

describe('the governor', () => {
  afterEach(() => {
    useQuality(QUALITY.high);
    forcePixelCap(null);
  });

  const card: AdapterHints = { backend: 'webgpu', adapter: 'nvidia rtx 4070', software: false, mobile: false };
  const laptop: AdapterHints = { backend: 'webgpu', adapter: 'intel iris xe', software: false, mobile: false };
  const picked = (over: Partial<GovernorSettings> = {}): GovernorSettings => ({ quality: 'auto', autoTier: null, autoAdapter: '', dynamicResolution: false, fpsCap: 0, ...over });
  /** Draws for `seconds` on a machine where a frame of each tier costs `cost(tier, scale)` ms; returns the tiers drawn, in order. */
  const play = (g: QualityGovernor, cost: (tier: QualityTier, scale: number) => number, seconds: number, from = 0): { tiers: QualityTier[]; end: number; frames: number } => {
    const tiers: QualityTier[] = [];
    let t = from;
    let frames = 0;
    while (t < from + seconds * 1000) {
      if (g.tick(t)) {
        if (tiers[tiers.length - 1] !== g.tier) tiers.push(g.tier);
        g.drawn(t, true);
        frames++;
      }
      t += cost(g.tier, g.scale);
    }
    return { tiers, end: t, frames };
  };

  it('draws the tier picked by hand, at its own scale, and never searches', () => {
    const g = new QualityGovernor(card, picked({ quality: 'low' }), 60);
    expect([g.tier, g.searching, g.scale]).toEqual(['low', false, QUALITY.low.renderScale]);
    expect(currentQuality()).toBe(QUALITY.low);
    play(g, () => 40, 20);
    expect([g.tier, g.scale]).toEqual(['low', QUALITY.low.renderScale]);
  });

  it('under Auto with nothing remembered, tries tiers from where the hints start and reports the highest that holds, once', () => {
    const g = new QualityGovernor(card, picked(), 60);
    const found: [QualityTier, string][] = [];
    g.onFound = (tier, adapter) => found.push([tier, adapter]);
    expect([g.tier, g.searching]).toEqual(['high', true]);
    const ms = { low: 5, medium: 9, high: 14, ultra: 30 };
    const { tiers } = play(g, (tier) => ms[tier], 30);
    expect(tiers).toEqual(['high', 'ultra', 'high']);
    expect(found).toEqual([['high', 'nvidia rtx 4070']]);
    expect([g.tier, g.searching]).toEqual(['high', false]);
    expect(currentQuality()).toBe(QUALITY.high);
  });

  it('keeps what Auto remembered for this adapter, and measures again on another', () => {
    const same = new QualityGovernor(card, picked({ autoTier: 'medium', autoAdapter: 'nvidia rtx 4070' }), 60);
    expect([same.tier, same.searching]).toEqual(['medium', false]);
    const moved = new QualityGovernor(laptop, picked({ autoTier: 'ultra', autoAdapter: 'nvidia rtx 4070' }), 60);
    expect([moved.tier, moved.searching]).toEqual(['medium', true]);
  });

  it('has nothing to measure where the hints leave one tier', () => {
    const g = new QualityGovernor({ ...card, software: true }, picked(), 60);
    expect([g.tier, g.searching]).toEqual(['low', false]);
  });

  it('looks again when what Auto remembered is cleared, and keeps what it found when that is handed back', () => {
    const g = new QualityGovernor(card, picked({ autoTier: 'medium', autoAdapter: 'nvidia rtx 4070' }), 60);
    g.use(picked());
    expect([g.tier, g.searching]).toEqual(['high', true]);
    g.onFound = (tier, adapter) => g.use(picked({ autoTier: tier, autoAdapter: adapter }));
    play(g, () => 5, 30);
    expect([g.tier, g.searching]).toEqual(['ultra', false]);
  });

  it('holds the frame time with dynamic resolution on, and leaves the scale alone with it off', () => {
    const cost = (_: QualityTier, scale: number) => 4 + 26 * scale * scale;
    const off = new QualityGovernor(card, picked({ quality: 'high' }), 60);
    play(off, cost, 20);
    expect(off.scale).toBe(1);
    expect(off.dynamic).toBe(false);
    const on = new QualityGovernor(card, picked({ quality: 'high', dynamicResolution: true }), 60);
    play(on, cost, 20);
    expect(on.dynamic).toBe(true);
    expect(on.scale).toBeLessThan(0.8);
    expect(cost('high', on.scale)).toBeLessThanOrEqual((1000 / 60) * 1.08);
    on.restart();
    expect(on.scale).toBe(1);
    on.use(picked({ quality: 'high' }));
    expect(on.scale).toBe(1);
  });

  it('holds the scale while Auto is still looking, whatever dynamic resolution says', () => {
    const g = new QualityGovernor(card, picked({ dynamicResolution: true }), 60);
    play(g, () => 40, 1);
    expect([g.searching, g.dynamic, g.scale]).toEqual([true, false, QUALITY[g.tier].renderScale]);
  });

  it('judges only frames drawn one after another with the game on show', () => {
    const g = new QualityGovernor(card, picked({ quality: 'high', dynamicResolution: true }), 60);
    // Slow frames, every other one behind a menu: no two judged frames in a row, so nothing to judge.
    for (let i = 0, t = 0; i < 600; i++, t += 40) {
      g.tick(t);
      g.drawn(t, i % 2 === 0);
    }
    expect(g.scale).toBe(1);
  });

  it('draws under the cap, and aims at the cap where it is under the display', () => {
    const g = new QualityGovernor(card, picked({ quality: 'high', fpsCap: 30 }), 60);
    expect(g.targetMs).toBeCloseTo(1000 / 30);
    const { frames } = play(g, () => 1000 / 60, 10);
    expect(frames).toBeGreaterThan(290);
    expect(frames).toBeLessThan(310);
    g.use(picked({ quality: 'high', fpsCap: 240 }));
    expect(g.targetMs).toBeCloseTo(1000 / 60);
  });

  it("takes the display's rate as stated, or reads it from the ticks", () => {
    expect(new QualityGovernor(card, picked({ quality: 'high' }), 144).refreshHz).toBe(144);
    const g = new QualityGovernor(card, picked({ quality: 'high' }));
    expect(g.refreshHz).toBeNull();
    play(g, () => 1000 / 120, 3);
    expect(g.refreshHz).toBe(120);
  });

  it('caps nothing with a cap at the display rate: no tick is passed over on a display a hair faster than the cap', () => {
    const g = new QualityGovernor(card, picked({ quality: 'high', fpsCap: 60 }));
    let ticks = 0;
    let drawn = 0;
    for (let t = 0; t < 30_000; t += 1000 / 60.05) {
      ticks++;
      if (g.tick(t)) drawn++;
    }
    expect(g.refreshHz).toBe(60);
    expect(drawn).toBe(ticks);
  });

  it('asks the display its rate again once the scale has sat at its floor: a window moved to a slower display is not held to the old one', () => {
    const g = new QualityGovernor(card, picked({ quality: 'high', dynamicResolution: true }));
    // A 144 Hz display, held with room to spare.
    const fast = play(g, () => 1000 / 144, 5);
    expect(g.refreshHz).toBe(144);
    expect(g.scale).toBe(1);
    // The window goes to a 60 Hz display: a tick every 16.7 ms, however small the picture.
    const slow = play(g, () => 1000 / 60, 6, fast.end);
    expect(g.scale).toBe(SCALE_FLOOR);
    play(g, () => 1000 / 60, 45, slow.end);
    expect(g.refreshHz).toBe(60);
    expect(g.scale).toBe(1);
  });

  it('keeps a rate that was stated, whatever the ticks say', () => {
    const g = new QualityGovernor(card, picked({ quality: 'high', dynamicResolution: true }), 144);
    play(g, () => 1000 / 60, 30);
    expect(g.refreshHz).toBe(144);
    expect(g.scale).toBe(SCALE_FLOOR);
  });

  it('puts the tier and the scale on the game, and only when they have moved', () => {
    const g = new QualityGovernor(card, picked({ quality: 'medium' }), 60);
    const calls: string[] = [];
    let scale = 1;
    const game = {
      quality: QUALITY.high as QualityProfile,
      setQuality(profile: QualityProfile) {
        calls.push(profile.name);
        this.quality = profile;
      },
      get renderScale() {
        return scale;
      },
      set renderScale(v: number) {
        calls.push(`scale ${v}`);
        scale = v;
      },
    };
    g.apply(game);
    g.apply(game);
    expect(calls).toEqual([QUALITY.medium.name, `scale ${QUALITY.medium.renderScale}`]);
  });

  it('lets a measurement lift the pixel cap of every tier', () => {
    expect(pixelCap(QUALITY.low)).toBe(QUALITY.low.megapixels);
    forcePixelCap(20);
    expect(QUALITY_TIERS.map((t) => pixelCap(QUALITY[t]))).toEqual([20, 20, 20, 20]);
    forcePixelCap(null);
    expect(pixelCap(QUALITY.ultra)).toBe(QUALITY.ultra.megapixels);
  });
});
