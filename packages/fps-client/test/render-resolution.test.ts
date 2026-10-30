import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from '../src/pipeline';

/** Millions of pixels rendered for a `width` x `height` (CSS px) canvas at `dpr`. */
const megapixels = (width: number, height: number, dpr: number) => {
  const r = renderPixelRatio(width, height, dpr);
  return (width * r * height * r) / 1e6;
};

describe('the render resolution', () => {
  it('draws a 1080p screen at its own pixels', () => {
    expect(renderPixelRatio(1920, 1080, 1)).toBe(1);
  });

  it('keeps a high-DPI screen within 1440p’s worth of pixels', () => {
    // A 1440 x 900 laptop at 2x: 2880 x 1800 device pixels.
    expect(megapixels(1440, 900, 2)).toBeCloseTo(3.7, 5);
  });

  it('renders a 4K screen smaller than native', () => {
    expect(megapixels(3840, 2160, 1)).toBeCloseTo(3.7, 5);
  });

  it('caps a very dense screen at twice its CSS pixels', () => {
    expect(renderPixelRatio(320, 200, 3)).toBe(2);
  });
});
