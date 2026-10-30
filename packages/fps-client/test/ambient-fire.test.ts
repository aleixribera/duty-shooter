import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { InstancedMesh, PerspectiveCamera, Scene } from 'three/webgpu';
import { Effects } from '../src/effects';
import { PRESETS } from '../src/pipeline';

// Effects' decal textures can be empty in this non-rendering lifecycle check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe('ambient fire', () => {
  it('emits bounded particles, survives a graphics change, and leaves with its map', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]), PRESETS.normal, [[0,0,0],[3,0,0]]);
    const camera = new PerspectiveCamera();
    for (let i=0; i<600; i++) effects.update(1/60, camera);
    const fire = scene.getObjectByName('ambient-fire') as InstancedMesh;
    const smoke = scene.getObjectByName('ambient-fire-smoke') as InstancedMesh;
    expect(fire.count).toBeGreaterThan(0);
    expect(fire.count).toBeLessThanOrEqual(96);
    expect(smoke.count).toBeGreaterThan(0);
    expect(smoke.count).toBeLessThanOrEqual(64);
    const disposed = vi.fn();
    smoke.geometry.addEventListener('dispose', disposed);
    effects.setFeatures(PRESETS.high);
    expect(disposed).toHaveBeenCalledOnce();
    for (let i=0; i<60; i++) effects.update(1/60, camera);
    expect((scene.getObjectByName('ambient-fire-smoke') as InstancedMesh).count).toBeGreaterThan(0);
    effects.dispose();
    expect(scene.getObjectByName('ambient-fire')).toBeUndefined();
    expect(scene.getObjectByName('ambient-fire-smoke')).toBeUndefined();
  });

  it('does not add ambient fire to maps without sources', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]), PRESETS.normal);
    effects.update(1, new PerspectiveCamera());
    expect(scene.getObjectByName('ambient-fire')).toBeUndefined();
    effects.dispose();
  });
});
