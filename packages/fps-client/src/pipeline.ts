import { float, mix, mrt, normalView, output, pass, screenUV, vec4, velocity } from 'three/tsl';
import { RenderPipeline, type Node, type PerspectiveCamera, type Scene, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import type { RenderBackend } from './renderer';
import type { GraphicsPreset } from './settings';

/** The WebGL2 fallback is capped at Normal: High's MRT velocity and TRAA are WebGPU-only here. */
export function effectivePreset(preset: GraphicsPreset, backend: RenderBackend): GraphicsPreset {
  return backend === 'webgl2' && preset === 'high' ? 'normal' : preset;
}

const BLOOM = 0.18;

/** What each preset turns on. */
export interface PresetFeatures {
  /** Anti-aliasing: 4x MSAA (only without AO: GTAO cannot read multisampled depth) or temporal reprojection. */
  readonly aa: 'msaa' | 'taa';
  readonly ao: false | 'half' | 'full';
  readonly bloom: boolean;
  readonly dynamicResolution: boolean;
  readonly shadows: 'low' | 'normal' | 'high';
  /** Soft, depth-faded smoke with more particles. */
  readonly volumetricSmoke: boolean;
  /** Particle budget multiplier for effects. */
  readonly particles: number;
}

export const PRESETS: Readonly<Record<GraphicsPreset, PresetFeatures>> = {
  low: { aa: 'msaa', ao: false, bloom: false, dynamicResolution: true, shadows: 'low', volumetricSmoke: false, particles: 0.5 },
  normal: { aa: 'taa', ao: 'half', bloom: true, dynamicResolution: false, shadows: 'normal', volumetricSmoke: false, particles: 1 },
  high: { aa: 'taa', ao: 'full', bloom: true, dynamicResolution: false, shadows: 'high', volumetricSmoke: true, particles: 1.5 },
};

/**
 * The frame: the world pass (with ambient occlusion and temporal AA by
 * preset), the viewmodel drawn in its own pass with its own camera and FOV
 * and composited on top (so it never clips into walls), then bloom and the
 * renderer's tone mapping. Low adjusts the render scale to hold the frame rate.
 */
export class GamePipeline {
  readonly #renderer: WebGPURenderer;
  readonly #world: Scene;
  readonly #camera: PerspectiveCamera;
  readonly #view: Scene;
  readonly #viewCamera: PerspectiveCamera;
  readonly #basePixelRatio: number;
  readonly #pipeline: RenderPipeline;
  #preset: GraphicsPreset = 'normal';
  #scale = 1;
  #frameTimes: number[] = [];
  #sinceAdjust = 0;
  #bloom: ReturnType<typeof bloom> | null = null;
  /** Nodes owning render targets, released when the preset changes. */
  #owned: { dispose(): void }[] = [];

  constructor(renderer: WebGPURenderer, world: Scene, camera: PerspectiveCamera, view: Scene, viewCamera: PerspectiveCamera, basePixelRatio: number) {
    this.#renderer = renderer;
    this.#world = world;
    this.#camera = camera;
    this.#view = view;
    this.#viewCamera = viewCamera;
    this.#basePixelRatio = basePixelRatio;
    // The viewmodel pass needs a transparent clear so it can be laid over the world.
    renderer.setClearColor(0x000000, 0);
    this.#pipeline = new RenderPipeline(renderer);
  }

  get preset(): GraphicsPreset {
    return this.#preset;
  }

  /** Current render scale (Low's dynamic resolution). */
  get renderScale(): number {
    return this.#scale;
  }

  setPreset(preset: GraphicsPreset): void {
    this.#preset = preset;
    for (const node of this.#owned) node.dispose();
    this.#owned = [];
    const f = PRESETS[preset];
    const taa = f.aa === 'taa';
    const worldPass = pass(this.#world, this.#camera, { samples: f.aa === 'msaa' ? 4 : 0 });
    this.#owned.push(worldPass);
    let color: Node<'vec4'> = worldPass.getTextureNode('output').toVec4();
    if (taa && f.ao === 'full') worldPass.setMRT(mrt({ output, normal: normalView, velocity }));
    else if (taa) worldPass.setMRT(mrt({ output, velocity }));
    else if (f.ao === 'full') worldPass.setMRT(mrt({ output, normal: normalView }));
    const depth = worldPass.getTextureNode('depth');
    if (f.ao) {
      const normal = f.ao === 'full' ? worldPass.getTextureNode('normal') : null;
      // Without a normal buffer, GTAO reconstructs normals from depth.
      const aoPass = ao(depth, normal as TextureNode, this.#camera);
      this.#owned.push(aoPass);
      aoPass.resolutionScale = f.ao === 'half' ? 0.5 : 1;
      aoPass.radius.value = 0.6;
      aoPass.samples.value = f.ao === 'half' ? 8 : 16;
      const occlusion = aoPass.getTextureNode().sample(screenUV).r;
      color = vec4(color.rgb.mul(mix(float(1), occlusion, 0.85)), color.a);
    }
    if (taa) {
      const t = traa(color, depth, worldPass.getTextureNode('velocity'), this.#camera);
      this.#owned.push(t);
      color = t as unknown as Node<'vec4'>;
    }
    // The viewmodel is small and close: 4x MSAA on its own pass keeps its edges clean under every preset.
    const viewPass = pass(this.#view, this.#viewCamera, { samples: 4 });
    this.#owned.push(viewPass);
    const vm = viewPass.getTextureNode('output');
    let composite: Node<'vec4'> = vec4(mix(color.rgb, vm.rgb, vm.a), 1);
    if (f.bloom) {
      this.#bloom = bloom(composite, BLOOM, 0.35, 0.92);
      this.#owned.push(this.#bloom);
      composite = composite.add(this.#bloom);
    } else {
      this.#bloom = null;
    }
    this.#pipeline.outputNode = composite;
    this.#pipeline.needsUpdate = true;
    this.#scale = 1;
    this.#renderer.setPixelRatio(this.#basePixelRatio);
  }

  /** Raises bloom briefly (the muzzle flash). */
  set bloomBoost(v: number) {
    if (this.#bloom) this.#bloom.strength.value = BLOOM + v;
  }

  /** Renders a frame; `dt` (s) drives Low's dynamic resolution. */
  render(dt: number): void {
    this.#pipeline.render();
    if (!PRESETS[this.#preset].dynamicResolution) return;
    this.#frameTimes.push(dt);
    if (this.#frameTimes.length > 60) this.#frameTimes.shift();
    this.#sinceAdjust += dt;
    if (this.#sinceAdjust < 1 || this.#frameTimes.length < 30) return;
    this.#sinceAdjust = 0;
    const avg = this.#frameTimes.reduce((a, b) => a + b, 0) / this.#frameTimes.length;
    const next = avg > 1 / 55 ? this.#scale - 0.1 : avg < 1 / 80 ? this.#scale + 0.05 : this.#scale;
    const clamped = Math.min(1, Math.max(0.5, next));
    if (Math.abs(clamped - this.#scale) > 1e-3) {
      this.#scale = clamped;
      this.#renderer.setPixelRatio(this.#basePixelRatio * clamped);
    }
  }

  dispose(): void {
    for (const node of this.#owned) node.dispose();
    this.#pipeline.dispose();
  }
}
