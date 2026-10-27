import { DEG } from '../math';
import { hashString, noise } from '../random';

/** How a bot likes to play. */
export type BotStyle = 'rusher' | 'flanker' | 'anchor' | 'roamer' | 'support';

export const BOT_STYLES: readonly BotStyle[] = ['rusher', 'flanker', 'anchor', 'roamer', 'support'];

/**
 * A bot's personality: how fast it reacts, how well it aims and how it
 * plays. Every bot is a moderate player with a style of its own (a rusher
 * closes in, an anchor holds angles, a support sticks with its team, ...),
 * and every number varies a little on top, so a lobby of them doesn't feel
 * like copies of one.
 */
export interface BotProfile {
  readonly name: string;
  readonly style: BotStyle;
  /** Seconds from first seeing an enemy to starting to aim at them. */
  readonly reaction: number;
  /** Aim error (radians) on a fresh target; it settles toward a wobble of `wobble` times this. */
  readonly aimError: number;
  /** The settled wobble, as a fraction of `aimError`, and its rate (rad/s). */
  readonly wobble: number;
  readonly wobbleRate: number;
  /** A steady habit of aiming a little high (+) or low (-), radians. */
  readonly aimBias: number;
  /** Chance a big turn onto a new target swings past it before settling back. */
  readonly overshoot: number;
  /** Seconds behind the target's real movement its aim follows (what the eye and hand take to catch up). */
  readonly perceptionLag: number;
  /** How much of that lag it makes up by following the target's motion, 0 to 1. */
  readonly tracking: number;
  /** Fastest turn while fighting (radians per second). */
  readonly turnRate: number;
  /** How quickly it pulls the recoil back down, 0 to 1 (1 keeps up shot for shot). */
  readonly recoilControl: number;
  /** 0 to 1: how readily it pushes toward fights and noise. */
  readonly aggression: number;
  /** Chance a fight is aimed at the head rather than the chest. */
  readonly headshots: number;
  /** Distance (m) it likes to fight from: it closes in when farther. */
  readonly fightRange: number;
  /** Beyond this range (m) it aims down sights. */
  readonly adsRange: number;
  /** Beyond this range (m) it fires in bursts; nearer, it holds the trigger. */
  readonly burstRange: number;
  /** Burst length scale (1 = about a third of a second). */
  readonly burst: number;
  /** Chance it crouches to shoot at range, or while holding an angle. */
  readonly crouch: number;
  /** Chance it stops to hold an angle at the end of a roam, and about how long (s) it holds. */
  readonly hold: number;
  readonly holdTime: number;
  /** Strafing in a fight: chance of standing still, and seconds per strafe. */
  readonly standStill: number;
  readonly strafeTime: number;
  /** Chance a tick of sprinting turns into a slide. */
  readonly slide: number;
  /** Chance a long leg is a tactical sprint. */
  readonly tacticalSprint: number;
  /** Reloads in a quiet moment below this many rounds. */
  readonly reloadBelow: number;
  /** How far (m) it likes to roam each leg. */
  readonly roam: number;
  /** Goal score near teammates: negative spreads out, positive sticks together. */
  readonly teamwork: number;
  /** Seconds it keeps chasing what it last saw or heard. */
  readonly chase: number;
  /** Chance a roaming goal follows a hunch about where an enemy is. */
  readonly hunch: number;
}

/** Player-like names for bots (always shown with a BOT tag). */
export const BOT_NAMES: readonly string[] = [
  'Kestrel', 'Moss', 'Vandal', 'Pike', 'Juniper', 'Rook', 'Tango', 'Halcyon', 'Sable', 'Wren', 'Gristle', 'Comet',
  'Bramble', 'Flint', 'Mako', 'Ember', 'Quill', 'Static', 'Nomad', 'Briar', 'Cinder', 'Lark', 'Onyx', 'Rusty',
];

type Tunable = Exclude<keyof BotProfile, 'name' | 'style'>;
type Range = readonly [number, number];

/** What every style starts from: each number is picked in its range. */
const COMMON: Readonly<Record<Tunable, Range>> = {
  reaction: [0.28, 0.48],
  aimError: [3 * DEG, 5 * DEG],
  wobble: [0.18, 0.34],
  wobbleRate: [1.1, 2.9],
  aimBias: [-0.6 * DEG, 0.6 * DEG],
  overshoot: [0.2, 0.6],
  perceptionLag: [0.12, 0.2],
  tracking: [0.75, 0.95],
  turnRate: [180 * DEG, 300 * DEG],
  recoilControl: [0.4, 0.75],
  aggression: [0.3, 0.7],
  headshots: [0.08, 0.24],
  fightRange: [10, 16],
  adsRange: [8, 11],
  burstRange: [20, 24],
  burst: [0.8, 1.2],
  crouch: [0.2, 0.35],
  hold: [0.2, 0.35],
  holdTime: [1.5, 4],
  standStill: [0.1, 0.2],
  strafeTime: [0.4, 1],
  slide: [0.002, 0.005],
  tacticalSprint: [0.15, 0.3],
  reloadBelow: [10, 14],
  roam: [20, 28],
  teamwork: [-14, -10],
  chase: [4, 6],
  hunch: [0.1, 0.2],
};

/** How each style differs from {@link COMMON}. */
const STYLES: Readonly<Record<BotStyle, Partial<Record<Tunable, Range>>>> = {
  // Closes in fast, sprints and slides, fires on the move, rarely waits.
  rusher: {
    reaction: [0.26, 0.38], aggression: [0.75, 0.95], fightRange: [5, 9], adsRange: [13, 18], burstRange: [24, 30], burst: [1, 1.4],
    crouch: [0.05, 0.15], hold: [0.02, 0.08], holdTime: [1, 2], standStill: [0.04, 0.1], strafeTime: [0.3, 0.6], slide: [0.006, 0.012],
    tacticalSprint: [0.4, 0.6], reloadBelow: [6, 10], roam: [26, 32], teamwork: [-14, -8], chase: [6, 8], hunch: [0.2, 0.25],
  },
  // Goes wide, away from the team, to come at fights from the side.
  flanker: {
    aggression: [0.5, 0.7], fightRange: [9, 14], adsRange: [9, 12], crouch: [0.15, 0.25], hold: [0.1, 0.2], holdTime: [1.5, 3],
    standStill: [0.1, 0.15], strafeTime: [0.5, 1], slide: [0.004, 0.007], tacticalSprint: [0.25, 0.4], reloadBelow: [10, 14],
    roam: [28, 36], teamwork: [-20, -14], chase: [5, 7], hunch: [0.15, 0.22],
  },
  // Holds angles crouched, fights from range, short careful bursts, gives up a chase early.
  anchor: {
    reaction: [0.3, 0.45], aggression: [0.1, 0.3], fightRange: [18, 26], adsRange: [6, 8], burstRange: [16, 20], burst: [0.7, 1],
    crouch: [0.45, 0.65], hold: [0.6, 0.8], holdTime: [3, 7], standStill: [0.3, 0.45], strafeTime: [0.6, 1.2], slide: [0, 0.001],
    tacticalSprint: [0, 0.1], reloadBelow: [14, 18], roam: [12, 18], teamwork: [-8, -4], chase: [2.5, 4], hunch: [0.1, 0.12],
  },
  // Covers the whole map in long loops.
  roamer: {
    aggression: [0.35, 0.6], fightRange: [11, 16], hold: [0.15, 0.3], holdTime: [1.5, 3.5], roam: [32, 40], chase: [4, 6], hunch: [0.12, 0.18],
  },
  // Stays near teammates and covers them.
  support: {
    aggression: [0.3, 0.5], fightRange: [12, 18], crouch: [0.3, 0.45], hold: [0.3, 0.45], holdTime: [2, 4], standStill: [0.15, 0.25],
    tacticalSprint: [0.1, 0.2], reloadBelow: [14, 18], roam: [16, 22], teamwork: [6, 12], chase: [4, 6], hunch: [0.1, 0.15],
  },
};

/** The moderate bot's personality for `name`: the same name always plays the same way. */
export function botProfile(name: string): BotProfile {
  const seed = hashString(name);
  // The listed names take the styles in turn, so any handful of them is a mix; other names by their hash.
  const listed = BOT_NAMES.indexOf(name);
  const style = BOT_STYLES[listed >= 0 ? listed % BOT_STYLES.length : Math.floor(noise(seed, 0) * BOT_STYLES.length)]!;
  const ranges = { ...COMMON, ...STYLES[style] };
  const keys = Object.keys(COMMON) as Tunable[];
  const values = Object.fromEntries(
    keys.map((k, i) => {
      const [lo, hi] = ranges[k];
      return [k, lo + (hi - lo) * noise(seed, i + 1)];
    }),
  ) as Record<Tunable, number>;
  return { name, style, ...values, reloadBelow: Math.round(values.reloadBelow) };
}

/** The style a listed name plays, or null for any other name. */
function listedStyle(name: string): BotStyle | null {
  const i = BOT_NAMES.indexOf(name);
  return i < 0 ? null : BOT_STYLES[i % BOT_STYLES.length]!;
}

/**
 * A name from {@link BOT_NAMES} that nobody in `taken` has, picked by `seed`
 * among those of the style fewest taken names play, so a lobby's bots are a
 * mix of styles; numbered once they run out.
 */
export function botName(taken: ReadonlySet<string>, seed: number): string {
  const used = (style: BotStyle) => [...taken].filter((n) => listedStyle(n) === style).length;
  const fewest = Math.min(...BOT_STYLES.map(used));
  const free = BOT_NAMES.filter((n) => !taken.has(n) && used(listedStyle(n)!) === fewest);
  if (free.length) return free[Math.floor(noise(seed, 7) * free.length)]!;
  for (let i = 2; ; i++) {
    const n = `${BOT_NAMES[seed % BOT_NAMES.length]}${i}`;
    if (!taken.has(n)) return n;
  }
}
