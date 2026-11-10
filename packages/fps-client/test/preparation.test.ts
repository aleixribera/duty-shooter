import { describe, expect, it } from 'vitest';
import { PREPARATION, viewDirection, type Vec3 } from '@duty-shooter/fps-core';
import { preparationShot, preparationTime, type PreparationScene } from '../src/preparation-shot';
import { PreparationSounds } from '../src/preparation-sounds';
import { heartbeat, prepDrone } from '../src/audio/preparation';
import { createRng } from '../src/audio/dsp';
import { preparationAction, preparationChampion, preparationClock, type PreparationView } from '../src/ui/preparation';

const scene: PreparationScene = {
  island: { x: 0, z: 0, radius: 400 },
  eye: [120, 12, -40],
  yaw: 0.6,
  squad: [[120, 10, -40], [123, 10, -41]],
};

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Where a pose's view points: toward `at` within this many radians. */
const facing = (pose: { position: Vec3; yaw: number; pitch: number }, at: Vec3) => {
  const d = viewDirection(pose.yaw, pose.pitch);
  const to: Vec3 = [at[0] - pose.position[0], at[1] - pose.position[1], at[2] - pose.position[2]];
  const n = Math.hypot(...to);
  return Math.acos(Math.min(1, (d[0] * to[0] + d[1] * to[1] + d[2] * to[2]) / n));
};

describe('the Preparation’s clock', () => {
  it('is the island, then the Squad, then the dive in its last seconds', () => {
    const start = 100;
    const ends = start + PREPARATION.seconds;
    expect(preparationTime(start, ends, start + 1).stage).toBe('island');
    expect(preparationTime(start, ends, start + 9).stage).toBe('squad');
    const dive = preparationTime(start, ends, ends - 2);
    expect(dive.stage).toBe('dive');
    expect(dive.dive).toBeCloseTo(1 - 2 / PREPARATION.dive, 5);
    expect(preparationTime(start, ends, ends - 2).left).toBeCloseTo(2, 5);
  });

  it('dives at once when everyone is ready early, from wherever it was', () => {
    // Everyone ready 3 s in: the server brings the end to 5 s off.
    const t = preparationTime(100, 108, 103);
    expect(t.stage).toBe('dive');
    expect(t.dive).toBeCloseTo(0, 5);
  });
});

describe('the Preparation’s camera', () => {
  it('looks down on the island from high above while the Ring ignites', () => {
    const early = preparationShot(scene, preparationTime(0, 20, 0.2));
    const lit = preparationShot(scene, preparationTime(0, 20, 6));
    expect(early.position[1]).toBeGreaterThan(200);
    expect(early.pitch).toBeLessThan(-0.3);
    expect(facing(early, [0, 0, 0])).toBeLessThan(0.05);
    expect(early.ring).toBeLessThan(0.2);
    expect(lit.ring).toBe(1);
  });

  it('stands a few metres in front of the Squad, looking at them', () => {
    const shot = preparationShot(scene, preparationTime(0, 20, 10));
    expect(shot.stage).toBe('squad');
    const centre: Vec3 = [121.5, 11.2, -40.5];
    expect(dist(shot.position, centre)).toBeGreaterThan(2.5);
    expect(dist(shot.position, centre)).toBeLessThan(8);
    // In view, set to the right of the frame (the picker is on the left).
    const off = facing(shot, centre);
    expect(off).toBeGreaterThan(0.05);
    expect(off).toBeLessThan(0.5);
    expect(shot.light).not.toBeNull();
  });

  it('dives from the sky and lands exactly on your eyes, facing your spawn', () => {
    const top = preparationShot(scene, preparationTime(0, 20, 15.01));
    const mid = preparationShot(scene, preparationTime(0, 20, 17.5));
    const end = preparationShot(scene, preparationTime(0, 20, 20));
    expect(top.position[1] - scene.eye[1]).toBeGreaterThan(150);
    expect(mid.position[1]).toBeLessThan(top.position[1]);
    expect(mid.position[1]).toBeGreaterThan(scene.eye[1]);
    expect(dist(end.position, scene.eye)).toBeLessThan(1e-6);
    expect(end.yaw).toBeCloseTo(scene.yaw, 6);
    expect(end.pitch).toBeCloseTo(0, 6);
    expect(end.ring).toBe(1);
  });

  it('starts the dive inside the Ring even from a spawn on the shore facing in', () => {
    // At the shore, facing the centre: behind is out to sea, through the Ring's wall.
    const eye: Vec3 = [-340, 30, -10];
    const shore: PreparationScene = { ...scene, eye, yaw: Math.atan2(eye[0], eye[2]), squad: [[-340, 28, -10]] };
    expect(facing({ position: eye, yaw: shore.yaw, pitch: 0 }, [0, eye[1], 0])).toBeLessThan(0.01);
    const top = preparationShot(shore, preparationTime(0, 20, 15.01));
    expect(Math.hypot(top.position[0], top.position[2])).toBeLessThanOrEqual(400 * 0.9 + 1e-6);
    expect(top.position[1] - eye[1]).toBeGreaterThan(150);
  });

  it('thins the haze high over the island and gives it back by the landing', () => {
    expect(preparationShot(scene, preparationTime(0, 20, 3)).haze).toBeLessThan(0.5);
    expect(preparationShot(scene, preparationTime(0, 20, 10)).haze).toBe(1);
    expect(preparationShot(scene, preparationTime(0, 20, 15.01)).haze).toBeLessThan(0.5);
    expect(preparationShot(scene, preparationTime(0, 20, 20)).haze).toBeCloseTo(1, 6);
  });

  it('never moves faster at the end of the dive than in its middle, so it lands softly', () => {
    const at = (t: number) => preparationShot(scene, preparationTime(0, 20, t)).position;
    const middle = dist(at(17.4), at(17.5));
    const landing = dist(at(19.9), at(20));
    expect(landing).toBeLessThan(middle / 4);
  });
});

describe('the Preparation’s sound', () => {
  it('a drone that rises and a heartbeat that quickens toward the drop', () => {
    const s = new PreparationSounds();
    const cues: { at: number; event: string; intensity: number }[] = [];
    for (let t = 0; t <= 20; t += 1 / 60) {
      for (const c of s.update(preparationTime(0, 20, t), t)) cues.push({ at: t + (c.params.when ?? 0), event: c.event, intensity: c.params.intensity ?? 0 });
    }
    const beats = cues.filter((c) => c.event === 'heartbeat').map((c) => c.at);
    const drones = cues.filter((c) => c.event === 'prepDrone');
    expect(beats.length).toBeGreaterThan(18);
    const gap = (i: number) => beats[i + 1]! - beats[i]!;
    expect(gap(beats.length - 2)).toBeLessThan(gap(0) * 0.7);
    expect(drones.length).toBeGreaterThan(3);
    expect(drones.at(-1)!.intensity).toBeGreaterThan(drones[0]!.intensity);
    // Silent once the match is on.
    expect(s.update(null, 21)).toEqual([]);
  });

  it('renders clean, bounded buffers', () => {
    for (const b of [prepDrone(22050, createRng(1)), heartbeat(22050, createRng(2))]) {
      expect(b.every(Number.isFinite)).toBe(true);
      expect(b.every((v) => Math.abs(v) <= 1)).toBe(true);
      expect(Math.max(...b.map(Math.abs))).toBeGreaterThan(0.1);
    }
  });

  it('beats a heart a small speaker still carries: a knock above 100 Hz over the thump under it', () => {
    const sr = 12000;
    const beat = heartbeat(sr, createRng(2));
    /** The beat's energy between two frequencies, by a plain Fourier sum every 2 Hz. */
    const energy = (from: number, to: number) => {
      let sum = 0;
      for (let f = from; f < to; f += 2) {
        let re = 0;
        let im = 0;
        for (let i = 0; i < beat.length; i++) {
          re += beat[i]! * Math.cos((2 * Math.PI * f * i) / sr);
          im -= beat[i]! * Math.sin((2 * Math.PI * f * i) / sr);
        }
        sum += re * re + im * im;
      }
      return sum;
    };
    const all = energy(20, 600);
    const low = energy(20, 100);
    const knock = energy(100, 300);
    // A laptop or a phone plays next to nothing under 100 Hz: a seventh of the beat or more has to sit above it.
    expect(knock / all).toBeGreaterThan(0.14);
    // And it is still a heart, not a tap: most of it stays low, and nothing bright.
    expect(low / all).toBeGreaterThan(0.6);
    expect(energy(300, 600) / all).toBeLessThan(0.03);
  });
});

describe('the Preparation’s one action', () => {
  const view = (over: Partial<PreparationView> = {}): PreparationView => ({
    stage: 'squad', elapsed: 9, left: 11, alive: 60, squads: 20, squad: [], loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' },
    ready: false, readyCount: 0, people: 2, loading: 0, play: false, ...over,
  });

  it('is Ready until pressed, then says what it waits for', () => {
    expect(preparationAction(view())).toMatchObject({ label: 'Ready', enabled: true });
    expect(preparationAction(view()).note).toContain('0 of 2 ready');
    expect(preparationAction(view({ ready: true, readyCount: 1 }))).toMatchObject({ enabled: false, note: expect.stringContaining('1 more') });
    expect(preparationAction(view({ ready: true, readyCount: 1, loading: 1 })).note).toBe('Waiting for 1 player to load');
  });

  it('locks in the dive and asks for a click once it is over', () => {
    expect(preparationAction(view({ stage: 'dive' }))).toMatchObject({ label: 'Dropping', enabled: false, note: 'Loadout locked' });
    expect(preparationAction(view({ stage: 'dive', play: true }))).toMatchObject({ label: 'Play', enabled: true });
  });

  it('counts whole seconds down to 0', () => {
    expect(preparationClock(20)).toBe('20');
    expect(preparationClock(4.2)).toBe('5');
    expect(preparationClock(0)).toBe('0');
  });
});

describe('the champion Squad at the dive (ticket 69)', () => {
  it("says who they are and why, and when they're yours", () => {
    expect(preparationChampion({ team: 2, names: ['Ada', 'Bo'], why: 'won' }, 1)).toEqual({ title: 'Champion Squad', names: 'Ada and Bo', why: 'Won the last match' });
    expect(preparationChampion({ team: 1, names: ['Ada'], why: 'leader', kills: 7 }, 1)).toEqual({ title: 'Your Squad: champions', names: 'Ada', why: "Last match's Kill Leader, 7 eliminations" });
    expect(preparationChampion(undefined, 1)).toBeNull();
  });
});
