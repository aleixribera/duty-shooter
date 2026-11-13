/** How far an edge marker keeps from the screen's edges (px). */
const MARGIN = 32;
/** How wide each Bottom bar's corner is at most (px): health on the left, ammo on the right. */
const CORNER = 340;

/**
 * The ground the touch controls stand on (px, from the corner each is in; see TOUCH_CSS in
 * touch/controls.ts): the stick's lower left, the fire cluster's lower right, the column of
 * Pause, scoreboard and map at the top left, Ping at the top right, and the strip along the
 * bottom where the health and the ammo stand between the thumbs.
 */
export const TOUCH_GROUND = {
  stick: { width: 200, height: 190 },
  cluster: { width: 252, height: 232 },
  menu: { width: 104, height: 176 },
  ping: { width: 104, height: 92 },
  plates: 76,
} as const;

/** A marker moved off the touch controls: up over the stick, the cluster and the plates, and in from the corner buttons. */
function pinTouch(px: number, py: number, width: number, height: number): { x: number; y: number } {
  const g = TOUCH_GROUND;
  let x = px;
  let y = Math.min(py, height - g.plates);
  if (x >= width - g.cluster.width) y = Math.min(y, height - g.cluster.height);
  else if (x <= g.stick.width) y = Math.min(y, height - g.stick.height);
  x = offTouchCorners(x, y, width);
  return { x, y };
}

/** A point moved in from the touch buttons in the top corners: Pause and the scoreboard on the left, Ping on the right. */
export function offTouchCorners(x: number, y: number, width: number): number {
  const g = TOUCH_GROUND;
  if (y <= g.menu.height && x < g.menu.width) return g.menu.width;
  if (y <= g.ping.height && x > width - g.ping.width) return width - g.ping.width;
  return x;
}

/** How tall the Bottom bars' corners are (px); on a narrow screen the ping sits over the health too. */
export function cornerHeight(width: number): number {
  return width <= 960 ? 148 : 124;
}

/**
 * Where a world marker goes on screen (the point its bottom sits on), from its projected
 * position in pixels. Behind the camera the projection mirrors, so `x` comes in already
 * flipped and the marker pins to the bottom edge. It stays on screen, and out of the Bottom
 * bars' corners: low and to a side, it sits just over them instead (ticket 50). With the
 * touch controls on the glass (`touch`), it keeps off the ground they stand on instead.
 */
export function pinMarker(x: number, y: number, behind: boolean, width: number, height: number, touch = false): { x: number; y: number } {
  const px = Math.min(width - MARGIN, Math.max(MARGIN, x));
  let py = behind ? height - MARGIN : y;
  py = Math.min(height - MARGIN, Math.max(MARGIN + 24, py));
  if (touch) return pinTouch(px, py, width, height);
  const corner = Math.min(CORNER, width / 2);
  const top = height - cornerHeight(width);
  if (py > top && (px <= corner || px >= width - corner)) py = top;
  return { x: px, y: py };
}

/**
 * How much room one objective marker takes (px): its 26 px letter box over its distance, and a little air. The
 * marker's point is the bottom of its distance, centred (see `.ds-marker` in hud.ts).
 */
export const MARKER_ROOM = { width: 44, height: 50 } as const;

/**
 * The objective markers (Outposts' zones, Charge's sites) moved apart where they would cover each other. Pinned
 * to the screen's edge, two zones off to one side landed on the same spot, one letter and distance printed over
 * the other (review 2026-11-13b, Switchyard's B over A). A marker that would cover one already placed stands right
 * above it instead, still over its own side of the screen; where that would run off the top, right below it. They
 * are placed in the order given, so pass them in a fixed order (by letter) and none swaps places from frame to frame.
 */
export function spreadMarkers<T extends { readonly x: number; readonly y: number }>(marks: readonly T[]): T[] {
  const { width, height } = MARKER_ROOM;
  const top = MARGIN + 24;
  const placed: T[] = [];
  const clash = (x: number, y: number) => placed.find((p) => Math.abs(p.x - x) < width && Math.abs(p.y - y) < height);
  // Each step clears one placed marker and only meets ones further along, so there are at most as many as are placed.
  const walk = (m: T, step: -1 | 1): number => {
    let y = m.y;
    for (let k = 0; k <= placed.length; k++) {
      const hit = clash(m.x, y);
      if (!hit) break;
      y = hit.y + step * height;
    }
    return y;
  };
  for (const m of marks) {
    let y = walk(m, -1);
    if (y < top) y = walk(m, 1);
    placed.push(y === m.y ? m : { ...m, y });
  }
  return placed;
}
