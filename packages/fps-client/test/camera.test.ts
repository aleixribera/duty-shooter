import type { PlayerOutput } from '@duty-shooter/fps-core';
import { describe, expect, it } from 'vitest';
import { FirstPersonCamera } from '../src/camera';
import { DEFAULT_SETTINGS } from '../src/settings';

/** Just the fields the camera reads. */
function player(movement: PlayerOutput['movement'], ads = 0): PlayerOutput {
  return { position: [0, 0, 0], eyeHeight: 1.6, movement, yaw: 0, pitch: 0, weapon: { ads } } as unknown as PlayerOutput;
}

/** The camera's vertical FOV (degrees) after a second in this state. */
function settledFov(p: PlayerOutput): number {
  const cam = new FirstPersonCamera();
  for (let i = 0; i < 60; i++) cam.update({ prev: p, cur: p, alpha: 0, look: { yaw: 0, pitch: 0 }, cmd: { yaw: 0, pitch: 0 }, dt: 1 / 60 }, DEFAULT_SETTINGS);
  return cam.camera.fov;
}

describe('first-person camera FOV', () => {
  it('widens a little when sprinting, more in a tactical sprint and a slide', () => {
    const walk = settledFov(player('walk'));
    expect(settledFov(player('sprint')) / walk).toBeCloseTo(1.04, 2);
    expect(settledFov(player('tacticalSprint')) / walk).toBeCloseTo(1.08, 2);
    expect(settledFov(player('slide')) / walk).toBeCloseTo(1.06, 2);
  });

  it('does not widen while aiming', () => {
    expect(settledFov(player('sprint', 1))).toBeCloseTo(settledFov(player('walk', 1)), 3);
  });
});
