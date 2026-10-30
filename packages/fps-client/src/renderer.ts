import { WebGPURenderer } from 'three/webgpu';

/** Which GPU API the renderer ended up on. */
export type RenderBackend = 'webgpu' | 'webgl2';

export interface CreateRendererOptions {
  /** Skip WebGPU and use the WebGL2 backend, e.g. for testing the fallback. */
  readonly forceWebGL?: boolean;
  /** Measure GPU time with timestamp queries where the browser allows it (the benchmark). */
  readonly trackTimestamp?: boolean;
}

export interface GameRenderer {
  readonly renderer: WebGPURenderer;
  readonly backend: RenderBackend;
}

/**
 * Creates Three.js's WebGPU renderer on `canvas`. When the browser has no
 * usable WebGPU adapter, Three.js falls back to its WebGL2 backend on its
 * own; `backend` reports which one was picked.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  options: CreateRendererOptions = {},
): Promise<GameRenderer> {
  const renderer = new WebGPURenderer({
    canvas,
    // The frame is anti-aliased in the render pipeline (TRAA, MSAA on the viewmodel, or FXAA), so a multisampled canvas would only cost bandwidth.
    antialias: false,
    forceWebGL: options.forceWebGL ?? false,
    trackTimestamp: options.trackTimestamp ?? false,
  });
  await renderer.init();
  const isWebGPU = 'isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend === true;
  if (isWebGPU) compileInBackground(renderer);
  return { renderer, backend: isWebGPU ? 'webgpu' : 'webgl2' };
}

/** The parts of three.js's WebGPU backend that draw and that make pipelines. */
interface PipelineBackend {
  createRenderPipeline(renderObject: unknown, promises: Promise<void>[] | null): void;
  draw(renderObject: { pipeline: object }, info: unknown): void;
  get(object: object): { pipeline?: unknown };
}

/** Pipelines being compiled, per renderer. */
const compiling = new WeakMap<WebGPURenderer, Set<Promise<void>>>();

/**
 * Makes every render pipeline compile off the main thread, in parallel, with
 * whatever needs one left out of the picture until it is ready. Three.js
 * otherwise creates them in the frame that first needs them, and the GPU
 * process compiles them one by one with every frame queued behind: seconds of
 * nothing on a new map, a hitch for any shader first seen in a match. Here
 * no frame ever waits on a shader; see {@link pipelinesReady} for waiting on
 * purpose.
 */
function compileInBackground(renderer: WebGPURenderer): void {
  const backend = renderer.backend as unknown as PipelineBackend;
  const create = backend.createRenderPipeline.bind(backend);
  const draw = backend.draw.bind(backend);
  const pending = new Set<Promise<void>>();
  compiling.set(renderer, pending);
  backend.createRenderPipeline = (renderObject, promises) => {
    const started: Promise<void>[] = [];
    create(renderObject, started);
    for (const compile of started) {
      promises?.push(compile);
      pending.add(compile);
      void compile.finally(() => pending.delete(compile));
    }
  };
  backend.draw = (renderObject, info) => {
    if (backend.get(renderObject.pipeline).pipeline) draw(renderObject, info);
  };
}

/** Settles when every pipeline asked for so far has compiled (at once on WebGL, whose programs compile as they are used). */
export async function pipelinesReady(renderer: WebGPURenderer): Promise<void> {
  const pending = compiling.get(renderer);
  while (pending && pending.size > 0) await Promise.all(pending);
}
