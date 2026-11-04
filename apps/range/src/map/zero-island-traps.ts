import type { SoundTrap, Terrain, TrapKind } from '@duty-shooter/fps-core';
import type { CoverKind } from './zero-island-cover';
import type { DressedPiece } from './zero-island-plants';
import { CORES, REGION_IDS, type RegionId } from './zero-island-terrain';

/**
 * Zero Island's sound traps (ticket 72): two or three a Region, each on
 * something that would really give a runner away. Birds roost in the Jungle's
 * and the Peaks' trees (and the Harbor's gulls on its sheds), sheet metal
 * rattles in the Dustlands' shacks and the city's and the Harbor's sheds and
 * wrecks, and loose gravel lies on the crater's rubble.
 */
const PLAN: Readonly<Record<RegionId, readonly TrapKind[]>> = {
  'ground-zero': ['gravel', 'gravel', 'gravel'],
  'the-dustlands': ['metal', 'metal', 'metal'],
  'frostbite-peaks': ['birds', 'birds', 'birds'],
  'mutant-jungle': ['birds', 'birds', 'birds'],
  'neon-city': ['metal', 'metal'],
  'rogue-harbor': ['metal', 'metal', 'birds'],
};

/** What each kind of trap stands on. */
const ON: Readonly<Record<TrapKind, readonly CoverKind[]>> = {
  birds: ['trunk'],
  metal: ['shed', 'wreck', 'container', 'wagon'],
  gravel: ['rock', 'block', 'wall', 'barrier'],
};

/** Traps of one Region stand at least this far (m) apart, so one run past sets off one. */
const APART = 30;
/** And no farther from its Core than this many of its radii: where people land and fight. */
const OUT = 2.5;
/** Birds call from up in the canopy; the rest from the ground. */
const UP: Readonly<Record<TrapKind, number>> = { birds: 6, metal: 1, gravel: 0.3 };

/** Every Region's traps, from the cover pass's pieces. */
export function soundTraps(terrain: Terrain, pieces: readonly DressedPiece[]): SoundTrap[] {
  const out: SoundTrap[] = [];
  for (const id of REGION_IDS) {
    const core = CORES[id];
    const taken: [number, number][] = [];
    for (const [i, kind] of PLAN[id].entries()) {
      const from = (x: number, z: number) => Math.hypot(x - core.x, z - core.z);
      const free = (x: number, z: number) => taken.every(([tx, tz]) => Math.hypot(x - tx, z - tz) >= APART);
      const spot =
        pieces
          .filter((p) => p.region === id && ON[kind].includes(p.kind) && from(p.x, p.z) <= core.radius * OUT && free(p.x, p.z))
          .sort((a, b) => from(a.x, a.z) - from(b.x, b.z))
          .map((p): [number, number] => [p.x, p.z])[0] ??
        // Nothing of the kind there: round the Core, a third of the way about for each.
        ([core.x + Math.cos((i * 2 * Math.PI) / 3) * core.radius * 0.6, core.z + Math.sin((i * 2 * Math.PI) / 3) * core.radius * 0.6] as [number, number]);
      taken.push(spot);
      const [x, z] = spot;
      out.push({ kind, position: [x, terrain.heightAt(x, z) + UP[kind], z] });
    }
  }
  return out;
}
