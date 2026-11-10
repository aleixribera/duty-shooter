import { afterAll, describe, expect, it, vi } from 'vitest';
import { createWorld } from '@duty-shooter/fps-core';
import { PerspectiveCamera, PointLight, Scene } from 'three/webgpu';
import { Effects } from '../src/effects';

// Effects' decal textures can be empty in this non-rendering check.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
afterAll(() => vi.unstubAllGlobals());

/** The shot lights' strongest intensity: what lights the scene this frame. */
const shotLight = (scene: Scene) => {
  let most = 0;
  scene.traverse((o) => {
    if (o instanceof PointLight && o.distance === 9) most = Math.max(most, o.intensity);
  });
  return most;
};

describe('a muzzle flash', () => {
  // A frame's events are shown before its effects age: at under 28 fps the old order hid every flash before it was drawn.
  it.each([1 / 60, 1 / 20, 1 / 8])('is drawn in the frame of the shot however long that frame takes (%s s)', (dt) => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    const camera = new PerspectiveCamera();
    const flash = effects.createFlash();
    effects.flash(flash, 'pistol');
    effects.shot([0, 1.6, 0], [0, 0, -1], 'pistol');
    effects.update(dt, camera);
    expect(flash.visible).toBe(true);
    expect(shotLight(scene)).toBeGreaterThan(10);
    // And gone soon after: two slow frames, or a few quick ones.
    for (let t = 0; t < 0.1; t += dt) effects.update(dt, camera);
    expect(flash.visible).toBe(false);
    expect(shotLight(scene)).toBe(0);
    effects.dispose();
  });

  it('is bigger for a bigger round', () => {
    const scene = new Scene();
    const effects = new Effects(scene, createWorld([]));
    const size = (weapon: 'pistol' | 'smg' | 'm4a1' | 'sniper' | 'shotgun') => {
      const flash = effects.createFlash();
      let total = 0;
      for (let i = 0; i < 200; i++) {
        effects.flash(flash, weapon);
        total += flash.scale.x;
      }
      return total / 200;
    };
    expect(size('pistol')).toBeLessThan(size('m4a1'));
    expect(size('smg')).toBeLessThan(size('m4a1'));
    expect(size('m4a1')).toBeLessThan(size('sniper'));
    expect(size('m4a1')).toBeLessThan(size('shotgun'));
    effects.dispose();
  });
});
