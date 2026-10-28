import { dot, float, getViewPosition, mix, mrt, normalView, output, pass, perspectiveDepthToViewZ, renderOutput, screenUV, sin, smoothstep, step, time, uniform, vec2, vec3, vec4, velocity } from 'three/tsl';
import { RenderPipeline, type Node, type PerspectiveCamera, type Scene, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import type { RenderBackend } from './renderer';
import type { GraphicsPreset } from './settings';

/** The WebGL2 fallback is capped at Normal: High's MRT velocity and TRAA are WebGPU-only here. */
export function effectivePreset(preset: GraphicsPreset, backend: RenderBackend): GraphicsPreset {
  return backend === 'webgl2' && preset === 'high' ? 'normal' : preset;
}

const BLOOM = 0.1;

/**
 * Heat shimmer: what lies far off (the desert, the mountains) wavers a
 * little in the hot air over the ground, more the farther it is; the sky,
 * anything nearer than 150 m and anything seen well above the horizon (a
 * cloud) stay still. A pixel only borrows from a neighbour that is itself
 * far off, so near things never smear into the distance round their edges.
 * Two extra texture reads a pixel.
 */
function shimmer(image: TextureNode, depth: TextureNode, camera: PerspectiveCamera): Node<'vec4'> {
  const projectionInverse = uniform(camera.projectionMatrixInverse);
  const view = uniform(camera.matrixWorldInverse);
  const up = view.mul(vec4(0, 1, 0, 0)).xyz;
  const heat = (uv: Node<'vec2'>) => {
    const z = depth.sample(uv).r;
    const d = perspectiveDepthToViewZ(z, float(camera.near), float(camera.far)).negate();
    const elevation = dot(getViewPosition(uv, z, projectionInverse).normalize(), up);
    return smoothstep(float(150), float(600), d)
      .mul(float(1).sub(step(float(camera.far * 0.99), d)))
      .mul(float(1).sub(smoothstep(float(0.015), float(0.05), elevation)));
  };
  const t = time;
  const wave = vec2(sin(screenUV.y.mul(700).add(t.mul(6))).mul(0.0009), sin(screenUV.x.mul(300).sub(t.mul(4))).mul(0.0004));
  const shifted = screenUV.add(wave.mul(heat(screenUV)));
  return image.sample(mix(screenUV, shifted, step(float(0.5), heat(shifted)))) as unknown as Node<'vec4'>;
}

/** What each preset turns on. */
export interface PresetFeatures {
  /**
   * Anti-aliasing: FXAA over the finished frame (one cheap pass, for integrated
   * graphics), or temporal reprojection of the world with 4x MSAA on the viewmodel.
   */
  readonly aa: 'fxaa' | 'taa';
  readonly ao: false | 'half' | 'full';
  readonly bloom: boolean;
  readonly dynamicResolution: boolean;
  /**
   * The most pixels a frame renders (millions), whatever the screen: past it
   * the frame renders smaller and the browser scales it up.
   */
  readonly megapixels: number;
  /** Render pixels per screen pixel at most, before the budget: 1 ignores a high-DPI screen's extra density, above it supersamples. */
  readonly pixelsPerScreenPixel: number;
  readonly shadows: 'low' | 'normal' | 'high';
  /** Soft, depth-faded smoke with more particles. */
  readonly volumetricSmoke: boolean;
  /** Particle budget multiplier for effects. */
  readonly particles: number;
}

/**
 * Medium is the standard look, tuned first; Low takes from it what an
 * integrated GPU can't pay for (ambient occlusion, bloom, the temporal AA's
 * extra buffers, high-DPI density) and High adds to it for a fast GPU.
 */
export const PRESETS: Readonly<Record<GraphicsPreset, PresetFeatures>> = {
  // 1080p at most, at one pixel per CSS pixel, and lower still to hold the frame rate.
  low: { aa: 'fxaa', ao: false, bloom: false, dynamicResolution: true, megapixels: 2.1, pixelsPerScreenPixel: 1, shadows: 'low', volumetricSmoke: false, particles: 0.5 },
  // A high-DPI screen's full density up to 1440p's worth of pixels.
  normal: { aa: 'taa', ao: 'half', bloom: true, dynamicResolution: false, megapixels: 3.7, pixelsPerScreenPixel: 2, shadows: 'normal', volumetricSmoke: false, particles: 1 },
  // Supersampled: half again the screen's density, up to 4K's worth.
  high: { aa: 'taa', ao: 'full', bloom: true, dynamicResolution: false, megapixels: 8.3, pixelsPerScreenPixel: 3, shadows: 'high', volumetricSmoke: true, particles: 1.5 },
};

/** Supersampling on High: render pixels per device pixel. */
const HIGH_SUPERSAMPLE = 1.5;

/**
 * The pixel ratio a preset renders a `width` x `height` (CSS px) canvas at on a
 * screen of `devicePixelRatio`: the screen's density (times High's
 * supersampling), capped per preset, then cut to the preset's pixel budget.
 */
export function presetPixelRatio(preset: GraphicsPreset, width: number, height: number, devicePixelRatio: number): number {
  const f = PRESETS[preset];
  const wanted = Math.min(devicePixelRatio * (preset === 'high' ? HIGH_SUPERSAMPLE : 1), f.pixelsPerScreenPixel);
  const budget = Math.sqrt((f.megapixels * 1e6) / Math.max(1, width * height));
  return Math.min(wanted, budget);
}

/**
 * The frame: the world pass (with ambient occlusion and temporal AA by
 * preset), the viewmodel drawn in its own pass with its own camera and FOV
 * and composited on top (so it never clips into walls), then bloom and the
 * renderer's tone mapping (Low then smooths edges with FXAA). Normal and High
 * add a heat shimmer far off. Low adjusts render scale to hold the frame rate.
 */
export class GamePipeline {
  readonly #renderer: WebGPURenderer;
  readonly #world: Scene;
  readonly #camera: PerspectiveCamera;
  readonly #view: Scene;
  readonly #viewCamera: PerspectiveCamera;
  /** The preset's pixel ratio for the canvas size (see `presetPixelRatio`), before dynamic resolution. */
  #basePixelRatio = 1;
  #width = 1;
  #height = 1;
  #devicePixelRatio = 1;
  readonly #pipeline: RenderPipeline;
  #preset: GraphicsPreset = 'normal';
  #scale = 1;
  #frameTimes: number[] = [];
  #sinceAdjust = 0;
  #bloom: ReturnType<typeof bloom> | null = null;
  /** The nuke's white-out and colour grade, 0..1 (see `setNuke`). */
  readonly #flash = uniform(0);
  readonly #grade = uniform(0);
  /** Nodes owning render targets, released when the preset changes. */
  #owned: { dispose(): void }[] = [];

  constructor(renderer: WebGPURenderer, world: Scene, camera: PerspectiveCamera, view: Scene, viewCamera: PerspectiveCamera) {
    this.#renderer = renderer;
    this.#world = world;
    this.#camera = camera;
    this.#view = view;
    this.#viewCamera = viewCamera;
    // The viewmodel pass needs a transparent clear so it can be laid over the world. It is set
    // again as that pass starts: FXAA's render-to-texture, which draws it, clears to opaque black.
    renderer.setClearColor(0x000000, 0);
    view.onBeforeRender = () => renderer.setClearColor(0x000000, 0);
    this.#pipeline = new RenderPipeline(renderer);
  }

  get preset(): GraphicsPreset {
    return this.#preset;
  }

  /** Current dynamic render scale. */
  get renderScale(): number {
    return this.#scale;
  }

  setPreset(preset: GraphicsPreset): void {
    this.#preset = preset;
    for (const node of this.#owned) node.dispose();
    this.#owned = [];
    const f = PRESETS[preset];
    const taa = f.aa === 'taa';
    const worldPass = pass(this.#world, this.#camera);
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
      // Light: the bake already darkens the static world's corners; this adds contact shading round moving things.
      color = vec4(color.rgb.mul(mix(float(1), occlusion, 0.45)), color.a);
    }
    if (taa) {
      const t = traa(color, depth, worldPass.getTextureNode('velocity'), this.#camera);
      this.#owned.push(t);
      // The shimmer goes after the reprojection, so the two don't fight. (The types leave out TRAA's texture node.)
      const image = (t as unknown as { getTextureNode(): TextureNode }).getTextureNode();
      color = shimmer(image, depth, this.#camera);
    }
    // The viewmodel is small and close: under temporal AA, 4x MSAA on its own pass keeps its edges clean (FXAA covers it on Low).
    const viewPass = pass(this.#view, this.#viewCamera, { samples: taa ? 4 : 0 });
    this.#owned.push(viewPass);
    const vm = viewPass.getTextureNode('output');
    let composite: Node<'vec4'> = vec4(mix(color.rgb, vm.rgb, vm.a), 1);
    // The nuke: a scorched grade after the blast (burnt orange, deeper shadows), and a white-out at the instant of it.
    const c = composite.rgb;
    const luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    const warm = mix(c, vec3(luma).mul(vec3(1.35, 0.9, 0.6)), float(0.6));
    const graded = warm.mul(warm).div(warm.add(0.12)).mul(1.02);
    composite = vec4(mix(mix(c, graded, this.#grade), vec3(1.7, 1.6, 1.45), this.#flash), 1);
    if (f.bloom) {
      // Only real highlights bloom (flashes, glints), not sunlit ground.
      this.#bloom = bloom(composite, BLOOM, 0.35, 1.6);
      this.#owned.push(this.#bloom);
      composite = composite.add(this.#bloom);
    } else {
      this.#bloom = null;
    }
    if (f.aa === 'fxaa') {
      // FXAA reads the tone-mapped, display-encoded image, as it was made for.
      this.#pipeline.outputColorTransform = false;
      const fx = fxaa(renderOutput(composite));
      this.#owned.push(fx);
      composite = fx as unknown as Node<'vec4'>;
    } else {
      this.#pipeline.outputColorTransform = true;
    }
    this.#pipeline.outputNode = composite;
    this.#pipeline.needsUpdate = true;
    this.#scale = 1;
    this.#frameTimes = [];
    this.#sinceAdjust = 0;
    this.#applyPixelRatio();
  }

  /** The canvas's size (CSS px) and the screen's density, which set the preset's pixel ratio. */
  setViewport(width: number, height: number, devicePixelRatio: number): void {
    this.#width = width;
    this.#height = height;
    this.#devicePixelRatio = devicePixelRatio;
    this.#applyPixelRatio();
  }

  #applyPixelRatio(): void {
    this.#basePixelRatio = presetPixelRatio(this.#preset, this.#width, this.#height, this.#devicePixelRatio);
    this.#renderer.setPixelRatio(this.#basePixelRatio * this.#scale);
  }

  /** The nuke's white-out and colour grade this frame (0 to 1 each; both 0 outside the intermission). */
  setNuke(flash: number, grade: number): void {
    this.#flash.value = flash;
    this.#grade.value = grade;
  }

  /** Raises bloom briefly (the muzzle flash). */
  set bloomBoost(v: number) {
    if (this.#bloom) this.#bloom.strength.value = BLOOM + v;
  }

  /** Renders a frame; `dt` (s) drives dynamic resolution. */
  render(dt: number, adjustResolution = true): void {
    this.#pipeline.render();
    if (!adjustResolution || !PRESETS[this.#preset].dynamicResolution) return;
    this.#frameTimes.push(dt);
    if (this.#frameTimes.length > 60) this.#frameTimes.shift();
    this.#sinceAdjust += dt;
    if (this.#sinceAdjust < 1 || this.#frameTimes.length < 5) return;
    this.#sinceAdjust = 0;
    const avg = this.#frameTimes.reduce((a, b) => a + b, 0) / this.#frameTimes.length;
    // Allow recovery at a 60 Hz vsync cap, with a gap to avoid oscillation.
    const next = avg > 1 / 50 ? this.#scale - 0.1 : avg < 1 / 58 ? this.#scale + 0.05 : this.#scale;
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
