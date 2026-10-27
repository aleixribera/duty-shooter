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
 * | Sniper  | one shot: head, neck, upper torso, any range | lower torso, limbs: 2 |
 * | Pistol  | ~450 ms within 10 m   |                     |                       |
 *
 * None of them are taken from any other game's weapon tables. Display names
 * are original and avoid manufacturer trademarks.
 */

export type WeaponId = 'm4a1' | 'smg' | 'shotgun' | 'sniper' | 'pistol';
export const WEAPON_IDS: readonly WeaponId[] = ['m4a1', 'smg', 'shotgun', 'sniper', 'pistol'];

/** How the trigger works: held for full auto, one press per shot, or a pump or bolt worked between shots. */
export type FireMode = 'auto' | 'semi' | 'pump' | 'bolt';

/** The words of a row: what the loadout screen and the presentation need to know. */
export interface WeaponTraits {
  /** Display name. */
  readonly name: string;
  /** One line on what it's for. */
  readonly role: string;
  readonly slot: 'primary' | 'secondary';
  readonly fireMode: FireMode;
  /** A magazine swapped whole, or shells loaded one at a time. */
  readonly reload: 'magazine' | 'shell';
  readonly sight: 'iron' | 'scope';
}

export interface WeaponHandling {
  /** Cyclic rate (auto), the fastest rate presses are accepted at (semi), or 60 / cycle time (pump, bolt). */
  readonly fireRate: Stat<'rpm'>;
  readonly magazineSize: Stat<'rounds'>;
  readonly muzzleVelocity: Stat<'m/s'>;
  readonly adsTime: Stat<'s'>;
  /** ADS magnification: ADS FOV = hipfire FOV / zoom. */
  readonly zoom: Stat<'multiplier'>;
  readonly sprintToFire: Stat<'s'>;
  readonly tacticalSprintToFire: Stat<'s'>;
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
  readonly recoilResetTime: Stat<'s'>;
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
    adsTime: tuned(0.18, 's', 'faster than the M4A1 (0.242 s), so the SMG suits aggressive movement.'),
    zoom: tuned(1.1, 'multiplier', 'iron sights like the M4A1.'),
    sprintToFire: tuned(0.18, 's', 'faster than the M4A1 (0.246 s): a light gun comes up from a sprint quicker.'),
    tacticalSprintToFire: tuned(0.28, 's', 'the M4A1\'s ratio of tactical to plain sprint-to-fire (1.5) on the SMG\'s 0.18 s.'),
    drawTime: tuned(0.55, 's', 'a light gun raises faster than the M4A1 (0.8 s).'),
    holsterTime: tuned(0.3, 's', 'a little quicker than the M4A1\'s 0.35 s.'),
    moveSpeed: tuned(1.05, 'multiplier', 'a light gun moves a little faster than the rifle, but slower than the pistol (1.1).'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.2, 's', 'a short magazine swap, quicker than the M4A1 (1.39 s).'),
    tacticalDuration: tuned(1.75, 's', 'the M4A1\'s gap from add-ammo to ready, shortened for a lighter gun.'),
    emptyAddAmmo: tuned(1.55, 's', 'tactical plus 0.35 s to cock the bolt.'),
    emptyDuration: tuned(2.2, 's', 'tactical duration plus 0.45 s to cock the bolt.'),
  },
  damage: {
    bands: {
      close: { range: tuned(12, 'm', 'the close band of the time-to-kill target ("about 170 ms within 12 m").'), damage: tuned(26, 'HP', 'four torso hits kill: 3 intervals at 950 rpm = 189 ms, about the 170 ms target.') },
      medium: { range: tuned(25, 'm', 'the medium band of the target ("about 330 ms by 25 m").'), damage: tuned(18, 'HP', 'six torso hits kill: 5 intervals at 950 rpm = 316 ms, about the 330 ms target.') },
      long: { damage: tuned(14, 'HP', 'eight torso hits kill (442 ms), worse than the M4A1\'s five or six (297-371 ms) past 25 m.') },
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
    hipSpreadStill: tuned(1.6, 'deg', 'tighter than the M4A1 (2.0): the SMG is meant to be fired from the hip up close.'),
    hipSpreadMoving: tuned(2.8, 'deg', 'tighter than the M4A1 (3.5) for the same reason.'),
    hipSpreadAirborne: tuned(6, 'deg', 'a little tighter than the M4A1 (7).'),
    firstShotKick: tuned(0.4, 'deg', 'a light first-shot jump.'),
    verticalKick: tuned(0.32, 'deg', 'a little less climb per shot than the M4A1 (0.38), at a higher rate.'),
    horizontalKick: tuned(0.2, 'deg', 'more side drift than the M4A1 (0.16).'),
    kickBounce: tuned(0.35, 'multiplier', 'each later shot\'s climb alternates 35 % up and down: the bounce the spec asks for, which stays controllable.'),
    recoilResetTime: tuned(0.22, 's', 'about the M4A1\'s 0.25 s.'),
  },
};

/** The pistol: a 9 mm semi-automatic on the Glock 17's numbers, the only secondary. */
export const PISTOL: WeaponRow = {
  traits: { name: 'Warden 9', role: 'A quick draw for when the primary runs dry.', slot: 'secondary', fireMode: 'semi', reload: 'magazine', sight: 'iron' },
  handling: {
    fireRate: tuned(400, 'rpm', 'the fastest rate presses are accepted at (semi-automatic): four hits at 150 ms intervals kill in 450 ms, the target within 10 m.'),
    magazineSize: sourced(17, 'rounds', GLOCK_17, 0, 'The article describes the Glock 17 magazines as having "a 17-round capacity".'),
    muzzleVelocity: sourced(360, 'm/s', PARABELLUM, 15, '115 gr Federal FMJ from a 118 mm test barrel: 1,180 ft/s (360 m/s).'),
    adsTime: tuned(0.15, 's', 'the quickest to aim of every weapon.'),
    zoom: tuned(1.1, 'multiplier', 'iron sights like the M4A1.'),
    sprintToFire: tuned(0.12, 's', 'half the M4A1\'s 0.246 s: a pistol comes up at once.'),
    tacticalSprintToFire: tuned(0.2, 's', 'the M4A1\'s ratio of tactical to plain sprint-to-fire (1.5), rounded.'),
    drawTime: tuned(0.4, 's', 'switching from a primary (holster 0.3-0.4 s) to the pistol takes under a second, faster than any primary\'s reload, as the spec asks.'),
    holsterTime: tuned(0.25, 's', 'the quickest to put away.'),
    moveSpeed: tuned(1.1, 'multiplier', 'faster than with any primary, as the spec asks.'),
  },
  reload: {
    tacticalAddAmmo: tuned(1.05, 's', 'a pistol magazine goes in quicker than a rifle\'s (1.39 s).'),
    tacticalDuration: tuned(1.4, 's', 'add-ammo plus a short settle.'),
    emptyAddAmmo: tuned(1.3, 's', 'tactical plus 0.25 s to release the slide.'),
    emptyDuration: tuned(1.75, 's', 'tactical duration plus 0.35 s for the slide.'),
  },
  damage: {
    bands: {
      close: { range: tuned(10, 'm', 'the close band of the time-to-kill target ("about 450 ms within 10 m").'), damage: tuned(28, 'HP', 'four torso hits kill (3 x 150 ms = 450 ms); three (84) do not.') },
      medium: { range: tuned(25, 'm', 'past this the pistol is a poor choice.'), damage: tuned(22, 'HP', 'five torso hits kill.') },
      long: { damage: tuned(17, 'HP', 'six torso hits kill.') },
    },
    headMultiplier: tuned(1.5, 'multiplier', 'rewards a careful head shot: three to the head kill up close.'),
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
    sprintToFire: tuned(0.26, 's', 'about the M4A1\'s 0.246 s.'),
    tacticalSprintToFire: tuned(0.38, 's', 'about the M4A1\'s 0.371 s.'),
    drawTime: tuned(0.65, 's', 'between the SMG (0.55 s) and the M4A1 (0.8 s).'),
    holsterTime: tuned(0.35, 's', 'as the M4A1.'),
    moveSpeed: tuned(1, 'multiplier', 'as the M4A1.'),
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
      point: { range: tuned(5, 'm', 'the one-shot band of the target ("one shot within 5 m").'), damage: tuned(20, 'HP', 'per pellet: 5 of the 8 pellets kill, and inside 5 m nearly all of them land.') },
      close: { range: tuned(12, 'm', 'the two-shot band of the target ("two shots within 12 m").'), damage: tuned(13, 'HP', 'per pellet: 8 x 13 = 104 needs every pellet, so one shot rarely kills, and two do.') },
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
  },
};

/** The sniper rifle: a bolt action in 7.62x51 mm on the M24's numbers, with a scope. */
export const SNIPER: WeaponRow = {
  traits: { name: 'Ridgeline .308', role: 'One shot to the upper body at any range; poor up close.', slot: 'primary', fireMode: 'bolt', reload: 'magazine', sight: 'scope' },
  handling: {
    fireRate: tuned(54.5, 'rpm', `60 / the 1.1 s bolt cycle. The M24's practical rate is 20 rounds a minute (${M24.url}), aimed shot after aimed shot.`),
    magazineSize: sourced(5, 'rounds', M24, 0, '"5-round internal magazine" (M24).'),
    muzzleVelocity: sourced(790, 'm/s', M24, 10, '"2,580 ft/s (790 m/s) w/M118LR Sniper load (175 gr.)".'),
    adsTime: tuned(0.55, 's', 'more than twice the M4A1 (0.242 s): the sniper is slow to aim, as the spec asks.'),
    zoom: tuned(4, 'multiplier', 'the M24\'s fixed 10x scope would make Switchyard\'s 60-80 m lanes a keyhole; 4x is a low setting of a variable scope.'),
    sprintToFire: tuned(0.42, 's', 'a heavy rifle comes up slowly from a sprint.'),
    tacticalSprintToFire: tuned(0.55, 's', 'slower still from a tactical sprint.'),
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
    lowerTorsoMultiplier: tuned(0.8, 'multiplier', '84: two hits, as the spec asks.'),
    armMultiplier: tuned(0.75, 'multiplier', '79: two hits.'),
    legMultiplier: tuned(0.7, 'multiplier', '74: two hits.'),
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
    sway: tuned(1.2, 'deg', 'scope sway on first aiming: at 50 m it moves the aim point a metre, so a quick scope across the map is a gamble.'),
    swaySettle: tuned(1.5, 's', 'standing still this long settles the sway to a fifth, as the spec asks ("settles over about 1.5 s").'),
  },
};
