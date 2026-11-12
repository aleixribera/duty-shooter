import { describe, expect, it } from 'vitest';
import { signedDistance } from '../src/world-details';

// Review 2026-11-12f: the bus's stencil at arm's length was blurred blocks with stepped edges. The letters are kept as a
// distance from their edges, so the edge is drawn sharp however near; the distance has to be right for that.
describe("a stencil's distance field", () => {
  it('measures each pixel from the edge of the shape, positive inside', () => {
    const w = 40;
    const h = 30;
    const alpha = new Uint8ClampedArray(w * h);
    // A solid 10 x 10 block from (15, 10) to (24, 19).
    for (let y = 10; y < 20; y++) for (let x = 15; x < 25; x++) alpha[y * w + x] = 255;
    const d = signedDistance(alpha, w, h);
    const at = (x: number, y: number) => d[y * w + x]!;
    // Inside: to the nearest pixel outside.
    expect(at(19, 14)).toBeCloseTo(5, 5);
    expect(at(15, 14)).toBeCloseTo(1, 5);
    // Outside: to the nearest pixel inside, straight off a side and diagonally off a corner.
    expect(at(10, 14)).toBeCloseTo(-5, 5);
    expect(at(14, 14)).toBeCloseTo(-1, 5);
    expect(at(12, 7)).toBeCloseTo(-Math.hypot(3, 3), 5);
    // Antialiased edge pixels sit part way: a half-covered pixel is on the edge.
    alpha[14 * w + 14] = 128;
    expect(signedDistance(alpha, w, h)[14 * w + 14]!).toBeCloseTo(0, 1);
  });

  it('is the plain distance with nothing painted or everything painted', () => {
    const empty = signedDistance(new Uint8ClampedArray(9), 3, 3);
    expect(Math.min(...empty)).toBeLessThan(-1e9);
    const full = signedDistance(new Uint8ClampedArray(9).fill(255), 3, 3);
    expect(Math.max(...full)).toBeGreaterThan(1e9);
  });

  it('matches a brute-force distance on a scattered mask', () => {
    const w = 23;
    const h = 17;
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const alpha = Uint8ClampedArray.from({ length: w * h }, () => (random() < 0.3 ? 255 : 0));
    const d = signedDistance(alpha, w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = alpha[y * w + x] === 255;
        let best = Infinity;
        for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) if ((alpha[v * w + u] === 255) !== inside) best = Math.min(best, Math.hypot(u - x, v - y));
        expect(d[y * w + x]!).toBeCloseTo(inside ? best : -best, 5);
      }
    }
  });
});
