import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from '../src/pipeline';

describe('the render resolution', () => {
  it("draws every pixel of the screen, whatever its size: a 1080p, a 4K and a laptop's high-DPI screen at their own pixels", () => {
    expect(renderPixelRatio(1)).toBe(1);
    expect(renderPixelRatio(1.5)).toBe(1.5);
    expect(renderPixelRatio(2)).toBe(2);
  });

  it('caps a very dense screen at twice its CSS pixels', () => {
    expect(renderPixelRatio(3)).toBe(2);
  });
});
