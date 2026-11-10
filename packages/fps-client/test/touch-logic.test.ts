import { describe, expect, it } from 'vitest';
import {
  AUTO_FIRE_DELAY_MS,
  AUTO_FIRE_IDLE,
  AUTO_FIRE_LINGER_MS,
  BODY_RADIUS,
  PointerBook,
  SLOW_FLOOR,
  STICK_DEADZONE,
  STICK_LOCK,
  STICK_RADIUS,
  aimAt,
  aimSlowdown,
  autoFire,
  autoFireRange,
  lookGain,
  lookTurn,
  readStick,
  type AutoFireInput,
  type AutoFireState,
} from '../src/touch/logic';

describe('the move stick', () => {
  it('rests inside its deadzone, so a thumb that lands is not a step', () => {
    const rest = readStick(STICK_RADIUS * STICK_DEADZONE * 0.9, 0);
    expect(rest.forward).toBe(0);
    expect(rest.right).toBe(0);
    expect(rest.sprint).toBe(false);
  });

  it('pushes forward for a drag up the screen and right for a drag right', () => {
    const up = readStick(0, -STICK_RADIUS * 0.6);
    expect(up.forward).toBeGreaterThan(0.4);
    expect(up.right).toBeCloseTo(0);
    const right = readStick(STICK_RADIUS * 0.6, 0);
    expect(right.right).toBeGreaterThan(0.4);
    expect(right.forward).toBeCloseTo(0);
    expect(readStick(0, STICK_RADIUS * 0.6).forward).toBeLessThan(-0.4);
  });

  it('starts from nothing at the edge of the deadzone and reaches exactly one at full travel', () => {
    expect(readStick(0, -STICK_RADIUS * (STICK_DEADZONE + 0.01)).forward).toBeLessThan(0.05);
    expect(readStick(0, -STICK_RADIUS).forward).toBeCloseTo(1);
    // Past the travel the push stays at one and the knob stays on the ring.
    const far = readStick(0, -STICK_RADIUS * 3);
    expect(far.forward).toBeCloseTo(1);
    expect(Math.hypot(far.knobX, far.knobY)).toBeCloseTo(STICK_RADIUS);
  });

  it('never asks for more than a full push on the diagonal', () => {
    const d = readStick(STICK_RADIUS * 2, -STICK_RADIUS * 2);
    expect(Math.hypot(d.forward, d.right)).toBeCloseTo(1);
  });

  it('sprints at full deflection forward, not sideways, back or part way', () => {
    expect(readStick(0, -STICK_RADIUS).sprint).toBe(true);
    expect(readStick(STICK_RADIUS * 0.3, -STICK_RADIUS).sprint).toBe(true);
    expect(readStick(0, -STICK_RADIUS * 0.7).sprint).toBe(false);
    expect(readStick(STICK_RADIUS, 0).sprint).toBe(false);
    expect(readStick(STICK_RADIUS, -STICK_RADIUS * 0.5).sprint).toBe(false);
    expect(readStick(0, STICK_RADIUS).sprint).toBe(false);
  });

  it('offers the sprint lock only past the top of its travel', () => {
    expect(readStick(0, -STICK_RADIUS).lock).toBe(false);
    expect(readStick(0, -STICK_RADIUS * (STICK_LOCK + 0.05)).lock).toBe(true);
    expect(readStick(STICK_RADIUS * (STICK_LOCK + 0.5), 0).lock).toBe(false);
  });
});

describe('look by dragging', () => {
  it('turns left for a drag left and up for a drag up, as the mouse does', () => {
    const t = lookTurn(-10, -10, 16, 10);
    expect(t.yaw).toBeGreaterThan(0);
    expect(t.pitch).toBeGreaterThan(0);
    expect(lookTurn(0, 0, 16, 10)).toEqual({ yaw: 0, pitch: 0 });
  });

  it('turns in proportion to the sensitivity and to the scale', () => {
    const base = lookTurn(10, 0, 16, 10).yaw;
    expect(lookTurn(10, 0, 16, 20).yaw).toBeCloseTo(base * 2);
    expect(lookTurn(10, 0, 16, 10, 0.5).yaw).toBeCloseTo(base * 0.5);
  });

  it('accelerates: the same distance turns further as a flick than as a creep', () => {
    const creep = Math.abs(lookTurn(1, 0, 40, 10).yaw) * 40;
    const flick = Math.abs(lookTurn(40, 0, 16, 10).yaw);
    expect(flick).toBeGreaterThan(creep * 2);
    expect(lookGain(0)).toBeLessThan(1);
    expect(lookGain(10)).toBeGreaterThan(1.5);
    // The gain never falls as the drag speeds up.
    let last = 0;
    for (let s = 0; s <= 3; s += 0.05) {
      expect(lookGain(s)).toBeGreaterThanOrEqual(last);
      last = lookGain(s);
    }
  });

  it('a swipe across half a phone at the default turns about a right angle', () => {
    // 300 px in a third of a second, in 16 ms events.
    let yaw = 0;
    for (let i = 0; i < 20; i++) yaw += lookTurn(15, 0, 16, 10).yaw;
    const degrees = Math.abs((yaw * 180) / Math.PI);
    expect(degrees).toBeGreaterThan(70);
    expect(degrees).toBeLessThan(200);
  });

  it('does not read two events a millisecond apart as a flick', () => {
    expect(lookTurn(4, 0, 0.1, 10).yaw).toBeCloseTo(lookTurn(4, 0, 4, 10).yaw);
  });
});

describe('pointer tracking', () => {
  it('gives each control to the one finger that pressed it', () => {
    const book = new PointerBook<string>();
    expect(book.claim(1, 'stick')).toBe(true);
    expect(book.claim(2, 'look')).toBe(true);
    expect(book.owner(1)).toBe('stick');
    expect(book.owner(2)).toBe('look');
    expect(book.owns(2, 'stick')).toBe(false);
  });

  it('a third finger on a held control changes nothing', () => {
    const book = new PointerBook<string>();
    book.claim(1, 'stick');
    book.claim(2, 'look');
    expect(book.claim(3, 'stick')).toBe(false);
    expect(book.claim(3, 'look')).toBe(false);
    expect(book.owner(3)).toBeNull();
    expect(book.owner(1)).toBe('stick');
    // Lifting the stray finger frees nothing.
    expect(book.release(3)).toBeNull();
    expect(book.held('stick')).toBe(true);
    expect(book.held('look')).toBe(true);
  });

  it('a third finger on a free control gets it, without disturbing the others', () => {
    const book = new PointerBook<string>();
    book.claim(1, 'stick');
    book.claim(2, 'look');
    expect(book.claim(3, 'jump')).toBe(true);
    expect(book.size).toBe(3);
    expect(book.release(3)).toBe('jump');
    expect(book.owner(1)).toBe('stick');
    expect(book.owner(2)).toBe('look');
  });

  it('one finger holds one control: a pointer id seen twice is not claimed twice', () => {
    const book = new PointerBook<string>();
    book.claim(1, 'fire');
    expect(book.claim(1, 'jump')).toBe(false);
    expect(book.held('jump')).toBe(false);
  });

  it('frees a control when its finger lifts, for the next finger', () => {
    const book = new PointerBook<string>();
    book.claim(1, 'fire');
    expect(book.release(1)).toBe('fire');
    expect(book.held('fire')).toBe(false);
    expect(book.claim(5, 'fire')).toBe(true);
  });

  it('lets go of everything at once', () => {
    const book = new PointerBook<string>();
    book.claim(1, 'stick');
    book.claim(2, 'fire');
    expect(book.clear().sort()).toEqual(['fire', 'stick']);
    expect(book.size).toBe(0);
  });
});

describe('where the crosshair is against a body', () => {
  const eye = [0, 1.6, 0] as const;
  const ahead = [0, 0, -1] as const;

  it('is on a body straight ahead, at its distance', () => {
    const aim = aimAt(eye, ahead, [0, 0, -20], 1.6);
    expect(aim).not.toBeNull();
    expect(aim!.miss).toBeLessThan(0.01);
    expect(aim!.along).toBeCloseTo(20);
  });

  it('measures how far the view passes beside it', () => {
    const aim = aimAt(eye, ahead, [1.5, 0, -20], 1.6);
    expect(aim!.miss).toBeCloseTo(1.5);
  });

  it('counts the head and not the ground at its feet', () => {
    // Looking level at eye height, a body the same height: the line passes through its head.
    expect(aimAt(eye, ahead, [0, 0, -10], 1.6)!.miss).toBeLessThan(BODY_RADIUS);
    // Looking at the ground under it.
    const down = [0, -Math.sin(0.16), -Math.cos(0.16)] as const;
    expect(aimAt(eye, down, [0, 0, -10], 1.6)!.miss).toBeGreaterThan(BODY_RADIUS);
    // Looking well over its head.
    const up = [0, Math.sin(0.2), -Math.cos(0.2)] as const;
    expect(aimAt(eye, up, [0, 0, -10], 1.6)!.miss).toBeGreaterThan(BODY_RADIUS);
  });

  it('is nothing for a body behind the eye', () => {
    expect(aimAt(eye, ahead, [0, 0, 10], 1.6)).toBeNull();
  });

  it('finds a body below when looking straight down', () => {
    const aim = aimAt([0, 10, 0], [0, -1, 0], [0, 0, 0], 1.6);
    expect(aim).not.toBeNull();
    expect(aim!.miss).toBeLessThan(0.01);
  });
});

describe('the aim slowdown', () => {
  it('is nothing away from any target', () => {
    expect(aimSlowdown(null)).toBe(1);
    expect(aimSlowdown({ along: 20, miss: 5 })).toBe(1);
  });

  it('is at its floor on the body and eases back out beside it', () => {
    expect(aimSlowdown({ along: 20, miss: 0 })).toBeCloseTo(SLOW_FLOOR);
    expect(aimSlowdown({ along: 20, miss: BODY_RADIUS })).toBeCloseTo(SLOW_FLOOR);
    const beside = aimSlowdown({ along: 20, miss: BODY_RADIUS * 2 });
    expect(beside).toBeGreaterThan(SLOW_FLOOR);
    expect(beside).toBeLessThan(1);
  });

  it('never stops the drag and never speeds it up', () => {
    for (let miss = 0; miss < 3; miss += 0.05) {
      const f = aimSlowdown({ along: 15, miss });
      expect(f).toBeGreaterThanOrEqual(SLOW_FLOOR);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it('does not slow the whole screen for a body at arm\'s length', () => {
    // Half a metre off a body one metre away is far off the crosshair, however near in metres.
    expect(aimSlowdown({ along: 1, miss: 0.5 })).toBe(1);
  });
});

describe('auto-fire', () => {
  const rifle = { ready: true, auto: true, interval: 80 };
  const run = (steps: readonly (Partial<AutoFireInput> & { now: number; onTarget: boolean })[], start: AutoFireState = AUTO_FIRE_IDLE) => {
    let state = start;
    const outs = steps.map((s) => {
      const out = autoFire(state, { ...rifle, ...s });
      state = out.state;
      return out;
    });
    return { outs, state };
  };

  it('waits for the crosshair to rest on the enemy before the first shot', () => {
    const { outs } = run([
      { now: 0, onTarget: true },
      { now: AUTO_FIRE_DELAY_MS - 10, onTarget: true },
      { now: AUTO_FIRE_DELAY_MS + 1, onTarget: true },
      { now: AUTO_FIRE_DELAY_MS + 17, onTarget: true },
    ]);
    expect(outs.map((o) => o.hold)).toEqual([false, false, true, true]);
    // The first frame of the hold is the press; after it the trigger is just held.
    expect(outs.map((o) => o.press)).toEqual([false, false, true, false]);
  });

  it('does not fire for a sweep past an enemy', () => {
    const { outs } = run([
      { now: 0, onTarget: true },
      { now: 60, onTarget: false },
      { now: 400, onTarget: false },
    ]);
    expect(outs.some((o) => o.hold || o.press)).toBe(false);
  });

  it('starts the wait again each time the crosshair comes back on', () => {
    const { outs } = run([
      { now: 0, onTarget: true },
      { now: 100, onTarget: false },
      { now: 150, onTarget: true },
      { now: 150 + AUTO_FIRE_DELAY_MS - 20, onTarget: true },
      { now: 150 + AUTO_FIRE_DELAY_MS + 5, onTarget: true },
    ]);
    expect(outs.map((o) => o.hold)).toEqual([false, false, false, false, true]);
  });

  it('holds on for a moment after the crosshair slips off, then lets go', () => {
    const t = AUTO_FIRE_DELAY_MS + 10;
    const { outs } = run([
      { now: 0, onTarget: true },
      { now: t, onTarget: true },
      { now: t + AUTO_FIRE_LINGER_MS - 10, onTarget: false },
      { now: t + AUTO_FIRE_LINGER_MS + 10, onTarget: false },
    ]);
    expect(outs.map((o) => o.hold)).toEqual([false, true, true, false]);
  });

  it('lets go at once when the player cannot fire (reloading, an empty magazine, down)', () => {
    const t = AUTO_FIRE_DELAY_MS + 10;
    const { outs, state } = run([
      { now: 0, onTarget: true },
      { now: t, onTarget: true },
      { now: t + 16, onTarget: true, ready: false },
    ]);
    expect(outs.map((o) => o.hold)).toEqual([false, true, false]);
    expect(state).toEqual(AUTO_FIRE_IDLE);
  });

  it('never fires with the option off the target, however long it waits', () => {
    const { outs } = run(Array.from({ length: 50 }, (_, i) => ({ now: i * 50, onTarget: false })));
    expect(outs.some((o) => o.hold || o.press)).toBe(false);
  });

  it('presses once per shot for a weapon that fires once per press, at its fire rate', () => {
    const pistol = { auto: false, interval: 150 };
    const steps = Array.from({ length: 60 }, (_, i) => ({ now: i * 16, onTarget: true, ...pistol }));
    const { outs } = run(steps);
    const presses = outs.map((o, i) => (o.press ? i * 16 : -1)).filter((t) => t >= 0);
    // The trigger is never held down for it: each shot is its own press.
    expect(outs.some((o) => o.hold)).toBe(false);
    expect(presses.length).toBeGreaterThanOrEqual(4);
    expect(presses[0]).toBeGreaterThanOrEqual(AUTO_FIRE_DELAY_MS);
    for (let i = 1; i < presses.length; i++) expect(presses[i]! - presses[i - 1]!).toBeGreaterThanOrEqual(150);
  });

  it('does not press a one-shot weapon into the wall after the enemy has gone', () => {
    const t = AUTO_FIRE_DELAY_MS + 10;
    const pistol = { auto: false, interval: 150 };
    const { outs } = run([
      { now: 0, onTarget: true, ...pistol },
      { now: t, onTarget: true, ...pistol },
      { now: t + 40, onTarget: false, ...pistol },
      { now: t + 400, onTarget: false, ...pistol },
    ]);
    expect(outs.map((o) => o.press)).toEqual([false, true, false, false]);
  });
});

describe('how far auto-fire reaches', () => {
  it('goes half again past the last falloff band', () => {
    expect(autoFireRange([15, 25, undefined])).toBeCloseTo(37.5);
    expect(autoFireRange([7, 12, 18, undefined])).toBeCloseTo(27);
  });

  it('is open for a weapon with no falloff', () => {
    expect(autoFireRange([undefined])).toBe(160);
  });
});
