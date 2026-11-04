import type { Vec3 } from '../math';
import { box, type Solid, type World } from '../world';
import type { BattleRoyaleState } from './game-mode';

/**
 * A Battle Royale's crates and Beacons as solids (ticket 66): what stands on
 * the island once it is there, so a player walks round a crate and takes
 * cover behind a Beacon instead of passing through them. The server and each
 * client make the same ones from the same state, so prediction agrees.
 * Sizes are the Blender models' (tools/weapon/supply_drop.py, reboot_beacon.py).
 */

/** The crate on its skids: 1.2 m by 0.8 m, 0.77 m to the top of its lid. */
const CRATE: Vec3 = [0.6, 0.77, 0.4];
/** The Beacon's plate, 1.4 m square and 0.2 m high: a step anyone takes. */
const PLATE: Vec3 = [0.7, 0.2, 0.7];
/** Its cabinet on the plate, 0.7 m by 0.5 m, its top 1.16 m up. */
const CABINET: Vec3 = [0.35, 1.16, 0.25];

/** How far each goes on down into the ground, so on a slope nobody walks under the downhill edge of one standing on the slope's height at its centre. */
const BURY = 1;

const block = (at: Vec3, half: Vec3): Solid =>
  box({ min: [at[0] - half[0], at[1] - BURY, at[2] - half[2]], max: [at[0] + half[0], at[1] + half[1], at[2] + half[2]], material: 'metal' });

/** The solids a Battle Royale's state stands on the island at `time`: every Beacon, and each crate once it has landed. */
export function royaleProps(state: BattleRoyaleState | null, time: number): Solid[] {
  if (!state) return [];
  const out: Solid[] = [];
  for (const b of state.beacons ?? []) out.push(block(b.position, PLATE), block(b.position, CABINET));
  for (const d of state.drops ?? []) if (d.lands <= time) out.push(block(d.position, CRATE));
  return out;
}

/** A key that changes when the props do, so a world is told only then. */
export function propsKey(state: BattleRoyaleState | null, time: number): string {
  if (!state) return '';
  const landed = (state.drops ?? []).filter((d) => d.lands <= time).map((d) => d.position.join(','));
  return `${state.beacons?.[0]?.position.join(',') ?? ''}:${state.beacons?.length ?? 0}:${landed.join(';')}`;
}

/**
 * Where a body standing at `at` is put so it is clear of `solids`: out the
 * nearest side of the first it stands in, a hull's half width (`margin`) off
 * it; null when it is in none. `fits` is asked of each side, nearest first,
 * and may move it (onto the ground) or turn it down (inside a wall); with every
 * side turned down the body goes on top of the solid instead.
 */
export function clearOf(solids: readonly Solid[], at: Vec3, margin: number, height: number, fits: (at: Vec3) => Vec3 | null = (x) => x): Vec3 | null {
  for (const s of solids) {
    if (at[1] >= s.max[1] || at[1] + height <= s.min[1]) continue;
    if (at[0] <= s.min[0] - margin || at[0] >= s.max[0] + margin || at[2] <= s.min[2] - margin || at[2] >= s.max[2] + margin) continue;
    const ways: [number, Vec3][] = [
      [at[0] - (s.min[0] - margin), [s.min[0] - margin - 0.05, at[1], at[2]]],
      [s.max[0] + margin - at[0], [s.max[0] + margin + 0.05, at[1], at[2]]],
      [at[2] - (s.min[2] - margin), [at[0], at[1], s.min[2] - margin - 0.05]],
      [s.max[2] + margin - at[2], [at[0], at[1], s.max[2] + margin + 0.05]],
    ];
    ways.sort((a, b) => a[0] - b[0]);
    for (const [, way] of ways) {
      const fit = fits(way);
      if (fit) return fit;
    }
    const x = Math.min(Math.max(at[0], s.min[0]), s.max[0]);
    const z = Math.min(Math.max(at[2], s.min[2]), s.max[2]);
    return [x, s.max[1] + 0.02, z];
  }
  return null;
}

/** Stands `state`'s props in `world`, if they changed since `key` (the last call's answer); returns the new key. */
export function standProps(world: World, state: BattleRoyaleState | null, time: number, key: string): string {
  const now = propsKey(state, time);
  if (now !== key) world.props.set(royaleProps(state, time));
  return now;
}
