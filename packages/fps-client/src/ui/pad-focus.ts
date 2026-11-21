/** Where the d-pad moves the focus on a page laid out in rows and grids. */
export type PadDirection = 'up' | 'down' | 'left' | 'right';

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

interface Boxed {
  getBoundingClientRect(): Box;
}

const empty = (b: Box) => b.right - b.left === 0 && b.bottom - b.top === 0;

/**
 * The control the d-pad lands on from `current` going `dir`: the nearest one that way on screen, so a grid
 * (the loadout's guns and attachments, the lobby's maps) moves the way it looks. Up and down come round from the
 * far end when nothing lies that way; left and right stay put. Before anything is focused it lands on the first
 * control; without a layout to measure it walks the list in order.
 *
 * `area` names the scrolling box a control sits in (null outside any). Inside one, the move stays in it while
 * anything lies that way, so a footer drawn over the list (Done) is not taken for the next row; from outside,
 * a control scrolled out of its box's view is not a target.
 */
export function padMove<T extends Boxed>(items: readonly T[], current: T | undefined, dir: PadDirection, area: (item: T) => Boxed | null = () => null): T | undefined {
  if (items.length === 0) return undefined;
  const at = current ? items.indexOf(current) : -1;
  const forward = dir === 'down' || dir === 'right';
  // Nothing focused yet: the first control, the screen's main action.
  if (at < 0) return items[0];
  const self = items[at]!;
  const from = self.getBoundingClientRect();
  if (empty(from)) return items[(at + (forward ? 1 : items.length - 1)) % items.length];
  const here = area(self);
  const others = items.filter((item) => item !== self);
  const inView = (item: T) => {
    const box = area(item);
    if (!box) return true;
    const b = box.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    return r.bottom > b.top && r.top < b.bottom;
  };
  const best = here
    ? (nearest(from, others.filter((item) => area(item) === here), dir) ?? nearest(from, others.filter((item) => area(item) === here || inView(item)), dir))
    : nearest(from, others.filter(inView), dir);
  if (best) return best;
  if (dir === 'left' || dir === 'right') return self;
  // Nothing that way: round to the far end, the first control going down, the last going up.
  return items[forward ? 0 : items.length - 1];
}

/** Of `pool`, the one nearest `from` going `dir`, or undefined when none lies that way. */
function nearest<T extends Boxed>(from: Box, pool: readonly T[], dir: PadDirection): T | undefined {
  const vertical = dir === 'up' || dir === 'down';
  const sign = dir === 'down' || dir === 'right' ? 1 : -1;
  // One in line with this control (overlapping it across the move) wins over any off to the side: the column stays.
  let inLine: T | undefined;
  let inLineScore = Infinity;
  let best: T | undefined;
  let bestScore = Infinity;
  for (const item of pool) {
    const to = item.getBoundingClientRect();
    if (empty(to)) continue;
    // How far it lies that way, edge to edge (a little overlap still counts as that way), and how far off to the side.
    const ahead = vertical ? (sign > 0 ? to.top - from.bottom : from.top - to.bottom) : sign > 0 ? to.left - from.right : from.left - to.right;
    const centre = vertical ? (to.top + to.bottom - from.top - from.bottom) / 2 : (to.left + to.right - from.left - from.right) / 2;
    if (ahead < -4 || centre * sign <= 0) continue;
    const side = vertical ? Math.max(0, to.left - from.right, from.left - to.right) : Math.max(0, to.top - from.bottom, from.top - to.bottom);
    // Of a row under a wide control, the one lined up with its leading edge (the row's first).
    const align = vertical ? Math.abs(to.left - from.left) : Math.abs(to.top - from.top);
    const score = Math.max(0, ahead) + side + align * 0.1;
    if (side === 0 && score < inLineScore) {
      inLineScore = score;
      inLine = item;
    }
    // Nothing in line: the nearest, as far to the side counting as far ahead, so a row wrapped onto a line of its own
    // (Quit under Loadout on a phone) is reached from its far end before what lies further down.
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return inLine ?? best;
}

/** The scrolling box an element sits in (its nearest ancestor that scrolls), or null: the `area` for {@link padMove}. */
export function scrollArea(el: Element): Element | null {
  for (let e = el.parentElement; e; e = e.parentElement) {
    const y = getComputedStyle(e).overflowY;
    if ((y === 'auto' || y === 'scroll') && e.scrollHeight > e.clientHeight) return e;
  }
  return null;
}
