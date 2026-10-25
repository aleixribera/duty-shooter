/**
 * A 3D vector as a plain tuple, so simulation outputs stay serialisable and
 * comparable with deep equality.
 *
 * World convention: 1 unit = 1 metre, Y is up (matching Three.js), and a
 * player facing yaw 0 looks down -Z.
 */
export type Vec3 = readonly [x: number, y: number, z: number];

export const ZERO: Vec3 = [0, 0, 0];
