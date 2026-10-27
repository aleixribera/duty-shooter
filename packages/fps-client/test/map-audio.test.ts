import { describe, expect, it } from 'vitest';
import { MATERIALS } from '@duty-shooter/fps-core';
import { birdsVoice, creakVoice, radioVoice, windVoice } from '../src/audio/ambience';
import { footstepVoice } from '../src/audio/foley';
import { gunshotVoice } from '../src/audio/gunshot';
import { impactVoice } from '../src/audio/impacts';
import { hear, loudness } from './helpers/offline-audio';

describe('every material', () => {
  const step = footstepVoice();
  const impact = impactVoice();
  const sound = (voice: typeof step, event: 'footstep' | 'impact', material: (typeof MATERIALS)[number]) =>
    hear(voice, event, { position: [4, 0, 0], material, movement: 'walk' }, 4);

  it.each(MATERIALS)('%s has a footstep bank and a bullet impact', (material) => {
    expect(loudness(sound(step, 'footstep', material))).toBeGreaterThan(0.005);
    expect(loudness(sound(impact, 'impact', material))).toBeGreaterThan(0.005);
  });
});

describe('ambient loudness', () => {
  // Every variant and jitter, many times over: the quietest of what must be heard against the loudest ambience.
  const plays = (f: () => Float32Array) => Array.from({ length: 20 }, () => loudness(f()));
  const quietest = (f: () => Float32Array) => Math.min(...plays(f));
  const loudest = (f: () => Float32Array) => Math.max(...plays(f));
  // What the ambience must never mask: someone walking 8 m away, and a rifle 50 m away.
  const footsteps = quietest(() => hear(footstepVoice(), 'footstep', { position: [8, 0, 0], material: 'concrete', movement: 'walk' }, 8));
  const gunfire = quietest(() => hear(gunshotVoice(), 'gunshot', { position: [50, 0, 0] }, 50));
  // Each ambient sound as loud as it gets: the wind outdoors, and the rest from as close as a player can stand.
  const ambient = {
    wind: loudest(() => hear(windVoice(), 'ambientWind', { intensity: 1 }, null)),
    birds: loudest(() => hear(birdsVoice(), 'ambientBirds', { position: [6, 0, 0] }, 6)),
    sign: loudest(() => hear(creakVoice(), 'ambientCreak', { position: [1.5, 0, 0], intensity: 1 }, 1.5)),
    radio: loudest(() => hear(radioVoice(), 'ambientRadio', { position: [1, 0, 0] }, 1)),
  };

  it('is recorded', () => {
    const db = (x: number) => (20 * Math.log10(x)).toFixed(1);
    console.log(`loudest 50 ms (dBFS): footsteps at 8 m ${db(footsteps)}, gunfire at 50 m ${db(gunfire)}, ` + Object.entries(ambient).map(([k, v]) => `${k} ${db(v)}`).join(', '));
  });

  it.each(Object.keys(ambient) as (keyof typeof ambient)[])('keeps the %s at least 6 dB under footsteps and gunfire', (name) => {
    expect(ambient[name]).toBeGreaterThan(0);
    expect(ambient[name]).toBeLessThan(Math.min(footsteps, gunfire) / 2);
  });
});
