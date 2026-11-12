import type { Vec3 } from '@duty-shooter/fps-core';
import {
  If,
  abs,
  attribute,
  dFdx,
  dFdy,
  int,
  select,
  uniformArray,
  distance,
  cameraPosition,
  clamp,
  color,
  dot,
  exp,
  float,
  floor,
  log2,
  Fn,
  fract,
  fwidth,
  length,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  normalView,
  positionView,
  normalWorld,
  positionWorld,
  positionWorldDirection,
  pow,
  property,
  reflect,
  sign,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  texture3D,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  ClampToEdgeWrapping,
  DoubleSide,
  Data3DTexture,
  DataTexture,
  DataUtils,
  HalfFloatType,
  Vector2,
  type DirectionalLight,
  LightingModel,
  LinearFilter,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NodeMaterial,
  PhysicalLightingModel,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type NodeBuilder,
  type Texture,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { INDIRECT_RANGE, LIGHTING, type BakeFile, type Family, type Finish, type Lighting, type ProbeGrid } from './surfaces';
import { roomColor } from './surface-room';
import type { SkyField } from './sky-field';
import { CLIFF_LAYER, GROUND_LAYERS, groundLayerIndex, groundTextures } from './ground-layers';
import { atlasAt, detailNormal, FAMILY_DEPTH, FAMILY_TILE, gradients, HEX_FAMILIES, hexRelief, noiseAt, parallax, reliefAt } from './surface-tiles';

/**
 * How the world is lit in the browser: static surfaces from the baked
 * lightmap (indirect light in RGB, the sun term in A); near the player the
 * sun term comes from the realtime shadow map instead (everything casts into
 * it), which is crisper than the bake's texels, fading to the bake where the
 * shadow map ends. Moving objects take ambient light from the baked probe
 * grid and the realtime sun, shadowed by walls and roofs like everything
 * else. Muzzle flashes and other point lights light both. Surface detail is
 * drawn by pattern families in world space.
 */

// TSL's node types are loose; these keep the pattern code readable.
type N = Node<'float'>;
type N2 = Node<'vec2'>;
type N3 = Node<'vec3'>;
type N4 = Node<'vec4'>;

/**
 * The current map's sun and sky, as uniforms every material reads, so a map
 * with its own light (Switchyard's dusk) relights them all; see useLighting.
 */
/** The cloud a map's sky has when its light doesn't say. */
const DEFAULT_CLOUD_COVER = 0.45;

const light = {
  sunDirection: uniform(new Vector3(...LIGHTING.sunDirection)),
  sunColor: uniform(new Vector3(...LIGHTING.sunColor)),
  sunIntensity: uniform(LIGHTING.sunIntensity),
  skyZenith: uniform(new Vector3(...LIGHTING.skyZenith)),
  skyHorizon: uniform(new Vector3(...LIGHTING.skyHorizon)),
  skyIntensity: uniform(LIGHTING.skyIntensity),
  ground: uniform(new Vector3(...LIGHTING.ground)),
  /** How thick the distance haze is, 1 normally: thinner for a camera high over the island, where the air below is clear. */
  haze: uniform(1),
  /** How much of the sky is cloud, 0 to 1. */
  cloudCover: uniform(LIGHTING.cloudCover ?? DEFAULT_CLOUD_COVER),
};
let current: Lighting = LIGHTING;

/** Lights every world material with `lighting` from now on (a map's WorldView sets its own). */
export function useLighting(lighting: Lighting): void {
  current = lighting;
  light.sunDirection.value.set(...lighting.sunDirection);
  light.sunColor.value.set(...lighting.sunColor);
  light.sunIntensity.value = lighting.sunIntensity;
  light.skyZenith.value.set(...lighting.skyZenith);
  light.skyHorizon.value.set(...lighting.skyHorizon);
  light.skyIntensity.value = lighting.skyIntensity;
  light.ground.value.set(...lighting.ground);
  light.cloudCover.value = lighting.cloudCover ?? DEFAULT_CLOUD_COVER;
}

/** Thins (below 1) or restores (1) the distance haze for every world material; a uniform, so no shader rebuilds. */
export function setHaze(scale: number): void {
  light.haze.value = scale;
}

/** The light the world is drawn in now. */
export function currentLighting(): Lighting {
  return current;
}

/**
 * The map's sky field (see sky-field.ts), for a map on terrain with no bake: where its picture lies, and the
 * realtime shadow map's reach, inside which the field leaves the near casters to it. Off on any other map.
 */
/**
 * What stands in for the sky field on a map without one. One texture for good, never disposed: every map without a
 * field says so twice (as it is built, and again when its bake arrives), and a new stand-in each time destroyed the
 * old one under shaders still being built with it, whose every frame the GPU then refused.
 */
const NO_FIELD = placeholderField();
const field = {
  map: texture(NO_FIELD),
  origin: uniform(new Vector2(0, 0)),
  size: uniform(new Vector2(1, 1)),
  cell: uniform(1),
  on: uniform(0),
  reachCentre: uniform(new Vector2(0, 0)),
  reachRadius: uniform(40),
};

function placeholderField(): DataTexture {
  const t = new DataTexture(new Uint16Array(4), 1, 1, RGBAFormat, HalfFloatType);
  // The sampler is set up from this texture and kept when the real one replaces it.
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** Lights every world material by `sky` from now on, or by none (a map with a bake, or with no terrain). */
export function useSkyField(sky: SkyField | null): void {
  const old = field.map.value;
  field.on.value = sky ? 1 : 0;
  if (sky) {
    const half = new Uint16Array(sky.data.length);
    for (let i = 0; i < half.length; i++) half[i] = DataUtils.toHalfFloat(sky.data[i]!);
    const t = new DataTexture(half, sky.columns, sky.rows, RGBAFormat, HalfFloatType);
    t.minFilter = t.magFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    field.map.value = t;
    field.origin.value.set(sky.origin[0], sky.origin[1]);
    field.size.value.set(sky.columns * sky.cell, sky.rows * sky.cell);
    field.cell.value = sky.cell;
  } else field.map.value = NO_FIELD;
  if (old !== NO_FIELD) old.dispose();
}

/** Where the realtime shadow map reaches now: its centre (x, z) and the radius it fully covers (m). */
export function setShadowReach(x: number, z: number, radius: number): void {
  field.reachCentre.value.set(x, z);
  field.reachRadius.value = radius;
}

/** How deep under a shadow's top (m) a point is still lit, and over how much more it goes dark: far off, and near the player. */
const SHADE_FAR = [0.35, 1.2] as const;
const SHADE_NEAR = [0.25, 1] as const;
/** The most of the sky's light that what stands close over a point takes, and that the land round about takes; and how far under them (m) it is all taken. */
const CLOSE_LOSS = 0.5;
const CLOSE_UNDER = [0.15, 4] as const;
const WIDE_LOSS = 0.3;
const WIDE_UNDER = [1.5, 24] as const;
/** How far out along its normal (field cells) a surface reads the field: a wall reads the air in front of it, not its own solid. */
const FIELD_PUSH = 1.25;

/**
 * What the sky field says of the fragment (1 and 1 on a map without one): how much of the sun reaches it past
 * what the realtime shadow map doesn't hold, and how much of the sky it sees. `n` is the surface's normal, or
 * null for what has none worth the name (leaves).
 */
function skyLight(n: N3 | null): { sun: N; open: N } {
  const p = positionWorld as unknown as N3;
  const at = n ? (p.xz.add(n.xz.mul(field.cell.mul(FIELD_PUSH))) as N2) : (p.xz as N2);
  const v = field.map.sample(at.sub(field.origin).div(field.size) as never) as unknown as N4;
  const lit = (top: N, [from, over]: readonly [number, number]) => float(1).sub(smoothstep(float(from), float(from + over), top.sub(p.y))) as N;
  const near = float(1).sub(smoothstep(field.reachRadius.mul(0.8), field.reachRadius, length(p.xz.sub(field.reachCentre))));
  const sun = mix(lit(v.x, SHADE_FAR), lit(v.w, SHADE_NEAR), near);
  const under = (top: N, [from, to]: readonly [number, number]) => smoothstep(float(from), float(to), top.sub(p.y)) as N;
  const open = float(1).sub(under(v.y, CLOSE_UNDER).mul(CLOSE_LOSS)).mul(float(1).sub(under(v.z, WIDE_UNDER).mul(WIDE_LOSS)));
  return { sun: mix(float(1), sun, field.on) as N, open: mix(float(1), open, field.on) as N };
}

/** How much of the sky is cloud, as a node. */
export const cloudCover = light.cloudCover as unknown as N;
/** Toward the sun, as a node. */
export const sunDir = light.sunDirection as unknown as N3;
/** The sun's colour times its strength, as a node. */
export const sunColor = (light.sunColor as unknown as N3).mul(light.sunIntensity) as N3;
/** The horizon's colour times the sky's strength, as a node: what the haze fades toward. */
export const horizonColor = (light.skyHorizon as unknown as N3).mul(light.skyIntensity) as N3;
/** The top of the sky's colour times its strength, as a node. */
export const skyZenith = (light.skyZenith as unknown as N3).mul(light.skyIntensity) as N3;
/** Fill light (linear) added to the darkest baked light; warm, like light bounced off wood and plaster. */
const INDOOR_FILL = [0.2, 0.18, 0.15] as const;

/**
 * Light stored by the bake (square-root encoded) back to linear, with a
 * little fill added where it is darkest: two bounces leave rooms lit only
 * through their windows nearly black, and players need to see in them.
 */
function decode(c: N3): N3 {
  const light = c.mul(c).mul(INDIRECT_RANGE);
  const luma = dot(light, vec3(0.2126, 0.7152, 0.0722));
  return light.add(vec3(...INDOOR_FILL).mul(smoothstep(float(0.35), float(0.02), luma))) as N3;
}

/** The sky in direction `d`, as the bake sees it, with a warm glow round the sun. */
function skyNode(d: N3): N3 {
  const z = light.skyZenith as unknown as N3;
  const h = light.skyHorizon as unknown as N3;
  const up = max(d.y, float(0));
  const base = mix(h, z, sqrt(up)).mul(light.skyIntensity);
  const toSun = max(dot(d, sunDir), float(0));
  const glow = (light.sunColor as unknown as N3).mul(pow(toSun, float(12)).mul(0.35).add(pow(toSun, float(900)).mul(12)));
  const ground = (light.ground as unknown as N3).mul(0.9);
  return mix(ground, base.add(glow), smoothstep(float(-0.04), float(0.02), d.y)) as N3;
}

/** How fast the haze thins with height (per metre): it lies on the ground, so a peak stands clear of it and a camera high up looks down through little. */
const HAZE_FALLOFF = 0.011;

/**
 * Distance haze: far things fade toward the horizon colour, by how much air
 * lies along the look. The air is thickest at the ground (y = 0) and thins
 * upward, so the sum along a look that climbs is less than along a level one.
 */
export function haze(lit: N3): N3 {
  const ray = positionWorld.sub(cameraPosition);
  const dist = length(ray);
  const climb = ray.y.mul(HAZE_FALLOFF);
  // (1 - e^-x) / x, the mean thickness along the climb; 1 on a level look.
  const steep = max(abs(climb), float(1e-3)).mul(sign(climb).add(step(abs(climb), float(0))));
  const mean = float(1).sub(exp(steep.negate())).div(steep);
  const air = dist.mul(0.0035).mul(light.haze).mul(exp(max(cameraPosition.y, float(0)).mul(-HAZE_FALLOFF))).mul(mean);
  const k = float(1).sub(exp(air.negate()));
  // Dust in the air: thicker, and lit up, looking toward the sun.
  const toSun = pow(max(dot(normalize(ray) as unknown as N3, sunDir), float(0)), float(4));
  return mix(lit, horizonColor.add(sunColor.mul(toSun.mul(0.3))), k.mul(toSun.mul(0.4).add(0.45))) as N3;
}

/**
 * The sky a shiny thing reflects: the air from horizon to zenith, the ground
 * below, and the sun as a soft lobe (a hard one sparkles once it is blurred
 * for rough metal).
 */
export function reflectedSky(d: N3): N3 {
  const z = light.skyZenith as unknown as N3;
  const h = light.skyHorizon as unknown as N3;
  const base = mix(h, z, sqrt(max(d.y, float(0)))).mul(light.skyIntensity);
  const toSun = max(dot(d, sunDir), float(0));
  const lobe = sunColor.mul(pow(toSun, float(10)).mul(0.12).add(pow(toSun, float(180)).mul(1.4)));
  const ground = (light.ground as unknown as N3).mul(0.9);
  return mix(ground, base.add(lobe), smoothstep(float(-0.06), float(0.04), d.y)) as N3;
}

/** A 0..1 hash of a cell. */
const hash = (cell: N2): N => fract(sin(dot(cell, vec2(127.1, 311.7))).mul(43758.5453)) as N;

/** 0..1 where the bright specks of `scale` noise (aggregate, pebbles) are; the noise's mipmaps fade them where they get smaller than a pixel. */
function specks(st: N2, scale: number, cover: number): N {
  return smoothstep(float(1 - cover), float(1 - cover * 0.5), noiseAt(st, scale, 'g')) as N;
}

/**
 * 1 along hairline cracks `width` wide in noise units, only in the scattered
 * patches where the surface has given (about `cover` of it), and fading out
 * with distance.
 */
function cracks(st: N2, scale: number, width: number, cover: number): N {
  const n = noiseAt(st, scale, 'b');
  const w = max(fwidth(n), float(1e-4));
  const line = smoothstep(float(width).add(w), float(0), n).mul(float(1).sub(smoothstep(float(width), float(width * 3), w)));
  return line.mul(smoothstep(float(1 - cover), float(1 - cover * 0.6), noiseAt(st, scale * 0.13))) as N;
}

/**
 * How far this point of a wall is from the wall's open edges (m): its two ends,
 * its foot and its head, where it stops at a corner, window or door rather
 * than running on into more wall (see openEdges).
 */
const faceEdges = (): N4 => attribute<'vec4'>('faceEdges', 'vec4') as unknown as N4;

/** 1 near a corner or opening, 0 from `reach` metres away: where real plaster and paint let go first. */
function nearOpening(reach: number): N {
  const e = faceEdges();
  return smoothstep(float(reach), float(0.03), min(min(e.x, e.y), min(e.z, e.w))) as N;
}

/**
 * Weathering on an outdoor wall: dirt splashed up the bottom 70 cm from the
 * ground (y = 0), rain streaks running down it, heaviest under whatever it
 * runs off (a roofline, a sill), and grime gathered at its corners. Floors and
 * roofs (faces looking up or down) are left alone.
 */
function weathered(a: N3, p: N3, st: N2): N3 {
  const wall = smoothstep(float(0.6), float(0.2), abs(normalWorld.y));
  const splash = smoothstep(float(0.7), float(0.02), p.y).mul(noiseAt(st, 1.4).mul(0.6).add(0.4));
  const edges = faceEdges();
  const under = smoothstep(float(2.6), float(0.05), edges.w);
  const streaks = smoothstep(float(0.5), float(0.8), noiseAt(vec2(st.x.mul(2.5), st.y.mul(0.12)) as N2, 1));
  const corner = smoothstep(float(0.5), float(0.02), min(edges.x, edges.y)).mul(noiseAt(st, 0.9, 'g'));
  return a.mul(float(1).sub(wall.mul(splash.mul(0.32).add(streaks.mul(under.mul(0.3).add(0.06))).add(corner.mul(0.16))))) as N3;
}

/** Slow tone drift over tens of metres, so big surfaces don't read as one flat colour: the first of the fixes for a repeat you can see from far off. */
const macro = (st: N2, amount: number): N => float(1 - amount).add(noiseAt(st, 0.035, 'g').mul(amount * 2)) as N;

/**
 * 1 between grooves, 0 on one: grooves `width` m wide every `period` m along
 * `x`, which changes by `pixel` m a pixel. Antialiased, and fading to their
 * average once they get thinner than a pixel, so distant patterns don't shimmer.
 */
function grooves(x: N, pixel: N, period: number, width: number): N {
  const q = x.div(period);
  const w = max(pixel.div(period), float(1e-4));
  const half = width / period / 2;
  const d = abs(fract(q.add(0.5)).sub(0.5));
  const sharp = smoothstep(float(half).sub(w), float(half).add(w), d);
  return mix(sharp, float(1 - width / period), smoothstep(float(0.15), float(0.45), w)) as N;
}

/** Dry ground: broad scuffed patches and a slow change of soil. */
function parched(a: N3, st: N2): N3 {
  return a.mul(float(1).sub(smoothstep(float(0.4), float(0.72), noiseAt(st, 0.19, 'g').add(noiseAt(st, 1.1).sub(0.5).mul(0.35))).mul(0.2))) as N3;
}

/** How a finish shines: specular strength and sharpness under the sun. */
const SHINE: Readonly<Record<Family, { ks: number; power: number }>> = {
  grid: { ks: 0.04, power: 16 },
  siding: { ks: 0.06, power: 24 },
  shingles: { ks: 0.02, power: 8 },
  brick: { ks: 0.02, power: 8 },
  asphalt: { ks: 0.02, power: 8 },
  grass: { ks: 0.01, power: 4 },
  sand: { ks: 0.02, power: 6 },
  concrete: { ks: 0.03, power: 10 },
  paint: { ks: 0.18, power: 48 },
  sheetMetal: { ks: 0.35, power: 40 },
  fence: { ks: 0.03, power: 10 },
  louvre: { ks: 0.1, power: 30 },
  glass: { ks: 1.2, power: 400 },
  room: { ks: 0, power: 1 },
  plastic: { ks: 0.15, power: 36 },
  floor: { ks: 0.1, power: 30 },
  plaster: { ks: 0.02, power: 8 },
  wornPlaster: { ks: 0.02, power: 8 },
  dirt: { ks: 0.01, power: 4 },
  gravel: { ks: 0.02, power: 6 },
  tile: { ks: 0.2, power: 60 },
  lamp: { ks: 0, power: 1 },
};

/** The rust sheet metal goes to. */
const RUST = 0x6b3a22;

/**
 * A finish's albedo (linear) at the current fragment. `st` holds the
 * surface's own coordinates in metres: along the surface horizontally, and
 * up it (on walls) or along -Z (on floors). Grooves take their width from the
 * coordinates before any parallax shift, so a shifted edge doesn't read as a
 * sudden change of scale. A family whose top layer comes away hands `wear` how
 * much has (0..1), for the relief to follow.
 */
function albedo(finish: Finish, st: N2, wear: (mask: N) => void): N3 {
  const base = color(finish.color) as unknown as N3;
  const accent = color(finish.accent ?? finish.color) as unknown as N3;
  const p = positionWorld as unknown as N3;
  const x = st.x as N;
  const y = st.y as N;
  const pixel = fwidth(uv() as unknown as N2) as N2;
  const [px, py] = [pixel.x as N, pixel.y as N];
  const grain = (cycles: number, amount: number) => float(1 - amount).add(noiseAt(st, cycles).mul(amount * 2));
  switch (finish.family) {
    case 'grid': {
      const minor = grooves(x, px, 1, 0.025).mul(grooves(y, py, 1, 0.025));
      const major = grooves(x, px, 5, 0.06).mul(grooves(y, py, 5, 0.06));
      return mix(accent, base, minor.mul(0.55).add(0.45).mul(major.mul(0.9).add(0.1))) as N3;
    }
    case 'siding':
      // Lap boards 20 cm high: the lips are in the relief.
      return weathered(base.mul(grain(3, 0.03)).mul(macro(st, 0.04)) as N3, p, st);
    case 'shingles': {
      // Courses 22 cm high, tabs 33 cm wide offset every other course, each tab its own shade.
      const row = floor(y.div(0.22));
      const xs = x.add(fract(row.mul(0.5)).mul(0.33));
      const tab = hash(vec2(floor(xs.div(0.33)), row) as N2);
      // Sun-bleached and grimy in broad patches.
      const aged = mix(float(0.86), float(1.08), noiseAt(st, 0.12));
      return mix(base, accent, tab.mul(0.6)).mul(grain(6, 0.06)).mul(aged) as N3;
    }
    case 'brick': {
      // Running bond: 21.5 x 6.5 cm bricks in 1 cm mortar.
      const row = floor(y.div(0.075));
      const xs = x.add(fract(row.mul(0.5)).mul(0.225));
      const brick = hash(vec2(floor(xs.div(0.225)), row) as N2);
      const mortar = grooves(y, py, 0.075, 0.01).mul(grooves(xs, px, 0.225, 0.01));
      const fired = brick.mul(0.36).add(0.78).mul(hash(vec2(row, floor(xs.div(0.225)).add(31)) as N2).mul(0.12).add(0.94));
      return weathered(mix(accent, base.mul(fired), mortar).mul(grain(9, 0.05)) as N3, p, st);
    }
    case 'asphalt': {
      // Worn and resealed patches, hairline cracks, and pale aggregate showing through.
      const patch = smoothstep(float(0.6), float(0.66), noiseAt(st, 0.09));
      const worn = mix(float(1), float(0.82), patch);
      const crack = cracks(st, 1.1, 0.012, 0.3);
      const lit = base.mul(grain(0.35, 0.1)).mul(grain(14, 0.1)).mul(worn).mul(float(1).sub(crack.mul(0.3)));
      return mix(lit, base.mul(1.9), specks(st, 55, 0.12).mul(0.5)) as N3;
    }
    case 'grass': {
      // Lush and dry patches, darker clumps, and a slow drift in tone.
      const patches = smoothstep(float(0.3), float(0.75), noiseAt(st, 0.16));
      const clumps = smoothstep(float(0.45), float(0.8), noiseAt(st, 1.6, 'g'));
      return mix(base, accent, patches.mul(0.9)).mul(float(1).sub(clumps.mul(0.18))).mul(grain(11, 0.1)).mul(macro(st, 0.1)) as N3;
    }
    case 'sand': {
      const ripple = sin(x.mul(1.7).add(noiseAt(st, 0.12).mul(9))).mul(0.025).add(1);
      return parched(base.mul(grain(0.05, 0.07)).mul(ripple).mul(grain(6, 0.04)).mul(macro(st, 0.06)) as N3, st);
    }
    case 'concrete': {
      // Slabs 1.5 m square with tooled joints.
      const joints = grooves(x, px, 1.5, 0.014).mul(grooves(y, py, 1.5, 0.014));
      // Water stains and the odd hairline crack.
      const stain = smoothstep(float(0.62), float(0.85), noiseAt(st, 0.3));
      const crack = cracks(st, 0.8, 0.008, 0.25);
      const slab = mix(accent, base, joints).mul(grain(0.6, 0.06)).mul(grain(7, 0.04)).mul(float(1).sub(stain.mul(0.12))).mul(float(1).sub(crack.mul(0.25)));
      return weathered(slab as N3, p, st);
    }
    case 'paint':
      return base.mul(grain(1.5, 0.02)) as N3;
    case 'sheetMetal': {
      // Corrugations every 7.6 cm, running up the panel, are in the relief. Rust takes the edges and runs down from them.
      const runs = noiseAt(vec2(x.mul(1.8), y.mul(0.1)) as N2, 1, 'g').mul(0.14);
      const rust = smoothstep(float(0.62), float(0.84), noiseAt(st, 0.7).add(nearOpening(0.9).mul(0.3)).add(runs));
      return weathered(mix(base.mul(grain(0.8, 0.04)), (color(RUST) as unknown as N3).mul(grain(5, 0.2)), rust.mul(0.75)) as N3, p, st);
    }
    case 'fence': {
      const board = hash(vec2(floor(x.div(0.14)), float(3)) as N2);
      return weathered(mix(base, accent, board.mul(0.5)).mul(grooves(x, px, 0.14, 0.018).mul(0.45).add(0.55)).mul(grain(4, 0.06)) as N3, p, st);
    }
    case 'louvre': {
      // Slats 5 cm apart, tipped down: each catches the light along its top edge and sits in the shadow of the one above
      // at its foot, with a dark gap between. Far off, where a slat is under a couple of pixels, it settles to their mean.
      const q = fract(y.div(0.05));
      const slat = mix(float(0.5), float(1.12), smoothstep(float(0.05), float(0.9), q)).mul(grooves(y, py, 0.05, 0.007).mul(0.6).add(0.4));
      const far = smoothstep(float(0.2), float(0.5), py.div(0.05));
      return weathered(base.mul(mix(slat, float(0.8), far)).mul(grain(4, 0.05)) as N3, p, st);
    }
    case 'floor': {
      // Planks 14 cm wide, butt joints every 1.8 m, staggered per plank.
      const plank = floor(x.div(0.14));
      const shift = hash(vec2(plank, float(7)) as N2);
      const ys = y.add(shift.mul(1.8));
      const tone = hash(vec2(plank, floor(ys.div(1.8))) as N2);
      const seams = grooves(x, px, 0.14, 0.006).mul(grooves(ys, py, 1.8, 0.006));
      return mix(base, accent, tone.mul(0.45)).mul(seams.mul(0.35).add(0.65)).mul(grain(5, 0.05)) as N3;
    }
    case 'plaster':
      return base.mul(grain(2.5, 0.03)) as N3;
    case 'wornPlaster': {
      // Irregular missing render reveals brickwork beneath faded plaster, most of it at corners and round openings.
      const broken = noiseAt(st, 0.55).add(noiseAt(st, 3, 'g').sub(0.5).mul(0.26)).add(noiseAt(st, 13).sub(0.5).mul(0.14)).add(nearOpening(0.9).mul(noiseAt(st, 1.7).mul(0.55)));
      const exposed = smoothstep(float(0.795), float(0.81), broken);
      wear(exposed as N);
      const row = floor(y.div(0.09));
      const xs = x.add(fract(row.mul(0.5)).mul(0.27));
      const mortar = grooves(y, py, 0.09, 0.012).mul(grooves(xs, px, 0.27, 0.012));
      const masonry = mix(accent.mul(0.66), accent, mortar).mul(grain(8, 0.06));
      // Pitted and blown: dark pocks, and tide marks of old damp across it.
      const pits = smoothstep(float(0.66), float(0.74), noiseAt(st, 7, 'g')).mul(smoothstep(float(0.35), float(0.6), noiseAt(st, 0.9)));
      const tide = smoothstep(float(0.4), float(0.72), noiseAt(st, 0.22, 'g'));
      const plaster = base.mul(grain(2.5, 0.07)).mul(macro(st, 0.14)).mul(float(1).sub(tide.mul(0.2))).mul(float(1).sub(pits.mul(0.32)));
      const crack = cracks(st, 0.5, 0.012, 0.5);
      // The broken edge of the render throws a thin shadow on the brick it stands off.
      const lip = smoothstep(float(0.8), float(0.81), broken).mul(smoothstep(float(0.87), float(0.82), broken));
      return weathered(mix(plaster, masonry, exposed).mul(float(1).sub(crack.mul(0.45))).mul(float(1).sub(lip.mul(0.4))) as N3, p, st);
    }
    case 'dirt':
      return parched(mix(base, accent, noiseAt(st, 0.5).mul(0.6)).mul(grain(6, 0.1)).mul(macro(st, 0.08)) as N3, st);
    case 'gravel':
      return base.mul(grain(1.2, 0.06)).mul(macro(st, 0.07)) as N3;
    case 'tile': {
      const grout = grooves(x, px, 0.3, 0.008).mul(grooves(y, py, 0.3, 0.008));
      return mix(accent, base, grout) as N3;
    }
    case 'glass':
    case 'plastic':
    case 'lamp':
    case 'room':
      return base;
  }
}

/**
 * A smooth (cubic B-spline) lightmap sample from four bilinear taps, so 20 cm
 * texels give soft shadow edges instead of steps. `size` is the texture's
 * size in texels.
 */
function sampleCubic(map: Node, uv: N2, size: N2): N4 {
  const tex = map as unknown as { sample(uv: Node): Node };
  const p = uv.mul(size);
  const tc = floor(p.sub(0.5)).add(0.5);
  const f = p.sub(tc);
  const f2 = f.mul(f);
  const f3 = f2.mul(f);
  const w0 = float(1).sub(f).pow(3).div(6);
  const w1 = f3.mul(3).sub(f2.mul(6)).add(4).div(6);
  const w2 = f3.mul(-3).add(f2.mul(3)).add(f.mul(3)).add(1).div(6);
  const w3 = f3.div(6);
  const g0 = w0.add(w1);
  const g1 = w2.add(w3);
  const t0 = tc.add(w1.div(g0)).sub(1).div(size);
  const t1 = tc.add(w3.div(g1)).add(1).div(size);
  const at = (x: N, y: N) => tex.sample(vec2(x, y)) as unknown as N4;
  return at(t0.x, t0.y).mul(g0.x).add(at(t1.x, t0.y).mul(g1.x)).mul(g0.y).add(at(t0.x, t1.y).mul(g0.x).add(at(t1.x, t1.y).mul(g1.x)).mul(g1.y)) as N4;
}

/** The lighting a baked surface reads: the lightmap, and where the realtime shadow map covers. */
interface Baked {
  readonly lightmap: Node;
  /** The lightmap's size in texels. */
  readonly size: N2;
  /** 1 once a lightmap matching this layout is in; until then, unshadowed sun and flat sky light. */
  readonly ready: Node;
  /** The realtime shadow map's reach: its centre (x, z) and the radius (m) it fully covers. */
  readonly shadowCentre: N2;
  readonly shadowRadius: N;
}

/** What a finish's relief hands the lighting: the leaning normal, and how open the pixel is to the light (1) or down a crevice (0). */
interface Relief {
  readonly normal: N3;
  readonly open: N;
}

/** How much a crevice loses of the ambient light. */
const CREVICE = 0.3;
/** How much of the sky a face leaning up or down gains or loses: walls in the shade still show their relief. */
const SKY_LEAN = 0.9;

/**
 * Adds a point light's share only while it shines. The game's point lights (the muzzle flashes and a frag's
 * blast) are dark until something fires, yet every lit pixel paid for their distance, falloff and angle; a
 * branch on the light's colour, the same for every pixel, skips all of it while it is dark (next-level ticket 35).
 * The view normal and position are worked out ahead of it: a shared node first used inside a branch is only
 * set inside it.
 */
function whileLit(lightNode: unknown, add: (normal: N3) => void): void {
  const normal = (normalView as unknown as N3).toVar() as N3;
  positionView.toVar();
  const c = (lightNode as { colorNode: N3 }).colorNode;
  If(c.x.add(c.y).add(c.z).greaterThan(0) as never, () => add(normal));
}

/** Lights a static surface from the lightmap and, near the player, the realtime sun shadow, through its relief; adds point lights (muzzle flashes). */
class BakedLightingModel extends LightingModel {
  readonly #albedo: N3;
  readonly #baked: Baked;
  readonly #shine: { ks: number; power: number };
  readonly #relief: Relief | null;
  readonly #mask = float(1).toVar('sunMask');
  readonly #point = vec3(0, 0, 0).toVar('pointLight');

  constructor(albedo: N3, baked: Baked, shine: { ks: number; power: number }, relief: Relief | null) {
    super();
    this.#albedo = albedo;
    this.#baked = baked;
    this.#shine = shine;
    this.#relief = relief;
  }

  override direct(input: Parameters<LightingModel['direct']>[0]): void {
    const { lightNode } = input;
    const lightDirection = input.lightDirection as unknown as N3;
    const lightColor = input.lightColor as unknown as N3;
    const light = (lightNode as unknown as { light?: { isDirectionalLight?: boolean } }).light;
    if (light?.isDirectionalLight) {
      const shadow = (lightNode as unknown as { shadowNode: N | null }).shadowNode;
      if (shadow) this.#mask.mulAssign(shadow);
      return;
    }
    // Three's lights divide by pi where the bake's light does not.
    whileLit(lightNode, (n) => this.#point.addAssign(lightColor.mul(max(dot(n, lightDirection), float(0))).div(Math.PI)));
  }

  override finish(builder: NodeBuilder): void {
    const context = builder.context as unknown as { outgoingLight: N3 };
    const lm = sampleCubic(this.#baked.lightmap, uv(1) as unknown as N2, this.#baked.size);
    const n = normalWorld as unknown as N3;
    const lit = this.#relief?.normal ?? n;
    const ready = this.#baked.ready as unknown as N;
    const facing = max(dot(n, sunDir), float(0));
    // Within the shadow map's reach, the realtime shadow alone decides the sun; beyond it, the bake does.
    const reach = this.#baked.shadowRadius;
    const near = float(1).sub(smoothstep(reach.mul(0.8), reach, length(positionWorld.xz.sub(this.#baked.shadowCentre))));
    // On a map on terrain the sky field adds the shadows of what lies past the bake's reach (a hill's, far off); until
    // the bake is in it stands in for it, how much sky is seen too. Elsewhere it is off and changes nothing.
    const field = skyLight(n);
    const baked = mix(facing, lm.a, ready).mul(field.sun);
    // The bake and the shadow are for the flat face; the relief leans it toward the sun or away, by the ratio of the two.
    const lean = this.#relief ? max(dot(lit, sunDir), float(0)).div(max(facing, float(0.2))) : float(1);
    const sunTerm = mix(baked, facing.mul(field.sun), near.mul(ready)).mul(this.#mask).mul(lean);
    const sky = mix(vec3(0.42, 0.44, 0.47).mul(field.open), decode(lm.rgb as N3), ready);
    const shaded = this.#relief ? sky.mul(float(1).add(lit.y.sub(n.y).mul(SKY_LEAN))).mul(mix(float(1 - CREVICE), float(1), this.#relief.open)) : sky;
    const diffuse = this.#albedo.mul(shaded.add(sunColor.mul(sunTerm)).add(this.#point));
    const v = normalize(cameraPosition.sub(positionWorld)) as unknown as N3;
    const h = normalize(sunDir.add(v));
    const spec = sunColor.mul(sunTerm).mul(pow(max(dot(lit, h), float(0)), float(this.#shine.power)).mul(this.#shine.ks));
    context.outgoingLight.assign(haze(diffuse.add(spec) as N3));
  }
}

class SurfaceMaterial extends NodeMaterial {
  readonly #model: () => LightingModel;

  constructor(model: () => LightingModel) {
    super();
    this.lights = true;
    this.#model = model;
  }

  override setupLightingModel(): LightingModel {
    return this.#model();
  }
}

/** The material for one finish on static, lightmapped surfaces. */
export function surfaceMaterial(finish: Finish, baked: Baked): NodeMaterial {
  if (finish.family === 'glass') return glassMaterial(finish);
  if (finish.family === 'lamp') return lampMaterial(finish);
  if (finish.family === 'room') return roomMaterial();
  const tile = FAMILY_TILE[finish.family];
  // What the colour works out for the lighting, which runs after it in the same shader: so the march and the reads happen once.
  const a = property('vec3', 'surfaceAlbedo') as unknown as N3 & { assign(v: Node): void };
  const relief = tile ? (property('vec3', 'surfaceRelief') as unknown as N3 & { assign(v: Node): void }) : null;
  const depth = FAMILY_DEPTH[finish.family];
  const m = new SurfaceMaterial(() => new BakedLightingModel(a, baked, SHINE[finish.family], relief ? { normal: detailNormal(relief, 1), open: smoothstep(float(0.02), float(0.6), relief.z) as N } : null));
  m.colorNode = Fn(() => {
    const plain = uv() as unknown as N2;
    const st = tile && depth ? parallax(tile, plain, depth) : plain;
    let exposed: N | null = null;
    a.assign(albedo(finish, st, (mask) => (exposed = mask)));
    if (tile && relief) {
      const read = HEX_FAMILIES.has(finish.family) ? hexRelief(tile, st) : reliefAt(tile, st, depth ? gradients(plain) : null);
      // Where render has come away, the brickwork's relief; its courses are 20% bigger than a brick wall's.
      relief.assign(exposed ? (mix(read, reliefAt('brick', st.mul(1.8 / 2.16) as N2), exposed) as N3) : read);
      // Open ground's stones and cracks are in the relief: dirt lies in the low places, stone stands pale.
      if (HEX_FAMILIES.has(finish.family)) a.assign(a.mul(mix(float(0.74), float(1.1), smoothstep(float(0.12), float(0.62), read.z))));
    }
    return vec4(a, 1);
  })();
  return m;
}

/** The ground's colour map: world (x, z) from `origin`, over `size` metres. */
export interface TerrainColors {
  readonly texture: Texture;
  readonly origin: readonly [x: number, z: number];
  readonly size: readonly [x: number, z: number];
  /** Whether the map's alpha holds each cell's ground layer (see `GROUND_LAYERS`), so the ground wears its photos. */
  readonly layered?: boolean;
}

/** Rock showing through wherever ground is too steep to hold anything. */
const BARE_ROCK = 0x6e645a;

/**
 * Lights open ground with no bake yet (ticket 10 bakes it): a hemisphere of sky,
 * the sun by its angle, and the realtime shadow near the player.
 */
class OpenGroundModel extends LightingModel {
  readonly #albedo: N3;
  readonly #normal: N3;
  readonly #mask = float(1).toVar('sunMask');
  readonly #point = vec3(0, 0, 0).toVar('pointLight');

  readonly #glow: N3 | null;

  constructor(albedo: N3, normal: N3 = normalWorld as unknown as N3, glow: N3 | null = null) {
    super();
    this.#albedo = albedo;
    this.#normal = normal;
    this.#glow = glow;
  }

  override direct(input: Parameters<LightingModel['direct']>[0]): void {
    const { lightNode } = input;
    const lightDirection = input.lightDirection as unknown as N3;
    const lightColor = input.lightColor as unknown as N3;
    const light = (lightNode as unknown as { light?: { isDirectionalLight?: boolean } }).light;
    if (light?.isDirectionalLight) {
      const shadow = (lightNode as unknown as { shadowNode: N | null }).shadowNode;
      if (shadow) this.#mask.mulAssign(shadow);
      return;
    }
    whileLit(lightNode, (n) => this.#point.addAssign(lightColor.mul(max(dot(n, lightDirection), float(0))).div(Math.PI)));
  }

  override finish(builder: NodeBuilder): void {
    const context = builder.context as unknown as { outgoingLight: N3 };
    const n = this.#normal;
    const up = n.y.mul(0.5).add(0.5);
    const field = skyLight(normalWorld as unknown as N3);
    const sky = mix(vec3(0.16, 0.16, 0.2) as unknown as N3, (light.skyZenith as unknown as N3).mul(1.4).add(0.2), up).mul(field.open);
    const sun = sunColor.mul(max(dot(n, sunDir), float(0)).mul(this.#mask).mul(field.sun));
    const lit = this.#albedo.mul(sky.add(sun).add(this.#point));
    context.outgoingLight.assign(haze((this.#glow ? lit.add(this.#glow) : lit) as N3));
  }
}

/**
 * A material lit as the open ground is (the sky, the sun with its shadow, the
 * distance haze), for what stands on the island with no bake to light it:
 * its plants and rocks, and a Region's kit (see PlantsView), whose lit parts
 * add their `glow` whatever light falls on them.
 */
export function openGroundLit(albedo: Node, glow?: Node): NodeMaterial {
  const a = albedo as unknown as N3;
  const g = (glow ?? null) as unknown as N3 | null;
  const m = new SurfaceMaterial(() => new OpenGroundModel(a, normalWorld as unknown as N3, g));
  m.colorNode = vec4(a, 1);
  return m;
}

/** How far round a leaf the low sun still reaches (0 a hard terminator), and how much shines through leaves seen against it. */
const LEAF_WRAP = 0.6;
const LEAF_TRANSLUCENCY = 0.55;
/** The least sky light a leaf gets: light scattered through the canopy and off the ground, so the shade under a crown isn't black. */
const LEAF_SKY_FLOOR = vec3(0.24, 0.25, 0.24);

/**
 * Foliage's light (ticket 62): leaves are thin and many, so a crown is lit as
 * the rounded mass it makes (its `normal`, the same from either side of a
 * card) rather than as the cards it's built from. The sun wraps round it, a
 * leaf seen against the sun glows with the light coming through, and the
 * sky's share never falls to nothing, the shade inside a canopy being lit by
 * the leaves around it.
 */
class FoliageModel extends LightingModel {
  readonly #albedo: N3;
  readonly #normal: N3;
  readonly #mask = float(1).toVar('sunMask');
  readonly #point = vec3(0, 0, 0).toVar('pointLight');

  constructor(albedo: N3, normal: N3) {
    super();
    this.#albedo = albedo;
    this.#normal = normal;
  }

  override direct(input: Parameters<LightingModel['direct']>[0]): void {
    const { lightNode } = input;
    const lightDirection = input.lightDirection as unknown as N3;
    const lightColor = input.lightColor as unknown as N3;
    const light = (lightNode as unknown as { light?: { isDirectionalLight?: boolean } }).light;
    if (light?.isDirectionalLight) {
      const shadow = (lightNode as unknown as { shadowNode: N | null }).shadowNode;
      if (shadow) this.#mask.mulAssign(shadow);
      return;
    }
    // Lamps light leaves from either side, wrapped as the sun is.
    whileLit(lightNode, (n) => this.#point.addAssign(lightColor.mul(abs(dot(n, lightDirection)).mul(0.6).add(0.4)).div(Math.PI)));
  }

  override finish(builder: NodeBuilder): void {
    const context = builder.context as unknown as { outgoingLight: N3 };
    const n = this.#normal;
    const up = n.y.mul(0.5).add(0.5);
    const field = skyLight(null);
    const sky = max(mix(vec3(0.16, 0.16, 0.2) as unknown as N3, (light.skyZenith as unknown as N3).mul(1.4).add(0.2), up).mul(field.open), LEAF_SKY_FLOOR);
    const wrapped = max(dot(n, sunDir).add(LEAF_WRAP).div(1 + LEAF_WRAP), float(0));
    const towardSun = pow(max(dot(normalize(positionWorld.sub(cameraPosition)) as unknown as N3, sunDir), float(0)), float(3));
    const sun = sunColor.mul(wrapped.add(towardSun.mul(LEAF_TRANSLUCENCY)).mul(this.#mask).mul(field.sun));
    context.outgoingLight.assign(haze(this.#albedo.mul(sky.add(sun).add(this.#point)) as N3));
  }
}

/**
 * A material for alpha-tested foliage cards: `albedo` lit as foliage (see
 * `FoliageModel`) by `normal`, a world normal that doesn't turn over on a
 * card's back, cut where `alpha` is under a half. Drawn from both sides.
 */
export function foliageLit(albedo: Node, alpha: Node, normal: Node): NodeMaterial {
  const a = albedo as unknown as N3;
  const m = new SurfaceMaterial(() => new FoliageModel(a, normal as unknown as N3));
  m.colorNode = vec4(a, alpha as unknown as N);
  m.alphaTest = 0.5;
  m.side = DoubleSide;
  return m;
}

/** The ground: its colour map, with bare rock on the steep and a little noise so a flat colour doesn't read as paint. */
export function terrainMaterial(colors: TerrainColors): NodeMaterial {
  const [ox, oz] = colors.origin;
  const [sx, sz] = colors.size;
  const at = vec2(positionWorld.x.sub(ox).div(sx), positionWorld.z.sub(oz).div(sz));
  const paint = texture(colors.texture, at as never).rgb as unknown as N3;
  const steep = smoothstep(float(0.66), float(0.8), (normalWorld as unknown as N3).y);
  const coarse = mx_noise_float(positionWorld.xz.mul(0.09) as never) as unknown as N;
  const fine = mx_noise_float(positionWorld.xz.mul(0.7) as never) as unknown as N;
  if (colors.layered) return layeredGround(colors, paint, steep, coarse);
  const a = mix(color(BARE_ROCK) as unknown as N3, paint, steep).mul(coarse.mul(0.14).add(fine.mul(0.08)).add(1)) as N3;
  const m = new SurfaceMaterial(() => new OpenGroundModel(a));
  m.colorNode = vec4(a, 1);
  return m;
}

/** A hexagon's weight under which it can't change the pixel (one part in 255), so the ground doesn't read it. */
const HEX_UNSEEN = 1 / 255;
/** How far (m) the edge between two cells' layers wanders, so it follows no grid. */
const LAYER_WANDER = 1.4;
/** How strongly the photos' relief bends the light: the low sun rakes across it. */
const GROUND_RELIEF = 0.9;
/** Big soft patches over every layer (m a cycle), and how much they lighten and darken. */
const GROUND_PATCH = 23;
const GROUND_PATCH_STRENGTH = 0.22;

/**
 * Ground that wears real surfaces (ticket 29): each cell names a layer of the
 * photo strips (`GROUND_LAYERS`), read through hexagons so no grid shows over
 * a field, tinted so its mean is the cell's palette colour. The edge between
 * layers wanders with noise, the palette's own blend carries the tint across
 * it, and steep ground shows the cliff layer from the side (triplanar), so no
 * slope looks stretched.
 */
function layeredGround(colors: TerrainColors, paint: N3, flat: N, coarse: N): NodeMaterial {
  const [ox, oz] = colors.origin;
  const [sx, sz] = colors.size;
  const { color: photos, relief } = groundTextures();
  const metres = uniformArray(GROUND_LAYERS.map((l) => l.metres), 'float');
  const means = uniformArray(GROUND_LAYERS.map((l) => new Vector3(...l.mean)), 'vec3');
  const cliff = groundLayerIndex(CLIFF_LAYER);
  const p = positionWorld.xz as unknown as N2;
  const wander = vec2(noiseAt(p, 0.3, 'r'), noiseAt(p, 0.3, 'g')).sub(0.5).mul(LAYER_WANDER * 2) as unknown as N2;
  const cell = floor(p.add(wander).sub(vec2(ox, oz))).add(0.5) as N2;
  const layer = (texture(colors.texture, cell.div(vec2(sx, sz)) as never).level(float(0)) as unknown as N4).a.mul(255).round().toInt().toVar('groundLayer');
  const size = (metres.element(layer) as unknown as N).toVar('groundMetres');
  const st = p.div(size) as N2;
  const cells = st.mul(1.6 * 3.4641016) as N2;
  const skew = vec2(cells.x, cells.x.mul(-0.57735027).add(cells.y.mul(1.15470054))) as N2;
  const base = floor(skew) as N2;
  const f = fract(skew) as N2;
  const z = float(1).sub(f.x).sub(f.y) as N;
  const low = z.greaterThan(0);
  const corner = (a: Node, b: Node) => select(low, a, b) as unknown as N2;
  const ca = corner(base, base.add(vec2(1, 1)));
  const cb = corner(base.add(vec2(0, 1)), base.add(vec2(1, 0)));
  const cc = corner(base.add(vec2(1, 0)), base.add(vec2(0, 1)));
  const raw = pow(select(low, vec3(z, f.y, f.x), vec3(z.negate(), float(1).sub(f.y), float(1).sub(f.x))) as unknown as N3, vec3(7, 7, 7)) as N3;
  const shift = (c: N2) => fract(sin(vec2(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)))).mul(43758.5453)) as unknown as N2;
  const g = normalWorld as unknown as N3;
  // Steep ground: the cliff layer, read from the side along whichever way the slope faces (two reads, no hexagons: a cliff's strata run level anyway).
  const q = positionWorld.div(GROUND_LAYERS[cliff]!.metres) as unknown as N3;
  const rockTint = (color(BARE_ROCK) as unknown as N3).div(vec3(...GROUND_LAYERS[cliff]!.mean)) as N3;
  const albedo = property('vec3', 'groundAlbedo') as unknown as N3 & { assign(v: Node): void };
  const normal = property('vec3', 'groundNormal') as unknown as N3 & { assign(v: Node): void };
  const m = new SurfaceMaterial(() => new OpenGroundModel(albedo, normal));
  // The photos are read only where the ground is flat enough to show them, the cliff only where it is steep enough, and a
  // hexagon only where it weighs anything: open ground skips the cliff's two reads, and most of its pixels a hexagon or two.
  // Every read in a branch takes its gradients from outside it, where they are legal.
  m.colorNode = Fn(() => {
    // Worked out ahead of the branches: a shared node first used inside one is only set inside it.
    const open = flat.toVar('groundFlat') as N;
    const at = st.toVar('groundSt') as N2;
    const which = layer.toVar('groundLayerHere');
    const w = raw.div(raw.x.add(raw.y).add(raw.z)).toVar('groundHex') as N3;
    const corners = [ca.toVar('groundHexA'), cb.toVar('groundHexB'), cc.toVar('groundHexC')] as N2[];
    const dx = (dFdx(p as never) as unknown as N2).div(size).toVar('groundDx') as N2;
    const dy = (dFdy(p as never) as unknown as N2).div(size).toVar('groundDy') as N2;
    const qx = (dFdx(q as never) as unknown as N3).toVar('cliffDx') as N3;
    const qy = (dFdy(q as never) as unknown as N3).toVar('cliffDy') as N3;
    const facing = pow(abs(normalize(vec2(g.x, g.z).add(0.0001)) as unknown as N2) as unknown as N2, vec2(4, 4)) as N2;
    const across = facing.div(facing.x.add(facing.y)).toVar('cliffAcross') as N2;
    const photo = vec3(0, 0, 0).toVar('groundPhoto') as N3 & { assign(v: Node): void; addAssign(v: Node): void; divAssign(v: Node): void };
    const bump = vec3(0.5, 0.5, 1).toVar('groundBump') as N3 & { assign(v: Node): void; addAssign(v: Node): void; divAssign(v: Node): void };
    const rock = vec3(0, 0, 0).toVar('groundRock') as N3 & { assign(v: Node): void };
    If(open.greaterThan(0) as never, () => {
      const read = (map: Texture, c: N2) => (texture(map, at.add(shift(c)) as never).depth(which).grad(dx as never, dy as never) as unknown as N4).rgb as N3;
      const shown = float(0).toVar('groundHexShown') as N & { addAssign(v: Node): void };
      photo.assign(vec3(0, 0, 0));
      bump.assign(vec3(0, 0, 0));
      // Hex tiling (game-textures' hexSample): three places in the tile per pixel, blended where the hexagons meet;
      // a place weighing under one part in 255 can't change the pixel, so it isn't read.
      corners.forEach((c, i) => {
        const k = [w.x, w.y, w.z][i]!;
        If(k.greaterThan(HEX_UNSEEN) as never, () => {
          photo.addAssign(read(photos, c).mul(k));
          bump.addAssign(read(relief, c).mul(k));
          shown.addAssign(k);
        });
      });
      photo.divAssign(shown);
      bump.divAssign(shown);
    });
    If(open.lessThan(1) as never, () => {
      const side = (uvs: N2, gx: N2, gy: N2) => (texture(photos, uvs as never).depth(int(cliff)).grad(gx as never, gy as never) as unknown as N4).rgb as N3;
      const along = (v: N3) => vec2(v.z, v.y.negate()) as N2;
      const over = (v: N3) => vec2(v.x, v.y.negate()) as N2;
      rock.assign(side(along(q), along(qx), along(qy)).mul(across.x).add(side(over(q), over(qx), over(qy)).mul(across.y)));
    });
    // The photo's own detail over the cell's palette colour: its mean divided out.
    const tint = clamp(paint.div(max(means.element(layer) as unknown as N3, vec3(0.01, 0.01, 0.01))), vec3(0.15, 0.15, 0.15), vec3(5, 5, 5)) as N3;
    const patch = noiseAt(p, 1 / GROUND_PATCH, 'r').sub(0.5).mul(GROUND_PATCH_STRENGTH * 2).add(1).mul(coarse.mul(0.08).add(1)) as N;
    // The photo's +y runs up its picture, which is the world's -z.
    const lean = bump.xy.mul(2).sub(1).mul(GROUND_RELIEF) as N2;
    albedo.assign(mix(rock.mul(rockTint), photo.mul(tint), open).mul(patch));
    normal.assign(normalize(g.add(vec3(lean.x, float(0), lean.y.negate()).mul(open))));
    return vec4(albedo, 1);
  })();
  return m;
}

/** The deep water out past the ground, seen through the sea: a flat colour, since a sunset on it would turn it the colour of the sand. */
export function seabedMaterial(tint: number): NodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = vec4(haze(color(tint) as unknown as N3), 1);
  return m;
}

/** How much brighter than white a lit lamp glows (HDR, so the bloom catches it). */
const LAMP_GLOW = 6;

/** A lit lamp's glass: its colour, bright enough to bloom, unlit by anything else. */
export function lampMaterial(finish: Finish): NodeMaterial {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = vec4((color(finish.color) as unknown as N3).mul(LAMP_GLOW), 1);
  return m;
}

/** A pane with a room behind it (see roomColor): lit from inside, and the sky in the glass when seen at a slant. */
export function roomMaterial(): NodeMaterial {
  const view = normalize(positionWorld.sub(cameraPosition)) as unknown as N3;
  const n = normalWorld as unknown as N3;
  const slant = float(1).sub(clamp(dot(n, view.negate()), float(0), float(1)));
  const m = new MeshBasicNodeMaterial();
  m.colorNode = vec4(haze(mix(roomColor(), skyNode(reflect(view, n) as N3).mul(0.75), float(0.06).add(pow(slant, float(4)).mul(0.8))) as N3), 1);
  return m;
}

/** A weathering mark (see grimeQuads): near black, so laying it over a wall darkens it the way dirt does, in sun and shade alike. */
export function grimeMaterial(): NodeMaterial {
  const tint = attribute<'vec4'>('grimeTint', 'vec4');
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.colorNode = vec4(haze(tint.xyz as unknown as N3), 1);
  m.opacityNode = atlasAt('grime', uv() as never, clamp(log2(distance(positionWorld, cameraPosition).mul(0.15)), float(1), float(3))).r.mul(tint.w);
  return m;
}

/** Window glass: the sky reflected (strongly at grazing angles) over a faint tint, mostly see-through head on. */
function glassMaterial(finish: Finish): NodeMaterial {
  const n = normalWorld as unknown as N3;
  const view = positionWorldDirection as unknown as N3;
  const cos = clamp(dot(n, view.negate()), float(0), float(1));
  const fresnel = float(0.04).add(float(0.96).mul(pow(float(1).sub(cos), float(5))));
  const m = new SurfaceMaterial(() => new GlassModel(finish, fresnel as N));
  m.transparent = true;
  m.depthWrite = false;
  m.opacityNode = fresnel.mul(0.6).add(0.14);
  return m;
}

class GlassModel extends LightingModel {
  readonly #tint: N3;
  readonly #fresnel: N;

  constructor(finish: Finish, fresnel: N) {
    super();
    this.#tint = color(finish.color) as unknown as N3;
    this.#fresnel = fresnel;
  }

  override finish(builder: NodeBuilder): void {
    const context = builder.context as unknown as { outgoingLight: N3 };
    const view = positionWorldDirection as unknown as N3;
    const sky = skyNode(reflect(view, normalWorld as unknown as N3) as N3);
    context.outgoingLight.assign(haze(mix(this.#tint.mul(0.05), sky.mul(0.7), this.#fresnel.mul(0.85).add(0.1)) as N3));
  }
}

/** The baked probe grid as a 3D texture, plus a CPU sampler for things lit outside the shaders. */
export class ProbeField {
  readonly texture = texture3D(placeholder3D());
  readonly #min = uniform(new Vector3(0, 0, 0));
  readonly #size = uniform(new Vector3(1, 1, 1));
  readonly #dims = uniform(new Vector3(1, 1, 1));
  /** Fallback ambient before the bake is in. */
  readonly #ready = uniform(0);
  #grid: ProbeGrid | null = null;
  #data: Uint8Array | null = null;

  load(file: BakeFile): void {
    const [nx, ny, nz] = file.probes.dims;
    const t = new Data3DTexture(file.probeData, nx, ny, nz);
    t.format = RGBAFormat;
    t.type = UnsignedByteType;
    t.minFilter = t.magFilter = LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.texture.value = t;
    this.#min.value.set(...file.probes.min);
    this.#size.value.set(nx * file.probes.step, ny * file.probes.step, nz * file.probes.step);
    this.#dims.value.set(nx, ny, nz);
    this.#ready.value = 1;
    this.#grid = file.probes;
    this.#data = file.probeData;
  }

  /** The probe value at the fragment: ambient light (linear RGB) and sun visibility (A). */
  #at(): N4 {
    const step = this.#size.div(this.#dims);
    const uvw = positionWorld.sub(this.#min).add(step.mul(0.5)).div(this.#size);
    return this.texture.sample(uvw) as unknown as N4;
  }

  ambient(): N3 {
    return mix(vec3(0.42, 0.44, 0.47), decode(this.#at().rgb as N3), this.#ready) as N3;
  }

  sun(): N {
    return mix(float(1), this.#at().a, this.#ready) as N;
  }

  /** Trilinear CPU sample at `p`: ambient (linear RGB) and sun visibility, or null before the bake is in. */
  sample(p: Vec3): { ambient: Vec3; sun: number } | null {
    const g = this.#grid;
    const d = this.#data;
    if (!g || !d) return null;
    const [nx, ny, nz] = g.dims;
    const f = [(p[0] - g.min[0]) / g.step, (p[1] - g.min[1]) / g.step, (p[2] - g.min[2]) / g.step].map((v, i) => Math.min(Math.max(v, 0), [nx, ny, nz][i]! - 1.001));
    const [fx, fy, fz] = f as [number, number, number];
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 8; c++) {
      const xi = Math.min(nx - 1, x0 + (c & 1));
      const yi = Math.min(ny - 1, y0 + ((c >> 1) & 1));
      const zi = Math.min(nz - 1, z0 + ((c >> 2) & 1));
      const w = (c & 1 ? fx - x0 : 1 - (fx - x0)) * ((c >> 1) & 1 ? fy - y0 : 1 - (fy - y0)) * ((c >> 2) & 1 ? fz - z0 : 1 - (fz - z0));
      const k = (xi + yi * nx + zi * nx * ny) * 4;
      for (let i = 0; i < 4; i++) out[i]! += (d[k + i]! / 255) * w;
    }
    const dec = (v: number) => v * v * INDIRECT_RANGE;
    return { ambient: [dec(out[0]!), dec(out[1]!), dec(out[2]!)], sun: out[3]! };
  }
}

function placeholder3D(): Data3DTexture {
  const t = new Data3DTexture(new Uint8Array([200, 200, 200, 255]), 1, 1, 1);
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A 1x1 stand-in lightmap until the bake arrives. */
function placeholderLightmap(): DataTexture {
  const t = new DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  // The sampler is set up from this texture and kept when the real one replaces it.
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** The lightmap from a bake file, as a texture. */
export function lightmapTexture(file: BakeFile): DataTexture {
  const t = new DataTexture(file.lightmap, file.width, file.height, RGBAFormat, UnsignedByteType);
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

export function lightmapNode(): Node {
  return texture(placeholderLightmap()) as unknown as Node;
}

/**
 * Lights a standard material from the probes: ambient from the grid, and the
 * realtime sun, whose shadow map has walls and roofs in it. Beyond the shadow
 * map's reach the grid says how much of the sun gets through.
 */
class ProbeLightingModel extends PhysicalLightingModel {
  readonly #probes: ProbeField;
  readonly #sun: () => DirectionalLight;
  readonly #reach: { centre: N2; radius: N };
  /** The sky field at the fragment, read once for the sun and the sky both. */
  #field: { sun: N; open: N } | null = null;

  constructor(probes: ProbeField, sun: () => DirectionalLight, reach: { centre: N2; radius: N }) {
    super();
    this.#probes = probes;
    this.#sun = sun;
    this.#reach = reach;
  }

  get #sky(): { sun: N; open: N } {
    return (this.#field ??= skyLight(normalWorld as unknown as N3));
  }

  override direct(input: Parameters<PhysicalLightingModel['direct']>[0], builder: NodeBuilder): void {
    const light = (input.lightNode as unknown as { light?: unknown }).light;
    if (light === this.#sun()) {
      const near = float(1).sub(smoothstep(this.#reach.radius.mul(0.8), this.#reach.radius, length(positionWorld.xz.sub(this.#reach.centre))));
      input = { ...input, lightColor: (input.lightColor as unknown as N3).mul(mix(this.#probes.sun(), float(1), near)).mul(this.#sky.sun) as never };
    }
    super.direct(input, builder);
  }

  override indirect(builder: NodeBuilder): void {
    const context = builder.context as unknown as { irradiance: N3 };
    context.irradiance.addAssign(this.#probes.ambient().mul(this.#sky.open).mul(Math.PI * (currentLighting().modelFill ?? 1)));
    super.indirect(builder);
  }

  /** Soldiers, models and props stand in the same air as the walls behind them. */
  override finish(builder: NodeBuilder): void {
    super.finish(builder as never);
    const context = builder.context as unknown as { outgoingLight: N3 & { assign(v: Node): void } };
    context.outgoingLight.assign(haze(context.outgoingLight));
  }
}

/** Has a standard material lit by the probe grid (moving objects: soldiers, props, decals, casings). `sun` gives the current sun light. */
export function probeLit<T extends MeshStandardNodeMaterial>(material: T, probes: ProbeField, sun: () => DirectionalLight, reach: { centre: N2; radius: N }): T {
  material.setupLightingModel = () => new ProbeLightingModel(probes, sun, reach);
  return material;
}
