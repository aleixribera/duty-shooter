import { dot, float, getViewPosition, mix, mrt, normalView, output, pass, perspectiveDepthToViewZ, screenUV, sin, smoothstep, step, time, uniform, vec2, vec3, vec4, velocity } from 'three/tsl';
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
 * renderer's tone mapping. Normal and High add a heat shimmer far off. Low adjusts the render scale to hold the frame rate.
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
  /** The nuke's white-out and colour grade, 0..1 (see `setNuke`). */
  readonly #flash = uniform(0);
  readonly #grade = uniform(0);
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
    // The viewmodel is small and close: 4x MSAA on its own pass keeps its edges clean under every preset.
    const viewPass = pass(this.#view, this.#viewCamera, { samples: 4 });
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
    this.#pipeline.outputNode = composite;
    this.#pipeline.needsUpdate = true;
    this.#scale = 1;
    this.#renderer.setPixelRatio(this.#basePixelRatio);
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
