import { clamp, dot, exp, float, max, mix, pow, smoothstep, time, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { cloudCover, horizonColor, skyZenith, sunColor, sunDir } from './surface-materials';
import { cloudAt } from './surface-tiles';

type N = Node<'float'>;
type N2 = Node<'vec2'>;
type N3 = Node<'vec3'>;

/** How fast the clouds drift (sky units a second). */
const DRIFT = 0.00022;
/** How far toward the sun (sky units) a cloud is asked what lies between it and the light. */
const LIGHT_STEP = 0.022;

/** How much cloud stands at a sky point, 0 to 1: the heaps, gathered where the weather has them, by how much of the sky is cloud. */
function heaped(c: { r: N; g: N }): N {
  const floor = mix(float(0.86), float(0.3), cloudCover);
  return smoothstep(floor, floor.add(0.34), c.r.mul(0.72).add(c.g.mul(0.42))) as N;
}

/**
 * The sky as it is drawn. Behind: the air, deep overhead and pale toward the
 * horizon, bright round the sun, with the sun's own disc. In front: cloud in
 * soft heaps, each lit by what stands between it and the sun (so a bank is
 * bright on its sunward side and grey underneath), thinning to a lit fringe at
 * its edge and sinking into the haze toward the horizon. Three reads of the
 * cloud picture on pixels with nothing else to do; the bake and the
 * reflections keep the plain sky.
 */
export function cloudySky(d: N3): N3 {
  const up = max(d.y, float(0.012));
  const facing = max(dot(d, sunDir), float(0));

  // The air.
  const deep = mix(horizonColor, skyZenith, pow(up, float(0.45)));
  // A pale band low down, where the eye looks through the most of it.
  const band = horizonColor.mul(exp(up.mul(-9)).mul(0.22));
  const glow = sunColor.mul(pow(facing, float(5)).mul(0.07).add(pow(facing, float(48)).mul(0.22)).add(pow(facing, float(700)).mul(1.6)));
  const disc = sunColor.mul(smoothstep(float(0.99962), float(0.99986), facing).mul(26));
  const air = deep.add(band).add(glow);

  // The cloud deck: a flat ceiling seen from below, so it crowds toward the horizon.
  const drift = vec2(time.mul(DRIFT), time.mul(DRIFT * 0.4));
  const sky = vec2(d.x, d.z).div(up.add(0.3)).mul(0.5).add(drift) as N2;
  const here = cloudAt(sky);
  const fine = cloudAt(sky.mul(3.3).add(drift.mul(1.7)) as N2) as unknown as { b: N };
  const body = heaped(here);
  // Fine billows eat the edge and leave the middle.
  const shape = clamp(body.sub(fine.b.mul(float(1).sub(body)).mul(0.55)).mul(1.25), float(0), float(1)) as N;
  const low = smoothstep(float(0.0), float(0.11), d.y);
  const cover = smoothstep(float(0.02), float(0.5), shape).mul(low) as N;

  // Light: how much cloud lies toward the sun from here.
  const between = heaped(cloudAt(sky.add(vec2(sunDir.x, sunDir.z).mul(LIGHT_STEP)) as N2));
  const reached = exp(between.mul(-1.7).sub(shape.mul(0.9)));
  const lit = sunColor.mul(0.5).add(horizonColor.mul(0.3));
  const shade = skyZenith.mul(0.42).add(horizonColor.mul(0.2)).add(vec3(0.05, 0.05, 0.06));
  // The thin edge of a cloud near the sun lets the light through.
  const fringe = sunColor.mul(pow(facing, float(10)).mul(float(1).sub(shape)).mul(0.9));
  const far = exp(up.mul(-7));
  const cloud = mix(mix(shade, lit, reached).add(fringe), horizonColor.mul(1.05), far.mul(0.75)) as N3;

  // The sun burns through thin cloud and is hidden by thick.
  return mix(air.add(disc.mul(float(1).sub(cover).mul(float(1).sub(cover)))), cloud, cover.mul(0.96)) as N3;
}
