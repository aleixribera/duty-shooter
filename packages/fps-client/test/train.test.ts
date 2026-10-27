import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@duty-shooter/fps-core';
import { RUMBLE_OVERLAP, RUMBLE_SECONDS } from '../src/audio/train';
import type { FreightTrain } from '../src/surfaces';
import { TrainSounds, trainHead, type TrainCue } from '../src/train';

/** Two locos and three wagons, 12 m each, four bogies to a pair. */
const train: FreightTrain = {
  models: { url: 'train.glb', placements: [] },
  z: -32.5,
  start: 120,
  speed: 25,
  length: 60,
  bogies: [2.4, 9.6, 14.4, 21.6, 26.4, 33.6, 38.4, 45.6, 50.4, 57.6],
  headlights: [[0.2, 2.4, 0.7], [0.2, 2.4, -0.7]],
  horns: [0.3, 3.5],
};

/** Runs `sounds` at 60 fps from `from` to `to` s after the match ended, for a listener at `at`, returning each cue with the time it plays at. */
function run(sounds: TrainSounds, from: number, to: number, at: Vec3): (TrainCue & { at: number })[] {
  const out: (TrainCue & { at: number })[] = [];
  for (let t = from; t <= to; t += 1 / 60) for (const c of sounds.update(t, at)) out.push({ ...c, at: t + (c.params.when ?? 0) });
  return out;
}

describe('the freight train', () => {
  it('runs west along its line from where it starts at the match\'s end, at its speed', () => {
    expect(trainHead(train, 0)).toBe(120);
    expect(trainHead(train, 4)).toBe(20);
    expect(trainHead(train, null)).toBeNull();
  });

  it('sounds its horn once at each of its times, from the head of the train', () => {
    const horns = run(new TrainSounds(train), 0, 20, [0, 1.7, 0]).filter((c) => c.event === 'trainHorn');
    expect(horns.map((c) => c.at)).toEqual([expect.closeTo(0.3, 2), expect.closeTo(3.5, 2)]);
    expect(horns[1]!.params.position![0]).toBeCloseTo(trainHead(train, 3.5)!, 0);
    expect(horns[1]!.params.position![2]).toBe(train.z);
  });

  it('clacks once for each bogie as it passes the listener, at the rail joint beside them', () => {
    const at: Vec3 = [10, 1.7, 5];
    const clacks = run(new TrainSounds(train), 0, 20, at).filter((c) => c.event === 'trainClack');
    expect(clacks).toHaveLength(train.bogies.length);
    clacks.forEach((c, i) => {
      // Bogie i is over x = 10 when the head is 10 - bogie.
      expect(c.at).toBeCloseTo((train.start - (at[0] - train.bogies[i]!)) / train.speed, 1);
      expect(c.params.position).toEqual([10, 0.3, train.z]);
    });
  });

  it('roars without a gap from its nearest point while it is near, the diesels at the head', () => {
    const at: Vec3 = [0, 1.7, 0];
    const rumble = run(new TrainSounds(train), 0, 20, at).filter((c) => c.event === 'trainRumble');
    for (let i = 1; i < rumble.length; i++) expect(rumble[i]!.at - rumble[i - 1]!.at).toBeCloseTo(RUMBLE_SECONDS - RUMBLE_OVERLAP, 6);
    // Each from the point of the train nearest the listener.
    for (const c of rumble) {
      const head = trainHead(train, c.at)!;
      expect(c.params.position![0]).toBeCloseTo(Math.min(Math.max(0, head), head + train.length), 0);
    }
    expect(rumble.find((c) => trainHead(train, c.at)! > 30)!.params.intensity).toBe(1);
    expect(rumble.find((c) => trainHead(train, c.at)! < -40)!.params.intensity).toBe(0);
    // Gone once the tail is far down the line.
    const last = rumble.at(-1)!.at;
    expect(trainHead(train, last)! + train.length).toBeGreaterThan(-400);
    expect(rumble.length).toBeLessThan(20 / (RUMBLE_SECONDS - RUMBLE_OVERLAP) + 2);
  });

  it('is silent while a match is on, and starts over at the next match\'s end', () => {
    const sounds = new TrainSounds(train);
    expect(run(sounds, 0, 5, [0, 1.7, 0]).filter((c) => c.event === 'trainHorn')).toHaveLength(2);
    expect(sounds.update(null, [0, 1.7, 0])).toEqual([]);
    expect(run(sounds, 0, 5, [0, 1.7, 0]).filter((c) => c.event === 'trainHorn')).toHaveLength(2);
  });

  it('lets someone joining part way through hear only what is still to come', () => {
    const cues = run(new TrainSounds(train), 2, 20, [0, 1.7, 0]);
    expect(cues.filter((c) => c.event === 'trainHorn').map((c) => c.at)).toEqual([expect.closeTo(3.5, 2)]);
  });
});
