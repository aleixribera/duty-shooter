import { Fn, add, float, reference, renderGroup, texture, vec2 } from 'three/tsl';
import type { LightShadow, Texture } from 'three/webgpu';

type N2 = ReturnType<typeof vec2>;
type N = ReturnType<typeof float>;

interface FilterInputs {
  readonly depthTexture: Texture & { readonly isArrayTexture?: boolean };
  readonly shadowCoord: { readonly xy: N2; readonly z: N };
  readonly shadow: LightShadow;
  readonly depthLayer: N;
}

/**
 * The sun's shadow filter: nine hardware-filtered taps on a grid a shadow-map texel apart, weighted 1-2-1 each way.
 * Three's own PCF filter takes five taps on a disc turned per screen pixel by interleaved gradient noise, which the
 * picture keeps as a fixed diagonal dot grid over every penumbra, in six flat steps (review 2026-11-12f, 07: the sun
 * patch on the room's wall "like a screen door"). These taps are the same in every pixel, and each is itself a
 * bilinear blend of four depth tests, so the shadow's edge is a smooth ramp about four texels wide with no grain.
 */
export const sunShadowFilter = Fn((inputs: { readonly [key: string]: unknown }) => {
  const { depthTexture, shadowCoord, shadow, depthLayer } = inputs as unknown as FilterInputs;
  const texel = vec2(1).div((reference('mapSize', 'vec2', shadow) as unknown as { setGroup(g: unknown): N2 }).setGroup(renderGroup));
  const tap = (i: number, j: number): N => {
    let depth = texture(depthTexture, shadowCoord.xy.add(texel.mul(vec2(i, j))));
    if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer);
    return depth.compare(shadowCoord.z).mul(((2 - Math.abs(i)) * (2 - Math.abs(j))) / 16) as unknown as N;
  };
  return add(tap(-1, -1), tap(0, -1), tap(1, -1), tap(-1, 0), tap(0, 0), tap(1, 0), tap(-1, 1), tap(0, 1), tap(1, 1));
});
