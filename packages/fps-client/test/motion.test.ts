import type { PlayerOutput } from '@duty-shooter/fps-core';
import { describe, expect, it } from 'vitest';
import { FirstPersonCamera } from '../src/camera';
import { STEP_LENGTH, Stride, fallSpeed, strafeSpeed } from '../src/motion';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { WeaponMotion, type WeaponMotionInput, type WeaponOffset } from '../src/viewmodel/motion';

const DEG = Math.PI / 180;
const DT = 1 / 120;

const STILL: WeaponMotionInput = {
  dt: DT,
  amount: 1,
  ads: 0,
  movement: 'walk',
  stance: 'stand',
  speed: 0,
  strafe: 0,
  rise: 0,
  lookDelta: { yaw: 0, pitch: 0 },
  weight: 1,
  carries: true,
};

/** Runs `seconds` of a state and returns the last offset (a copy), and the furthest each channel got. */
function run(motion: WeaponMotion, input: Partial<WeaponMotionInput>, seconds: number): { last: WeaponOffset; most: number[] } {
  const state = { ...STILL, ...input };
  const most = [0, 0, 0, 0, 0, 0];
  let last: WeaponOffset = { p: [0, 0, 0], r: [0, 0, 0], sprint: 0 };
  for (let t = 0; t < seconds; t += state.dt) {
    const o = motion.update(state);
    [...o.p, ...o.r].forEach((v, i) => (most[i] = Math.max(most[i]!, Math.abs(v))));
    last = { p: [...o.p], r: [...o.r], sprint: o.sprint };
  }
  return { last, most };
}

/** Everything at once: running, strafing, turning and coming down from a jump. */
const BUSY: Partial<WeaponMotionInput> = { movement: 'walk', speed: 4.8, strafe: 4.8, rise: -6, lookDelta: { yaw: 0.02, pitch: -0.01 } };

describe('the stride', () => {
  it('takes a step every half stride of ground, at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 144]) {
      const stride = new Stride();
      let steps = 0;
      let was = stride.side;
      // 10 s at 4.8 m/s: 48 m, at 0.725 m a footstep.
      for (let t = 0; t < 10; t += dt) {
        stride.advance(4.8 * dt, dt, 'walk', true);
        if (Math.sign(stride.side) !== Math.sign(was)) steps++;
        was = stride.side;
      }
      expect(Math.abs(steps - 48 / (STEP_LENGTH.walk / 2))).toBeLessThanOrEqual(1);
    }
  });

  it('is lowest as the footstep sounds', () => {
    const stride = new Stride();
    // Out of step by a third of a footstep when the sound comes.
    stride.advance((STEP_LENGTH.walk / 2) * 0.33, DT, 'walk', true);
    stride.footfall();
    for (let i = 0; i < 60; i++) stride.advance(0, DT, 'walk', true);
    expect(stride.lift).toBeLessThan(0.01);
  });

  it('stops off its feet', () => {
    const stride = new Stride();
    for (let t = 0; t < 1; t += DT) stride.advance(6 * DT, DT, 'sprint', true);
    expect(stride.amount).toBeGreaterThan(0.8);
    for (let t = 0; t < 1; t += DT) stride.advance(6 * DT, DT, 'sprint', false);
    expect(stride.amount).toBeLessThan(0.01);
  });
});

describe('landing and strafing', () => {
  it('lands faster from higher, by the square root', () => {
    expect(fallSpeed(0)).toBe(0);
    expect(fallSpeed(4) / fallSpeed(1)).toBeCloseTo(2, 6);
  });

  it('reads a strafe to the right of the view as positive, whichever way the view faces', () => {
    // Facing -Z (yaw 0), +X is to the right; turned a quarter left (toward -X), -Z is.
    expect(strafeSpeed([3, 0, 0], 0)).toBeCloseTo(3, 9);
    expect(strafeSpeed([0, 0, -3], Math.PI / 2)).toBeCloseTo(3, 9);
    expect(strafeSpeed([0, 0, -3], 0)).toBeCloseTo(0, 9);
  });
});

describe('the weapon in hand', () => {
  it('is still at rest but for the breath', () => {
    const { most } = run(new WeaponMotion(), {}, 3);
    expect(most[0]).toBe(0);
    expect(most[1]).toBeGreaterThan(0.001);
    expect(most[1]).toBeLessThan(0.002);
    expect(Math.max(most[2]!, most[3]!, most[4]!, most[5]!)).toBe(0);
  });

  it('tilts into a strafe and comes level after it', () => {
    const motion = new WeaponMotion();
    const right = run(motion, { movement: 'walk', speed: 4.8, strafe: 4.8 }, 1).last;
    expect(right.r[2]).toBeLessThan(-3 * DEG);
    const left = run(motion, { movement: 'walk', speed: 4.8, strafe: -4.8 }, 1).last;
    expect(left.r[2]).toBeGreaterThan(3 * DEG);
    const after = run(motion, {}, 2).last;
    expect(Math.abs(after.r[2])).toBeLessThan(0.01 * DEG);
  });

  it('lags a turn of the look by the same amount at any frame rate, and catches up when it stops', () => {
    const lag = (dt: number) => run(new WeaponMotion(), { dt, lookDelta: { yaw: 2 * dt, pitch: 0 } }, 1).last.r[1];
    expect(lag(1 / 60)).toBeLessThan(-1 * DEG);
    expect(lag(1 / 240) / lag(1 / 60)).toBeCloseTo(1, 1);
    const motion = new WeaponMotion();
    run(motion, { lookDelta: { yaw: 2 * DT, pitch: 0 } }, 1);
    expect(Math.abs(run(motion, {}, 2).last.r[1])).toBeLessThan(0.01 * DEG);
  });

  it('hangs back going up, floats coming down, and dips on landing by how hard', () => {
    const up = run(new WeaponMotion(), { movement: 'airborne', rise: 5 }, 0.5).last;
    const down = run(new WeaponMotion(), { movement: 'airborne', rise: -8 }, 0.5).last;
    expect(up.p[1]).toBeLessThan(-0.01);
    expect(down.p[1]).toBeGreaterThan(0.01);
    const dip = (height: number) => {
      const motion = new WeaponMotion();
      motion.land(height);
      return run(motion, {}, 1.5);
    };
    const hop = dip(1);
    const drop = dip(4);
    // Minus the breath.
    expect(hop.most[1]! - 0.0015).toBeGreaterThan(0.008);
    expect(drop.most[1]!).toBeGreaterThan(hop.most[1]! * 1.6);
    expect(drop.most[1]!).toBeLessThan(0.06);
    expect(Math.abs(drop.last.r[0])).toBeLessThan(0.05 * DEG);
  });

  it('takes a pose crouched and another in a slide, and leaves them standing', () => {
    const motion = new WeaponMotion();
    const crouched = run(motion, { stance: 'crouch' }, 1).last;
    expect(crouched.r[2]).toBeGreaterThan(4 * DEG);
    const sliding = run(motion, { stance: 'crouch', movement: 'slide', speed: 7 }, 1).last;
    expect(sliding.r[2]).toBeGreaterThan(15 * DEG);
    const standing = run(motion, {}, 2).last;
    expect(Math.abs(standing.r[2])).toBeLessThan(0.05 * DEG);
  });

  it('swings to the sprint carry in a third of a second, not past it by much, and not with busy hands', () => {
    const motion = new WeaponMotion();
    const going = run(motion, { movement: 'sprint', speed: 6.2 }, 0.35);
    expect(going.last.sprint).toBeGreaterThan(0.93);
    const there = run(motion, { movement: 'sprint', speed: 6.2 }, 1).last;
    expect(there.sprint).toBeCloseTo(1, 2);
    let most = 0;
    const fresh = new WeaponMotion();
    for (let t = 0; t < 1; t += DT) most = Math.max(most, fresh.update({ ...STILL, movement: 'sprint', speed: 6.2 }).sprint);
    expect(most).toBeLessThan(1.06);
    expect(run(new WeaponMotion(), { movement: 'sprint', speed: 6.2, carries: false }, 1).last.sprint).toBe(0);
  });

  it('bobs to the footsteps, more at a sprint', () => {
    const walk = run(new WeaponMotion(), { movement: 'walk', speed: 4.8 }, 3).most;
    const sprint = run(new WeaponMotion(), { movement: 'sprint', speed: 6.2 }, 3).most;
    expect(walk[1]).toBeGreaterThan(0.006);
    expect(walk[1]).toBeLessThan(0.02);
    expect(sprint[1]).toBeGreaterThan(walk[1]! * 1.3);
  });

  it('is rock steady aimed: nothing but a fifth of a millimetre of breath', () => {
    const motion = new WeaponMotion();
    motion.land(5);
    const { most } = run(motion, { ...BUSY, ads: 1 }, 3);
    expect(most[1]).toBeLessThanOrEqual(0.0002 + 1e-9);
    expect(most[1]).toBeGreaterThan(0);
    expect(Math.max(most[0]!, most[2]!, most[3]!, most[4]!, most[5]!)).toBe(0);
  });

  it('does not move at all with camera motion at 0, and still takes the sprint carry', () => {
    const motion = new WeaponMotion();
    motion.land(5);
    const { most } = run(motion, { ...BUSY, amount: 0 }, 3);
    expect(Math.max(...most)).toBe(0);
    expect(run(new WeaponMotion(), { movement: 'sprint', speed: 6.2, amount: 0 }, 1).last.sprint).toBeCloseTo(1, 2);
  });

  it('halves with the setting at a half', () => {
    const whole = run(new WeaponMotion(), { movement: 'walk', speed: 4.8, strafe: 4.8 }, 1).last;
    const half = run(new WeaponMotion(), { movement: 'walk', speed: 4.8, strafe: 4.8, amount: 0.5 }, 1).last;
    expect(half.r[2] / whole.r[2]).toBeCloseTo(0.5, 6);
  });

  it('swings a heavier gun later', () => {
    const at = (weight: number) => run(new WeaponMotion(), { movement: 'walk', speed: 4.8, strafe: 4.8, weight }, 0.12).last.r[2];
    expect(Math.abs(at(1.5))).toBeLessThan(Math.abs(at(1)) * 0.85);
  });
});

describe('the camera with the body', () => {
  const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });
  /** Just the fields the camera reads. */
  const player = (over: Record<string, unknown> = {}, ads = 0): PlayerOutput =>
    ({ position: [0, 0, 0], velocity: [0, 0, 0], eyeHeight: 1.6, movement: 'walk', stance: 'stand', alive: true, yaw: 0, pitch: 0, weapon: { id: 'm4a1', ads, sway: [0, 0] }, ...over }) as unknown as PlayerOutput;
  /** A second of strafing right at walking pace; returns the camera, the last pose, and how far the eyes went up and down. */
  function strafe(with_: Settings, ads = 0, land = 0) {
    const cam = new FirstPersonCamera();
    let pose = { position: [0, 0, 0] as readonly number[], yaw: 0, pitch: 0 };
    let low = Infinity;
    let high = -Infinity;
    let roll = 0;
    for (let i = 0; i < 120; i++) {
      const prev = player({ position: [(i - 1) * 4.8 * DT, 0, 0], velocity: [4.8, 0, 0] }, ads);
      const cur = player({ position: [i * 4.8 * DT, 0, 0], velocity: [4.8, 0, 0] }, ads);
      if (i === 10 && land > 0) cam.land(land);
      pose = cam.update({ prev, cur, alpha: 0, look: { yaw: 0.3, pitch: 0.1 }, cmd: { yaw: 0, pitch: 0 }, dt: DT }, with_);
      low = Math.min(low, cam.camera.position.y);
      high = Math.max(high, cam.camera.position.y);
      roll = cam.camera.rotation.z;
    }
    return { cam, pose, travel: high - low, roll };
  }

  it('leans about a degree into a strafe', () => {
    // The view is turned 0.3 rad left of the motion, so most of 4.8 m/s is to its right.
    const { roll } = strafe(settings({}));
    expect(roll).toBeLessThan(-0.7 * DEG);
    expect(roll).toBeGreaterThan(-1.05 * DEG);
  });

  it('bobs a little with the steps and dips on landing, and neither turns the aim', () => {
    const walked = strafe(settings({}));
    expect(walked.travel).toBeGreaterThan(0.004);
    expect(walked.travel).toBeLessThan(0.02);
    const landed = strafe(settings({}), 0, 3);
    expect(landed.travel).toBeGreaterThan(0.03);
    expect(landed.travel).toBeLessThan(0.12);
    for (const run of [walked, landed]) {
      expect(run.pose.yaw).toBe(0.3);
      expect(run.pose.pitch).toBe(0.1);
    }
  });

  it('does none of it with camera motion at 0', () => {
    const { roll, travel, pose } = strafe(settings({ cameraMotion: 0 }), 0, 3);
    expect(roll).toBe(0);
    expect(travel).toBe(0);
    expect(pose.yaw).toBe(0.3);
    expect(pose.pitch).toBe(0.1);
  });

  it('neither bobs nor leans aimed', () => {
    const { roll, travel } = strafe(settings({}), 1);
    expect(Math.abs(roll)).toBe(0);
    expect(travel).toBe(0);
  });

  it('lies level Downed and through a slide with camera motion at 0', () => {
    const cam = new FirstPersonCamera();
    const p = player({ downed: { bleedOut: 20, revive: 0 }, movement: 'slide' });
    for (let i = 0; i < 60; i++) cam.update({ prev: p, cur: p, alpha: 0, look: { yaw: 0, pitch: 0 }, cmd: { yaw: 0, pitch: 0 }, dt: 1 / 60 }, settings({ cameraMotion: 0 }));
    expect(cam.camera.rotation.z).toBe(0);
  });

  it('shakes and widens by the FOV-effects setting, down to nothing', () => {
    const shaken = (fovEffects: number) => {
      const cam = new FirstPersonCamera();
      const p = player({ movement: 'sprint' });
      const frame = { prev: p, cur: p, alpha: 0, look: { yaw: 0, pitch: 0 }, cmd: { yaw: 0, pitch: 0 }, dt: 1 / 60 };
      const with_ = settings({ fovEffects, cameraMotion: 0 });
      cam.update(frame, with_);
      cam.kick(2, 1, 1);
      let most = 0;
      for (let i = 0; i < 60; i++) {
        cam.update(frame, with_);
        most = Math.max(most, Math.abs(cam.camera.rotation.x), Math.abs(cam.camera.rotation.z));
      }
      return { most, fov: cam.camera.fov };
    };
    const walkFov = (() => {
      const cam = new FirstPersonCamera();
      const p = player();
      for (let i = 0; i < 60; i++) cam.update({ prev: p, cur: p, alpha: 0, look: { yaw: 0, pitch: 0 }, cmd: { yaw: 0, pitch: 0 }, dt: 1 / 60 }, DEFAULT_SETTINGS);
      return cam.camera.fov;
    })();
    const whole = shaken(1);
    const half = shaken(0.5);
    const none = shaken(0);
    expect(whole.most).toBeGreaterThan(0.5 * DEG);
    expect(half.most / whole.most).toBeCloseTo(0.5, 2);
    expect(none.most).toBe(0);
    expect(whole.fov / walkFov).toBeCloseTo(1.04, 2);
    expect(half.fov / walkFov).toBeCloseTo(1.02, 2);
    expect(none.fov).toBeCloseTo(walkFov, 6);
  });
});
