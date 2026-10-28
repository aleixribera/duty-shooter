import { describe, expect, it } from 'vitest';
import { PRESETS, presetPixelRatio } from '../src/pipeline';

/** Millions of pixels a preset renders for a `width` x `height` (CSS px) canvas at `dpr`. */
const megapixels = (preset: 'low' | 'normal' | 'high', width: number, height: number, dpr: number) => {
  const r = presetPixelRatio(preset, width, height, dpr);
  return (width * r * height * r) / 1e6;
};

describe('what each preset renders', () => {
  it('draws a 1080p screen at its own pixels on Low and Medium, and supersamples it on High', () => {
    expect(presetPixelRatio('low', 1920, 1080, 1)).toBe(1);
    expect(presetPixelRatio('normal', 1920, 1080, 1)).toBe(1);
    expect(presetPixelRatio('high', 1920, 1080, 1)).toBe(1.5);
  });

  it('ignores a high-DPI screen on Low, and keeps Medium within 1440p’s worth of pixels', () => {
    // A 1440 x 900 laptop at 2x: 2880 x 1800 device pixels.
    expect(presetPixelRatio('low', 1440, 900, 2)).toBe(1);
    expect(megapixels('normal', 1440, 900, 2)).toBeCloseTo(PRESETS.normal.megapixels, 5);
    expect(megapixels('high', 1440, 900, 2)).toBeCloseTo(PRESETS.high.megapixels, 5);
  });

  it('renders a 4K screen smaller than native on Low and Medium, never above each budget', () => {
    for (const preset of ['low', 'normal', 'high'] as const) {
      expect(megapixels(preset, 3840, 2160, 1)).toBeLessThanOrEqual(PRESETS[preset].megapixels + 1e-9);
    }
    expect(megapixels('low', 3840, 2160, 1)).toBeCloseTo(2.1, 5);
    expect(megapixels('normal', 3840, 2160, 1)).toBeCloseTo(3.7, 5);
  });

  it('turns on more as the presets go up', () => {
    expect(PRESETS.low.aa).toBe('fxaa');
    expect(PRESETS.normal.aa).toBe('taa');
    expect([PRESETS.low.ao, PRESETS.normal.ao, PRESETS.high.ao]).toEqual([false, 'half', 'full']);
    expect(PRESETS.low.dynamicResolution && !PRESETS.normal.dynamicResolution && !PRESETS.high.dynamicResolution).toBe(true);
  });
});
