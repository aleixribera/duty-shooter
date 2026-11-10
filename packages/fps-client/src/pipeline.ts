import { Fn, Loop, clamp, dot, float, frameId, getViewPosition, interleavedGradientNoise, length, max, min, mix, mrt, output, pass, velocity as velocityNode, perspectiveDepthToViewZ, rtt, texture, screenCoordinate, screenSize, screenUV, sin, smoothstep, step, time, uniform, vec2, vec3, vec4, velocity } from 'three/tsl';
import { HalfFloatType, RenderPipeline, RenderTarget, Vector2, Vector3, type Matrix4, type Node, type PerspectiveCamera, type Scene, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import { currentLighting, sunColor } from './surface-materials';
import { currentQuality, pixelCap, sharpenFor, type QualityProfile } from './quality';

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
function shimmer(depth: TextureNode, camera: PerspectiveCamera): Node<'vec2'> {
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
  return mix(screenUV, shifted, step(float(0.5), heat(shifted))) as unknown as Node<'vec2'>;
}

/** How much of the difference between a pixel and its neighbours is added back to it. */
const SHARPEN = 0.5;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * The frame read at `at`, with the softness temporal AA leaves taken back out:
 * each pixel is pushed away from the mean of its four neighbours, less where
 * that mean is bright (the sun's edge, a muzzle flash), so nothing rings.
 */
function sharpened(image: TextureNode, at: Node<'vec2'>, amount: Node<'float'> = float(SHARPEN) as never): Node<'vec3'> {
  const px = vec2(1, 1).div(screenSize);
  const here = image.sample(at).rgb;
  const around = image
    .sample(at.add(vec2(px.x, 0)))
    .rgb.add(image.sample(at.sub(vec2(px.x, 0))).rgb)
    .add(image.sample(at.add(vec2(0, px.y))).rgb)
    .add(image.sample(at.sub(vec2(0, px.y))).rgb)
    .mul(0.25);
  const calm = float(1).div(dot(around, LUMA).add(1));
  return max(here.add(here.sub(around).mul(calm.mul(amount))), vec3(0)) as unknown as Node<'vec3'>;
}

/** The sun shafts' picture (pixels: small, whatever the screen, since they have no edges), and how many reads each of its pixels takes toward the sun. */
const SHAFT_SIZE = [384, 216] as const;
const SHAFT_STEPS = 10;
/** How far toward the sun a shaft reaches (of the way there), and how strong it lands. */
const SHAFT_REACH = 0.85;
const SHAFT_STRENGTH = 0.55;

/**
 * Sun shafts: each pixel of a small picture looks back along the line to the
 * sun on screen, adding up how much of the blazing sky it crosses, so that cloud,
 * roofs and wrecks cut the light into beams. `sun` is the sun's place on screen.
 * Only the sun and what's round it are bright enough to count, so the picture
 * alone says what is sky.
 */
function shafts(image: TextureNode, sun: Node<'vec2'>): Node<'float'> {
  return Fn(() => {
    const total = float(0).toVar();
    const step_ = sun.sub(screenUV).mul(SHAFT_REACH / SHAFT_STEPS);
    const at = screenUV.toVar();
    const weight = float(1).toVar();
    Loop(SHAFT_STEPS, () => {
      const bright = smoothstep(float(2.5), float(7), dot(image.sample(at).level(float(0)).rgb, vec3(0.3, 0.5, 0.2)));
      total.addAssign(bright.mul(weight));
      weight.mulAssign(0.9);
      at.addAssign(step_);
    });
    return total.div(SHAFT_STEPS * 0.65);
  })() as unknown as Node<'float'>;
}

/**
 * The film look, on the frame before tone mapping: sun-warmed lights over cool
 * shadows, the loudest colours reined in so paint and grass sit in the same
 * light as everything else, the corners falling away, and a grain too fine to
 * see that keeps the sky's slow gradients from banding.
 */
function filmLook(c: Node<'vec3'>): Node<'vec3'> {
  const luma = dot(c, LUMA);
  const tinted = mix(c.mul(vec3(0.96, 0.99, 1.05)), c.mul(vec3(1.06, 1.0, 0.9)), smoothstep(float(0.03), float(0.7), luma));
  const top = max(max(tinted.r, tinted.g), tinted.b);
  const loud = top.sub(min(min(tinted.r, tinted.g), tinted.b)).div(top.add(1e-4));
  const rich = mix(vec3(luma), tinted, float(1.1).sub(smoothstep(float(0.45), float(1), loud).mul(0.22)));
  const edge = length(screenUV.sub(0.5).mul(vec2(1, 0.7)));
  const framed = rich.mul(float(1).sub(smoothstep(float(0.4), float(0.8), edge).mul(0.24)));
  const grain = interleavedGradientNoise(screenCoordinate.xy.add(float(frameId).mod(8).mul(vec2(47, 17)))).sub(0.5);
  return max(framed.mul(grain.mul(0.03).add(1)).add(grain.mul(0.0015)), vec3(0)) as unknown as Node<'vec3'>;
}

/**
 * The picture's two moods, laid over the film look. Low health drains the
 * colour out of it (`drain`, ticket 12): what is left is a cold grey, a little
 * darker, so the red of the HUD's own warning is the only colour on screen.
 * The last minute changes the light (`dread`, ticket 24): the shadows and the
 * middle take the amber of a warning lamp while the brightest parts keep
 * their own colour, the contrast tightens about middle grey and the frame's
 * edge closes in; `beat` lifts the whole picture for an instant on each of
 * the last ten seconds.
 */
function mooded(c: Node<'vec3'>, drain: Node<'float'>, dread: Node<'float'>, beat: Node<'float'>): Node<'vec3'> {
  const grey = dot(c, LUMA);
  const drained = mix(c, vec3(grey).mul(vec3(0.94, 0.98, 1.04)), drain.mul(0.82)).mul(float(1).sub(drain.mul(0.05)));
  const luma = dot(drained, LUMA);
  const lamp = vec3(luma).mul(vec3(1.3, 0.96, 0.56));
  const lit = mix(drained, lamp, dread.mul(0.5).mul(float(1).sub(smoothstep(float(0.45), float(1.1), luma).mul(0.7))));
  const tight = max(lit.sub(0.18).mul(dread.mul(0.22).add(1)).add(0.18), vec3(0));
  const edge = length(screenUV.sub(0.5).mul(vec2(1, 0.7)));
  const closed = tight.mul(float(1).sub(smoothstep(float(0.3), float(0.75), edge).mul(dread).mul(0.3)));
  return closed.mul(beat.mul(0.09).add(1)) as unknown as Node<'vec3'>;
}

/**
 * The pixel ratio a `width` x `height` (CSS px) canvas renders at on a screen
 * of `devicePixelRatio`: the screen's density, capped, then cut to the pixel
 * budget.
 */
export function renderPixelRatio(width: number, height: number, devicePixelRatio: number, megapixels = MAX_MEGAPIXELS): number {
  const budget = Math.sqrt((megapixels * 1e6) / Math.max(1, width * height));
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

const sunOnScreen = new Vector3();
const bufferSize = new Vector2();
const cameraForward = new Vector3();

export class GamePipeline {
  readonly #renderer: WebGPURenderer;
  readonly #pipeline: RenderPipeline;
  /** FXAA's own step (the tiers without temporal AA): the target the finished frame is drawn to, and the pipeline that smooths it onto the screen. */
  #smooth: { readonly flat: RenderTarget; readonly pipeline: RenderPipeline } | null = null;
  readonly #bloom: ReturnType<typeof bloom> | null;
  /** The tier this frame is put together for (ticket 22): what it turns on is decided once, here. */
  readonly #quality: QualityProfile;
  /** How much the frame is sharpened: more while it renders under the screen's size. */
  readonly #sharpen = uniform(SHARPEN);
  /** The render scale (the picture's side as a share of the native one), and the viewport it is a share of. */
  #scale = 1;
  #viewport: readonly [number, number, number] | null = null;
  #ratio = 0;
  /** The nuke's white-out and colour grade, 0..1 (see `setNuke`). */
  readonly #flash = uniform(0);
  readonly #grade = uniform(0);
  /** The picture's moods, 0..1 each (see `setMood`). */
  readonly #drain = uniform(0);
  readonly #dread = uniform(0);
  readonly #beat = uniform(0);
  /** The sun on screen (0..1) and how much it is in front of the camera. */
  readonly #sun = uniform(new Vector2(0.5, 0.5));
  readonly #sunAhead = uniform(0);
  readonly #camera: PerspectiveCamera;
  /** Nodes owning render targets. */
  readonly #owned: { dispose(): void }[] = [];
  /** What to build shaders for ahead of drawing: the scenes and the passes that draw them. */
  readonly #passes: { scene: Scene; camera: PerspectiveCamera; pass: ReturnType<typeof pass>; depth: number; samples: number; unjittered: Matrix4 | null }[];

  constructor(renderer: WebGPURenderer, world: Scene, camera: PerspectiveCamera, view: Scene, viewCamera: PerspectiveCamera, quality: QualityProfile = currentQuality()) {
    this.#renderer = renderer;
    this.#quality = quality;
    this.#scale = quality.renderScale;
    const temporal = quality.antialias === 'taa';
    this.#camera = camera;
    // The viewmodel pass needs a transparent clear so it can be laid over the world.
    renderer.setClearColor(0x000000, 0);
    this.#pipeline = new RenderPipeline(renderer);
    const worldPass = pass(world, camera);
    this.#owned.push(worldPass);
    // The velocity buffer is temporal AA's alone: a tier without it draws the world to one target.
    if (temporal) worldPass.setMRT(mrt({ output, velocity }));
    const depth = worldPass.getTextureNode('depth');
    // Light: the bake already darkens the static world's corners; ambient occlusion adds contact shading round moving things, on the tiers that have it.
    let occluded: Node<'float'> | null = null;
    if (quality.aoSamples > 0) {
      // GTAO reconstructs normals from depth.
      const aoPass = ao(depth, null as unknown as TextureNode, camera);
      this.#owned.push(aoPass);
      aoPass.resolutionScale = 0.5;
      aoPass.radius.value = 0.6;
      aoPass.samples.value = quality.aoSamples;
      occluded = mix(float(1), aoPass.getTextureNode().sample(screenUV).r, 0.45) as unknown as Node<'float'>;
    }
    const lit: Node<'vec4'> = worldPass.getTextureNode('output').toVec4();
    let image: TextureNode;
    let unjittered: Matrix4 | null = null;
    // Under temporal AA the occlusion goes in before the reprojection, which steadies its noise; without it, on top of the frame.
    let after: Node<'float'> | null = null;
    if (temporal) {
      // TRAA reads a texture: the world pass's own where nothing is laid on it. With occlusion on top, one drawn here and let go with the pipeline
      // (the one `traa` would make for itself is never disposed).
      let beauty: Node = worldPass.getTextureNode('output');
      if (occluded) {
        const shaded = rtt(vec4(lit.rgb.mul(occluded), lit.a) as never);
        this.#owned.push(shaded);
        beauty = shaded;
      }
      const t = traa(beauty, depth, worldPass.getTextureNode('velocity'), camera);
      this.#owned.push(t);
      // (The types leave out TRAA's texture node.)
      image = (t as unknown as { getTextureNode(): TextureNode }).getTextureNode();
      unjittered = (t as unknown as { _originalProjectionMatrix: Matrix4 })._originalProjectionMatrix;
    } else {
      image = worldPass.getTextureNode('output');
      after = occluded;
    }
    // The shimmer goes after the reprojection, so the two don't fight.
    const sharp = sharpened(image, quality.shimmer ? shimmer(depth, camera) : (screenUV as unknown as Node<'vec2'>), this.#sharpen as never);
    const color = after ? (sharp.mul(after) as unknown as Node<'vec3'>) : sharp;
    // The viewmodel is small and close: under temporal AA, 4x MSAA on its own pass keeps its edges clean.
    const viewSamples = quality.viewmodelSamples > 1 ? quality.viewmodelSamples : 0;
    const viewPass = pass(view, viewCamera, { samples: viewSamples });
    this.#owned.push(viewPass);
    this.#passes = [
      { scene: world, camera, pass: worldPass, depth: WORLD_DEPTH, samples: renderer.samples, unjittered },
      { scene: view, camera: viewCamera, pass: viewPass, depth: VIEW_DEPTH, samples: viewSamples, unjittered: null },
    ];
    const vm = viewPass.getTextureNode('output');
    let beamed = color;
    if (quality.shafts) {
      const beams = rtt(clamp(shafts(image, this.#sun as never), float(0), float(1.6)) as never, SHAFT_SIZE[0], SHAFT_SIZE[1], { type: HalfFloatType });
      this.#owned.push(beams);
      beamed = color.add(sunColor.mul((beams as unknown as { r: Node<'float'> }).r).mul(this.#sunAhead).mul(SHAFT_STRENGTH)) as unknown as Node<'vec3'>;
    }
    const over = vec4(mix(beamed, vm.rgb, vm.a), 1);
    // The nuke: a scorched grade after the blast (burnt orange, deeper shadows), and a white-out at the instant of it.
    const c = mooded(filmLook(over.rgb as never), this.#drain as never, this.#dread as never, this.#beat as never);
    const luma = dot(c, LUMA);
    const warm = mix(c, vec3(luma).mul(vec3(1.35, 0.9, 0.6)), float(0.6));
    const graded = warm.mul(warm).div(warm.add(0.12)).mul(1.02);
    const composite = vec4(mix(mix(c, graded, this.#grade), vec3(1.7, 1.6, 1.45), this.#flash), 1);
    // Only real highlights bloom (flashes, glints), not sunlit ground.
    this.#bloom = quality.bloom ? bloom(composite, BLOOM, 0.35, 1.6) : null;
    if (this.#bloom) this.#owned.push(this.#bloom);
    const finished = this.#bloom ? composite.add(this.#bloom) : composite;
    this.#pipeline.outputNode = finished;
    if (!temporal) {
      // FXAA looks for edges in the picture as the screen shows it: the frame is finished and tone-mapped into a target
      // of this pipeline's own, and a second, small pipeline smooths that onto the screen. Two steps, each drawn from
      // the top: a node that draws its own input to a texture (what `fxaa` makes of anything but a texture) draws the
      // world and the viewmodel inside its own render, where the sun's shadow map comes out wrong and the viewmodel's
      // clear is opaque.
      const flat = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
      const smoothed = fxaa(texture(flat.texture) as never);
      const pipeline = new RenderPipeline(renderer, smoothed as never);
      pipeline.outputColorTransform = false;
      this.#owned.push(flat, smoothed, pipeline);
      this.#smooth = { flat, pipeline };
    }
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
    this.#viewport = [width, height, devicePixelRatio];
    this.#resize();
  }

  /** The tier this pipeline was put together for. */
  get quality(): QualityProfile {
    return this.#quality;
  }

  /**
   * The render scale: the picture's side as a share of the native one (the
   * tier's own, or wherever dynamic resolution has it). The browser stretches
   * the canvas back to the screen, and the frame is sharpened more the further
   * it is stretched, so it does not go soft. The HUD is the page's, over the
   * canvas, and stays at the screen's own resolution.
   */
  get renderScale(): number {
    return this.#scale;
  }

  set renderScale(scale: number) {
    if (scale === this.#scale) return;
    this.#scale = scale;
    this.#resize();
  }

  #resize(): void {
    this.#sharpen.value = sharpenFor(this.#scale);
    if (!this.#viewport) return;
    const [width, height, dpr] = this.#viewport;
    const ratio = renderPixelRatio(width, height, dpr, pixelCap(this.#quality)) * this.#scale;
    // Every change of ratio reallocates each pass's targets: only when it moves.
    if (Math.abs(ratio - this.#ratio) < 1e-4) return;
    this.#ratio = ratio;
    this.#renderer.setPixelRatio(ratio);
  }

  /** The nuke's white-out and colour grade this frame (0 to 1 each; both 0 outside the intermission). */
  setNuke(flash: number, grade: number): void {
    this.#flash.value = flash;
    this.#grade.value = grade;
  }

  /**
   * The picture's moods this frame, 0 to 1 each: how far low health has
   * drained its colour, how far the last minute's light has come, and the beat
   * of the last ten seconds.
   */
  setMood(drain: number, dread: number, beat: number): void {
    this.#drain.value = drain;
    this.#dread.value = dread;
    this.#beat.value = beat;
  }

  /** Raises bloom briefly (the muzzle flash). */
  set bloomBoost(v: number) {
    if (this.#bloom) this.#bloom.strength.value = BLOOM + v;
  }

  render(): void {
    const d = currentLighting().sunDirection;
    const camera = this.#camera;
    camera.updateMatrixWorld();
    const sun = sunOnScreen.set(d[0], d[1], d[2]);
    const ahead = cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(sun) / sun.length();
    sun.multiplyScalar(1000).add(camera.position).project(camera);
    // screenUV runs from the top of the screen.
    this.#sun.value.set(sun.x * 0.5 + 0.5, 0.5 - sun.y * 0.5);
    this.#sunAhead.value = Math.max(0, Math.min(1, (ahead - 0.15) / 0.45));
    // Another game drawing to this renderer (the range kept ready behind the menu) leaves its own pixel ratio on it.
    if (this.#ratio > 0 && Math.abs(this.#renderer.getPixelRatio() - this.#ratio) > 1e-4) this.#renderer.setPixelRatio(this.#ratio);
    const smooth = this.#smooth;
    if (!smooth) {
      this.#pipeline.render();
      return;
    }
    const renderer = this.#renderer;
    const size = renderer.getDrawingBufferSize(bufferSize);
    if (smooth.flat.width !== size.x || smooth.flat.height !== size.y) smooth.flat.setSize(size.x, size.y);
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(smooth.flat);
    this.#pipeline.render();
    renderer.setRenderTarget(target);
    smooth.pipeline.render();
  }

  dispose(): void {
    for (const node of this.#owned) node.dispose();
    this.#pipeline.dispose();
  }
}
