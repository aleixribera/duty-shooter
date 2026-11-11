import { cameraPosition, dFdx, dFdy, dot, float, floor, fract, If, length, Loop, max, normalize, normalWorld, positionWorld, select, sin, smoothstep, sqrt, texture, vec2, vec3 } from 'three/tsl';
import { LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, Texture, TextureLoader, type Node } from 'three/webgpu';
import type { Family } from './surfaces';

/**
 * The tiling pictures under the finishes (tools/textures/tiles.mjs paints
 * them): for each kind of surface a relief (normal x, normal y, height), and
 * one shared noise. The patterns stay in code, which never repeats and needs
 * no memory; what would cost the GPU every pixel (noise) or can't be done in
 * code at all (lit relief) comes from these, and their mipmaps keep the
 * distance from flickering. They load with the engine, ahead of the first
 * frame; one that fails reads as a flat surface.
 */

type N = Node<'float'>;
type N2 = Node<'vec2'>;
type N3 = Node<'vec3'>;

export type TileName = 'brick' | 'stucco' | 'concrete' | 'siding' | 'shingles' | 'sheetMetal' | 'planks' | 'gravel' | 'asphalt' | 'earth' | 'grass' | 'trim';

/** What one tile covers (m, along and up the surface): a whole number of its pattern (see tools/textures/tiles.mjs). */
const TILES: Readonly<Record<TileName, readonly [number, number]>> = {
  brick: [1.8, 1.8],
  stucco: [3, 3],
  concrete: [3, 3],
  siding: [2, 2],
  shingles: [1.98, 2.2],
  sheetMetal: [1.976, 1.976],
  planks: [1.96, 1.96],
  gravel: [2, 2],
  asphalt: [2, 2],
  earth: [3, 3],
  grass: [2, 2],
  trim: [1, 1],
};

/** Noise cycles per tile of the noise picture. */
const NOISE_CYCLES = 8;

/** Hexagons per tile, hex-tiled. */
const HEX_CELLS = 2;

/** How anisotropically tiles filter: walls and floors are mostly seen at a slant. */
const ANISOTROPY = 8;

const cache = new Map<string, Texture>();
const loading: Promise<unknown>[] = [];
const loader = new TextureLoader();

/** A one-pixel tile with no relief: level, and neither high nor low. Null where nothing can be painted (a page with no 2D canvas, as the tests' is). */
function flatTile(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = 'rgb(128 128 128)';
  context.fillRect(0, 0, 1, 1);
  return canvas;
}

/** The tile picture `name`, shared by every map and kept for the page's life. */
function picture(name: string): Texture {
  let t = cache.get(name);
  if (!t) {
    const texture = new Texture();
    loading.push(
      loader.loadAsync(`textures/${name}.webp`).then(
        (image) => {
          texture.image = image.image;
          texture.needsUpdate = true;
        },
        () => {
          console.error(`Surface tile ${name} failed to load`);
          const flat = flatTile();
          if (!flat) return;
          texture.image = flat;
          texture.needsUpdate = true;
        },
      ),
    );
    texture.colorSpace = NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = ANISOTROPY;
    texture.generateMipmaps = true;
    texture.flipY = false;
    cache.set(name, texture);
    t = texture;
  }
  return t;
}

/** A read of one of the pictures that don't tile, at a mip level of the caller's: they are cut into cells, which the derivatives at a cell's edge would blur right across. */
export function atlasAt(name: 'rooms' | 'grime', at: Node<'vec2'>, level: Node<'float'>): Node<'vec4'> {
  return texture(picture(name), at as never).level(level) as unknown as Node<'vec4'>;
}

/** Settles when every tile has loaded, or failed to. Materials ask for theirs as their shaders build, too late to wait for, so this asks for all of them. */
export function tilesLoaded(): Promise<void> {
  for (const name of [...Object.keys(TILES), 'noise', 'clouds', 'rooms', 'grime']) picture(name);
  return Promise.all(loading).then(() => undefined);
}

/** The surface's relief at `st` (metres): normal in the surface's own axes (x, y), and height. */
export function reliefAt(name: TileName, st: N2, gradient: { x: N2; y: N2 } | null = null): N3 {
  const [mx, my] = TILES[name];
  const at = st.div(vec2(mx, my)) as N2;
  const node = texture(picture(name), at as never) as unknown as { rgb: N3; grad(x: Node, y: Node): { rgb: N3 } };
  if (!gradient) return node.rgb;
  return node.grad(gradient.x.div(vec2(mx, my)) as never, gradient.y.div(vec2(mx, my)) as never).rgb;
}

/** A coordinate's rates of change across the screen, for reading a tile at a shifted coordinate without its mip level jumping. */
export function gradients(st: N2): { x: N2; y: N2 } {
  return { x: dFdx(st as never) as unknown as N2, y: dFdy(st as never) as unknown as N2 };
}

const noisePicture = (): Texture => picture('noise');

/** Shared noise at `q`, `scale` cycles per unit, about 0..1: channel r or g smooth, b a crease (0 along its cracks). */
export function noiseAt(q: N2, scale: number, channel: 'r' | 'g' | 'b' = 'r'): N {
  const node = texture(noisePicture(), q.mul(scale / NOISE_CYCLES) as never) as unknown as Record<'r' | 'g' | 'b', N>;
  return node[channel];
}

/** The sky's cloud at `q` (one tile a unit): r its density, g how deep into a bank. */
export function cloudAt(q: N2): { r: N; g: N } {
  return texture(picture('clouds'), q as never) as unknown as { r: N; g: N };
}

/**
 * Relief read through hexagons, each showing the tile from its own random
 * place, blended where they meet: one tile that no longer draws a grid over a
 * yard (three reads instead of one). Only for what has no joints to break.
 */
export function hexRelief(name: TileName, st: N2): N3 {
  const [mx] = TILES[name];
  const cell = st.div(mx).mul(HEX_CELLS) as N2;
  // A triangle grid: each pixel weighs the triangle's three corners, each corner its own place in the tile.
  const skewed = vec2(cell.x.sub(cell.y.mul(0.57735)), cell.y.mul(1.1547)) as N2;
  const base = floor(skewed) as N2;
  const part = fract(skewed) as N2;
  const rest = float(1).sub(part.x).sub(part.y) as N;
  const lower = rest.greaterThan(0);
  const pick = (a: Node, b: Node) => select(lower, a, b) as unknown as N;
  const w1 = pick(rest, rest.negate());
  const w2 = pick(part.y, float(1).sub(part.y));
  const w3 = pick(part.x, float(1).sub(part.x));
  const v1 = base.add(pick(float(0), float(1))) as N2;
  const v2 = base.add(vec2(pick(float(0), float(1)), pick(float(1), float(0)))) as N2;
  const v3 = base.add(vec2(pick(float(1), float(0)), pick(float(0), float(1)))) as N2;
  const g = gradients(st);
  const read = (corner: N2): N3 => {
    const place = fract(sin(vec2(dot(corner, vec2(127.1, 311.7)), dot(corner, vec2(269.5, 183.3)))).mul(43758.5453));
    return reliefAt(name, st.add((place as unknown as N2).mul(mx)) as N2, g);
  };
  const [a, b, c] = [w1.mul(w1).mul(w1), w2.mul(w2).mul(w2), w3.mul(w3).mul(w3)];
  return read(v1).mul(a).add(read(v2).mul(b)).add(read(v3).mul(c)).div(a.add(b).add(c)) as N3;
}

/** The surface's own axes at the fragment, the same ones its `uv` runs along (see surfaceGeometries in world-view.ts). */
function surfaceAxes(): { tangent: N3; bitangent: N3; normal: N3 } {
  const n = normalWorld as unknown as N3;
  const wall = normalize(vec3(n.z, float(0), n.x.negate())) as N3;
  const tangent = select(n.y.abs().lessThan(0.99), wall, vec3(1, 0, 0)) as unknown as N3;
  const bitangent = vec3(n.y.mul(tangent.z).sub(n.z.mul(tangent.y)), n.z.mul(tangent.x).sub(n.x.mul(tangent.z)), n.x.mul(tangent.y).sub(n.y.mul(tangent.x))) as N3;
  return { tangent, bitangent, normal: n };
}

/** How many steps parallax marches, and how far off it fades out (m): past that a pixel reads the relief once, flat. */
const PARALLAX_STEPS = 6;
const PARALLAX_NEAR = 7;
const PARALLAX_FAR = 12;

/**
 * Parallax occlusion: where the eye would really land on a surface `depth`
 * metres deep at `st`, marching down the height of the tile. Near only, so it
 * costs its reads on the walls beside the player, and a fixed few of them;
 * it takes level reads, which are legal in a shader's branches.
 */
export function parallax(name: TileName, st: N2, depth: number): N2 {
  const { tangent, bitangent, normal } = surfaceAxes();
  const [mx, my] = TILES[name];
  const shifted = st.toVar('parallaxUv') as N2;
  const toEye = cameraPosition.sub(positionWorld) as unknown as N3;
  const distance = length(toEye as never) as unknown as N;
  const near = float(1).sub(smoothstep(float(PARALLAX_NEAR), float(PARALLAX_FAR), distance)) as N;
  // Worked out ahead of the branch: a shared node first used inside it is only set inside it, and the rest of the shader would read it as zero wherever the branch didn't run.
  const eye = normalize(toEye).toVar('parallaxEye') as N3;
  const across = vec2(dot(eye, tangent), dot(eye, bitangent)).toVar('parallaxAcross') as N2;
  const facing = dot(eye, normal).toVar('parallaxFacing') as N;
  If(near.greaterThan(0) as never, () => {
    // How far along the surface one step down travels; flat views are held back so the march can't run away.
    const reach = across.div(max(facing, float(0.25))).mul(depth).mul(near).div(PARALLAX_STEPS) as N2;
    const level = 1 / PARALLAX_STEPS;
    const surface = float(1).toVar('parallaxDepth') as N & { assign(v: Node): void };
    const height = float(0).toVar('parallaxHeight') as N & { assign(v: Node): void };
    const uv = shifted as unknown as { assign(v: Node): void };
    const tex = texture(picture(name)) as unknown as { sample(uv: Node): { level(l: Node): { b: N } } };
    Loop(PARALLAX_STEPS, () => {
      height.assign(tex.sample((shifted as N2).div(vec2(mx, my))).level(float(1)).b);
      If(height.lessThan(surface) as never, () => {
        surface.assign(surface.sub(level));
        uv.assign((shifted as N2).sub(reach));
      });
    });
  });
  return shifted;
}

/** Which relief each family reads (those with none are smooth). */
export const FAMILY_TILE: Partial<Readonly<Record<Family, TileName>>> = {
  siding: 'siding',
  shingles: 'shingles',
  brick: 'brick',
  asphalt: 'asphalt',
  grass: 'grass',
  sand: 'earth',
  concrete: 'concrete',
  sheetMetal: 'sheetMetal',
  fence: 'planks',
  floor: 'planks',
  plaster: 'stucco',
  wornPlaster: 'stucco',
  dirt: 'earth',
  gravel: 'gravel',
  tile: 'concrete',
};

/** How deep parallax reads a family (m); the rest are too shallow to be worth it. */
export const FAMILY_DEPTH: Partial<Readonly<Record<Family, number>>> = {
  siding: 0.016,
  shingles: 0.016,
  brick: 0.012,
  sheetMetal: 0.014,
};

/** The families that read relief through hexagons: open ground, big and with no joints to break. */
export const HEX_FAMILIES: ReadonlySet<Family> = new Set(['sand', 'dirt', 'gravel', 'grass']);

/** The relief's normal in the world, leaning `strength` (1: as painted). */
export function detailNormal(relief: N3, strength: number): N3 {
  const { tangent, bitangent, normal } = surfaceAxes();
  const lean = relief.xy.mul(2).sub(1).mul(strength) as N2;
  const z = sqrt(max(float(1).sub(dot(lean, lean)), float(0.04)));
  return normalize(tangent.mul(lean.x).add(bitangent.mul(lean.y)).add(normal.mul(z))) as N3;
}
