import { readBakeFile, type BakeFile } from './surfaces';

/**
 * Fetches and inflates a map's baked lighting (the build serves it deflated
 * at bake/<map>.bin). Resolves to null, with a warning, if it is missing or
 * unreadable: the world then draws without it.
 */
export async function loadBake(url: string, onProgress?: (fraction: number) => void): Promise<BakeFile | null> {
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    // Download progress for the loading screen, when the size is known.
    const size = Number(response.headers.get('content-length')) || 0;
    let received = 0;
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
        transform(chunk, out) {
          received += chunk.byteLength;
          if (size > 0) onProgress?.(Math.min(1, received / size));
          out.enqueue(chunk);
        },
      }),
    );
    const inflated = counted.pipeThrough(new DecompressionStream('deflate'));
    return readBakeFile(new Uint8Array(await new Response(inflated).arrayBuffer()));
  } catch (error) {
    console.warn(`No baked lighting from ${url}: ${String(error)}`);
    return null;
  }
}
