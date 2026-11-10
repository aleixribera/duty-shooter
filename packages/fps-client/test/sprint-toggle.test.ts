import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, isPressed, type UserCmd } from '@duty-shooter/fps-core';
import { PAD } from '../src/gamepad';
import { InputController } from '../src/input';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';

/** The page as InputController sees it: a document and a window that carry events, and a pad slot. */
let pad: Gamepad | null = null;
function page(): void {
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock: () => {}, hasFocus: () => true, hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
}

/** A standard-mapping controller: the buttons held, and the left stick's forward push (0 to 1). */
function controller(held: readonly number[], forward: number): Gamepad {
  const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: held.includes(i), touched: held.includes(i), value: held.includes(i) ? 1 : 0 }));
  return { id: 'test pad', connected: true, buttons, axes: [0, -forward, 0, 0] } as unknown as Gamepad;
}

/** An input controller in play, without pointer lock, and a tick clock for its usercmds. */
function playing(settings: Settings = DEFAULT_SETTINGS) {
  const input = new InputController({ style: {} } as unknown as HTMLElement, settings);
  input.lockFree = true;
  input.enabled = true;
  let t = performance.now();
  const key = (type: 'keydown' | 'keyup', code: string) => document.dispatchEvent(Object.assign(new Event(type), { code }));
  const mouse = (type: 'mousedown' | 'mouseup', button: number) => document.dispatchEvent(Object.assign(new Event(type), { button }));
  return {
    input,
    down: (code: string) => key('keydown', code),
    up: (code: string) => key('keyup', code),
    tap(code: string) {
      key('keydown', code);
      key('keyup', code);
    },
    press: (button: number) => mouse('mousedown', button),
    release: (button: number) => mouse('mouseup', button),
    click(button: number) {
      mouse('mousedown', button);
      mouse('mouseup', button);
    },
    /** One tick's usercmd, the controller read once first. */
    cmd(): UserCmd {
      input.poll(t, 1 / 60);
      const cmd = input.sample(t, t + 1000 / 60);
      t += 1000 / 60;
      return cmd;
    },
  };
}

const sprinting = (cmd: UserCmd) => isPressed(cmd, 'Sprint');

beforeEach(() => {
  pad = null;
  page();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toggle sprint on the keyboard', () => {
  it('latches on a press of Shift and stays on while forward is held, the key let go', () => {
    const p = playing();
    p.down('KeyW');
    expect(sprinting(p.cmd())).toBe(false);

    p.tap('ShiftLeft');

    for (let i = 0; i < 120; i++) expect(sprinting(p.cmd())).toBe(true);
  });

  it('lets go on a second press', () => {
    const p = playing();
    p.down('KeyW');
    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(true);

    p.tap('ShiftLeft');

    expect(sprinting(p.cmd())).toBe(false);
    expect(sprinting(p.cmd())).toBe(false);
  });

  it('lets go when forward is let go, and pressing forward again walks', () => {
    const p = playing();
    p.down('KeyW');
    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(true);

    p.up('KeyW');
    expect(sprinting(p.cmd())).toBe(false);
    p.down('KeyW');

    expect(sprinting(p.cmd())).toBe(false);
  });

  it('lets go on a shot', () => {
    const p = playing();
    p.down('KeyW');
    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(true);

    p.click(0);
    const fired = p.cmd();

    expect(fired.firePresses.length).toBe(1);
    expect(sprinting(fired)).toBe(false);
    expect(sprinting(p.cmd())).toBe(false);
  });

  it('lets go on aiming down sights, held or toggled', () => {
    for (const adsMode of ['hold', 'toggle'] as const) {
      const p = playing({ ...DEFAULT_SETTINGS, adsMode });
      p.down('KeyW');
      p.tap('ShiftLeft');
      expect(sprinting(p.cmd())).toBe(true);

      p.press(2);
      const aimed = p.cmd();

      expect(isPressed(aimed, 'Ads')).toBe(true);
      expect(sprinting(aimed)).toBe(false);
      // Lowering the sights again walks: the latch is gone, not paused.
      p.release(2);
      if (adsMode === 'toggle') p.click(2);
      const lowered = p.cmd();
      expect(isPressed(lowered, 'Ads')).toBe(false);
      expect(sprinting(lowered)).toBe(false);
    }
  });

  it('keeps a press made a moment before forward: Shift a frame before W sprints', () => {
    const p = playing();
    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(false);
    expect(sprinting(p.cmd())).toBe(false);

    p.down('KeyW');

    expect(sprinting(p.cmd())).toBe(true);
  });

  it('drops a press that forward never follows', () => {
    const p = playing();
    p.tap('ShiftLeft');
    for (let i = 0; i < 30; i++) p.cmd();

    p.down('KeyW');

    expect(sprinting(p.cmd())).toBe(false);
  });

  it('sprints out of toggled sights, lowering them', () => {
    const p = playing({ ...DEFAULT_SETTINGS, adsMode: 'toggle' });
    p.down('KeyW');
    p.click(2);
    expect(isPressed(p.cmd(), 'Ads')).toBe(true);

    p.tap('ShiftLeft');
    const run = p.cmd();

    expect(isPressed(run, 'Ads')).toBe(false);
    expect(sprinting(run)).toBe(true);
  });

  it('never sends bit 8, however fast Shift is tapped', () => {
    const p = playing();
    p.down('KeyW');
    for (let i = 0; i < 6; i++) {
      p.tap('ShiftLeft');
      expect(p.cmd().buttons & (1 << 8)).toBe(0);
    }
  });

  it('stands up from a crouch and sprints, and keeps the latch through a slide', () => {
    const p = playing();
    p.down('KeyW');
    p.tap('KeyC');
    expect(isPressed(p.cmd(), 'Crouch')).toBe(true);

    // From a crouch, Shift stands you up and sprints.
    p.tap('ShiftLeft');
    const up = p.cmd();
    expect(isPressed(up, 'Crouch')).toBe(false);
    expect(sprinting(up)).toBe(true);

    // Crouch while sprinting is a slide: Sprint and Crouch together, the latch kept.
    p.tap('KeyC');
    const slide = p.cmd();
    expect(slide.buttons & (Button.Sprint | Button.Crouch)).toBe(Button.Sprint | Button.Crouch);
    // Still latched after the slide, crouched: Shift stands you up again rather than letting go.
    p.tap('ShiftLeft');
    const after = p.cmd();
    expect(isPressed(after, 'Crouch')).toBe(false);
    expect(sprinting(after)).toBe(true);
  });

  it('lets go when input stops (a menu opens) and on endSprint (death, a respawn)', () => {
    const p = playing();
    p.down('KeyW');
    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(true);
    p.input.enabled = false;
    p.input.enabled = true;
    p.down('KeyW');
    expect(sprinting(p.cmd())).toBe(false);

    p.tap('ShiftLeft');
    expect(sprinting(p.cmd())).toBe(true);
    p.input.endSprint();
    expect(sprinting(p.cmd())).toBe(false);
  });
});

describe('toggle sprint on the controller', () => {
  it('latches on a click of L3 while the stick pushes forward, and lets go when it drops below half', () => {
    const p = playing();
    pad = controller([], 1);
    expect(sprinting(p.cmd())).toBe(false);
    pad = controller([PAD.l3], 1);
    p.cmd();
    pad = controller([], 1);
    for (let i = 0; i < 60; i++) expect(sprinting(p.cmd())).toBe(true);

    pad = controller([], 0.4);

    expect(sprinting(p.cmd())).toBe(false);
  });

  it('shares the latch with the keyboard: a second click lets go, as Shift does', () => {
    const p = playing();
    pad = controller([PAD.l3], 1);
    p.cmd();
    pad = controller([], 1);
    expect(sprinting(p.cmd())).toBe(true);

    pad = controller([PAD.l3], 1);

    expect(sprinting(p.cmd())).toBe(false);
  });

  it('lets go on R2 (fire)', () => {
    const p = playing();
    pad = controller([PAD.l3], 1);
    p.cmd();
    pad = controller([], 1);
    expect(sprinting(p.cmd())).toBe(true);

    pad = controller([PAD.r2], 1);

    expect(sprinting(p.cmd())).toBe(false);
  });
});

describe('hold sprint', () => {
  it('runs while the key is down and stops the tick it comes up', () => {
    const { down, up, cmd } = playing({ ...DEFAULT_SETTINGS, sprintMode: 'hold' });
    down('KeyW');
    down('ShiftLeft');
    expect(sprinting(cmd())).toBe(true);
    expect(sprinting(cmd())).toBe(true);
    up('ShiftLeft');
    expect(sprinting(cmd())).toBe(false);
    expect(sprinting(cmd())).toBe(false);
  });

  it('a tap within one tick still runs that tick, and only that one', () => {
    const { down, tap, cmd } = playing({ ...DEFAULT_SETTINGS, sprintMode: 'hold' });
    down('KeyW');
    tap('ShiftLeft');
    expect(sprinting(cmd())).toBe(true);
    expect(sprinting(cmd())).toBe(false);
  });
});
