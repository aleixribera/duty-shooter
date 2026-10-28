import { MAX_PITCH, usercmd, type PlayerOutput } from '@duty-shooter/fps-core';
import { createHeadlessMatch } from '@duty-shooter/fps-core/harness';
import { describe, expect, it } from 'vitest';
import { lookPitch } from '../src/input';

const DEG = Math.PI / 180;

describe('mouse look pitch limits', () => {
  it('still reaches the floor after a spray has kicked the view up', () => {
    const match = createHeadlessMatch({ solids: [], players: [{ id: 'p', team: 1, position: [0, 0, 0], loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' } }] });
    let pitch = 0;
    let self = match.latest.players[0] as PlayerOutput;
    // A long spray: the recoil stays on the view.
    for (let i = 0; i < 120; i++) self = match.step({ p: usercmd({ pitch, buttons: ['Fire'] }) }).players[0] as PlayerOutput;
    expect(self.pitch).toBeGreaterThan(5 * DEG);
    // Then the mouse pulls hard towards the floor, a frame at a time.
    for (let i = 0; i < 60; i++) {
      pitch = lookPitch(pitch, -5 * DEG, self.pitch - pitch);
      self = match.step({ p: usercmd({ pitch }) }).players[0] as PlayerOutput;
    }
    expect(self.pitch).toBeCloseTo(-MAX_PITCH, 5);
  });

  it('stops at the limits without pulling the pitch back', () => {
    expect(lookPitch(0, -2, 0)).toBeCloseTo(-MAX_PITCH);
    expect(lookPitch(0, 2, 0)).toBeCloseTo(MAX_PITCH);
    expect(lookPitch(0, -2, 20 * DEG)).toBeCloseTo(-MAX_PITCH - 20 * DEG);
    // Already past a limit (the offset changed): moving back in works, moving further out does not.
    expect(lookPitch(-MAX_PITCH, 0.1, 30 * DEG)).toBeCloseTo(-MAX_PITCH + 0.1);
    expect(lookPitch(MAX_PITCH - 0.1, 0.05, 20 * DEG)).toBeCloseTo(MAX_PITCH - 0.1);
  });
});
