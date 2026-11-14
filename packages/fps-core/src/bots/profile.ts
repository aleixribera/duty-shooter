import { DEG } from '../math';
import { hashString, noise } from '../random';
import { STATS, type WeaponId } from '../stats';
import type { Loadout, PerkId, TacticalId } from '../weapon/loadout';
import type { DropHolds } from '../modes/supply-drops';

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
  /** What it carries: a primary picked by its style's weights, the pistol (or, for about one in three, the revolver), a frag, and its style's tactical and perk. */
  readonly loadout: Loadout;
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

type Tunable = Exclude<keyof BotProfile, 'name' | 'style' | 'loadout'>;
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
    reloadBelow: [6, 10], roam: [26, 32], teamwork: [-14, -8], chase: [6, 8], hunch: [0.2, 0.25],
  },
  // Goes wide, away from the team, to come at fights from the side.
  flanker: {
    aggression: [0.5, 0.7], fightRange: [9, 14], adsRange: [9, 12], crouch: [0.15, 0.25], hold: [0.1, 0.2], holdTime: [1.5, 3],
    standStill: [0.1, 0.15], strafeTime: [0.5, 1], slide: [0.004, 0.007], reloadBelow: [10, 14],
    roam: [28, 36], teamwork: [-20, -14], chase: [5, 7], hunch: [0.15, 0.22],
  },
  // Holds angles crouched, fights from range, short careful bursts, gives up a chase early.
  anchor: {
    reaction: [0.3, 0.45], aggression: [0.1, 0.3], fightRange: [18, 26], adsRange: [6, 8], burstRange: [16, 20], burst: [0.7, 1],
    crouch: [0.45, 0.65], hold: [0.6, 0.8], holdTime: [3, 7], standStill: [0.3, 0.45], strafeTime: [0.6, 1.2], slide: [0, 0.001],
    reloadBelow: [14, 18], roam: [12, 18], teamwork: [-8, -4], chase: [2.5, 4], hunch: [0.1, 0.12],
  },
  // Covers the whole map in long loops.
  roamer: {
    aggression: [0.35, 0.6], fightRange: [11, 16], hold: [0.15, 0.3], holdTime: [1.5, 3.5], roam: [32, 40], chase: [4, 6], hunch: [0.12, 0.18],
  },
  // Stays near teammates and covers them.
  support: {
    aggression: [0.3, 0.5], fightRange: [12, 18], crouch: [0.3, 0.45], hold: [0.3, 0.45], holdTime: [2, 4], standStill: [0.15, 0.25],
    reloadBelow: [14, 18], roam: [16, 22], teamwork: [6, 12], chase: [4, 6], hunch: [0.1, 0.15],
  },
};

/**
 * How likely each style is to carry each primary: a rusher always brings
 * something for close range, an anchor mostly something that holds a lane
 * (the sniper, the machine gun, the marksman rifle), a support the machine
 * gun more than anyone, and the burst rifle goes to those who fight from the
 * middle.
 */
const PRIMARY_WEIGHTS: Readonly<Record<BotStyle, Readonly<Partial<Record<WeaponId, number>>>>> = {
  rusher: { smg: 5, shotgun: 4 },
  flanker: { smg: 4, m4a1: 3, burst: 2, shotgun: 2, sniper: 1 },
  anchor: { sniper: 4, m4a1: 3, lmg: 3, dmr: 3, smg: 1 },
  roamer: { m4a1: 4, burst: 3, smg: 3, dmr: 2, sniper: 1, shotgun: 1 },
  support: { m4a1: 5, burst: 2, lmg: 3, smg: 1, dmr: 1, sniper: 1 },
};

/** The share of bots that carry the revolver instead of the pistol. */
const REVOLVER_SHARE = 0.35;

/** A primary for `style`, picked by its weights with `roll` (0 to 1), leaving out `not`. */
function pickPrimary(style: BotStyle, roll: number, not?: WeaponId): WeaponId {
  const weights = (Object.entries(PRIMARY_WEIGHTS[style]) as [WeaponId, number][]).filter(([id]) => id !== not);
  let left = roll * weights.reduce((n, [, w]) => n + w, 0);
  for (const [id, w] of weights) {
    left -= w;
    if (left < 0) return id;
  }
  return weights.at(-1)![0];
}

/**
 * The noise slot of each tunable, in COMMON's order. The slot after slide's
 * was tactical sprint's, now gone: it stays retired so every other trait
 * draws as it did and each name keeps its character.
 */
const RETIRED_SLOT = Object.keys(COMMON).indexOf('slide') + 2;
const slotOf = (i: number) => (i + 1 < RETIRED_SLOT ? i + 1 : i + 2);

/** The moderate bot's personality for `name`: the same name always plays the same way. */
/**
 * What each style carries beside its guns (ticket 20): the ones who go in
 * first throw a flash ahead of them, the ones who hold or roam a smoke to
 * get out under; the perk fits how each plays.
 */
const KIT: Readonly<Record<BotStyle, { readonly tactical: TacticalId; readonly perk: PerkId }>> = {
  rusher: { tactical: 'flash', perk: 'fastHands' },
  flanker: { tactical: 'flash', perk: 'softSoles' },
  anchor: { tactical: 'smoke', perk: 'blastVest' },
  roamer: { tactical: 'smoke', perk: 'softSoles' },
  support: { tactical: 'smoke', perk: 'blastVest' },
};

export function botProfile(name: string): BotProfile {
  const seed = hashString(name);
  // The listed names take the styles in turn, so any handful of them is a mix; other names by their hash.
  const style = listedStyle(name) ?? BOT_STYLES[Math.floor(noise(seed, 0) * BOT_STYLES.length)]!;
  const ranges = { ...COMMON, ...STYLES[style] };
  const keys = Object.keys(COMMON) as Tunable[];
  const values = Object.fromEntries(
    keys.map((k, i) => {
      const [lo, hi] = ranges[k];
      return [k, lo + (hi - lo) * noise(seed, slotOf(i))];
    }),
  ) as Record<Tunable, number>;
  const kit = KIT[style];
  // One in four takes the other tactical: a lobby of rushers isn't all flashes.
  const tactical: TacticalId = noise(seed, 97) < 0.25 ? (kit.tactical === 'flash' ? 'smoke' : 'flash') : kit.tactical;
  const loadout: Loadout = { primary: pickPrimary(style, noise(seed, 99)), secondary: noise(seed, 98) < REVOLVER_SHARE ? 'revolver' : 'pistol', grenade: 'frag', tactical, perk: kit.perk };
  return { name, style, loadout, ...values, reloadBelow: Math.round(values.reloadBelow) };
}

/**
 * A bot as it plays a Battle Royale: the same style, with slower eyes and a
 * looser hand from the stats file. One life against 59 means many more fights
 * than an arena match, so what's a fair duel there is a wall here. Under the
 * loot rules the sniper comes only from a Supply Drop (ticket 71), so a style
 * that would bring it brings its next pick by the same roll (an anchor, mostly
 * the M4A1); on loadouts (`holds` is `resupply`) it brings its own pick.
 */
export function royaleProfile(profile: BotProfile, holds: DropHolds = 'sniper'): BotProfile {
  const R = STATS.royale;
  const loadout = holds === 'sniper' && profile.loadout.primary === 'sniper' ? { ...profile.loadout, primary: pickPrimary(profile.style, noise(hashString(profile.name), 99), 'sniper') } : profile.loadout;
  return { ...profile, loadout, reaction: profile.reaction * R.botReaction.value, aimError: profile.aimError * R.botAim.value };
}

/** How well a match's bots play, picked in Bot Match's setup: Normal is the moderate bot as {@link botProfile} makes it. */
export type BotSkill = 'easy' | 'normal' | 'hard';
export const BOT_SKILLS: readonly BotSkill[] = ['easy', 'normal', 'hard'];

/**
 * What each skill does to the traits that decide a fight, as multipliers on the bot's own (Normal is all ones). Easy
 * sees you later, aims wider and follows a strafe worse; Hard reacts about as fast as a quick player, settles its aim
 * tighter and goes for the head more. Style, loadout and how a bot moves stay its own, so a lobby keeps its mix.
 * Game values, set against bot-vs-bot duels (`skillDuels` in the duel harness): Hard beats Normal, Normal beats Easy.
 */
const SKILL: Readonly<Record<Exclude<BotSkill, 'normal'>, Readonly<Partial<Record<'reaction' | 'aimError' | 'perceptionLag' | 'tracking' | 'turnRate' | 'recoilControl' | 'headshots', number>>>>> = {
  easy: { reaction: 1.6, aimError: 1.8, perceptionLag: 1.4, tracking: 0.7, turnRate: 0.7, recoilControl: 0.7, headshots: 0.5 },
  hard: { reaction: 0.7, aimError: 0.6, perceptionLag: 0.75, tracking: 1.15, turnRate: 1.25, recoilControl: 1.2, headshots: 1.4 },
};

/** `profile` played at `skill`: its fighting traits scaled (see {@link SKILL}), the shares held within 0 to 1. */
export function skilledProfile(profile: BotProfile, skill: BotSkill): BotProfile {
  if (skill === 'normal') return profile;
  const k = SKILL[skill];
  const share = (v: number) => Math.min(1, v);
  return {
    ...profile,
    reaction: profile.reaction * (k.reaction ?? 1),
    aimError: profile.aimError * (k.aimError ?? 1),
    perceptionLag: profile.perceptionLag * (k.perceptionLag ?? 1),
    tracking: share(profile.tracking * (k.tracking ?? 1)),
    turnRate: profile.turnRate * (k.turnRate ?? 1),
    recoilControl: share(profile.recoilControl * (k.recoilControl ?? 1)),
    headshots: share(profile.headshots * (k.headshots ?? 1)),
  };
}

const LISTED_STYLES = new Map<string, BotStyle>(BOT_NAMES.map((name, i) => [name, BOT_STYLES[i % BOT_STYLES.length]!]));

/** The style a listed name plays, or null for any other name. */
function listedStyle(name: string): BotStyle | null {
  return LISTED_STYLES.get(name) ?? null;
}

/**
 * A name from {@link BOT_NAMES} that nobody in `taken` has, picked by `seed`
 * among those of the style fewest taken names play, so a lobby's bots are a
 * mix of styles; numbered once they run out.
 */
export function botName(taken: ReadonlySet<string>, seed: number): string {
  const used = new Map<BotStyle | null, number>();
  for (const n of taken) {
    const style = listedStyle(n);
    used.set(style, (used.get(style) ?? 0) + 1);
  }
  const fewest = Math.min(...BOT_STYLES.map((style) => used.get(style) ?? 0));
  const free = BOT_NAMES.filter((n) => !taken.has(n) && (used.get(listedStyle(n)) ?? 0) === fewest);
  if (free.length) return free[Math.floor(noise(seed, 7) * free.length)]!;
  for (let i = 2; ; i++) {
    const n = `${BOT_NAMES[seed % BOT_NAMES.length]}${i}`;
    if (!taken.has(n)) return n;
  }
}
