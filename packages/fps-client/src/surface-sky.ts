import { clamp, dot, float, max, mix, pow, smoothstep, time, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { horizonColor, skyNode, skyZenith, sunColor, sunDir } from './surface-materials';
import { cloudAt } from './surface-tiles';

type N = Node<'float'>;
type N2 = Node<'vec2'>;
type N3 = Node<'vec3'>;

/** How fast the clouds drift (sky units a second). */
const DRIFT = 0.00022;

/**
 * The sky as it is drawn: the bake's gradient behind heaped cloud, heavy and
 * dark in the middle of each bank with its fringes catching the light, gold
 * round the sun, which burns through whatever crosses it. Two reads of the
 * cloud picture, on pixels with nothing else to do; the bake and the reflections keep
 * the plain sky.
 */
export function cloudySky(d: N3): N3 {
  const up = max(d.y, float(0.012));
  const sky = vec2(d.x, d.z).div(up.add(0.34)).mul(0.62).add(vec2(time.mul(DRIFT), time.mul(DRIFT * 0.4))) as N2;
  const here = cloudAt(sky);
  const facing = max(dot(d, sunDir), float(0));
  const cover = smoothstep(float(0.54), float(0.63), here.r).mul(smoothstep(float(0.015), float(0.1), d.y)).mul(float(1).sub(pow(facing, float(160)).mul(0.9))) as N;
  // Thinner toward the sun means lit: one step along the light.
  const toward = cloudAt(sky.add(vec2(sunDir.x, sunDir.z).mul(0.018)) as N2);
  const lit = clamp(here.r.sub(toward.r).mul(9).add(0.5), float(0), float(1)) as N;
  const near = pow(facing, float(6));
  const belly = vec3(0.11, 0.11, 0.16).add(horizonColor.mul(0.08)).add(sunColor.mul(near.mul(0.05)));
  const fringe = mix(vec3(0.72, 0.62, 0.5), sunColor.mul(0.75), near);
  const cloud = mix(belly, fringe, clamp(lit.mul(0.8).add(float(1).sub(smoothstep(float(0.6), float(0.7), here.r))).sub(here.g.mul(0.45)), float(0), float(1)));
  // The thin edge of a cloud lets the sun through.
  const rim = sunColor.mul(cover.mul(float(1).sub(cover)).mul(4).mul(pow(facing, float(24))).mul(1.3));
  const glow = sunColor.mul(pow(facing, float(8)).mul(0.05).add(pow(facing, float(90)).mul(0.55)).add(pow(facing, float(1200)).mul(5)));
  return mix(mix(skyNode(d), skyZenith, smoothstep(float(0.08), float(0.5), d.y)), cloud as N3, cover.mul(0.97)).add(glow).add(rim) as N3;
}
