import { DEG } from '../math';
import { hashString, noise } from '../random';

/**
 * A bot's personality: how fast it reacts, how well it aims and how it
 * plays. Every bot is a moderate player; each one is a little different, so
 * a lobby of them doesn't feel like copies of one.
 */
export interface BotProfile {
  readonly name: string;
  /** Seconds from first seeing an enemy to starting to aim at them. */
  readonly reaction: number;
  /** Aim error (radians) on a fresh target; it settles toward a quarter of this. */
  readonly aimError: number;
  /** Fastest turn while fighting (radians per second). */
  readonly turnRate: number;
  /** How quickly it pulls the recoil back down, 0 to 1 (1 keeps up shot for shot). */
  readonly recoilControl: number;
  /** 0 to 1: how readily it pushes toward fights rather than holding angles. */
  readonly aggression: number;
  /** Chance a fight is aimed at the head rather than the chest. */
  readonly headshots: number;
}

/** Player-like names for bots (always shown with a BOT tag). */
export const BOT_NAMES: readonly string[] = [
  'Kestrel', 'Moss', 'Vandal', 'Pike', 'Juniper', 'Rook', 'Tango', 'Halcyon', 'Sable', 'Wren', 'Gristle', 'Comet',
  'Bramble', 'Flint', 'Mako', 'Ember', 'Quill', 'Static', 'Nomad', 'Briar', 'Cinder', 'Lark', 'Onyx', 'Rusty',
];

/** The moderate bot's personality for `name`: the same name always plays the same way. */
export function botProfile(name: string): BotProfile {
  const seed = hashString(name);
  const r = (n: number) => noise(seed, n);
  return {
    name,
    reaction: 0.26 + 0.12 * r(1),
    aimError: (2.6 + 1.6 * r(2)) * DEG,
    turnRate: (230 + 90 * r(3)) * DEG,
    recoilControl: 0.55 + 0.25 * r(4),
    aggression: 0.25 + 0.6 * r(5),
    headshots: 0.12 + 0.15 * r(6),
  };
}

/** A name from {@link BOT_NAMES} that nobody in `taken` has, picked by `seed`; numbered once they run out. */
export function botName(taken: ReadonlySet<string>, seed: number): string {
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  if (free.length) return free[Math.floor(noise(seed, 7) * free.length)]!;
  for (let i = 2; ; i++) {
    const n = `${BOT_NAMES[seed % BOT_NAMES.length]}${i}`;
    if (!taken.has(n)) return n;
  }
}
