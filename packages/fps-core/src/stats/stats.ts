import type { Estimated, Source, Stat, Unit } from './types';

/**
 * The stats file: every MW2019 movement and weapon number the simulation
 * uses, each with its provenance. No value is invented: anything without a
 * public measurement is marked `estimated` with the method.
 *
 * Research notes behind this file (collected 2026-10-25): sym.gg has no
 * MW2019 data and TrueGameData no longer serves it. The M4A1 walk, ADS walk,
 * sprint and tactical sprint speeds come from an archived TrueGameData
 * Warzone 1 dataset; most other movement values are estimates from IW-engine
 * lineage dvars (CoD4/WaW defaults) and close relatives. They are
 * placeholders to replace with measured values.
 *
 * Weapon research (2026-10-26): the same archived TGD dataset gives the
 * M4A1's fire rate, ADS, sprint-to-fire, reload, magazine, bullet velocity
 * and zoom. The damage profile comes from MeinMMO's write-up of MutantMedia
 * and TheXclusiveAce data (December 2019). Hit-zone multipliers,
 * spread, recoil, melee, flinch and draw time were not found anywhere
 * and are estimates.
 *
 * IW engine units are inches; values given in units by the research are
 * converted with {@link IW_UNIT}.
 */

/** One IW engine unit (an inch) in metres. */
export const IW_UNIT = 0.0254;

const COLLECTED = '2026-10-25';

function sourced<U extends Unit>(value: number, unit: U, source: Omit<Source, 'collected'>, tolerance: number, note?: string): Stat<U> {
  return {
    value,
    unit,
    provenance: { kind: 'sourced', source: { ...source, collected: COLLECTED }, tolerance, ...(note ? { note } : {}) },
  };
}

function estimated<U extends Unit>(value: number, unit: U, method: string, tolerance?: number): Stat<U> {
  const provenance: Estimated = { kind: 'estimated', method, collected: COLLECTED, ...(tolerance === undefined ? {} : { tolerance }) };
  return { value, unit, provenance };
}

// Sources referenced more than once.
const WAW_DVAR_DUMP = 'https://www.ugx-mods.com/forum/scripting/50/dvar-dump/21388/';
const UPCOMER_REGEN: Omit<Source, 'collected'> = {
  name: 'Upcomer (analysis of TheXclusiveAce testing, 2020-01-04)',
  url: 'https://upcomer.com/is-the-quickfix-perk-worth-running-in-modern-warfare/',
};
const PCGAMINGWIKI: Omit<Source, 'collected'> = {
  name: 'PCGamingWiki',
  url: 'https://www.pcgamingwiki.com/wiki/Call_of_Duty:_Modern_Warfare',
};

/**
 * TrueGameData's Warzone 1 base data (final WZ1 patch, 2023-10-23), whose rows
 * carry game "mw": the MW2019 weapons. Handling and movement were shared with
 * MW2019 multiplayer in that era, but the dataset itself cannot prove it.
 * Unit definitions: TGD glossary, https://web.archive.org/web/20210115214145/https://truegamedata.com/glossary.php
 */
const TGD_WZ1_M4A1: Omit<Source, 'collected'> = {
  name: 'TrueGameData Warzone 1 base data, M4A1 row (Wayback capture 2023-11-18)',
  url: 'https://web.archive.org/web/20231118105140id_/https://www.truegamedata.com/api/weapons/api.php?game=wz&action=all_base_data',
};

const WALK_SPEED = 4.78;
const ADS_WALK_SPEED = 2.52;

export const STATS = {
  /** Ground and air movement for a player holding the stock M4A1. */
  movement: {
    walkSpeed: sourced(WALK_SPEED, 'm/s', TGD_WZ1_M4A1, 0.05, 'TGD field movement: 4.78. Replaces the earlier IW-lineage estimate (g_speed 190 u/s = 4.83 m/s).'),
    sprintSpeed: sourced(6.22, 'm/s', TGD_WZ1_M4A1, 0.05, 'TGD field sprint: 6.22. Replaces the earlier estimate of 6.50 m/s (1.35x walk).'),
    sprintSpeedUpperBound: sourced(
      7.0,
      'm/s',
      {
        name: 'TrueGameData via DBLTap (2021-10-02)',
        url: 'https://www.dbltap.com/posts/truegamedata-reveals-how-to-get-the-fastest-movement-possible-in-warzone-01fh0z438ed8',
      },
      0,
      'The OTs 9 is the only Warzone (MW2019 engine) weapon whose base sprint exceeds 7 m/s, so the M4A1 base sprint is below this.',
    ),
    tacticalSprintSpeed: sourced(7.43, 'm/s', TGD_WZ1_M4A1, 0.05, 'TGD field tac_sprint: 7.43. Replaces the earlier estimate of 7.80 m/s (1.2x sprint).'),
    tacticalSprintDuration: estimated(
      2.0,
      's',
      '8 s with Double Time and Combat Knife (XclusiveAce pinned comment, https://www.youtube.com/watch?v=nt2wTcpR2V8, seen via search snippet) divided by 2 for Double Time (https://callofduty.fandom.com/wiki/Double_Time) and 2 for the knife (https://upcomer.com/fastest-way-to-move-in-modern-warfare-revealed-in-a-video), assuming the multipliers stack.',
      0.5,
    ),
    tacticalSprintRecharge: estimated(
      4.0,
      's',
      'Placeholder, not measured. Sources only say stamina regenerates over time after each use (https://callofduty.fandom.com/wiki/Tactical_Sprint).',
      2.0,
    ),
    strafeMultiplier: estimated(
      0.8,
      'multiplier',
      `IW lineage player_strafeSpeedScale 0.8 (${WAW_DVAR_DUMP}). Not yet replaced by TGD's strafe value (see tgdStrafeSpeed): whether that is a hipfire or an ADS strafe speed could not be checked.`,
      0.05,
    ),
    tgdStrafeSpeed: sourced(
      2.85,
      'm/s',
      TGD_WZ1_M4A1,
      0.05,
      'TGD field strafe: 2.85. Not used by the simulation yet: the archived glossary could not be read to tell whether this is hipfire strafe (it would make the strafe multiplier 2.85 / 4.78 = 0.60) or ADS strafe.',
    ),
    backpedalMultiplier: estimated(0.7, 'multiplier', `IW lineage player_backSpeedScale 0.7 (${WAW_DVAR_DUMP}).`, 0.05),
    adsWalkSpeed: sourced(ADS_WALK_SPEED, 'm/s', TGD_WZ1_M4A1, 0.05, 'TGD field ads_movement: 2.52.'),
    adsMoveMultiplier: sourced(
      ADS_WALK_SPEED / WALK_SPEED,
      'multiplier',
      TGD_WZ1_M4A1,
      0.01,
      'Derived: ads_movement / movement = 2.52 / 4.78 = 0.527. Replaces the earlier 0.6 borrowed from CoD Mobile.',
    ),
    crouchMultiplier: estimated(0.65, 'multiplier', 'IW3 (CoD4) pmove crouch scale 0.65, remembered from decompiled PM_CmdScale_Walk; no web page verified it.', 0.05),
    proneMultiplier: estimated(0.15, 'multiplier', 'IW3 (CoD4) pmove prone scale 0.15, remembered; not verified.', 0.05),
    gravity: estimated(
      800 * IW_UNIT,
      'm/s²',
      `IW lineage g_gravity 800 u/s² (${WAW_DVAR_DUMP}). Not verified for MW2019; xlabs-mirror lists 600 for IW4x/IW6x/S1x.`,
      0.1 * 800 * IW_UNIT,
    ),
    jumpHeight: estimated(39 * IW_UNIT, 'm', `IW lineage jump_height 39 u (${WAW_DVAR_DUMP}).`, 4 * IW_UNIT),
    stepHeight: estimated(18 * IW_UNIT, 'm', `IW lineage jump_stepSize 18 u (${WAW_DVAR_DUMP}).`, 2 * IW_UNIT),
    groundFriction: estimated(5.5, '1/s', `IW lineage friction 5.5, Quake-style (${WAW_DVAR_DUMP}).`, 1),
    stopSpeed: estimated(100 * IW_UNIT, 'm/s', `IW lineage stopspeed 100 u/s (${WAW_DVAR_DUMP}).`, 20 * IW_UNIT),
    groundAcceleration: estimated(10, '1/s', 'Quake III pm_accelerate 10, which IW pmove descends from; IW dumps do not expose it. Tune so 0 to walk speed takes about 0.2-0.3 s.'),
    airAcceleration: estimated(1, '1/s', 'Quake III pm_airaccelerate 1.0; IW has weak air control. Tune by feel.'),
  },

  /** Eye heights and stance transition times. */
  stance: {
    standEyeHeight: estimated(60 * IW_UNIT, 'm', 'IW3 default stand view height, 60 u.', 4 * IW_UNIT),
    crouchEyeHeight: estimated(40 * IW_UNIT, 'm', 'IW3 default crouch view height, 40 u.', 4 * IW_UNIT),
    proneEyeHeight: estimated(11 * IW_UNIT, 'm', 'IW3 default prone view height, 11 u.', 3 * IW_UNIT),
    standCrouchTime: estimated(0.2, 's', 'IW-style view-height lerp; measure by frame count.', 0.05),
    toProneTime: estimated(0.6, 's', 'Placeholder: MW2019 prone is visibly slower than crouch; measure by frame count.', 0.1),
    proneToStandTime: estimated(0.7, 's', 'Placeholder; measure by frame count.', 0.1),
    proneToCrouchTime: estimated(0.5, 's', 'Placeholder; measure by frame count.', 0.1),
    hullHalfWidth: estimated(15 * IW_UNIT, 'm', 'IW3 (CoD4) player bounds mins (-15, -15, 0) / maxs (15, 15, 70), remembered from the IW3 game source lineage; not verified for MW2019.'),
    standHullHeight: estimated(70 * IW_UNIT, 'm', 'IW3 (CoD4) standing bounds maxs z = 70 u, remembered; not verified for MW2019.'),
    crouchHullHeight: estimated(50 * IW_UNIT, 'm', 'IW3 (CoD4) crouched bounds maxs z = 50 u, remembered; not verified for MW2019.'),
    proneHullHeight: estimated(30 * IW_UNIT, 'm', 'IW3 (CoD4) prone bounds maxs z = 30 u, remembered; not verified for MW2019.'),
  },

  /** Mantle height bands (upper edge of each band, above the step height) and durations. */
  mantle: {
    lowVaultMaxHeight: estimated(24 * IW_UNIT, 'm', 'From IW jump_stepSize (18 u) up to about knee height, 24 u.', 4 * IW_UNIT),
    waistMantleMaxHeight: estimated(48 * IW_UNIT, 'm', 'Human proportions at a 60 u eye height: waist-high band up to 48 u.', 6 * IW_UNIT),
    highClimbMaxHeight: estimated(80 * IW_UNIT, 'm', 'MW2019 lets you pull up onto roughly head-plus-arm-reach ledges, about 2 m (80 u).', 8 * IW_UNIT),
    lowVaultDuration: estimated(0.45, 's', 'Placeholder; measure by frame count.', 0.1),
    waistMantleDuration: estimated(0.75, 's', 'Placeholder; measure by frame count.', 0.1),
    highClimbDuration: estimated(1.2, 's', 'Placeholder; measure by frame count.', 0.15),
    reach: estimated(20 * IW_UNIT, 'm', 'IW lineage dvar mantle_check_range 20 u (horizontal distance from the player bounds to the ledge), remembered from CoD4/WaW; not verified.'),
  },

  /** Slide from sprint and slide-cancel. */
  slide: {
    duration: estimated(0.9, 's', 'Placeholder; measure by frame count.', 0.15),
    distance: estimated(180 * IW_UNIT, 'm', 'About the integral of an exponential-ish decay from slide entry speed to crouch speed over the slide duration, 180 u.', 0.75),
    cameraRoll: estimated(5, 'deg', 'Visual guess.', 3),
    cancelWindowOpen: estimated(
      0.15,
      's',
      'A minimum delay after slide start before cancel works is sourced qualitatively (Prima Games via search summary, https://primagames.com/tips/call-duty-modern-warfare-how-slide-cancel); the value is a guess. The window closes at slide end.',
      0.05,
    ),
  },

  /** Fall damage: none below minHeight, linear up to lethal at lethalHeight. */
  fallDamage: {
    minHeight: estimated(200 * IW_UNIT, 'm', `IW lineage bg_fallDamageMinHeight 200 u (${WAW_DVAR_DUMP}, a WaW zombies config). CoD4 MP believed 128 u, unverified.`, 25 * IW_UNIT),
    lethalHeight: estimated(350 * IW_UNIT, 'm', `IW lineage bg_fallDamageMaxHeight 350 u (${WAW_DVAR_DUMP}). CoD4 MP believed 300 u, unverified.`, 25 * IW_UNIT),
  },

  /** Player health and regeneration. */
  health: {
    max: sourced(
      100,
      'HP',
      {
        name: 'Charlie Intel',
        url: 'https://www.charlieintel.com/modern-warfare/modern-warfare-devs-make-secret-ttk-change-with-major-health-boost-180125/',
      },
      0,
      'Indirect: reports Ground War health changing from the standard 100 to 150.',
    ),
    regenDelay: sourced(6, 's', UPCOMER_REGEN, 0.5, 'Secondary source; the article says "around 6 seconds" after the last damage.'),
    regenDuration: sourced(1.4, 's', UPCOMER_REGEN, 0.3, 'Time from regen start to full health. Secondary source.'),
  },

  /** The stock M4A1 (iron sights, full auto, no attachments). */
  weapon: {
    fireRate: sourced(809, 'rpm', TGD_WZ1_M4A1, 10, 'TGD field rpm: 809. MeinMMO (2019-12-10) and Kavo give 800 and 793.'),
    magazineSize: sourced(30, 'rounds', TGD_WZ1_M4A1, 0, 'TGD field mag_size: 30.'),
    muzzleVelocity: sourced(628, 'm/s', TGD_WZ1_M4A1, 10, 'TGD field bv (bullet velocity): 628.'),
    projectileGravity: estimated(9.81, 'm/s²', 'Standard gravity. MW2019 bullets drop, but the drop rate has not been published.', 1),
    projectileMaxRange: estimated(1000, 'm', 'Beyond any sightline on the map; projectiles are removed past this distance.'),
    adsTime: sourced(0.242, 's', TGD_WZ1_M4A1, 1 / 60, 'TGD field ads: 242 ms. ADS out uses the same time (estimated).'),
    ironSightZoom: sourced(1.1, 'multiplier', TGD_WZ1_M4A1, 0, 'TGD field zoom1: 1.1, read as the iron-sight magnification: ADS FOV = hipfire FOV / 1.1 (interpretation not confirmed).'),
    sprintToFire: sourced(0.246, 's', TGD_WZ1_M4A1, 1 / 60, 'TGD field stf: 246 ms.'),
    tacticalSprintToFire: sourced(0.371, 's', TGD_WZ1_M4A1, 1 / 60, 'TGD field sstf (super sprint to fire): 371 ms.'),
    tacticalReloadAddAmmo: sourced(
      1.39,
      's',
      { name: 'MeinMMO (MutantMedia and TheXclusiveAce data, 2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' },
      0.1,
      'Article lists reload 1.39 s without saying which; read as the tactical add-ammo point, the time testers usually report.',
    ),
    tacticalReloadDuration: sourced(2.23, 's', TGD_WZ1_M4A1, 0.1, 'TGD field reload: 2.23 s, read as the full tactical reload animation (interpretation not confirmed).'),
    emptyReloadAddAmmo: estimated(1.8, 's', 'Tactical add-ammo point (1.39 s) plus about 0.4 s for the bolt release, the gap typical of IW ARs; unmeasured.', 0.15),
    emptyReloadDuration: estimated(2.75, 's', 'Tactical duration (2.23 s) plus about 0.5 s for the bolt release; unmeasured.', 0.15),
    drawTime: estimated(0.8, 's', 'Spawn raise animation; not found in any source. Visual estimate from MW2019 footage.', 0.1),
    inspectHoldTime: estimated(0.4, 's', 'How long reload must be held to inspect; chosen so a normal reload tap never inspects.'),
    inspectDuration: estimated(4.5, 's', 'Inspect animation length; visual estimate.'),
    recoilResetTime: estimated(0.25, 's', 'Pause in fire after which the recoil pattern restarts from the first shot; IW-style.'),
  },

  /** Damage profile of the stock M4A1 (torso damage per range band). */
  damage: {
    closeDamage: sourced(
      28,
      'HP',
      { name: 'MeinMMO (MutantMedia and TheXclusiveAce data, 2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' },
      0,
      'Pre-January-2020 patch values; the 2020-01-28 patch made a small range cut that was never quantified.',
    ),
    closeRange: sourced(27, 'm', { name: 'MeinMMO (2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' }, 1, '"About 27 m".'),
    midDamage: sourced(23, 'HP', { name: 'MeinMMO (2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' }, 0),
    midRange: sourced(50, 'm', { name: 'MeinMMO (2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' }, 1, '"About 50 m".'),
    farDamage: sourced(18, 'HP', { name: 'MeinMMO (2019-12-10)', url: 'https://mein-mmo.de/en/cod-modern-warfare-m4a1-the-best-loadouts-and-setups,451183' }, 0),
    headMultiplier: estimated(1.4, 'multiplier', 'Not found in any source. 1.4x is the head multiplier commonly quoted for MW2019 ARs; makes three close-range headshots plus a body shot lethal.'),
    neckMultiplier: estimated(1.0, 'multiplier', 'Not found; MW2019 ARs are commonly listed with a 1.0x neck.'),
    upperTorsoMultiplier: estimated(1.0, 'multiplier', 'Not found; the torso is the base damage the range bands describe.'),
    lowerTorsoMultiplier: estimated(1.0, 'multiplier', 'Not found; MW2019 ARs are commonly listed with a 1.0x lower torso.'),
    armMultiplier: estimated(1.0, 'multiplier', 'Not found; MW2019 ARs are commonly listed with 1.0x limbs.'),
    legMultiplier: estimated(0.9, 'multiplier', 'Not found; a small leg reduction, so leg shots can add a shot to kill at range.'),
  },

  /** Hipfire spread cone (half-angle) and the recoil pattern. */
  accuracy: {
    hipSpreadStill: estimated(2.0, 'deg', 'TGD lists hipfire 15.21 for the M4A1 in an unknown unit. Half-angle chosen so a still hipfire burst groups within a man-sized target at about 10 m.'),
    hipSpreadMoving: estimated(3.5, 'deg', 'Spread at full walk speed; MW2019 hipfire visibly blooms while moving. Visual estimate.'),
    hipSpreadAirborne: estimated(7.0, 'deg', 'Spread while airborne; MW2019 punishes jump-shots heavily. Visual estimate.'),
    firstShotKick: estimated(0.55, 'deg', 'Vertical kick of the first shot; the M4A1 has a noticeable first-shot jump. Visual estimate.'),
    verticalKick: estimated(0.38, 'deg', 'Vertical climb per later shot; tuned so a full magazine climbs about 11 deg without compensation. Visual estimate.'),
    horizontalKick: estimated(0.16, 'deg', 'Peak horizontal drift per shot; the M4A1 drifts right then left. Visual estimate.'),
  },

  /** Quick melee (gun butt). */
  melee: {
    damage: estimated(55, 'HP', 'Not found. MW2019 quick melee is a two-hit kill at full health.'),
    lungeRange: estimated(2.0, 'm', 'Not found. IW-lineage player_meleeRange 64 u (1.6 m) plus a short lunge.', 0.25),
    impactTime: estimated(0.15, 's', 'Time from press to the hit; visual estimate.'),
    duration: estimated(0.65, 's', 'Time until the gun can fire again; visual estimate.'),
  },

  /** Hit reactions, lag compensation and range dummies. */
  combat: {
    flinch: estimated(1.2, 'deg', 'Upward view kick on the victim per hit; not found in any source. Visual estimate from MW2019 footage.', 0.01),
    lagCompensationWindow: estimated(
      0.3,
      's',
      'Not an MW2019 measurement: covers 80 ms latency plus interpolation delay and jitter with margin. Source engine caps the same rewind at 1 s (sv_maxunlag).',
    ),
    dummyResetDelay: estimated(1.5, 's', 'Range dummies stand back up at full health this long after dying; a design choice.'),
  },

  /** Mouse sensitivity and field of view. */
  input: {
    yawPerCount: sourced(
      0.0066,
      'deg/count',
      { name: 'West Games sensitivity converter (MW2019 / IW 8.0 row)', url: 'https://west-games.com/call-of-duty-sensitivity-converter/' },
      0,
      'Degrees of yaw per mouse count at sensitivity 1.00.',
    ),
    defaultFov: sourced(
      80,
      'deg',
      {
        name: 'DPI Wizard, mouse-sensitivity.com forum (archived, 2019-09-20)',
        url: 'https://web.archive.org/web/20200503211942/https://www.mouse-sensitivity.com/forums/topic/6164-call-of-duty-modern-warfare-2019/',
      },
      0,
      'Horizontal degrees at 16:9, Hor+ for other aspects.',
    ),
    minFov: sourced(60, 'deg', PCGAMINGWIKI, 0, 'Horizontal at 16:9 (36 deg vertical).'),
    maxFov: sourced(120, 'deg', PCGAMINGWIKI, 0, 'Horizontal at 16:9 (89 deg vertical).'),
    adsSensitivityMultiplier: estimated(1.0, 'multiplier', 'Default of the ADS (low zoom) multiplier; separate low/high zoom multipliers are sourced (PCGamingWiki) but the 1.00 default is not.'),
    monitorDistanceCoefficient: estimated(1.33, 'multiplier', 'Remembered MW2019 menu default for Relative ADS sensitivity; not verified.'),
    stickSensitivity: estimated(
      6,
      'level',
      'Controller look sensitivity on the 1-20 scale, horizontal and vertical. 6/6 is the commonly cited default, seen as an author setting in the GameRevolution alpha settings (https://www.gamerevolution.com/?p=586077); Activision does not state it.',
    ),
    stickTurnRate: estimated(180, 'deg/s', 'Turn rate at full stick deflection at sensitivity 6; no measured MW2019 figure was found, so a typical console-shooter rate is used and scaled linearly with the sensitivity.', 40),
    stickResponseExponent: estimated(1.6, 'multiplier', 'Exponent of the stick response curve (deflection^n); the MW2019 "Standard" curve is undocumented, this keeps fine aim near the centre.'),
    stickAdsMultiplier: estimated(1.0, 'multiplier', 'Controller ADS sensitivity multiplier; the MW2019 default is undocumented, 1.00 matches the mouse default.'),
    stickDeadzone: sourced(
      0.07,
      'multiplier',
      { name: 'GameRevolution, CoD Modern Warfare and Warzone deadzone guide', url: 'https://www.gamerevolution.com/guides/652540-cod-modern-warfare-warzone-what-is-deadzone' },
      0.02,
      'Stick deadzone as a fraction of full travel.',
    ),
    proneHoldTime: estimated(0.35, 's', 'Holding the controller crouch button this long goes prone (Activision: tap Circle to crouch, hold to go prone); the hold length is not documented.', 0.1),
  },
} as const;

export type Stats = typeof STATS;
