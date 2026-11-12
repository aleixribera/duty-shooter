import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { InstancedMesh, Matrix4, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';
import { CHIP_ARC, CHIP_GONE, Effects } from '../src/effects';

// Effects' decal textures can be empty in this non-rendering check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterAll(() => vi.unstubAllGlobals());

/** The chips' layer: the particle mesh with room for 240. */
const chips = (scene: Scene) => {
  let found: InstancedMesh | null = null;
  scene.traverse((o) => {
    if (o instanceof InstancedMesh && o.instanceMatrix.count === 240) found = o;
  });
  if (!found) throw new Error('no chip layer');
  return found as InstancedMesh;
};

describe('chips near the camera', () => {
  it('never span more than a fleck of the view, and are gone a hand from the eye (ticket 86)', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    const layer = chips(scene);
    const camera = new PerspectiveCamera(70, 16 / 9, 0.05, 500);
    camera.position.set(0, 1.6, 0.3);
    camera.updateMatrixWorld();
    // Splinters off a wooden wall 0.65 m ahead, thrown back at the shooter: some fly past the camera.
    for (let i = 0; i < 40; i++) effects.impact([0, 1.6, -0.35], [0, 0, 1], 'wood');
    const m = new Matrix4();
    const at = new Vector3();
    const scale = new Vector3();
    let near = 0;
    let checked = 0;
    for (let frame = 0; frame < 20; frame++) {
      // Walking at the wall: the game moves the camera before the effects update and makes its world matrix only at
      // the render, so the effects must measure from where the eye is now, not where the last frame drew it.
      camera.position.z -= 0.06;
      effects.update(1 / 60, camera);
      const alpha = layer.geometry.getAttribute('pData');
      for (let i = 0; i < layer.count; i++) {
        layer.getMatrixAt(i, m);
        m.decompose(at, camera.quaternion.clone(), scale);
        const d = at.distanceTo(camera.position);
        expect(Math.max(scale.x, scale.y) / d).toBeLessThanOrEqual(CHIP_ARC * 1.001);
        if (d < CHIP_GONE) {
          near++;
          expect(alpha.getX(i)).toBe(0);
        }
        checked++;
      }
      camera.updateMatrixWorld();
    }
    expect(checked).toBeGreaterThan(100);
    expect(near).toBeGreaterThan(0);
    effects.dispose();
  });
});
