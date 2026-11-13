import type { Estimated, Source, Stat, Unit } from './types';

/**
 * The weapons table's types and the rows of the four weapons added in v2
 * (the M4A1's row is assembled in stats.ts from its existing sections, so
 * its numbers and provenance stay exactly as they were).
 *
 * Real-world facts (cyclic rate, magazine capacity, muzzle velocity) come
 * from public firearm references. Every game number (damage, ranges, recoil,
 * handling times) is an estimate, tied to the time-to-kill targets of the v2
 * spec against 100 HP with torso hits:
 *
 * | Weapon  | Close                 | Medium              | Long                  |
 * | ------- | --------------------- | ------------------- | --------------------- |
 * | M4A1    | 4 shots               | 5 shots             | 6 shots               |
 * | SMG     | ~170 ms within 12 m   | ~330 ms by 25 m     | worse than the M4A1   |
 * | Shotgun | one shot within 5 m   | two within 12 m     | no reliable kill >18 m |
 * | Sniper  | one shot: body and legs, any range | feet: 2 |
 * | Pistol  | 3 shots / 300 ms within 12 m | 4 / 450 ms by 30 m | 5 shots        |
 *
 * None of them are taken from any other game's weapon tables. Display names
 * are original and avoid manufacturer trademarks.
 *
 * The four of next-level ticket 18 each take a place the first five left open
 * (same 100 HP, torso hits; the full table is in docs/balance.md):
 *
 * | Weapon        | Its place                                                                  |
 * | ------------- | -------------------------------------------------------------------------- |
 * | Bulwark 5.56  | 100 rounds and a recoil that settles: slower than the M4A1 close, level with it far, slow to do anything else |
 * | Vantage 7.62  | two hits within 30 m; past it two only when one is the head, else three: between the M4A1 and the sniper |
 * | Trident 5.56  | one three-round burst kills within 26 m when all three land; a miss waits out the gap to the next burst |
 * | Marshal .357  | a secondary: two hits or one to the head within 12 m, six rounds, a slow trigger and a slow reload |
 */

export type WeaponId = 'm4a1' | 'smg' | 'shotgun' | 'sniper' | 'pistol' | 'lmg' | 'dmr' | 'burst' | 'revolver';
export const WEAPON_IDS: readonly WeaponId[] = ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol', 'lmg', 'dmr', 'burst', 'revolver'];

/** How the trigger works: held for full auto, one press per shot, a burst of a few rounds per press, or a pump or bolt worked between shots. */
export type FireMode = 'auto' | 'semi' | 'burst' | 'pump' | 'bolt';

/** The words of a row: what the loadout screen and the presentation need to know. */
export interface WeaponTraits {
  /** Display name. */
  readonly name: string;
  /** One line on what it's for. */
  readonly role: string;
  readonly slot: 'primary' | 'secondary';
  readonly fireMode: FireMode;
  /**
   * A magazine swapped whole, shells loaded one at a time, a belt laid in
   * under a feed cover, or a cylinder swung out and filled. A belt and a
   * cylinder go in all at once, so their times are a {@link MagazineReload}'s;
   * the word picks the hands and the sounds.
   */
  readonly reload: 'magazine' | 'shell' | 'belt' | 'cylinder';
  /** Open sights, a low-power optic on the gun that is looked through like them, or a scope that fills the screen. */
  readonly sight: 'iron' | 'optic' | 'scope';
}

export interface WeaponHandling {
  /** Cyclic rate (auto, and inside a burst), the fastest rate presses are accepted at (semi), or 60 / cycle time (pump, bolt). */
  readonly fireRate: Stat<'rpm'>;
  /** Rounds one press fires (burst weapons), and the wait from a burst's last round to the next burst's first. */
  readonly burstRounds?: Stat<'rounds'>;
  readonly burstDelay?: Stat<'s'>;
  readonly magazineSize: Stat<'rounds'>;
  readonly muzzleVelocity: Stat<'m/s'>;
  readonly adsTime: Stat<'s'>;
  /** ADS magnification: ADS FOV = hipfire FOV / zoom. */
  readonly zoom: Stat<'multiplier'>;
  readonly sprintToFire: Stat<'s'>;
  readonly drawTime: Stat<'s'>;
  readonly holsterTime: Stat<'s'>;
  /** Movement speed with this weapon out, relative to the stats file's movement (measured with the M4A1). */
  readonly moveSpeed: Stat<'multiplier'>;
  /** Working the pump or bolt after a shot (pump and bolt weapons). */
  readonly cycleTime?: Stat<'s'>;
}

/** A magazine swap: tactical (rounds left) or empty (one more step to chamber), each with the point the ammo goes in. */
export interface MagazineReload {
  readonly tacticalAddAmmo: Stat<'s'>;
  readonly tacticalDuration: Stat<'s'>;
  readonly emptyAddAmmo: Stat<'s'>;
  readonly emptyDuration: Stat<'s'>;
}

/** Shells loaded one at a time; firing cancels the reload once a shell is in. */
export interface ShellReload {
  /** From the press to the first shell going in. */
  readonly start: Stat<'s'>;
  readonly perShell: Stat<'s'>;
  /** From the last shell to ready. */
  readonly end: Stat<'s'>;
  /** Extra time to chamber a round when the reload started empty. */
  readonly chamber: Stat<'s'>;
}

/** One range band: damage per bullet (or pellet) to the torso up to `range` metres; the last band has no range. */
export interface DamageBand {
  readonly range?: Stat<'m'>;
  readonly damage: Stat<'HP'>;
}

export interface WeaponDamage {
  /** Bands in order of distance; the last reaches to any distance. */
  readonly bands: Readonly<Record<string, DamageBand>>;
  readonly headMultiplier: Stat<'multiplier'>;
  readonly neckMultiplier: Stat<'multiplier'>;
  readonly upperTorsoMultiplier: Stat<'multiplier'>;
  readonly lowerTorsoMultiplier: Stat<'multiplier'>;
  readonly armMultiplier: Stat<'multiplier'>;
  readonly legMultiplier: Stat<'multiplier'>;
  readonly footMultiplier?: Stat<'multiplier'>;
  /** Projectiles per shot (pellets); 1 when absent. */
  readonly pellets?: Stat<'rounds'>;
  /** Scales the penetration budget each bullet starts with. */
  readonly penetration: Stat<'multiplier'>;
}

export interface WeaponAccuracy {
  readonly hipSpreadStill: Stat<'deg'>;
  readonly hipSpreadMoving: Stat<'deg'>;
  readonly hipSpreadAirborne: Stat<'deg'>;
  /** Spread left when fully aimed: the pellet cone of a shotgun; 0 when absent. */
  readonly aimedSpread?: Stat<'deg'>;
  readonly firstShotKick: Stat<'deg'>;
  readonly verticalKick: Stat<'deg'>;
  readonly horizontalKick: Stat<'deg'>;
  /** How much each later shot's climb alternates up and down (an SMG's bounce); 0 when absent. */
  readonly kickBounce?: Stat<'multiplier'>;
  /**
   * A gun that settles as it fires (a machine gun leaned into): the climb per
   * shot falls from `verticalKick` at the second shot to `settledKick` by shot
   * `settleShots`, and the side drift shrinks by the same share. Absent, every
   * later shot climbs by `verticalKick`.
   */
  readonly settledKick?: Stat<'deg'>;
  readonly settleShots?: Stat<'rounds'>;
  readonly recoilResetTime: Stat<'s'>;
  /** The share of each kick that comes back to the view once the gun is quiet (0: none; 1: all of it). */
  readonly recoilReturn: Stat<'multiplier'>;
  /** How long the gun must be quiet before its recoil starts back, and how long the return takes to close most (63 %) of what is left. */
  readonly recoilReturnDelay: Stat<'s'>;
  readonly recoilReturnTime: Stat<'s'>;
  /** Scope sway half-amplitude when first fully aimed, and how long standing still takes to settle it. */
  readonly sway?: Stat<'deg'>;
  readonly swaySettle?: Stat<'s'>;
}

export interface WeaponRow {
  readonly traits: WeaponTraits;
  readonly handling: WeaponHandling;
  readonly reload: MagazineReload | ShellReload;
  readonly damage: WeaponDamage;
  readonly accuracy: WeaponAccuracy;
}

export function isShellReload(reload: MagazineReload | ShellReload): reload is ShellReload {
  return 'perShell' in reload;
}

const COLLECTED = '2026-10-27';

function sourced<U extends Unit>(value: number, unit: U, source: Omit<Source, 'collected'>, tolerance: number, note?: string): Stat<U> {
  return { value, unit, provenance: { kind: 'sourced', source: { ...source, collected: COLLECTED }, tolerance, ...(note ? { note } : {}) } };
}

export function estimate<U extends Unit>(value: number, unit: U, method: string): Stat<U> {
  const provenance: Estimated = { kind: 'estimated', method, collected: COLLECTED };
  return { value, unit, provenance };
}

/** A game number tuned to the time-to-kill targets or the weapon's role. */
const tuned = <U extends Unit>(value: number, unit: U, why: string) => estimate(value, unit, `Game value for Duty Shooter v2, not measured from any game: ${why}`);

const MINI_UZI: Omit<Source, 'collected'> = { name: 'Wikipedia, Mini Uzi', url: 'https://en.wikipedia.org/wiki/Mini_Uzi' };
const GLOCK_17: Omit<Source, 'collected'> = { name: 'Wikipedia, Glock 17', url: 'https://en.wikipedia.org/wiki/Glock_17' };
const PARABELLUM: Omit<Source, 'collected'> = { name: 'Wikipedia, 9×19mm Parabellum (ballistic performance table)', url: 'https://en.wikipedia.org/wiki/9%C3%9719mm_Parabellum' };
const REMINGTON_870: Omit<Source, 'collected'> = { name: 'Wikipedia, Remington Model 870', url: 'https://en.wikipedia.org/wiki/Remington_Model_870' };
const BUCKSHOT = 'https://en.wikipedia.org/wiki/Buckshot';
const M24: Omit<Source, 'collected'> = { name: 'Wikipedia, M24 sniper weapon system', url: 'https://en.wikipedia.org/wiki/M24_sniper_weapon_system' };

/** The SMG: a compact 9 mm submachine gun on the Mini Uzi's numbers. */
export const SMG: WeaponRow = {
  traits: { name: 'Wasp 9', role: 'Fastest kill up close; falls off fast past 15 m.', slot: 'primary', fireMode: 'auto', reload: 'magazine', sight: 'iron' },
  handling: {
    fireRate: sourced(950, 'rpm', MINI_UZI, 10, '"A greater automatic rate of fire of 950 rounds per minute due to the shorter bolt."'),
    magazineSize: tuned(32, 'rounds', 'the Uzi family\'s 32-round box magazine; the Mini Uzi\'s own 20-round magazine would empty in 1.3 s, less than one fight.'),
    muzzleVelocity: sourced(375, 'm/s', MINI_UZI, 10, '"Its muzzle velocity is 375 m/s."'),
    adsTime: tuned(0.15, 's', 'well under the M4A1 (0.242 s), so the SMG suits aggressive movement and gets the first shot off in its own band (0.18 s split its 15 m duels with the M4A1 evenly in the balance runs).'),
    zoom: tuned(1.1, 'multiplier', 'iron sights like the M4A1.'),
    sprintToFire: tuned(0.18, 's', 'faster than the M4A1 (0.246 s): a light gun comes up from a sprint quicker.'),
    drawTime: tuned(0.55, 's', 'a light gun raises faster than the M4A1 (0.8 s).'),
    holsterTime: tuned(0.3, 's', 'a little quicker than the M4A1\'s 0.35 s.'),
    moveSpeed: tuned(1.059, 'multiplier', 'a light gun moves a touch faster than the rifle, but slower than the shotgun and the pistol. Raised from 1.01 when tactical sprint went: at 1.01 it lost its own 15 m band to the M4A1 (46 %) in the balance runs; at 1.059 it takes 48 % there and 59 % of all its duels (it passed 60 % at 1.05 while tactical sprint was in).'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.2, 's', 'a short magazine swap, quicker than the M4A1 (1.39 s).'),
    tacticalDuration: tuned(1.75, 's', 'the M4A1\'s gap from add-ammo to ready, shortened for a lighter gun.'),
    emptyAddAmmo: tuned(1.55, 's', 'tactical plus 0.35 s to cock the bolt.'),
    emptyDuration: tuned(2.2, 's', 'tactical duration plus 0.45 s to cock the bolt.'),
  },
  damage: {
    bands: {
      close: { range: tuned(15, 'm', 'the close band of the time-to-kill target ("about 170 ms within 12 m"), carried on to 15 m so the SMG wins its own band in the balance runs (at 12 m the M4A1 took 15 m duels two times in three).'), damage: tuned(26, 'HP', 'four torso hits kill: 3 intervals at 950 rpm = 189 ms, about the 170 ms target.') },
      medium: { range: tuned(25, 'm', 'the medium band of the target ("about 330 ms by 25 m").'), damage: tuned(18, 'HP', 'six torso hits kill: 5 intervals at 950 rpm = 316 ms, about the 330 ms target.') },
      long: { damage: tuned(12, 'HP', 'nine torso hits kill (505 ms), worse than the M4A1\'s five or six (297-371 ms) past 25 m.') },
    },
    headMultiplier: tuned(1.3, 'multiplier', 'a smaller head bonus than the rifle\'s 1.4: a pistol-calibre round.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    armMultiplier: tuned(1, 'multiplier', 'as on the M4A1.'),
    legMultiplier: tuned(0.9, 'multiplier', 'as on the M4A1.'),
    penetration: tuned(0.8, 'multiplier', 'a pistol-calibre round goes through less than the rifle\'s.'),
  },
  accuracy: {
    hipSpreadStill: tuned(1.2, 'deg', 'well inside the M4A1 (2.0): the SMG is meant to be fired from the hip up close. At 1.6 it lost its own 15 m band to the M4A1 in the balance runs.'),
    hipSpreadMoving: tuned(2.2, 'deg', 'well inside the M4A1 (3.5) for the same reason.'),
    hipSpreadAirborne: tuned(6, 'deg', 'a little tighter than the M4A1 (7).'),
    firstShotKick: tuned(0.4, 'deg', 'a light first-shot jump.'),
    verticalKick: tuned(0.36, 'deg', 'a little less climb per shot than the M4A1 (0.38), at two and a half times the rate, so a long burst climbs off target faster.'),
    horizontalKick: tuned(0.2, 'deg', 'more side drift than the M4A1 (0.16).'),
    kickBounce: tuned(0.35, 'multiplier', 'each later shot\'s climb alternates 35 % up and down: the bounce the spec asks for, which stays controllable.'),
    recoilResetTime: tuned(0.22, 's', 'about the M4A1\'s 0.25 s.'),
    recoilReturn: tuned(0.75, 'multiplier', 'a little more than the M4A1 (0.7): the SMG is light and comes back to hand.'),
    recoilReturnDelay: tuned(0.08, 's', 'longer than the gap between its shots (0.05 s).'),
    recoilReturnTime: tuned(0.13, 's', 'quicker back than the M4A1 (0.16 s).'),
  },
};

/** The pistol: a 9 mm semi-automatic on the Glock 17's numbers, the only secondary. */
export const PISTOL: WeaponRow = {
  traits: { name: 'Warden 9', role: 'A quick draw for when the primary runs dry.', slot: 'secondary', fireMode: 'semi', reload: 'magazine', sight: 'iron' },
  handling: {
    fireRate: tuned(400, 'rpm', 'the fastest rate presses are accepted at (semi-automatic): 150 ms, about as fast as a player keeps clicking (Valorant\'s Classic fires 6.75 a second, 148 ms; CS2\'s Glock-18 400 rpm), and a click a little early is kept for the gun (\'pressBuffer\' in the weapon section).'),
    magazineSize: sourced(17, 'rounds', GLOCK_17, 0, 'The article describes the Glock 17 magazines as having "a 17-round capacity".'),
    muzzleVelocity: sourced(360, 'm/s', PARABELLUM, 15, '115 gr Federal FMJ from a 118 mm test barrel: 1,180 ft/s (360 m/s).'),
    adsTime: tuned(0.15, 's', 'the quickest to aim of every weapon.'),
    zoom: tuned(1.1, 'multiplier', 'iron sights like the M4A1.'),
    sprintToFire: tuned(0.12, 's', 'half the M4A1\'s 0.246 s: a pistol comes up at once.'),
    drawTime: tuned(0.4, 's', 'switching from a primary (holster 0.3-0.4 s) to the pistol takes under a second, faster than any primary\'s reload, as the spec asks.'),
    holsterTime: tuned(0.25, 's', 'the quickest to put away.'),
    moveSpeed: tuned(1.4, 'multiplier', 'faster than with any primary (the shotgun is 1.35), as the spec asks.'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.05, 's', 'a pistol magazine goes in quicker than a rifle\'s (1.39 s).'),
    tacticalDuration: tuned(1.4, 's', 'add-ammo plus a short settle.'),
    emptyAddAmmo: tuned(1.3, 's', 'tactical plus 0.25 s to release the slide.'),
    emptyDuration: tuned(1.75, 's', 'tactical duration plus 0.35 s for the slide.'),
  },
  damage: {
    bands: {
      close: { range: tuned(12, 'm', 'a room and the yard outside it, the revolver\'s close band too.'), damage: tuned(34, 'HP', 'three torso hits kill in 300 ms (2 x 150 ms), 1.35 times the M4A1\'s 222 ms. It was four in 450 ms, twice the rifle, and five past 10 m: the sidearm lost the fights it is drawn for. Well-liked sidearms sit nearer their rifles or kill with the head: Modern Warfare\'s X16 about 388 ms against its rifles\' 200-250 (esportstales.com); Valorant\'s Classic 26 to the body and 78 to the head, CS2\'s Glock-18 30 and four times that to the head (csdb.gg).') },
      medium: { range: tuned(30, 'm', 'past this the pistol is a poor choice.'), damage: tuned(26, 'HP', 'four torso hits kill, 450 ms: behind every primary at that range.') },
      long: { damage: tuned(20, 'HP', 'five torso hits kill.') },
    },
    headMultiplier: tuned(1.6, 'multiplier', 'two to the head kill up close (54 each), where it took three: an aimed pistol pays, as Valorant\'s and CS2\'s do, without the one-shot head the revolver keeps.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    armMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    legMultiplier: tuned(0.9, 'multiplier', 'as on the M4A1.'),
    penetration: tuned(0.7, 'multiplier', 'a pistol round goes through less than the rifle\'s.'),
  },
  accuracy: {
    hipSpreadStill: tuned(1.4, 'deg', 'the tightest hipfire: a pistol is pointed, not braced.'),
    hipSpreadMoving: tuned(2.4, 'deg', 'blooms while moving, less than the M4A1.'),
    hipSpreadAirborne: tuned(5, 'deg', 'less than the M4A1 (7).'),
    firstShotKick: tuned(0.9, 'deg', 'a visible flip per shot; the pistol\'s rate is set by clicks, not by recoil.'),
    verticalKick: tuned(0.9, 'deg', 'every shot flips the same.'),
    horizontalKick: tuned(0.25, 'deg', 'a little side flip.'),
    recoilResetTime: tuned(0.3, 's', 'about the M4A1\'s 0.25 s.'),
    recoilReturn: tuned(0.85, 'multiplier', 'the flip of a pistol nearly all comes back: it is shot by shot, each from where the last began.'),
    recoilReturnDelay: tuned(0.06, 's', 'well inside the gap between two presses at its fastest (0.15 s), so the sights are coming back before the next.'),
    recoilReturnTime: tuned(0.09, 's', 'the quickest back of every weapon.'),
  },
};

/** The shotgun: a 12-gauge pump on the Remington 870's numbers, firing 00 buckshot. */
export const SHOTGUN: WeaponRow = {
  traits: { name: 'Harrow 12', role: 'One-shot kills in a doorway; useless at range.', slot: 'primary', fireMode: 'pump', reload: 'shell', sight: 'iron' },
  handling: {
    fireRate: tuned(75, 'rpm', '60 / the 0.8 s pump cycle.'),
    magazineSize: sourced(6, 'rounds', REMINGTON_870, 0, 'One of the listed internal tube magazines: "3+1, 4+1, 5+1, 6+1, or 7+1 round". The tube\'s 6 count; the chambered round is not modelled.'),
    muzzleVelocity: tuned(400, 'm/s', 'a typical 00 buckshot load (about 1,300 ft/s); the Buckshot article gives no velocity.'),
    adsTime: tuned(0.3, 's', 'a little slower than the M4A1 (0.242 s): a long, heavy gun.'),
    zoom: tuned(1.05, 'multiplier', 'a bead sight barely magnifies.'),
    sprintToFire: tuned(0.2, 's', 'quicker than the M4A1 (0.246 s): a shotgun comes in at a run and fires on arrival (the balance runs).'),
    drawTime: tuned(0.65, 's', 'between the SMG (0.55 s) and the M4A1 (0.8 s).'),
    holsterTime: tuned(0.35, 's', 'as the M4A1.'),
    moveSpeed: tuned(1.35, 'multiplier', 'the quickest primary to carry, short of the pistol (1.4): the shotgun has to get close. A sprint with it (8.4 m/s) is about the pace its tactical sprint had (8.5 m/s at 1.15) before tactical sprint went; at 1.15 without it the shotgun took 37 % of all its duels in the balance runs, at 1.28 39 %, at 1.35 41 % (at the pace of the M4A1 it lost two in three of its fights beyond 5 m).'),
    cycleTime: tuned(0.8, 's', 'working the pump: a miss up close costs most of a second, so the second shot is the risk.'),
  },
  reload: {
    start: tuned(0.45, 's', 'lowering the gun and turning it over for the loading port.'),
    perShell: tuned(0.5, 's', 'one shell into the tube per half second, so a full reload (about 3.3 s) is the longest of any weapon.'),
    end: tuned(0.35, 's', 'bringing the gun back up.'),
    chamber: tuned(0.45, 's', 'one more pump when the reload started empty.'),
  },
  damage: {
    bands: {
      point: { range: tuned(7, 'm', 'the one-shot band of the target ("one shot within 5 m"), carried on to 7 m: at 5 m the shotgun had to cross the last few metres under fire and lost too many fights in the balance runs.'), damage: tuned(30, 'HP', 'per pellet: any 4 of the 8 pellets kill, limbs included, so a blast that is half on target still kills inside 5 m (the balance runs: at 20, a blast from a bot at 4 m often left a few HP).') },
      close: { range: tuned(12, 'm', 'the two-shot band of the target ("two shots within 12 m").'), damage: tuned(15, 'HP', 'per pellet: at 12 m about half the pellets of an aimed blast land (measured in the simulation), so two blasts kill (7 pellets, 105), and seven of eight up to about 7 m still kill in one.') },
      medium: { range: tuned(18, 'm', 'past this the target asks for no reliable kill.'), damage: tuned(7, 'HP', 'per pellet: half the pellets land at this range, so it takes three or four shots.') },
      long: { damage: tuned(3, 'HP', 'per pellet: a full hit is 24, no reliable kill past 18 m.') },
    },
    headMultiplier: tuned(1.2, 'multiplier', 'a small bonus per pellet: a spread is not aimed at the head.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    armMultiplier: tuned(0.9, 'multiplier', 'a little less on the limbs.'),
    legMultiplier: tuned(0.8, 'multiplier', 'a little less on the limbs.'),
    pellets: tuned(8, 'rounds', `the lower end of the "8 (eight) to 18 (eighteen) pellets" the Buckshot article (${BUCKSHOT}) gives for standard-length shells.`),
    penetration: tuned(0.45, 'multiplier', 'pellets go through less than rifle rounds, so a door does not become a wall of pellets (the spec).'),
  },
  accuracy: {
    hipSpreadStill: tuned(4.5, 'deg', 'the pellet cone from the hip: at 5 m it is 0.4 m wide, about a torso.'),
    hipSpreadMoving: tuned(5.5, 'deg', 'a little wider on the move.'),
    hipSpreadAirborne: tuned(8, 'deg', 'wide in the air.'),
    aimedSpread: tuned(3.2, 'deg', 'the pellet cone aimed: at 12 m it is 1.3 m wide, so about half the pellets land.'),
    firstShotKick: tuned(3, 'deg', 'a heavy kick per shot; the pump hides the climb.'),
    verticalKick: tuned(3, 'deg', 'every shot kicks the same.'),
    horizontalKick: tuned(0.6, 'deg', 'a little side kick.'),
    recoilResetTime: tuned(0.5, 's', 'the pump takes longer than any reset.'),
    recoilReturn: tuned(0.8, 'multiplier', 'the muzzle comes back down as the pump is worked.'),
    recoilReturnDelay: tuned(0.12, 's', 'the kick is felt before the gun comes back.'),
    recoilReturnTime: tuned(0.22, 's', 'back on the target within the 0.8 s pump cycle.'),
  },
};

/** The sniper rifle: a bolt action in 7.62x51 mm on the M24's numbers, with a scope. */
export const SNIPER: WeaponRow = {
  traits: { name: 'Ridgeline .308', role: 'One shot to the upper body at any range; poor up close.', slot: 'primary', fireMode: 'bolt', reload: 'magazine', sight: 'scope' },
  handling: {
    fireRate: tuned(54.5, 'rpm', `60 / the 1.1 s bolt cycle. The M24's practical rate is 20 rounds a minute (${M24.url}), aimed shot after aimed shot.`),
    magazineSize: sourced(5, 'rounds', M24, 0, '"5-round internal magazine" (M24).'),
    muzzleVelocity: sourced(790, 'm/s', M24, 10, '"2,580 ft/s (790 m/s) w/M118LR Sniper load (175 gr.)".'),
    adsTime: tuned(0.35, 's', 'nearly half as slow again as the M4A1 (0.242 s), and the scope sways on top; slower than the SMG takes to aim and kill up close (0.15 + 0.19 s): the sniper is slow to aim, as the spec asks. 0.55 s lost the sniper its own 60 m band in the balance runs, and 0.36 s with a 0.7 deg sway left it under 40 % of all its duels.'),
    zoom: tuned(4, 'multiplier', 'the M24\'s fixed 10x scope would make Switchyard\'s 60-80 m lanes a keyhole; 4x is a low setting of a variable scope.'),
    sprintToFire: tuned(0.42, 's', 'a heavy rifle comes up slowly from a sprint.'),
    drawTime: tuned(0.85, 's', 'a little slower than the M4A1 (0.8 s).'),
    holsterTime: tuned(0.4, 's', 'a little slower than the M4A1 (0.35 s).'),
    moveSpeed: tuned(0.92, 'multiplier', 'the heaviest gun moves slowest.'),
    cycleTime: tuned(1.1, 's', 'working the bolt: a miss costs over a second, as the spec asks.'),
  },
  reload: {
    tacticalAddAmmo: tuned(2, 's', 'a careful magazine swap.'),
    tacticalDuration: tuned(2.9, 's', 'add-ammo plus bringing the scope back up.'),
    emptyAddAmmo: tuned(2.6, 's', 'tactical plus working the bolt.'),
    emptyDuration: tuned(3.5, 's', 'tactical duration plus working the bolt.'),
  },
  damage: {
    bands: {
      any: { damage: tuned(105, 'HP', 'kills in one hit to the upper torso at any range (no falloff), as the spec asks.') },
    },
    headMultiplier: tuned(2, 'multiplier', 'a head shot always kills.'),
    neckMultiplier: tuned(1, 'multiplier', '105: kills in one hit, as the spec asks.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', '105: kills in one hit, as the spec asks.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', '105: one hit.'),
    armMultiplier: tuned(1, 'multiplier', '105: one hit.'),
    legMultiplier: tuned(1, 'multiplier', '105: one hit; feet deal less.'),
    footMultiplier: tuned(0.7, 'multiplier', '74: two hits to the feet.'),
    penetration: tuned(1.6, 'multiplier', 'a full-power rifle round goes through more than the M4A1\'s, so thin cover doesn\'t save anyone (the spec).'),
  },
  accuracy: {
    hipSpreadStill: tuned(9, 'deg', 'very poor from the hip, as the spec asks.'),
    hipSpreadMoving: tuned(11, 'deg', 'worse on the move.'),
    hipSpreadAirborne: tuned(14, 'deg', 'hopeless in the air.'),
    firstShotKick: tuned(4, 'deg', 'a heavy kick; the bolt cycle hides it.'),
    verticalKick: tuned(4, 'deg', 'every shot kicks the same.'),
    horizontalKick: tuned(0.8, 'deg', 'a little side kick.'),
    recoilResetTime: tuned(1, 's', 'longer than the bolt cycle.'),
    recoilReturn: tuned(0.9, 'multiplier', 'a braced rifle settles nearly where it was aimed.'),
    recoilReturnDelay: tuned(0.15, 's', 'the scope jumps and hangs a moment.'),
    recoilReturnTime: tuned(0.3, 's', 'the slowest back: the scope is on the target again as the bolt closes.'),
    sway: tuned(0.4, 'deg', 'scope sway on first aiming: at 50 m it moves the aim point 0.35 m, so a quick scope across the map is a gamble. 0.5 and more kept the sniper under its share in the balance runs.'),
    swaySettle: tuned(1.5, 's', 'standing still this long settles the sway to a fifth, as the spec asks ("settles over about 1.5 s").'),
  },
};

/** The light machine gun: belt-fed from a 100-round box, heavy in every way but the last ninety rounds of a burst. */
export const LMG: WeaponRow = {
  traits: { name: 'Bulwark 5.56', role: 'A hundred rounds that settle as they go: holds a lane, slow to do anything else.', slot: 'primary', fireMode: 'auto', reload: 'belt', sight: 'iron' },
  handling: {
    fireRate: tuned(680, 'rpm', 'slower than the M4A1 (809): four hits take 265 ms against its 223 ms, so the rifle wins a meeting up close and the machine gun has to be aimed already.'),
    magazineSize: tuned(100, 'rounds', 'a belt in a box: nine seconds of fire, three times the M4A1\'s magazine, which is what holding a lane takes.'),
    muzzleVelocity: tuned(915, 'm/s', 'a longer barrel than the M4A1\'s for the same round.'),
    adsTime: tuned(0.42, 's', 'the slowest to aim of every weapon (the sniper is 0.35 s): caught unaimed, it loses to anything.'),
    zoom: tuned(1.2, 'multiplier', 'iron sights, a touch tighter than the M4A1\'s 1.1 for the lanes it watches.'),
    sprintToFire: tuned(0.4, 's', 'about the sniper\'s 0.42 s: it does not come out of a run shooting.'),
    drawTime: tuned(1.25, 's', 'the slowest to raise by far (the sniper is 0.85 s): switching to it in a fight is a mistake.'),
    holsterTime: tuned(0.5, 's', 'the slowest to put away.'),
    moveSpeed: tuned(0.88, 'multiplier', 'the heaviest gun moves slowest, under the sniper (0.92).'),
  },
  reload: {
    tacticalAddAmmo: tuned(4.3, 's', 'cover up, old belt out, box off, box on, belt laid in: twice as long as any magazine before the rounds count.'),
    tacticalDuration: tuned(5.2, 's', 'the cover shut and the gun back in the shoulder: the longest reload of any weapon, the price of a hundred rounds.'),
    emptyAddAmmo: tuned(4.3, 's', 'the same hands as a tactical reload.'),
    emptyDuration: tuned(5.7, 's', 'tactical plus half a second on the charging handle.'),
  },
  damage: {
    bands: {
      close: { range: tuned(40, 'm', 'past the M4A1\'s close band (27 m): between 27 and 40 m the machine gun\'s four hits (265 ms) beat the rifle\'s five (297 ms).'), damage: tuned(26, 'HP', 'four torso hits kill, like the M4A1 up close, at a slower rate.') },
      long: { damage: tuned(21, 'HP', 'five torso hits kill at any range (353 ms), level with the M4A1\'s six past 50 m (371 ms): it does not fall off further.') },
    },
    headMultiplier: tuned(1.4, 'multiplier', 'the rifle\'s head bonus: the same round.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    armMultiplier: tuned(1, 'multiplier', 'as on the M4A1.'),
    legMultiplier: tuned(0.9, 'multiplier', 'as on the M4A1.'),
    penetration: tuned(1.3, 'multiplier', 'more than the M4A1: a machine gun is what shoots through the cover someone ran behind.'),
  },
  accuracy: {
    hipSpreadStill: tuned(3.2, 'deg', 'well outside the M4A1 (2.0): fired from the hip it sprays.'),
    hipSpreadMoving: tuned(5.5, 'deg', 'worse on the move than any gun but the sniper and the marksman rifle.'),
    hipSpreadAirborne: tuned(9, 'deg', 'hopeless in the air.'),
    firstShotKick: tuned(0.8, 'deg', 'the gun jumps as it starts (the M4A1 is 0.55).'),
    verticalKick: tuned(0.55, 'deg', 'the second shot climbs half as much again as an M4A1\'s (0.38): its first five shots climb 2.7 deg against the rifle\'s 2.1.'),
    horizontalKick: tuned(0.3, 'deg', 'twice the M4A1\'s side drift while the gun is still moving about.'),
    settledKick: tuned(0.16, 'deg', 'under half the M4A1\'s climb per shot once the weight is behind it: a long burst gets easier to hold, the opposite of every other automatic.'),
    settleShots: tuned(10, 'rounds', 'settled by the tenth round, under a second of fire: thirty rounds climb about 7.5 deg against the M4A1 magazine\'s 11.6.'),
    recoilResetTime: tuned(0.35, 's', 'longer than the M4A1 (0.25 s): let go for a moment and the gun is still settled; stop for longer and it has to settle again.'),
    recoilReturn: tuned(0.5, 'multiplier', 'the least of any weapon: a heavy gun stays where the burst walked it, so half the climb is the player\'s to bring down.'),
    recoilReturnDelay: tuned(0.14, 's', 'longer than the gap between its shots (0.09 s).'),
    recoilReturnTime: tuned(0.3, 's', 'as slow back as the sniper: the weight that steadies it also brings it back late.'),
  },
};

/** The marksman rifle: a semi-automatic in 7.62 mm under a 2x prism optic. */
export const DMR: WeaponRow = {
  traits: { name: 'Vantage 7.62', role: 'Two aimed shots: any two up to 30 m, one of them the head past it.', slot: 'primary', fireMode: 'semi', reload: 'magazine', sight: 'optic' },
  handling: {
    fireRate: tuned(240, 'rpm', 'the fastest rate presses are accepted at: two hits 250 ms apart, a little slower than the M4A1\'s four up close (223 ms) and quicker than anything but the sniper far off.'),
    magazineSize: tuned(12, 'rounds', 'six kills at best, four when every one takes three: enough for a fight, not for a spray.'),
    muzzleVelocity: tuned(820, 'm/s', 'a full-power rifle round from a mid-length barrel, a little quicker than the sniper\'s heavy load (790).'),
    adsTime: tuned(0.3, 's', 'between the M4A1 (0.242 s) and the sniper (0.35 s).'),
    zoom: tuned(2.2, 'multiplier', 'a low-power optic: enough to pick a head at 60 m, not enough to lose the street around it (the sniper\'s scope is 4x).'),
    sprintToFire: tuned(0.3, 's', 'between the M4A1 (0.246 s) and the sniper (0.42 s).'),
    drawTime: tuned(0.9, 's', 'a little slower than the sniper (0.85 s): longer than the M4A1, with glass on top.'),
    holsterTime: tuned(0.4, 's', 'as the sniper.'),
    moveSpeed: tuned(0.96, 'multiplier', 'between the M4A1 (1) and the sniper (0.92).'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.7, 's', 'a bigger magazine to seat than the M4A1\'s (1.39 s).'),
    tacticalDuration: tuned(2.5, 's', 'add-ammo plus bringing the optic back up.'),
    emptyAddAmmo: tuned(2.05, 's', 'tactical plus 0.35 s before the bolt is let go.'),
    emptyDuration: tuned(2.95, 's', 'tactical duration plus 0.45 s for the bolt.'),
  },
  damage: {
    bands: {
      close: { range: tuned(30, 'm', 'a little past the M4A1\'s close band (27 m): inside it the marksman rifle is a two-shot gun anywhere on the torso. At 45 m bots carrying it beat the M4A1 in the carbine\'s own 30 m band (54 % of 200 duels).'), damage: tuned(52, 'HP', 'two torso hits kill (104); one never does.') },
      long: { damage: tuned(44, 'HP', 'two torso hits leave 12 HP; a head and a torso (66 + 44) kill, and three torso hits always do: far off it pays for the head.') },
    },
    headMultiplier: tuned(1.5, 'multiplier', 'a head shot never kills by itself (78 up close, 66 far): that is the sniper\'s. It makes the second shot a kill at any range.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    armMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    legMultiplier: tuned(0.9, 'multiplier', 'two leg hits leave 6 HP up close: aim matters.'),
    penetration: tuned(1.4, 'multiplier', 'a full-power round, a little under the sniper\'s 1.6.'),
  },
  accuracy: {
    hipSpreadStill: tuned(5, 'deg', 'poor from the hip, between the M4A1 (2) and the sniper (9): it is an aimed gun.'),
    hipSpreadMoving: tuned(7, 'deg', 'worse on the move.'),
    hipSpreadAirborne: tuned(11, 'deg', 'hopeless in the air.'),
    firstShotKick: tuned(1.7, 'deg', 'three times an M4A1 round\'s jump: the optic leaves the target on every shot.'),
    verticalKick: tuned(1.7, 'deg', 'every shot kicks the same.'),
    horizontalKick: tuned(0.35, 'deg', 'a little side kick.'),
    recoilResetTime: tuned(0.45, 's', 'longer than the gap between two presses at its fastest (0.25 s).'),
    recoilReturn: tuned(0.9, 'multiplier', 'a shouldered rifle comes back nearly to where it was aimed, as the sniper does.'),
    recoilReturnDelay: tuned(0.07, 's', 'the optic jumps and starts back at once.'),
    recoilReturnTime: tuned(0.11, 's', 'at the fastest press (0.25 s) four fifths of the return is done, so a second shot fired flat out lands about half a degree high, 0.4 m at 50 m: fast is for close, a breath between shots is for far.'),
  },
};

/** The burst rifle: three rounds a press. */
export const BURST: WeaponRow = {
  traits: { name: 'Trident 5.56', role: 'Three rounds a press: one burst kills within 26 m if all three land.', slot: 'primary', fireMode: 'burst', reload: 'magazine', sight: 'iron' },
  handling: {
    fireRate: tuned(800, 'rpm', 'the rate inside a burst, about the M4A1\'s (809): three rounds leave in 150 ms.'),
    burstRounds: tuned(3, 'rounds', 'the burst the ticket asks for.'),
    burstDelay: tuned(0.34, 's', 'from a burst\'s last round to the next burst\'s first: a burst that leaves its target standing costs 490 ms from first round to first round, more than twice an M4A1 kill.'),
    magazineSize: tuned(30, 'rounds', 'ten bursts, the M4A1\'s magazine.'),
    muzzleVelocity: tuned(930, 'm/s', 'a full-length barrel for the M4A1\'s round.'),
    adsTime: tuned(0.26, 's', 'a little slower than the M4A1 (0.242 s): a longer rifle.'),
    zoom: tuned(1.2, 'multiplier', 'iron sights, a touch tighter than the M4A1\'s 1.1: it is aimed burst by burst.'),
    sprintToFire: tuned(0.26, 's', 'about the M4A1\'s 0.246 s.'),
    drawTime: tuned(0.8, 's', 'as the M4A1.'),
    holsterTime: tuned(0.35, 's', 'as the M4A1.'),
    moveSpeed: tuned(1, 'multiplier', 'as the M4A1.'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.45, 's', 'about the M4A1\'s 1.39 s: the same magazine into a longer rifle.'),
    tacticalDuration: tuned(2.3, 's', 'about the M4A1\'s.'),
    emptyAddAmmo: tuned(1.75, 's', 'tactical plus 0.3 s before the bolt is let go.'),
    emptyDuration: tuned(2.8, 's', 'tactical duration plus half a second for the bolt.'),
  },
  damage: {
    bands: {
      close: { range: tuned(26, 'm', 'the one-burst band, just short of the M4A1\'s close band (27 m): where the carbine starts to need a fifth round, a burst stops killing alone. At 38 m bots carrying it beat the M4A1 in the carbine\'s own 30 m band (57 % of 200 duels).'), damage: tuned(34, 'HP', 'three torso hits kill (102), two never do: a burst kills only whole. 150 ms, the quickest kill of any gun that needs more than one hit, and 490 ms when one round of it misses.') },
      medium: { range: tuned(70, 'm', 'the two-burst band.'), damage: tuned(26, 'HP', 'four torso hits kill: a burst and the first round of the next, 490 ms, against the M4A1\'s 297-371 ms.') },
      long: { damage: tuned(21, 'HP', 'five torso hits kill: 565 ms, well behind the M4A1 (371 ms).') },
    },
    headMultiplier: tuned(1.4, 'multiplier', 'the rifle\'s head bonus: the same round.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage, as on the M4A1.'),
    armMultiplier: tuned(1, 'multiplier', 'as on the M4A1.'),
    legMultiplier: tuned(0.9, 'multiplier', 'a burst into the legs leaves 8 HP.'),
    penetration: tuned(1, 'multiplier', 'the M4A1\'s round.'),
  },
  accuracy: {
    hipSpreadStill: tuned(2.6, 'deg', 'outside the M4A1 (2.0): from the hip a burst rarely lands whole past a few metres.'),
    hipSpreadMoving: tuned(4.2, 'deg', 'worse on the move than the M4A1 (3.5).'),
    hipSpreadAirborne: tuned(8, 'deg', 'worse than the M4A1 (7).'),
    firstShotKick: tuned(0.32, 'deg', 'the second round leaves 0.32 deg above the first: 0.15 m at 26 m.'),
    verticalKick: tuned(0.36, 'deg', 'the third leaves 0.68 deg above the first, 0.3 m at 26 m: aimed at the belt, a burst walks up the torso; aimed at the chest far off, its last round goes over the shoulder.'),
    horizontalKick: tuned(0.1, 'deg', 'a burst climbs straight.'),
    recoilResetTime: tuned(0.25, 's', 'shorter than the wait between bursts, so every burst is the same three kicks.'),
    recoilReturn: tuned(0.95, 'multiplier', 'nearly all of a burst comes back: the next starts where this one did.'),
    recoilReturnDelay: tuned(0.09, 's', 'longer than the gap between a burst\'s rounds (0.075 s), so nothing comes back inside one.'),
    recoilReturnTime: tuned(0.08, 's', 'the sights are back on the target before the next burst is allowed.'),
  },
};

/** The revolver: six rounds of .357, the second secondary. */
export const REVOLVER: WeaponRow = {
  traits: { name: 'Marshal .357', role: 'Six heavy rounds: two hits, or one to the head, inside 12 m.', slot: 'secondary', fireMode: 'semi', reload: 'cylinder', sight: 'iron' },
  handling: {
    fireRate: tuned(210, 'rpm', 'the fastest rate presses are accepted at: a long double-action pull, 286 ms between shots. Two hits kill in 286 ms against the pistol\'s three in 300 ms; a miss costs 286 ms more against the pistol\'s 150. It was 150 rpm (400 ms) while the pistol took four hits in 450 ms.'),
    magazineSize: tuned(6, 'rounds', 'a six-shot cylinder, as the ticket asks: three kills at best before the slowest sidearm reload.'),
    muzzleVelocity: tuned(440, 'm/s', 'a .357 load from a 4 inch barrel, quicker than the pistol\'s 9 mm (360).'),
    adsTime: tuned(0.2, 's', 'slower than the pistol (0.15 s): a heavier gun to level.'),
    zoom: tuned(1.1, 'multiplier', 'iron sights like the pistol.'),
    sprintToFire: tuned(0.16, 's', 'a little slower than the pistol (0.12 s).'),
    drawTime: tuned(0.5, 's', 'a little slower than the pistol (0.4 s), still quicker than any primary.'),
    holsterTime: tuned(0.3, 's', 'a little slower than the pistol (0.25 s).'),
    moveSpeed: tuned(1.3, 'multiplier', 'a sidearm\'s pace, a little under the pistol (1.4) for the weight.'),
  },
  reload: {
    tacticalAddAmmo: tuned(2, 's', 'cylinder out, cases dumped, six rounds in off a speedloader: nearly twice the pistol\'s magazine (1.05 s).'),
    tacticalDuration: tuned(2.6, 's', 'the cylinder shut and the gun back up: longer than the M4A1\'s reload (2.23 s) for a fifth of the rounds.'),
    emptyAddAmmo: tuned(2, 's', 'the same hands: a revolver has nothing to chamber.'),
    emptyDuration: tuned(2.6, 's', 'the same as with rounds left.'),
  },
  damage: {
    bands: {
      close: { range: tuned(12, 'm', 'the pistol\'s close band: a sidearm\'s reach.'), damage: tuned(52, 'HP', 'two torso hits kill, where the M4A1 takes four: it hits like a rifle and a half up close.') },
      medium: { range: tuned(30, 'm', 'the three-shot band.'), damage: tuned(36, 'HP', 'three torso hits kill, 571 ms: slower than the pistol\'s four (450 ms).') },
      long: { damage: tuned(26, 'HP', 'four torso hits kill, 857 ms: no gun for a long shot.') },
    },
    headMultiplier: tuned(2, 'multiplier', 'one head shot kills inside 12 m (104) and nowhere else (72): the reason to carry it instead of the pistol.'),
    neckMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    upperTorsoMultiplier: tuned(1, 'multiplier', 'the base the bands describe.'),
    lowerTorsoMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    armMultiplier: tuned(1, 'multiplier', 'the torso\'s damage.'),
    legMultiplier: tuned(0.9, 'multiplier', 'two leg hits leave 6 HP.'),
    penetration: tuned(1.1, 'multiplier', 'a heavier bullet than the pistol\'s goes through a little more than the M4A1\'s.'),
  },
  accuracy: {
    hipSpreadStill: tuned(1.8, 'deg', 'a little wider than the pistol (1.4): the long pull moves the muzzle.'),
    hipSpreadMoving: tuned(3, 'deg', 'wider than the pistol (2.4).'),
    hipSpreadAirborne: tuned(6, 'deg', 'wider than the pistol (5).'),
    firstShotKick: tuned(3.4, 'deg', 'the hardest flip of anything but the sniper: the sights leave the target on every shot.'),
    verticalKick: tuned(3.4, 'deg', 'every shot flips the same.'),
    horizontalKick: tuned(0.7, 'deg', 'it twists in the hand.'),
    recoilResetTime: tuned(0.5, 's', 'longer than the gap between two presses (0.29 s).'),
    recoilReturn: tuned(0.9, 'multiplier', 'the flip comes back down as the hammer comes back.'),
    recoilReturnDelay: tuned(0.1, 's', 'the muzzle hangs at the top a moment.'),
    recoilReturnTime: tuned(0.12, 's', 'mostly back on the target inside the 0.29 s between shots.'),
  },
};
