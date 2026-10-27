import type { ProbeGrid } from './bake';

/**
 * A map's baked lighting as it ships: a little-endian u32 header length, that
 * many bytes of JSON header, the lightmap's RGBA bytes, then the probes'.
 * The build deflates it; the client inflates it before reading.
 */
export interface BakeFile {
  /** The surface layout it was baked for (SurfaceLayout.key). */
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly probes: ProbeGrid;
  /** width x height RGBA: indirect light (encoded) and the sun term. */
  readonly lightmap: Uint8Array;
  /** One RGBA per probe, x fastest then y then z: ambient light (encoded) and sun visibility. */
  readonly probeData: Uint8Array;
}

export function writeBakeFile(file: BakeFile): Uint8Array {
  const header = new TextEncoder().encode(JSON.stringify({ key: file.key, width: file.width, height: file.height, probes: file.probes }));
  const out = new Uint8Array(4 + header.length + file.lightmap.length + file.probeData.length);
  new DataView(out.buffer).setUint32(0, header.length, true);
  out.set(header, 4);
  out.set(file.lightmap, 4 + header.length);
  out.set(file.probeData, 4 + header.length + file.lightmap.length);
  return out;
}

export function readBakeFile(bytes: Uint8Array): BakeFile {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length))) as Omit<BakeFile, 'lightmap' | 'probeData'>;
  const start = 4 + length;
  const lightmapSize = header.width * header.height * 4;
  const [nx, ny, nz] = header.probes.dims;
  const probeSize = nx * ny * nz * 4;
  if (bytes.length !== start + lightmapSize + probeSize) throw new Error(`Bake file is ${bytes.length} bytes, expected ${start + lightmapSize + probeSize}`);
  return { ...header, lightmap: bytes.subarray(start, start + lightmapSize), probeData: bytes.subarray(start + lightmapSize) };
}
