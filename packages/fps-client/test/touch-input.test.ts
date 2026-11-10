import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, isPressed, type UserCmd } from '@duty-shooter/fps-core';
import { PAD } from '../src/gamepad';
import { InputController } from '../src/input';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../src/settings';
import { nextTouchMode, setTouchMode, touchMode } from '../src/touch/mode';

/** The page as InputController sees it: a document and a window that carry events, and a pad slot. No elements, so the controls' page is never built. */
let pad: Gamepad | null = null;
function page(): void {
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock: () => {}, hasFocus: () => true, hidden: false });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { getGamepads: () => [pad] });
}

function controller(held: readonly number[]): Gamepad {
  const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: held.includes(i), touched: held.includes(i), value: held.includes(i) ? 1 : 0 }));
  return { id: 'test pad', connected: true, buttons, axes: [0, 0, 0, 0] } as unknown as Gamepad;
}

/** An input controller in play on a touchscreen: no pointer lock, no `lockFree`. */
function playing(settings: Settings = DEFAULT_SETTINGS) {
  const input = new InputController({ style: {} } as unknown as HTMLElement, settings);
  input.enabled = true;
  let t = performance.now();
  return {
    input,
    touch: input.touchSink,
    mouse: (type: 'mousedown' | 'mouseup', button: number) => document.dispatchEvent(Object.assign(new Event(type), { button })),
    cmd(): UserCmd {
      input.poll(t, 1 / 60);
      const cmd = input.sample(t, t + 1000 / 60);
      t += 1000 / 60;
      return cmd;
    },
  };
}

beforeEach(() => {
  pad = null;
  page();
  setTouchMode(false);
});

afterEach(() => {
  setTouchMode(false);
  vi.unstubAllGlobals();
});

describe('which input is in use', () => {
  it('a finger on the glass turns touch on; hovering does not', () => {
    expect(nextTouchMode(false, { kind: 'pointer', pointerType: 'touch', down: true })).toBe(true);
    expect(nextTouchMode(false, { kind: 'pointer', pointerType: 'touch', down: false })).toBe(false);
    expect(nextTouchMode(false, { kind: 'pointer', pointerType: 'pen', down: true })).toBe(true);
  });

  it('a mouse that moves or presses turns it off: a laptop with both switches both ways', () => {
    expect(nextTouchMode(true, { kind: 'pointer', pointerType: 'mouse', down: false })).toBe(false);
    expect(nextTouchMode(true, { kind: 'pointer', pointerType: 'mouse', down: true })).toBe(false);
    expect(nextTouchMode(false, { kind: 'pointer', pointerType: 'touch', down: true })).toBe(true);
  });

  it('a key turns it off, but not one typed into a field (the on-screen keyboard)', () => {
    expect(nextTouchMode(true, { kind: 'key', typing: false })).toBe(false);
    expect(nextTouchMode(true, { kind: 'key', typing: true })).toBe(true);
  });

  it('a controller turns it off', () => {
    expect(nextTouchMode(true, { kind: 'pad' })).toBe(false);
  });
});

describe('touch through the input controller', () => {
  it('needs no pointer lock: in touch mode the game takes input', () => {
    const { input } = playing();
    expect(input.locked).toBe(false);
    setTouchMode(true);
    expect(input.touchMode).toBe(true);
    expect(input.locked).toBe(true);
  });

  it('a button reaches the usercmd as the same button a key presses', () => {
    setTouchMode(true);
    const { touch, cmd } = playing();
    touch.press('jump');
    expect(isPressed(cmd(), 'Jump')).toBe(true);
    touch.release('jump');
    expect(isPressed(cmd(), 'Jump')).toBe(false);
    touch.press('reload');
    touch.press('grenade');
    const both = cmd();
    expect(isPressed(both, 'Reload')).toBe(true);
    expect(isPressed(both, 'Grenade')).toBe(true);
  });

  it('a tap shorter than a tick still fires, with its press time', () => {
    setTouchMode(true);
    const { touch, cmd } = playing();
    touch.press('fire');
    touch.release('fire');
    const c = cmd();
    expect(isPressed(c, 'Fire')).toBe(true);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });

  it('the swap button asks for one switch', () => {
    setTouchMode(true);
    const { touch, cmd } = playing();
    touch.press('switchWeapon');
    touch.release('switchWeapon');
    expect((cmd().buttons & Button.SwitchWeapon) !== 0).toBe(true);
    expect((cmd().buttons & Button.SwitchWeapon) !== 0).toBe(false);
  });

  it('the sights toggle on a tap whatever the ADS setting: a thumb cannot hold them and aim', () => {
    setTouchMode(true);
    const { touch, cmd } = playing({ ...DEFAULT_SETTINGS, adsMode: 'hold' });
    touch.press('ads');
    touch.release('ads');
    expect(isPressed(cmd(), 'Ads')).toBe(true);
    expect(isPressed(cmd(), 'Ads')).toBe(true);
    touch.press('ads');
    touch.release('ads');
    expect(isPressed(cmd(), 'Ads')).toBe(false);
  });

  it('crouch toggles on a tap, and jump stands back up', () => {
    setTouchMode(true);
    const { touch, cmd } = playing({ ...DEFAULT_SETTINGS, crouchMode: 'hold' });
    touch.press('crouch');
    touch.release('crouch');
    expect(isPressed(cmd(), 'Crouch')).toBe(true);
    touch.press('jump');
    touch.release('jump');
    expect(isPressed(cmd(), 'Crouch')).toBe(false);
  });

  it('a drag turns the view, and less in the sights', () => {
    setTouchMode(true);
    const { input, touch } = playing();
    touch.look(-30, 0, 16);
    const hip = input.angles.yaw;
    expect(hip).toBeGreaterThan(0);
    input.setAngles(0, 0);
    input.aiming = true;
    input.setWeapon(0, 4);
    touch.look(-30, 0, 16);
    expect(input.angles.yaw).toBeGreaterThan(0);
    expect(input.angles.yaw).toBeLessThan(hip);
  });

  it('a drag down cannot pitch past the limits', () => {
    setTouchMode(true);
    const { input, touch } = playing();
    for (let i = 0; i < 400; i++) touch.look(0, 60, 16);
    expect(input.angles.pitch).toBeGreaterThan(-Math.PI / 2 - 0.2);
    expect(input.angles.pitch).toBeLessThan(0);
  });

  it('the browser\'s late mouse click for a tap is not a shot', () => {
    setTouchMode(true);
    const { mouse, cmd } = playing();
    mouse('mousedown', 0);
    mouse('mouseup', 0);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });

  it('nothing is read while a menu is open', () => {
    setTouchMode(true);
    const { input, touch, cmd } = playing();
    input.enabled = false;
    touch.press('fire');
    touch.look(40, 0, 16);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
    expect(input.angles.yaw).toBe(0);
  });

  it('the pause button opens the menu', () => {
    setTouchMode(true);
    const { input, touch } = playing();
    const paused = vi.fn();
    input.onUnlock = paused;
    touch.pause();
    expect(paused).toHaveBeenCalledOnce();
  });

  it('a mouse coming back mid-game hands over through the pause menu, which takes the pointer', () => {
    setTouchMode(true);
    const { input, touch, cmd } = playing();
    const paused = vi.fn();
    input.onUnlock = paused;
    touch.press('fire');
    setTouchMode(false);
    expect(paused).toHaveBeenCalledOnce();
    expect(input.locked).toBe(false);
    // What the thumb held is let go with the mode.
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });

  it('a controller taking over ends touch mode without pausing', () => {
    setTouchMode(true);
    const { input, cmd } = playing();
    const paused = vi.fn();
    input.onUnlock = paused;
    pad = controller([PAD.cross]);
    cmd();
    expect(touchMode()).toBe(false);
    expect(input.padMode).toBe(true);
    expect(paused).not.toHaveBeenCalled();
  });

  it('a touch taking over from the controller ends pad mode', () => {
    const { input, cmd } = playing();
    pad = controller([PAD.cross]);
    cmd();
    expect(input.padMode).toBe(true);
    pad = controller([]);
    cmd();
    setTouchMode(true);
    expect(input.padMode).toBe(false);
    expect(input.locked).toBe(true);
  });
});

describe('auto-fire and the aim slowdown through the input controller', () => {
  it('auto-fire holds the same fire button a finger would', () => {
    setTouchMode(true);
    const { input, cmd } = playing();
    input.touchAssist(1, true, false);
    const first = cmd();
    expect(isPressed(first, 'Fire')).toBe(true);
    expect(first.firePresses.length).toBe(1);
    expect(isPressed(cmd(), 'Fire')).toBe(true);
    input.touchAssist(1, false, false);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });

  it('a one-shot weapon gets one press per shot', () => {
    setTouchMode(true);
    const { input, cmd } = playing();
    input.touchAssist(1, false, true);
    const c = cmd();
    expect(c.firePresses.length).toBe(1);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });

  it('sends nothing a mouse could not: buttons, axes and view angles only', () => {
    setTouchMode(true);
    const { input, touch, cmd } = playing();
    input.touchAssist(0.55, true, false);
    touch.look(-20, 5, 16);
    const c = cmd();
    expect(Object.keys(c).sort()).toEqual(['buttons', 'firePresses', 'forward', 'pitch', 'right', 'yaw']);
  });

  it('the slowdown scales the drag and never turns the view by itself', () => {
    setTouchMode(true);
    const { input, touch } = playing();
    input.touchAssist(0.55, false, false);
    expect(input.angles).toEqual({ yaw: 0, pitch: 0 });
    touch.look(-30, 0, 16);
    const slowed = input.angles.yaw;
    input.setAngles(0, 0);
    input.touchAssist(1, false, false);
    touch.look(-30, 0, 16);
    expect(slowed).toBeCloseTo(input.angles.yaw * 0.55);
  });

  it('is off for the mouse: leaving touch mode drops the slowdown and the trigger', () => {
    setTouchMode(true);
    const { input, cmd } = playing();
    input.lockFree = true;
    input.touchAssist(0.55, true, false);
    setTouchMode(false);
    expect(isPressed(cmd(), 'Fire')).toBe(false);
  });
});

describe('the touch settings', () => {
  it('auto-fire and the aim slowdown are on by default, with a sensitivity of their own', () => {
    expect(DEFAULT_SETTINGS.touchAutoFire).toBe(true);
    expect(DEFAULT_SETTINGS.touchAimAssist).toBe(true);
    expect(DEFAULT_SETTINGS.touchSensitivity).toBe(10);
  });

  it('are kept with the other settings, and a save from before them gets the defaults', () => {
    const old = parseSettings({ sensitivity: 12, defaultsVersion: 2 });
    expect(old.touchAutoFire).toBe(true);
    expect(old.touchSensitivity).toBe(10);
    const off = parseSettings({ touchAutoFire: false, touchAimAssist: false, touchSensitivity: 99, touchAdsMultiplier: -4 });
    expect(off.touchAutoFire).toBe(false);
    expect(off.touchAimAssist).toBe(false);
    expect(off.touchSensitivity).toBe(20);
    expect(off.touchAdsMultiplier).toBe(0.1);
  });
});
