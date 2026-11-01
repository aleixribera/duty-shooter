import type { Vec3 } from '@duty-shooter/fps-core';
import {
  abs,
  attribute,
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
  normalWorld,
  positionWorld,
  positionWorldDirection,
  pow,
  property,
  reflect,
  sin,
  smoothstep,
  sqrt,
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
  Data3DTexture,
  DataTexture,
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
const light = {
  sunDirection: uniform(new Vector3(...LIGHTING.sunDirection)),
  sunColor: uniform(new Vector3(...LIGHTING.sunColor)),
  sunIntensity: uniform(LIGHTING.sunIntensity),
  skyZenith: uniform(new Vector3(...LIGHTING.skyZenith)),
  skyHorizon: uniform(new Vector3(...LIGHTING.skyHorizon)),
  skyIntensity: uniform(LIGHTING.skyIntensity),
  ground: uniform(new Vector3(...LIGHTING.ground)),
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
}

/** The light the world is drawn in now. */
export function currentLighting(): Lighting {
  return current;
}

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
export function skyNode(d: N3): N3 {
  const z = light.skyZenith as unknown as N3;
  const h = light.skyHorizon as unknown as N3;
  const up = max(d.y, float(0));
  const base = mix(h, z, sqrt(up)).mul(light.skyIntensity);
  const toSun = max(dot(d, sunDir), float(0));
  const glow = (light.sunColor as unknown as N3).mul(pow(toSun, float(12)).mul(0.35).add(pow(toSun, float(900)).mul(12)));
  const ground = (light.ground as unknown as N3).mul(0.9);
  return mix(ground, base.add(glow), smoothstep(float(-0.04), float(0.02), d.y)) as N3;
}

/** Distance haze: far surfaces fade toward the horizon colour. */
export function haze(lit: N3): N3 {
  const dist = length(positionWorld.sub(cameraPosition));
  const k = float(1).sub(exp(dist.mul(-0.0035)));
  // Dust in the air: thicker, and lit up, looking toward the sun.
  const toSun = pow(max(dot(normalize(positionWorld.sub(cameraPosition)) as unknown as N3, sunDir), float(0)), float(4));
  return mix(lit, horizonColor.add(sunColor.mul(toSun.mul(0.3))), k.mul(toSun.mul(0.4).add(0.45))) as N3;
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
    this.#point.addAssign(lightColor.mul(max(dot(normalView as unknown as N3, lightDirection), float(0))).div(Math.PI));
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
    const baked = mix(facing, lm.a, ready);
    // The bake and the shadow are for the flat face; the relief leans it toward the sun or away, by the ratio of the two.
    const lean = this.#relief ? max(dot(lit, sunDir), float(0)).div(max(facing, float(0.2))) : float(1);
    const sunTerm = mix(baked, facing, near.mul(ready)).mul(this.#mask).mul(lean);
    const sky = mix(vec3(0.42, 0.44, 0.47), decode(lm.rgb as N3), ready);
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
      if (HEX_FAMILIES.has(finish.family)) a.assign(a.mul(mix(float(0.5), float(1.22), smoothstep(float(0.12), float(0.62), read.z))));
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
}

/** Rock showing through wherever ground is too steep to hold anything. */
const BARE_ROCK = 0x6e645a;

/**
 * Lights open ground with no bake yet (ticket 10 bakes it): a hemisphere of sky,
 * the sun by its angle, and the realtime shadow near the player.
 */
class OpenGroundModel extends LightingModel {
  readonly #albedo: N3;
  readonly #mask = float(1).toVar('sunMask');
  readonly #point = vec3(0, 0, 0).toVar('pointLight');

  constructor(albedo: N3) {
    super();
    this.#albedo = albedo;
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
    this.#point.addAssign(lightColor.mul(max(dot(normalView as unknown as N3, lightDirection), float(0))).div(Math.PI));
  }

  override finish(builder: NodeBuilder): void {
    const context = builder.context as unknown as { outgoingLight: N3 };
    const n = normalWorld as unknown as N3;
    const up = n.y.mul(0.5).add(0.5);
    const sky = mix(vec3(0.16, 0.16, 0.2) as unknown as N3, (light.skyZenith as unknown as N3).mul(1.4).add(0.2), up);
    const sun = sunColor.mul(max(dot(n, sunDir), float(0)).mul(this.#mask));
    context.outgoingLight.assign(haze(this.#albedo.mul(sky.add(sun).add(this.#point)) as N3));
  }
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
  const a = mix(color(BARE_ROCK) as unknown as N3, paint, steep).mul(coarse.mul(0.14).add(fine.mul(0.08)).add(1)) as N3;
  const m = new SurfaceMaterial(() => new OpenGroundModel(a));
  m.colorNode = vec4(a, 1);
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
export function placeholderLightmap(): DataTexture {
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

  constructor(probes: ProbeField, sun: () => DirectionalLight, reach: { centre: N2; radius: N }) {
    super();
    this.#probes = probes;
    this.#sun = sun;
    this.#reach = reach;
  }

  override direct(input: Parameters<PhysicalLightingModel['direct']>[0], builder: NodeBuilder): void {
    const light = (input.lightNode as unknown as { light?: unknown }).light;
    if (light === this.#sun()) {
      const near = float(1).sub(smoothstep(this.#reach.radius.mul(0.8), this.#reach.radius, length(positionWorld.xz.sub(this.#reach.centre))));
      input = { ...input, lightColor: (input.lightColor as unknown as N3).mul(mix(this.#probes.sun(), float(1), near)) as never };
    }
    super.direct(input, builder);
  }

  override indirect(builder: NodeBuilder): void {
    const context = builder.context as unknown as { irradiance: N3 };
    context.irradiance.addAssign(this.#probes.ambient().mul(Math.PI * (currentLighting().modelFill ?? 1)));
    super.indirect(builder);
  }
}

/** Has a standard material lit by the probe grid (moving objects: soldiers, props, decals, casings). `sun` gives the current sun light. */
export function probeLit<T extends MeshStandardNodeMaterial>(material: T, probes: ProbeField, sun: () => DirectionalLight, reach: { centre: N2; radius: N }): T {
  material.setupLightingModel = () => new ProbeLightingModel(probes, sun, reach);
  return material;
}
