import { Fn, OnAfterRenderPipeline, OnBeforeRenderPipeline, context, float, ivec2, max, mix, texture, uv, vec2, velocity } from 'three/tsl';
import { FloatType, HalfFloatType, QuadMesh, RenderTarget, RendererUtils, Vector2, type Camera, type Node, type PerspectiveCamera, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer } from 'three/webgpu';
import TRAANode from 'three/examples/jsm/tsl/display/TRAANode.js';
// @ts-expect-error: three ships no types for its TAA helpers.
import { clipAABB, flickerReduction, sampleCurrentDepth, samplePreviousDepth } from 'three/examples/jsm/tsl/utils/TAAUtils.js';

/**
 * Three.js r186's temporal AA (TRAANode) with the same picture, cheaper for integrated graphics: two resolve targets
 * take turns as this frame's picture and the next frame's history, so the picture is never copied into the history
 * (a full-screen half-float copy every frame, which no pass's timestamps show: about 0.5 ms a frame on the toaster).
 * The resolve is three's, line for line; only the texture it reads as history changes each frame.
 *
 * Tried and dropped (pass 33): multiplying the ambient occlusion in here instead of in a pass before it. The passes'
 * GPU times fell 0.2 to 0.8 ms, but the frame got 0.3 to 0.6 ms slower on the toaster: reading the world pass's
 * picture cold costs more than reading one a pass has just drawn.
 */

const quad = new QuadMesh(null as never);
let rendererState: unknown;

/** The parts of three's TRAANode the resolve reads (its types leave them out). */
interface Inner {
  beautyNode: TextureNode;
  depthNode: TextureNode;
  velocityNode: TextureNode;
  camera: PerspectiveCamera;
  depthThreshold: number;
  edgeDepthDiff: number;
  maxVelocityLength: number;
  useSubpixelCorrection: boolean;
  _historyRenderTarget: RenderTarget;
  _resolveRenderTarget: RenderTarget;
  _resolveMaterial: { contextNode: unknown; colorNode: unknown; dispose(): void };
  _textureNode: TextureNode;
  _previousDepthNode: TextureNode;
  _cameraNearFar: { value: Vector2 };
  _cameraWorldMatrix: { value: { copy(m: unknown): void } };
  _cameraWorldMatrixInverse: { value: { copy(m: unknown): void } };
  _cameraProjectionMatrixInverse: { value: { copy(m: unknown): void } };
  _previousCameraWorldMatrix: { value: { copy(m: unknown): void } };
  _previousCameraProjectionMatrixInverse: { value: { copy(m: unknown): void } };
  _needsPostProcessingSync: boolean;
  _velocityNode: unknown;
  setViewOffset(width: number, height: number): void;
  clearViewOffset(): void;
}

const NEIGHBOURS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1], [1, 0], [0, -1], [0, 1], [-1, 0]];
const size = new Vector2();

export class TakingTurnsTRAA extends TRAANode {
  /** The other resolve target: this frame writes one and reads the other as its history. */
  readonly #turn = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  /** Which target this frame writes: false, three's resolve target; true, `#turn`. */
  #flip = false;
  /** Take turns (true) or copy this frame's picture into the history as three does (false). */
  pingPong = true;
  readonly #history: TextureNode;

  /** `beauty` is a texture drawn by a pass or an `rtt` (as three's `traa` makes one with `convertToTexture`). */
  constructor(beauty: TextureNode, depth: TextureNode, velocity: TextureNode, camera: Camera) {
    super(beauty, depth, velocity, camera);
    this.#turn.texture.name = 'TRAANode.resolve';
    const self = this as unknown as Inner;
    this.#history = texture(this.#turn.texture);
    // Only the previous depth is kept in three's history target now; its colour is never drawn.
    self._historyRenderTarget.texture.name = 'TRAANode.depth';
  }

  setSize(width: number, height: number): void {
    (TRAANode.prototype as unknown as { setSize(w: number, h: number): void }).setSize.call(this, width, height);
    this.#turn.setSize(width, height);
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = (frame as unknown as { renderer: WebGPURenderer }).renderer;
    const self = this as unknown as Inner;
    self._previousCameraWorldMatrix.value.copy(self._cameraWorldMatrix.value);
    self._previousCameraProjectionMatrixInverse.value.copy(self._cameraProjectionMatrixInverse.value);
    self._cameraNearFar.value.set(self.camera.near, self.camera.far);
    self._cameraWorldMatrix.value.copy(self.camera.matrixWorld);
    self._cameraWorldMatrixInverse.value.copy(self.camera.matrixWorldInverse);
    self._cameraProjectionMatrixInverse.value.copy(self.camera.projectionMatrixInverse);

    const node = self.beautyNode as unknown as { isRTTNode?: boolean; renderTarget: RenderTarget; passNode: { renderTarget: RenderTarget } };
    const beauty = node.isRTTNode ? node.renderTarget : node.passNode.renderTarget;
    const { width, height } = beauty.texture;
    if (self._needsPostProcessingSync) {
      self.setViewOffset(width, height);
      self._needsPostProcessingSync = false;
    }
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as never);

    const resolve = self._resolveRenderTarget;
    const needsRestart = self._historyRenderTarget.width !== width || self._historyRenderTarget.height !== height;
    this.setSize(width, height);
    const write = this.#flip ? this.#turn : resolve;
    const read = this.#flip ? resolve : this.#turn;
    if (needsRestart) {
      // Fresh history after a resize, from the current picture (not black, which would fade in).
      renderer.initRenderTarget(self._historyRenderTarget);
      renderer.initRenderTarget(resolve);
      renderer.initRenderTarget(this.#turn);
      renderer.copyTextureToTexture(beauty.texture, read.texture);
    }
    this.#history.value = read.texture;
    self._textureNode.value = write.texture;

    renderer.setRenderTarget(write);
    quad.material = self._resolveMaterial as never;
    quad.name = 'TRAA';
    quad.render(renderer);
    renderer.setRenderTarget(null);
    if (!this.pingPong) renderer.copyTextureToTexture(write.texture, read.texture);

    // The current depth becomes the previous one (only when the sizes agree; see three's TRAANode).
    const drawn = renderer.getDrawingBufferSize(size);
    if (self._historyRenderTarget.height === drawn.height && self._historyRenderTarget.width === drawn.width) {
      renderer.copyTextureToTexture(self.depthNode.value, self._historyRenderTarget.depthTexture!);
      self._previousDepthNode.value = self._historyRenderTarget.depthTexture!;
    }
    RendererUtils.restoreRendererState(renderer, rendererState as never);
    if (this.pingPong) this.#flip = !this.#flip;
    return undefined;
  }

  override setup(builder: NodeBuilder): TextureNode {
    const self = this as unknown as Inner;
    const b = builder as unknown as {
      renderPipeline?: unknown;
      context: { renderPipelineState: { viewOffsetOwner?: unknown }; velocity?: unknown };
      renderer: WebGPURenderer & { reversedDepthBuffer?: boolean };
      getSharedContext(): unknown;
    };
    if (b.renderPipeline && !b.context.renderPipelineState.viewOffsetOwner) {
      b.context.renderPipelineState.viewOffsetOwner = this;
      self._needsPostProcessingSync = true;
      OnBeforeRenderPipeline(() => {
        const drawn = b.renderer.getDrawingBufferSize(size);
        self.setViewOffset(drawn.width, drawn.height);
      });
      OnAfterRenderPipeline(() => self.clearViewOffset());
    }
    if (b.renderer.reversedDepthBuffer === true) self._historyRenderTarget.depthTexture!.type = FloatType;
    self._velocityNode = b.context.velocity ?? velocity;

    const beauty = self.beautyNode;
    // Variance clipping (three's).
    const varianceClipping = Fn(([positionTexel, currentColor, historyColor, gamma]: Node[]) => {
      const moment1 = (currentColor as Node<'vec4'>).toVar();
      const moment2 = (currentColor as Node<'vec4'>).pow2().toVar();
      for (const [x, y] of NEIGHBOURS) {
        // Use max() to prevent NaN values from propagating.
        const neighbor = (beauty.offset(ivec2(x, y)).load(positionTexel as never) as unknown as Node<'vec4'>).max(0);
        moment1.addAssign(neighbor);
        moment2.addAssign(neighbor.pow2());
      }
      const N = float(NEIGHBOURS.length + 1);
      const mean = moment1.div(N);
      const variance = moment2.div(N).sub(mean.pow2()).max(0).sqrt().mul(gamma as never);
      const minColor = mean.sub(variance);
      const maxColor = mean.add(variance);
      return clipAABB(mean.clamp(minColor, maxColor), historyColor, minColor, maxColor);
    });

    const subpixelCorrection = Fn(([velocityUV, textureSize]: Node[]) => {
      const velocityTexel = (velocityUV as Node<'vec2'>).mul(textureSize as never);
      const phase = velocityTexel.fract().abs();
      const weight = max(phase, phase.oneMinus());
      return weight.x.mul(weight.y).oneMinus().div(0.75);
    }).setLayout({
      name: 'subpixelCorrection',
      type: 'float',
      inputs: [
        { name: 'velocityUV', type: 'vec2' },
        { name: 'textureSize', type: 'ivec2' },
      ],
    });

    const historyNode = this.#history;
    const resolve = Fn(() => {
      const uvNode = uv(0);
      const textureSize = beauty.size(0 as never) as unknown as Node<'vec2'>;
      const positionTexel = uvNode.mul(textureSize);
      const currentDepth = sampleCurrentDepth(self.depthNode, positionTexel, self._cameraNearFar);
      const closestDepth = currentDepth.get('closestDepth');
      const closestPositionTexel = currentDepth.get('closestPositionTexel');
      const farthestDepth = currentDepth.get('farthestDepth');
      const offsetUV = self.velocityNode.load(closestPositionTexel).xy.mul(vec2(0.5, -0.5));
      const historyUV = uvNode.sub(offsetUV);
      const previousDepth = samplePreviousDepth(self._previousDepthNode, historyUV, self._previousCameraProjectionMatrixInverse, self._previousCameraWorldMatrix, self._cameraWorldMatrixInverse, self._cameraNearFar, self.camera);
      const isValidUV = historyUV.greaterThanEqual(0).all().and(historyUV.lessThanEqual(1).all());
      const isEdge = farthestDepth.sub(closestDepth).greaterThan(self.edgeDepthDiff);
      const isDisocclusion = closestDepth.sub(previousDepth).greaterThan(self.depthThreshold);
      const hasValidHistory = isValidUV.and(isEdge.or(isDisocclusion.not()));
      const currentColor = beauty.sample(uvNode);
      const historyColor = historyNode.sample(historyUV);
      const motionFactor = uvNode.sub(historyUV).mul(textureSize).length().div(self.maxVelocityLength).saturate();
      const currentWeight = float(0.05).toVar();
      if (self.useSubpixelCorrection) currentWeight.addAssign(subpixelCorrection(offsetUV, textureSize).mul(0.25));
      currentWeight.assign(hasValidHistory.select(currentWeight.add(motionFactor).saturate(), 1));
      const varianceGamma = mix(0.5, 1, motionFactor.oneMinus().pow2());
      const clippedHistoryColor = varianceClipping(positionTexel, currentColor, historyColor, varianceGamma);
      return flickerReduction(currentColor, clippedHistoryColor, currentWeight);
    });

    self._resolveMaterial.contextNode = context(b.getSharedContext() as never);
    self._resolveMaterial.colorNode = resolve();
    return self._textureNode;
  }

  override dispose(): void {
    super.dispose();
    this.#turn.dispose();
  }
}
