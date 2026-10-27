import { usercmd, type PlayerOutput, type Solid } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, playerClip } from '@duty-shooter/fps-core/harness';
import { describe, expect, it } from 'vitest';
import { FirstPersonCamera } from '../src/camera';
import { DEFAULT_SETTINGS } from '../src/settings';

const DEG = Math.PI / 180;

/** Just the fields the camera reads. */
function player(movement: PlayerOutput['movement'], ads = 0): PlayerOutput {
  return { position: [0, 0, 0], eyeHeight: 1.6, movement, yaw: 0, pitch: 0, weapon: { id: 'm4a1', ads } } as unknown as PlayerOutput;
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

describe('first-person camera on a slope of player clip steps', () => {
  /** A 30° slope 20 m long rising toward -Z, built from 5 cm player clip steps, with flat ground before and a deck after. */
  function slope(): Solid[] {
    const rise = 0.05;
    const run = rise / Math.tan(30 * DEG);
    const steps = 200;
    const solids: Solid[] = [box({ min: [-50, -1, -50], max: [50, 0, 50], material: 'concrete' })];
    for (let i = 0; i < steps; i++) solids.push(playerClip({ min: [-5, 0, -run * (i + 1)], max: [5, rise * (i + 1), -run * i], material: 'concrete' }));
    return solids;
  }

  /** Camera heights drawn at 240 Hz while walking `forward` (1 up the slope, -1 back down) for `seconds`. */
  function eyeHeights(start: [number, number, number], forward: number, seconds: number): number[] {
    const match = createHeadlessMatch({ solids: slope(), players: [{ id: 'p', team: 1, position: start }] });
    const cam = new FirstPersonCamera();
    const heights: number[] = [];
    let prev = match.latest.players[0] as PlayerOutput;
    for (let t = 0; t < seconds * 60; t++) {
      const cur = match.step({ p: usercmd({ forward }) }).players[0] as PlayerOutput;
      for (let f = 0; f < 4; f++) {
        const { position } = cam.update({ prev, cur, alpha: f / 4, look: { yaw: 0, pitch: 0 }, cmd: { yaw: 0, pitch: 0 }, dt: 1 / 240 }, DEFAULT_SETTINGS);
        heights.push(position[1]);
      }
      prev = cur;
    }
    return heights;
  }

  /** The largest change in camera height between drawn frames, over the steady part of the walk, against the average change. */
  function roughness(heights: readonly number[]): number {
    const steady = heights.slice(heights.length / 4, (heights.length * 3) / 4);
    const deltas = steady.slice(1).map((h, i) => Math.abs(h - (steady[i] as number)));
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return Math.max(...deltas) / mean;
  }

  it('rises smoothly walking up', () => {
    const heights = eyeHeights([0, 0, 2], 1, 3);
    expect(heights.at(-1)! - heights[0]!).toBeGreaterThan(3);
    expect(roughness(heights)).toBeLessThan(2);
  });

  it('descends smoothly walking down', () => {
    const top = 200 * 0.05;
    const heights = eyeHeights([0, top, -200 * (0.05 / Math.tan(30 * DEG)) + 0.5], -1, 3);
    expect(heights[0]! - heights.at(-1)!).toBeGreaterThan(3);
    expect(roughness(heights)).toBeLessThan(2);
  });
});
