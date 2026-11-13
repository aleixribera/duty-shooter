import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { InstancedMesh, Matrix4, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three/webgpu';
import { CASING_LENGTH, CASING_MAX_SCREEN, Effects } from '../src/effects';

// Effects' decal textures can be empty in this non-rendering check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterAll(() => vi.unstubAllGlobals());

/** The casings' mesh: the instanced mesh with room for 80. */
const casings = (scene: Scene) => {
  let found: InstancedMesh | null = null;
  scene.traverse((o) => {
    if (o instanceof InstancedMesh && o.instanceMatrix.count === 80) found = o;
  });
  if (!found) throw new Error('no casing mesh');
  return found as InstancedMesh;
};

describe('ejected casings', () => {
  it('never look longer than 40 px at 1080 lines, however near the eye they fly (review 2026-11-13b)', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    const mesh = casings(scene);
    // Aimed in (a narrow FOV makes a near case look biggest), the port a hand's width right of and below the eye.
    const camera = new PerspectiveCamera(40, 16 / 9, 0.05, 500);
    camera.position.set(0, 1.6, 0);
    for (let i = 0; i < 10; i++) effects.eject([0.07, 1.54, -0.22], [1, 0, 0], [0, 1, 0], [0, 0, 0]);
    // And another gun's, three metres ahead: drawn at its real size.
    for (let i = 0; i < 3; i++) effects.eject([0, 1.6, -3], [1, 0, 0], [0, 1, 0], [0, 0, 0]);
    const m = new Matrix4();
    const at = new Vector3();
    const scale = new Vector3();
    const halfTan = Math.tan((40 * Math.PI) / 360);
    let near = 0;
    let far = 0;
    for (let frame = 0; frame < 90; frame++) {
      effects.update(1 / 60, camera);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(at, new Quaternion(), scale);
        const d = at.distanceTo(camera.position);
        // Depth along the line of sight (the camera looks down -z): off the centre a case stretches by distance / depth².
        const depth = camera.position.z - at.z;
        if (depth <= 0) continue;
        const share = (CASING_LENGTH * scale.x * d) / (2 * halfTan * depth * depth);
        expect(share).toBeLessThanOrEqual(CASING_MAX_SCREEN * 1.001);
        if (scale.x < 0.99) near++;
        else far++;
      }
    }
    // Shrunk while near, real size further out.
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(0);
    effects.dispose();
  });
});
