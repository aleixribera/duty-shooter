import { Fn, abs, cameraPosition, clamp, distance, dot, float, floor, fract, log2, max, min, mix, normalize, normalWorld, positionWorld, select, sin, smoothstep, step, vec2, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { atlasAt } from './surface-tiles';

type N3 = Node<'vec3'>;

/** The rooms behind a window (m), and how far in the furniture stands. */
const WIDE = 3.6;
const HIGH = 3;
const DEEP = 3.4;
const CARD = 1.6;
/** Rooms in the picture (tools/textures/tiles.mjs): their back walls along its top half, their furniture along its bottom half. */
const ROOMS = 4;
/** The share of rooms with their light on, and how bright a room is either way. */
const DARK_ROOMS = 0.3;
const LIT = 1.5;
const DIM = 0.22;
const FLOOR_COLOUR = [0.09, 0.05, 0.03] as const;
const CEILING_COLOUR = [0.62, 0.58, 0.5] as const;
const LAMP_COLOUR = [1, 0.8, 0.56] as const;
const DAYLIGHT = [0.09, 0.1, 0.12] as const;

const tiny = 1e-4;

/**
 * What a window looks into, worked out here per pixel rather than built: the
 * eye's ray runs on through the pane into a box of a room and reads what it
 * hits, so the room shifts properly as you walk by and costs only the pixels of
 * the window. It needs nothing but the pane's plane, so faces and merged models
 * wear it alike. Rooms lie in a grid along the wall, which picks each one's
 * look and whether its light is on; a wall of that grid can fall behind a
 * window, as a wall between rooms would.
 */
export function roomColor(): N3 {
  return Fn(() => {
    const n = (normalWorld as unknown as N3).toVar();
    const side = normalize(vec3(n.z, 0, n.x.negate()).add(vec3(tiny, 0, 0))).toVar();
    const ray = normalize(positionWorld.sub(cameraPosition)).toVar();
    // The ray in the room's terms: across, up and into it.
    const l = vec3(dot(ray, side), ray.y, max(dot(ray, n).negate(), float(0.02))).toVar();
    const along = vec2(dot(positionWorld, side).div(WIDE), positionWorld.y.div(HIGH)).toVar();
    const cell = floor(along).toVar();
    const u = fract(along).toVar();
    const seed = fract(sin(dot(vec3(cell, floor(dot(positionWorld, n).mul(0.7))), vec3(12.9898, 78.233, 37.719))).mul(43758.5453)).toVar();
    const lightSeed = fract(seed.mul(17.13)).toVar();
    const room = floor(seed.mul(ROOMS)).toVar();
    const tx = select(l.x.greaterThanEqual(0), float(1).sub(u.x), u.x).mul(WIDE).div(max(abs(l.x), float(tiny))).toVar();
    const ty = select(l.y.greaterThanEqual(0), float(1).sub(u.y), u.y).mul(HIGH).div(max(abs(l.y), float(tiny))).toVar();
    const tz = float(DEEP).div(l.z).toVar();
    const t = min(min(tx, ty), tz).toVar();
    const hit = vec3(u.x.mul(WIDE).add(l.x.mul(t)), u.y.mul(HIGH).add(l.y.mul(t)), l.z.mul(t)).toVar();
    const blur = clamp(log2(distance(positionWorld, cameraPosition).mul(0.1)), float(1), float(3)).toVar();
    const back = step(tz, min(tx, ty));
    const level = step(ty, min(tx, tz)).mul(float(1).sub(back));
    // The side walls take the picture's edge, which is plain wall down to the skirting.
    const wallX = clamp(mix(float(0.02), hit.x.div(WIDE), back), float(0.01), float(0.99));
    const wall = atlasAt('rooms', vec2(room.add(wallX).div(ROOMS), float(1).sub(clamp(hit.y.div(HIGH), float(0.01), float(0.99))).mul(0.5)) as never, blur).rgb.toVar();
    const flat = mix(vec3(...FLOOR_COLOUR), vec3(...CEILING_COLOUR), step(float(0), l.y));
    const surface = mix(wall.mul(wall), flat, level).toVar();
    // The furniture stands on a card partway in, so it slides against the wall behind it.
    const tc = float(CARD).div(l.z).toVar();
    const cx = u.x.add(l.x.mul(tc).div(WIDE)).toVar();
    const cy = u.y.add(l.y.mul(tc).div(HIGH)).toVar();
    const card = atlasAt('rooms', vec2(room.add(clamp(cx, float(0.01), float(0.99))).div(ROOMS), float(1).sub(clamp(cy, float(0.01), float(0.99))).mul(0.5).add(0.5)) as never, blur).rgb.toVar();
    const solid = smoothstep(float(0.03), float(0.1), max(max(card.x, card.y), card.z));
    const inside = step(float(0), cx).mul(step(cx, float(1))).mul(step(float(0), cy)).mul(step(cy, float(1))).mul(step(tc, t));
    const seen = mix(surface, card.mul(card), solid.mul(inside));
    // A lamp hung in the middle of the room, and what daylight gets in by the window.
    const off = vec3(hit.x.sub(WIDE / 2), hit.y.sub(HIGH - 0.3), hit.z.sub(DEEP * 0.55)).toVar();
    const lamp = float(1).div(float(1).add(dot(off, off).mul(0.22)));
    const on = mix(float(DIM), float(LIT), step(float(DARK_ROOMS), lightSeed));
    const window = float(1).sub(hit.z.div(DEEP).mul(0.7));
    return seen.mul(vec3(...LAMP_COLOUR).mul(lamp).mul(on).add(vec3(...DAYLIGHT).mul(window)));
  })() as unknown as N3;
}
