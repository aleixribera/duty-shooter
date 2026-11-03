import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAD, readPad } from '../src/gamepad';

/** A DualShock 4 with R2 (fire) held and the left stick pushed: someone using it. */
function busyPad(): Gamepad {
  const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: i === PAD.r2, touched: i === PAD.r2, value: i === PAD.r2 ? 1 : 0 }));
  return { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', connected: true, buttons, axes: [-1, 0.57, 0, 0] } as unknown as Gamepad;
}

function page(focused: boolean, hidden = false): void {
  vi.stubGlobal('navigator', { getGamepads: () => [busyPad()] });
  vi.stubGlobal('document', { hasFocus: () => focused, hidden, visibilityState: hidden ? 'hidden' : 'visible' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading the controller', () => {
  it('reads the pad while the game has the focus', () => {
    page(true);
    const pad = readPad();
    expect(pad?.pressed[PAD.r2]).toBe(true);
    expect(pad?.leftStick[0]).toBe(-1);
  });

  // Ticket 77: the browser hands every page the controller, focused or not, so a pad used in
  // another window (another game, or a person at the PC while a scripted match runs) fired
  // and walked the idle player here.
  it('ignores the pad while another window has the focus', () => {
    page(false);
    expect(readPad()).toBeNull();
  });

  it('ignores the pad while the game is hidden', () => {
    page(true, true);
    expect(readPad()).toBeNull();
  });
});
