import { dot, float, getViewPosition, mix, mrt, output, pass, velocity as velocityNode, perspectiveDepthToViewZ, screenUV, sin, smoothstep, step, time, uniform, vec2, vec3, vec4, velocity } from 'three/tsl';
import { RenderPipeline, type Matrix4, type Node, type PerspectiveCamera, type Scene, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';

const BLOOM = 0.1;

/** Render pixels per CSS pixel at most: a high-DPI screen's density, up to twice. */
const MAX_DENSITY = 2;

/** The most pixels a frame renders (millions), 1440p's worth: past it the frame renders smaller and the browser scales it up. */
const MAX_MEGAPIXELS = 3.7;

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

/**
 * The pixel ratio a `width` x `height` (CSS px) canvas renders at on a screen
 * of `devicePixelRatio`: the screen's density, capped, then cut to the pixel
 * budget.
 */
export function renderPixelRatio(width: number, height: number, devicePixelRatio: number): number {
  const budget = Math.sqrt((MAX_MEGAPIXELS * 1e6) / Math.max(1, width * height));
  return Math.min(devicePixelRatio, MAX_DENSITY, budget);
}

/**
 * The frame: the world pass (with half-resolution ambient occlusion and
 * temporal AA), a heat shimmer far off, the viewmodel drawn in its own pass with
 * its own camera and FOV and composited on top (so it never clips into walls),
 * then bloom and the renderer's tone mapping.
 */
/** How deep the passes' renders sit: the viewmodel's inside the screen's quad, the world's inside the temporal AA's as well. */
const VIEW_DEPTH = 1;
const WORLD_DEPTH = 2;

/** The parts of three.js's renderer that compile ahead of drawing. */
interface CompilingRenderer extends WebGPURenderer {
  _mrt: unknown;
  _renderTarget: unknown;
  _renderContexts: { get(target: unknown, mrt: unknown, depth?: number): object };
  _nodes: {
    getForRender(object: { context: object & { mrt?: unknown } }): unknown;
    getForRenderAsync(object: { context: object & { mrt?: unknown } }): unknown;
  };
}

/** What each render context's shaders are built with: its render target, and the unjittered projection under temporal AA. */
const builds = new WeakMap<object, { target: unknown; projection: Matrix4 | null }>();

export class GamePipeline {
  readonly #renderer: WebGPURenderer;
  readonly #pipeline: RenderPipeline;
  readonly #bloom: ReturnType<typeof bloom>;
  /** The nuke's white-out and colour grade, 0..1 (see `setNuke`). */
  readonly #flash = uniform(0);
  readonly #grade = uniform(0);
  /** Nodes owning render targets. */
  readonly #owned: { dispose(): void }[] = [];
  /** What to build shaders for ahead of drawing: the scenes and the passes that draw them. */
  readonly #passes: { scene: Scene; camera: PerspectiveCamera; pass: ReturnType<typeof pass>; depth: number; samples: number; unjittered: Matrix4 | null }[];

  constructor(renderer: WebGPURenderer, world: Scene, camera: PerspectiveCamera, view: Scene, viewCamera: PerspectiveCamera) {
    this.#renderer = renderer;
    // The viewmodel pass needs a transparent clear so it can be laid over the world.
    renderer.setClearColor(0x000000, 0);
    this.#pipeline = new RenderPipeline(renderer);
    const worldPass = pass(world, camera);
    this.#owned.push(worldPass);
    worldPass.setMRT(mrt({ output, velocity }));
    const depth = worldPass.getTextureNode('depth');
    // GTAO reconstructs normals from depth.
    const aoPass = ao(depth, null as unknown as TextureNode, camera);
    this.#owned.push(aoPass);
    aoPass.resolutionScale = 0.5;
    aoPass.radius.value = 0.6;
    aoPass.samples.value = 8;
    const occlusion = aoPass.getTextureNode().sample(screenUV).r;
    const lit: Node<'vec4'> = worldPass.getTextureNode('output').toVec4();
    // Light: the bake already darkens the static world's corners; this adds contact shading round moving things.
    const shaded = vec4(lit.rgb.mul(mix(float(1), occlusion, 0.45)), lit.a);
    const t = traa(shaded, depth, worldPass.getTextureNode('velocity'), camera);
    this.#owned.push(t);
    // The shimmer goes after the reprojection, so the two don't fight. (The types leave out TRAA's texture node.)
    const image = (t as unknown as { getTextureNode(): TextureNode }).getTextureNode();
    const color = shimmer(image, depth, camera);
    // The viewmodel is small and close: under temporal AA, 4x MSAA on its own pass keeps its edges clean.
    const viewPass = pass(view, viewCamera, { samples: 4 });
    this.#owned.push(viewPass);
    this.#passes = [
      { scene: world, camera, pass: worldPass, depth: WORLD_DEPTH, samples: renderer.samples, unjittered: (t as unknown as { _originalProjectionMatrix: Matrix4 })._originalProjectionMatrix },
      { scene: view, camera: viewCamera, pass: viewPass, depth: VIEW_DEPTH, samples: 4, unjittered: null },
    ];
    const vm = viewPass.getTextureNode('output');
    const over = vec4(mix(color.rgb, vm.rgb, vm.a), 1);
    // The nuke: a scorched grade after the blast (burnt orange, deeper shadows), and a white-out at the instant of it.
    const c = over.rgb;
    const luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    const warm = mix(c, vec3(luma).mul(vec3(1.35, 0.9, 0.6)), float(0.6));
    const graded = warm.mul(warm).div(warm.add(0.12)).mul(1.02);
    const composite = vec4(mix(mix(c, graded, this.#grade), vec3(1.7, 1.6, 1.45), this.#flash), 1);
    // Only real highlights bloom (flashes, glints), not sunlit ground.
    this.#bloom = bloom(composite, BLOOM, 0.35, 1.6);
    this.#owned.push(this.#bloom);
    this.#pipeline.outputNode = composite.add(this.#bloom);
    this.#pipeline.needsUpdate = true;
  }

  /**
   * Builds the shaders of everything visible now, in small pieces between the
   * page's other work, with nothing drawn. Takes its list of objects at once,
   * so what is put on show for it can go straight back. `breath` runs before
   * each piece, which waits for it.
   */
  compile(breath?: () => Promise<void>): Promise<void> {
    const renderer = this.#renderer as unknown as CompilingRenderer;
    const contexts = renderer._renderContexts;
    const context = contexts.get.bind(contexts);
    // Three.js compiles for a render at depth 0, where no pass renders: its shaders would be built for nothing.
    let depth = 0;
    let projection: Matrix4 | null = null;
    contexts.get = (target, mrt) => {
      const found = context(target, mrt, depth);
      builds.set(found, { target, projection });
      return found;
    };
    const nodes = renderer._nodes;
    // Three.js builds a shader here over several turns, reading the renderer's current state, by then another pass's.
    // Built whole, with the state of its own pass, the pieces are one object each.
    const build = Object.getPrototypeOf(nodes).getForRender as CompilingRenderer['_nodes']['getForRender'];
    nodes.getForRenderAsync = async (object) => {
      await breath?.();
      const { _mrt: mrt, _renderTarget: target } = renderer;
      const own = builds.get(object.context);
      renderer._mrt = object.context.mrt;
      renderer._renderTarget = own ? own.target : target;
      velocityNode.setProjectionMatrix(own?.projection ?? null);
      try {
        return build.call(nodes, object);
      } finally {
        renderer._mrt = mrt;
        renderer._renderTarget = target;
        velocityNode.setProjectionMatrix(null);
      }
    };
    const target = renderer.getRenderTarget();
    const outer = renderer.getMRT();
    try {
      return Promise.all(
        this.#passes.map(({ scene, camera, pass: p, depth: at, samples, unjittered }) => {
          depth = at;
          projection = unjittered;
          // A pass sets these on its first frame, which may not have come.
          p.renderTarget.samples = samples;
          p.renderTarget.texture.type = renderer.getOutputBufferType();
          renderer.setRenderTarget(p.renderTarget);
          renderer.setMRT(p.getMRT());
          return renderer.compileAsync(scene, camera);
        }),
      ).then(() => undefined);
    } finally {
      contexts.get = context;
      renderer.setRenderTarget(target);
      renderer.setMRT(outer);
    }
  }

  /** The canvas's size (CSS px) and the screen's density, which set the pixel ratio. */
  setViewport(width: number, height: number, devicePixelRatio: number): void {
    this.#renderer.setPixelRatio(renderPixelRatio(width, height, devicePixelRatio));
  }

  /** The nuke's white-out and colour grade this frame (0 to 1 each; both 0 outside the intermission). */
  setNuke(flash: number, grade: number): void {
    this.#flash.value = flash;
    this.#grade.value = grade;
  }

  /** Raises bloom briefly (the muzzle flash). */
  set bloomBoost(v: number) {
    this.#bloom.strength.value = BLOOM + v;
  }

  render(): void {
    this.#pipeline.render();
  }

  dispose(): void {
    for (const node of this.#owned) node.dispose();
    this.#pipeline.dispose();
  }
}
