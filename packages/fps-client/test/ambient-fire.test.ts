import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { InstancedMesh, PerspectiveCamera, Scene } from 'three/webgpu';
import { Effects } from '../src/effects';

// Effects' decal textures can be empty in this non-rendering lifecycle check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe('ambient fire', () => {
  it('emits bounded particles and leaves with its map', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]), [[0,0,0],[3,0,0]]);
    const camera = new PerspectiveCamera();
    for (let i=0; i<600; i++) effects.update(1/60, camera);
    const fire = scene.getObjectByName('ambient-fire') as InstancedMesh;
    const smoke = scene.getObjectByName('ambient-fire-smoke') as InstancedMesh;
    expect(fire.count).toBeGreaterThan(0);
    expect(fire.count).toBeLessThanOrEqual(96);
    expect(smoke.count).toBeGreaterThan(0);
    expect(smoke.count).toBeLessThanOrEqual(64);
    effects.dispose();
    expect(scene.getObjectByName('ambient-fire')).toBeUndefined();
    expect(scene.getObjectByName('ambient-fire-smoke')).toBeUndefined();
  });

  it('does not add ambient fire to maps without sources', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    effects.update(1, new PerspectiveCamera());
    expect(scene.getObjectByName('ambient-fire')).toBeUndefined();
    effects.dispose();
  });
});
