/**
 * Whether a large map is drawn with its distance detail (ticket 10): soldiers by
 * level, the far ground in blocks, the far surfaces with their big solids alone.
 * Off (`?lod=off`) only to measure what that detail saves; read as each view is built.
 */
let distanceDetail = true;

export function useDistanceDetail(on: boolean): void {
  distanceDetail = on;
}

export function hasDistanceDetail(): boolean {
  return distanceDetail;
}
