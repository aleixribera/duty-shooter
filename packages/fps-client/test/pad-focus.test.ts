import { describe, expect, it } from 'vitest';
import { padMove } from '../src/ui/pad-focus';

/** A control at column `x`, row `y` of a grid of 100 × 40 cells with 10 px gaps. */
const cell = (name: string, x: number, y: number, w = 1) => ({
  name,
  getBoundingClientRect: () => ({ left: x * 110, right: x * 110 + w * 100 + (w - 1) * 10, top: y * 50, bottom: y * 50 + 40 }),
});

describe('moving the focus with the d-pad', () => {
  // The loadout: four guns a row, a shorter row under them, then Done at the foot.
  const guns = [cell('m4', 0, 0), cell('wasp', 1, 0), cell('harrow', 2, 0), cell('ridge', 3, 0), cell('bulwark', 0, 1), cell('vantage', 1, 1)];
  const done = cell('done', 0, 3);
  const all = [...guns, done];
  const at = (n: string) => all.find((c) => c.name === n);

  it('goes to the control under, over or beside, as the grid looks', () => {
    expect(padMove(all, at('m4'), 'down')?.name).toBe('bulwark');
    expect(padMove(all, at('m4'), 'right')?.name).toBe('wasp');
    expect(padMove(all, at('vantage'), 'up')?.name).toBe('wasp');
    expect(padMove(all, at('vantage'), 'left')?.name).toBe('bulwark');
    // A shorter row under: the nearest control that way.
    expect(padMove(all, at('ridge'), 'down')?.name).toBe('vantage');
  });

  it('comes round from the far end up and down, and stays put left and right at an edge', () => {
    expect(padMove(all, at('done'), 'down')?.name).toBe('m4');
    expect(padMove(all, at('m4'), 'up')?.name).toBe('done');
    expect(padMove(all, at('m4'), 'left')?.name).toBe('m4');
  });

  it('starts on the first control, and walks the list where nothing is laid out', () => {
    expect(padMove(all, undefined, 'up')?.name).toBe('m4');
    const flat = ['a', 'b', 'c'].map((name) => ({ name, getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) }));
    expect(padMove(flat, flat[1], 'down')?.name).toBe('c');
    expect(padMove(flat, flat[0], 'up')?.name).toBe('c');
  });

  // The main menu: wide plates over a row of small links; down from the last plate lands on the row's first.
  it('from a wide control, lands on the row under it at its leading edge', () => {
    const plate = { name: 'practice', getBoundingClientRect: () => ({ left: 56, right: 736, top: 819, bottom: 938 }) };
    const links = ['loadout', 'profile', 'settings'].map((name, i) => ({ name, getBoundingClientRect: () => ({ left: 68 + i * 120, right: 180 + i * 120, top: 956, bottom: 1000 }) }));
    expect(padMove([plate, ...links], plate, 'down')?.name).toBe('loadout');
  });

  // The loadout on a phone: the list scrolls under a Done footer drawn over it.
  it('keeps to the scrolling list while it goes on, and skips what is scrolled out of view from outside it', () => {
    const list = { getBoundingClientRect: () => ({ left: 0, right: 390, top: 0, bottom: 600 }) };
    const row = (name: string, top: number) => ({ name, getBoundingClientRect: () => ({ left: 16, right: 374, top, bottom: top + 56 }) });
    const grip = row('grip', 500);
    // Scrolled past the list's foot, behind the footer's band: nearer Done than grip, but out of view.
    const camo = row('camo', 640);
    const footer = { name: 'done', getBoundingClientRect: () => ({ left: 16, right: 374, top: 774, bottom: 832 }) };
    const items = [grip, camo, footer];
    const area = (i: (typeof items)[number]) => (i === footer ? null : list);
    // Inside the list, the next row is the next row, even past its foot.
    expect(padMove(items, grip, 'down', area)?.name).toBe('camo');
    // From Done, up is the last row in view.
    expect(padMove(items, footer, 'up', area)?.name).toBe('grip');
    // The list's last row goes on down to Done.
    expect(padMove(items, camo, 'down', area)?.name).toBe('done');
  });
});
