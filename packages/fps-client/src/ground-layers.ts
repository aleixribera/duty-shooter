import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, UnsignedByteType, RGBAFormat } from 'three/webgpu';
import { GROUND_LAYER_SIZE, GROUND_LAYERS } from './surfaces/ground-layers-data';
import { filterByQuality } from './quality';

/**
 * The ground's photo layers (tools/textures/ground.py): one strip of colour and
 * one of relief (normal x, normal y, height), a layer under the next, loaded
 * into two array textures so the ground's shader picks a layer per pixel with
 * one read. They load with the tiles (see `tilesLoaded`), ahead of the first
 * frame; a failed load leaves the ground its palette colours.
 */

export { GROUND_LAYERS } from './surfaces/ground-layers-data';

/** A layer's index by name, for a map's palette. */
export function groundLayerIndex(name: string): number {
  const i = GROUND_LAYERS.findIndex((l) => l.name === name);
  if (i < 0) throw new Error(`No ground layer "${name}"`);
  return i;
}

/** The layer steep ground wears, from the side. */
export const CLIFF_LAYER = 'cliff';

const ANISOTROPY = 8;

const toSrgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));

/** Until (or unless) the strips load: each layer its own mean colour, and level. */
function standIn(relief: boolean): Uint8Array {
  const area = GROUND_LAYER_SIZE * GROUND_LAYER_SIZE;
  const data = new Uint8Array(area * GROUND_LAYERS.length * 4);
  GROUND_LAYERS.forEach((layer, i) => {
    const [r, g, b] = relief ? [128, 128, 128] : layer.mean.map(toSrgb);
    for (let p = i * area; p < (i + 1) * area; p++) data.set([r!, g!, b!, 255], p * 4);
  });
  return data;
}

function arrayTexture(colorSpace: string): DataArrayTexture {
  const size = GROUND_LAYER_SIZE;
  const t = new DataArrayTexture(standIn(colorSpace === NoColorSpace), size, size, GROUND_LAYERS.length);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  filterByQuality(t, ANISOTROPY);
  t.flipY = false;
  return t;
}

let textures: { color: DataArrayTexture; relief: DataArrayTexture } | null = null;
let loading: Promise<void> | null = null;

/** Decodes a strip into RGBA bytes, as stored: no colour conversion, no premultiplying. */
async function decode(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
}

/** The two array textures, shared by every map with terrain. Their pixels arrive with `groundLoaded`. */
export function groundTextures(): { color: DataArrayTexture; relief: DataArrayTexture } {
  textures ??= { color: arrayTexture(SRGBColorSpace), relief: arrayTexture(NoColorSpace) };
  return textures;
}

/** Settles when the layers' pixels are in their textures, or failed to load. */
export function groundLoaded(): Promise<void> {
  if (loading) return loading;
  const { color, relief } = groundTextures();
  const fill = (t: DataArrayTexture, name: string) =>
    decode(`textures/${name}.webp`).then((bytes) => {
      const data = t.image.data as Uint8Array;
      data.set(bytes.subarray(0, data.length));
      t.needsUpdate = true;
    });
  loading = Promise.all([fill(color, 'ground-color'), fill(relief, 'ground-relief')]).then(
    () => undefined,
    (error: unknown) => console.error(`Ground layers failed to load: ${String(error)}`),
  );
  return loading;
}
