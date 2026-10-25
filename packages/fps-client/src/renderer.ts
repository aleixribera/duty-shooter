import { WebGPURenderer } from 'three/webgpu';

/** Which GPU API the renderer ended up on. */
export type RenderBackend = 'webgpu' | 'webgl2';

export interface CreateRendererOptions {
  /** Skip WebGPU and use the WebGL2 backend, e.g. for testing the fallback. */
  readonly forceWebGL?: boolean;
}

export interface GameRenderer {
  readonly renderer: WebGPURenderer;
  readonly backend: RenderBackend;
}

/**
 * Creates Three.js's WebGPU renderer on `canvas`. When the browser has no
 * usable WebGPU adapter, Three.js falls back to its WebGL2 backend on its
 * own; `backend` reports which one was picked so callers can cap presets.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions = {},
): Promise<GameRenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: options.forceWebGL ?? false,
  });
  await renderer.init();
  const isWebGPU = 'isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend === true;
  return { renderer, backend: isWebGPU ? 'webgpu' : 'webgl2' };
}
