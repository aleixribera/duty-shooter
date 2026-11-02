/** How far an edge marker keeps from the screen's edges (px). */
const MARGIN = 32;
/** How wide each Bottom bar's corner is at most (px): health on the left, ammo on the right. */
const CORNER = 340;

/** How tall the Bottom bars' corners are (px); on a narrow screen the ping sits over the health too. */
export function cornerHeight(width: number): number {
  return width <= 960 ? 148 : 124;
}

/**
 * Where a world marker goes on screen (the point its bottom sits on), from its projected
 * position in pixels. Behind the camera the projection mirrors, so `x` comes in already
 * flipped and the marker pins to the bottom edge. It stays on screen, and out of the Bottom
 * bars' corners: low and to a side, it sits just over them instead (ticket 50).
 */
export function pinMarker(x: number, y: number, behind: boolean, width: number, height: number): { x: number; y: number } {
  const px = Math.min(width - MARGIN, Math.max(MARGIN, x));
  let py = behind ? height - MARGIN : y;
  py = Math.min(height - MARGIN, Math.max(MARGIN + 24, py));
  const corner = Math.min(CORNER, width / 2);
  const top = height - cornerHeight(width);
  if (py > top && (px <= corner || px >= width - corner)) py = top;
  return { x: px, y: py };
}
