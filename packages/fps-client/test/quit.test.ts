import { describe, expect, it, vi } from 'vitest';
import { ARCADE_QUIT, quitGame, saveOnExit, type QuitWindow } from '../src/ui/quit';

/** A window on its own (`framed` false) or in a frame of the Arcade's, with what quitting did to it. */
function page(framed: boolean, closes = true) {
  const posted: [unknown, string][] = [];
  const went: string[] = [];
  const timers: (() => void)[] = [];
  const win = {
    parent: { postMessage: () => {} } as Pick<QuitWindow, 'postMessage'>,
    location: { origin: 'https://example.test', assign: (url: string) => went.push(url) },
    closed: false as boolean,
    close() {
      if (closes) this.closed = true;
    },
    setTimeout: (f: () => void) => timers.push(f),
    postMessage: () => {
      throw new Error('a window on its own posts nothing to itself');
    },
  } as { -readonly [K in keyof QuitWindow]: QuitWindow[K] };
  win.parent = framed ? { postMessage: (m: unknown, origin: string) => posted.push([m, origin]) } : win;
  return { win, posted, went, later: () => timers.forEach((f) => f()) };
}

describe('Quit', () => {
  it('saves, then asks the Arcade around the frame to close the game, on its own origin only', () => {
    const p = page(true);
    const order: string[] = [];
    const close = vi.spyOn(p.win, 'close');
    quitGame(() => order.push('save'), p.win);
    expect(order).toEqual(['save']);
    expect(p.posted).toEqual([[ARCADE_QUIT, 'https://example.test']]);
    expect(ARCADE_QUIT).toEqual({ type: 'arcade:quit' });
    expect(close).not.toHaveBeenCalled();
  });

  it('closes a window of its own (the Windows app quits with it)', () => {
    const p = page(false);
    quitGame(() => {}, p.win);
    p.later();
    expect(p.win.closed).toBe(true);
    expect(p.went).toEqual([]);
  });

  // A tab the page didn't open itself can't be closed by it.
  it('goes to the front page when the window will not close', () => {
    const p = page(false, false);
    quitGame(() => {}, p.win);
    expect(p.went).toEqual([]);
    p.later();
    expect(p.went).toEqual(['/']);
  });

  it('still quits when saving throws', () => {
    const p = page(true);
    quitGame(() => {
      throw new Error('storage gone');
    }, p.win);
    expect(p.posted).toHaveLength(1);
  });
});

describe('saving as the page goes', () => {
  it('saves when the page is hidden or torn down, not when it shows again', () => {
    const on = new Map<string, () => void>();
    const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: (t: string, f: () => void) => on.set(t, f) };
    const target = { addEventListener: (t: string, f: () => void) => on.set(t, f) };
    const save = vi.fn();
    saveOnExit(save, target as unknown as Window, doc as unknown as Document);
    on.get('visibilitychange')!();
    expect(save).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    on.get('visibilitychange')!();
    on.get('pagehide')!();
    expect(save).toHaveBeenCalledTimes(2);
  });
});
