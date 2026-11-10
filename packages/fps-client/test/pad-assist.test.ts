import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { box, createWorld, type Vec3 } from '@duty-shooter/fps-core';
import { aimSees } from '../src/aim-sight';
import { padActuator } from '../src/gamepad';
import { InputController } from '../src/input';
import { Rumbler, blastRumble, hitRumble, hurtRumble, landRumble, rumbleNow, shotRumble, type Actuator } from '../src/rumble';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

// Ticket 13: the pad's aim slowdown and its rumble.

let pad: Gamepad | null = null;
let focused = true;
function page(): void {
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock: () => {}, hasFocus: () => focused, hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
}

/** A standard-mapping pad, the look stick pushed right by `look`; `actuator` its motors, if it has any. */
function controller(look: number, actuator?: Actuator): Gamepad {
  const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
  return { id: 'test pad', connected: true, buttons, axes: [0, 0, look, 0], vibrationActuator: actuator } as unknown as Gamepad;
}

beforeEach(() => {
  pad = null;
  focused = true;
  page();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the pad aim slowdown', () => {
  /** How far (rad) a second of the look stick held half right turns the view, with the slowdown at `slow`. */
  const turned = (slow: number) => {
    const input = new InputController({ style: {} } as unknown as HTMLElement, DEFAULT_SETTINGS);
    input.lockFree = true;
    input.enabled = true;
    pad = controller(0.6);
    let t = performance.now();
    // The first push makes the pad the input in use.
    input.poll(t, 1 / 60);
    const start = input.sample(t, t + 1000 / 60).yaw;
    input.padAssist(slow);
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      input.poll(t, 1 / 60);
    }
    return Math.abs(input.sample(t, t + 1000 / 60).yaw - start);
  };

  it('turns the stick slower by the slowdown it is given, and never by itself', () => {
    const free = turned(1);
    expect(free).toBeGreaterThan(0.5);
    expect(turned(0.55) / free).toBeCloseTo(0.55, 2);
  });

  it('is on by default and kept in a save', () => {
    expect(DEFAULT_SETTINGS.padAimAssist).toBe(true);
    expect(parseSettings({ padAimAssist: false }).padAimAssist).toBe(false);
  });
});

describe('what the aim helps may know of', () => {
  const eye: Vec3 = [0, 1.6, 0];
  const chest: Vec3 = [0, 1.2, -14];
  const open = createWorld([]);

  it('a body in the open', () => {
    expect(aimSees(open, [], 0, eye, chest)).toBe(true);
  });

  it('not a body behind a wall', () => {
    const walled = createWorld([box({ min: [-3, 0, -7.2], max: [3, 3, -7], material: 'brick' })]);
    expect(aimSees(walled, [], 0, eye, chest)).toBe(false);
  });

  it('not a body inside a standing smoke, but again once it has cleared', () => {
    const cloud = { id: 1, at: [0, 0, -7] as Vec3, popped: 0 };
    expect(aimSees(open, [cloud], 5, eye, chest)).toBe(false);
    expect(aimSees(open, [cloud], 60, eye, chest)).toBe(true);
  });
});

describe('the pad rumble', () => {
  it('thumps harder and longer for a heavy gun than a light one', () => {
    const smg = shotRumble(0.7);
    const sniper = shotRumble(3);
    expect(sniper.strong).toBeGreaterThan(smg.strong * 4);
    expect(sniper.ms).toBeGreaterThan(smg.ms);
    for (const r of [smg, sniper]) for (const m of [r.strong, r.weak]) expect(m).toBeGreaterThanOrEqual(0), expect(m).toBeLessThanOrEqual(1);
  });

  it('ticks for a hit, knocks for a kill, and says nothing for a hit that took nothing', () => {
    expect(hitRumble('kill')!.strong).toBeGreaterThan(hitRumble('hit')!.strong);
    expect(hitRumble('headshot')!.weak).toBeGreaterThan(hitRumble('hit')!.weak);
    expect(hitRumble('shielded')).toBeNull();
  });

  it('grows with the damage taken, the blast\'s nearness and the fall', () => {
    expect(hurtRumble(80).strong).toBeGreaterThan(hurtRumble(10).strong);
    expect(blastRumble(2)!.strong).toBeGreaterThan(blastRumble(15)!.strong);
    expect(blastRumble(25)).toBeNull();
    expect(landRumble(1)).toBeNull();
    expect(landRumble(6)!.strong).toBeGreaterThan(landRumble(3)!.strong);
  });

  it('mixes what is felt: each motor at the strongest, until the soonest of them ends', () => {
    const felt = [
      { strong: 0.9, weak: 0.4, until: 400 },
      { strong: 0, weak: 0.6, until: 140 },
    ];
    expect(rumbleNow(felt, 100)).toEqual({ strong: 0.9, weak: 0.6, ms: 40 });
    expect(rumbleNow(felt, 200)).toEqual({ strong: 0.9, weak: 0.4, ms: 200 });
    expect(rumbleNow(felt, 400)).toBeNull();
  });

  it('lets a blast\'s weight go when the blast ends, however many hits come on top', () => {
    // A blast, then a burst whose shots and hits overlap without a break (the review of ticket 13).
    const sent: { strong: number; weak: number; ms: number; at: number }[] = [];
    let now = 0;
    const motors: Actuator = { playEffect: (_t, p) => (sent.push({ strong: p.strongMagnitude, weak: p.weakMagnitude, ms: p.duration, at: now }), Promise.resolve()) };
    const r = new Rumbler(() => motors, () => now);
    const blast = blastRumble(3)!;
    r.play(blast, 1);
    const smg = shotRumble(0.7);
    for (now = blast.ms - 60; now < blast.ms + 1600; now += 16) {
      if (now % 64 < 16) r.play(smg, 1);
      if (now % 64 >= 32 && now % 64 < 48) r.play(hitRumble('hit'), 1);
      r.update();
    }
    expect(sent.at(-1)!.strong).toBeLessThan(0.2);
    // Nothing sent after the blast ended still carries its weight.
    expect(sent.filter((x) => x.at >= blast.ms && x.strong > 0.5)).toEqual([]);
    // And the motors are never left idle mid-burst: every send runs into the next.
    for (let i = 1; i < sent.length; i++) expect(sent[i]!.at).toBeLessThanOrEqual(sent[i - 1]!.at + sent[i - 1]!.ms + 16);
  });

  it('plays on the pad at the player\'s strength, and not at all at 0 or without a pad that rumbles', () => {
    const played: { strongMagnitude: number; weakMagnitude: number; duration: number }[] = [];
    let resets = 0;
    const motors: Actuator = { playEffect: (_t, p) => (played.push(p), Promise.resolve()), reset: () => (resets++, Promise.resolve()) };
    let now = 0;
    const r = new Rumbler(() => motors, () => now);
    r.play({ strong: 0.8, weak: 0.4, ms: 100 }, 0.5);
    expect(played).toEqual([{ duration: 100, strongMagnitude: 0.4, weakMagnitude: 0.2 }]);
    now = 1000;
    r.play({ strong: 0.8, weak: 0.4, ms: 100 }, 0);
    expect(played).toHaveLength(1);
    new Rumbler(() => null, () => now).play({ strong: 1, weak: 1, ms: 100 }, 1);
    expect(played).toHaveLength(1);
    // A pause stops the motors at once, and only if they run.
    r.play({ strong: 1, weak: 1, ms: 500 }, 1);
    r.stop();
    r.stop();
    expect(resets).toBe(1);
    // Even once the page has lost the focus (and the pad reads as gone), the last pad played on is stopped.
    let reachable = true;
    const away = new Rumbler(() => (reachable ? motors : null), () => now);
    away.play({ strong: 1, weak: 1, ms: 500 }, 1);
    reachable = false;
    away.stop();
    expect(resets).toBe(2);
  });

  it('finds the motors of the pad in use, and none while the game is not in focus', () => {
    const motors: Actuator = { playEffect: () => Promise.resolve() };
    pad = controller(0, motors);
    expect(padActuator()).toBe(motors);
    focused = false;
    expect(padActuator()).toBeNull();
    focused = true;
    pad = controller(0);
    expect(padActuator()).toBeNull();
  });

  it('is full by default, and a save keeps it between off and full', () => {
    expect(DEFAULT_SETTINGS.padRumble).toBe(1);
    expect(parseSettings({ padRumble: 0 }).padRumble).toBe(0);
    expect(parseSettings({ padRumble: 7 }).padRumble).toBe(1);
  });
});
