import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAD, PAD_KEPT_IN_PLAY, PAD_LAYOUTS, PadMenuReader, padActuator, readPad, type PadReading } from '../src/gamepad';

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

  // The Arcade runs the game in a same-origin frame and keeps the focus on its own page until the frame is clicked.
  it('reads the pad in a frame while the page around it has the focus, not while another window has it', () => {
    page(false);
    const top = { document: { hasFocus: () => true } };
    vi.stubGlobal('window', { top });
    expect(readPad()?.pressed[PAD.r2]).toBe(true);
    top.document.hasFocus = () => false;
    expect(readPad()).toBeNull();
  });

  it('ignores the pad in an unfocused frame of another origin, whose page it cannot ask', () => {
    page(false);
    vi.stubGlobal('window', { top: { get document(): never { throw new DOMException('Blocked a frame', 'SecurityError'); } } });
    expect(readPad()).toBeNull();
  });

  it('ignores the pad while the game is hidden', () => {
    page(true, true);
    expect(readPad()).toBeNull();
  });
});

describe('the pad layouts', () => {
  // Ticket 20's tactical first went on d-pad left, which play keeps for the mode vote: it could never be thrown from a pad.
  it('bind every action to a button play hands on, each to its own', () => {
    for (const [name, layout] of Object.entries(PAD_LAYOUTS)) {
      const buttons = Object.values(layout).map((b) => PAD[b]);
      expect(buttons.filter((b) => PAD_KEPT_IN_PLAY.includes(b)), name).toEqual([]);
      expect(new Set(buttons).size, name).toBe(buttons.length);
    }
  });
});

/** A pad at `index` with `pressed` buttons down and the given axes. */
function padAt(index: number, id: string, pressed: readonly number[] = [], axes: readonly number[] = [0, 0, 0, 0]): Gamepad {
  const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 }));
  return { id, index, connected: true, buttons, axes: [...axes], vibrationActuator: { playEffect: () => Promise.resolve('complete'), id } } as unknown as Gamepad;
}

describe('more than one pad', () => {
  const XBOX = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
  const DS4 = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  let pads: (Gamepad | null)[] = [];
  const connect = (...p: (Gamepad | null)[]) => {
    pads = p;
    vi.stubGlobal('navigator', { getGamepads: () => pads });
    vi.stubGlobal('document', { hasFocus: () => true, hidden: false });
  };

  // Steam adds a virtual Xbox pad beside the real DualShock, often ahead of it: reading only the first read an idle pad.
  it('follows the pad that was pressed, not the first connected', () => {
    connect(padAt(0, XBOX), padAt(1, DS4));
    readPad();
    connect(padAt(0, XBOX), padAt(1, DS4, [PAD.cross]));
    expect(readPad()?.id).toBe(DS4);
    expect(readPad()?.pressed[PAD.cross]).toBe(true);
    // Let go, it stays the pad in use.
    connect(padAt(0, XBOX), padAt(1, DS4));
    expect(readPad()?.id).toBe(DS4);
    expect((padActuator() as unknown as { id: string }).id).toBe(DS4);
  });

  it('follows a stick pushed on another pad, and back', () => {
    connect(padAt(0, XBOX), padAt(1, DS4, [PAD.cross]));
    expect(readPad()?.id).toBe(DS4);
    connect(padAt(0, XBOX, [], [0, -1, 0, 0]), padAt(1, DS4, [PAD.cross]));
    expect(readPad()?.id).toBe(XBOX);
    connect(padAt(0, XBOX), padAt(1, DS4, [PAD.r2]));
    expect(readPad()?.id).toBe(DS4);
  });

  // A virtual pad that mirrors the real one is used at the same moments: the one in use keeps the reading, no flip-flop.
  it('keeps the pad in use while a mirror of it is used too', () => {
    connect(padAt(0, XBOX), padAt(1, DS4, [PAD.square]));
    expect(readPad()?.id).toBe(DS4);
    connect(padAt(0, XBOX, [PAD.cross]), padAt(1, DS4, [PAD.square, PAD.cross]));
    expect(readPad()?.id).toBe(DS4);
  });

  // A drifting or resting axis is a level, not a use: only a push as it starts counts, so it cannot take the pad back.
  it('a stick held still on another pad does not take over', () => {
    connect(padAt(0, XBOX, [], [0.8, 0, 0, 0]));
    expect(readPad()?.id).toBe(XBOX);
    connect(padAt(0, XBOX, [], [0.8, 0, 0, 0]), padAt(1, DS4, [PAD.cross]));
    expect(readPad()?.id).toBe(DS4);
    connect(padAt(0, XBOX, [], [0.8, 0, 0, 0]), padAt(1, DS4));
    expect(readPad()?.id).toBe(DS4);
  });

  // A raw driver's pad (no standard layout, triggers resting at -1) beside a standard one is never read.
  it('reads a pad without the standard layout only when no standard one is connected', () => {
    const standard = (p: Gamepad) => Object.assign(p, { mapping: 'standard' });
    const raw = padAt(1, 'raw', [PAD.cross], [0, 0, 0, 0, -1, -1]);
    connect(standard(padAt(0, DS4)), raw);
    expect(readPad()?.id).toBe(DS4);
    connect(raw);
    expect(readPad()?.id).toBe('raw');
  });

  it('moves to a pad still connected when the one in use goes', () => {
    connect(padAt(0, XBOX), padAt(1, DS4, [PAD.cross]));
    expect(readPad()?.id).toBe(DS4);
    connect(padAt(0, XBOX), null);
    expect(readPad()?.id).toBe(XBOX);
    connect();
    expect(readPad()).toBeNull();
  });
});

describe('menu moves from the pad', () => {
  const reading = (pressed: readonly number[], leftStick: [number, number] = [0, 0]): PadReading => ({
    id: 'pad',
    pressed: Array.from({ length: 18 }, (_, i) => pressed.includes(i)),
    leftStick,
    rightStick: [0, 0],
  });

  it('reads each face and shoulder button as one press', () => {
    const r = new PadMenuReader();
    const down = reading([PAD.cross, PAD.circle, PAD.square, PAD.triangle, PAD.l1, PAD.r1, PAD.options]);
    expect(r.read(down, 0, []).sort()).toEqual(['accept', 'alt', 'back', 'erase', 'next', 'prev', 'start']);
    // Held, they don't press again.
    expect(r.read(down, 16, down.pressed)).toEqual([]);
  });

  it('repeats a held direction after a pause, from the d-pad or the stick', () => {
    const r = new PadMenuReader();
    expect(r.read(reading([PAD.down]), 0, [])).toEqual(['down']);
    expect(r.read(reading([PAD.down]), 300, [])).toEqual([]);
    expect(r.read(reading([PAD.down]), 450, [])).toEqual(['down']);
    expect(r.read(reading([], [0, 0]), 500, [])).toEqual([]);
    expect(r.read(reading([], [-0.9, 0]), 520, [])).toEqual(['left']);
  });
});
