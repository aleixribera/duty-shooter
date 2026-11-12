import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { InstancedMesh, Scene } from 'three/webgpu';
import { Effects } from '../src/effects';

// Effects' decal textures can be empty in this non-rendering check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterAll(() => vi.unstubAllGlobals());

/** The bullet holes' layer: the decal mesh with room for 220. */
const holes = (scene: Scene) => {
  let found: InstancedMesh | null = null;
  scene.traverse((o) => {
    if (o instanceof InstancedMesh && o.instanceMatrix.count === 220) found = o;
  });
  if (!found) throw new Error('no hole layer');
  return found as InstancedMesh;
};

describe('bullet holes', () => {
  it('lay one decal for shots into a hole already there, and a new one a hand away (ticket 45)', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    const layer = holes(scene);
    effects.impact([0, 1.5, -2], [0, 0, 1], 'plaster');
    effects.impact([0.004, 1.502, -2], [0, 0, 1], 'plaster');
    effects.impact([0, 1.5, -2], [0, 0, 1], 'plaster');
    expect(layer.count).toBe(1);
    effects.impact([0.12, 1.5, -2], [0, 0, 1], 'plaster');
    expect(layer.count).toBe(2);
    // The same spot on a face turned another way is another surface.
    effects.impact([0, 1.5, -2], [1, 0, 0], 'plaster');
    expect(layer.count).toBe(3);
    effects.dispose();
  });
});
