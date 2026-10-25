import type { Estimated, Source, Stat, Unit } from './types';

/**
 * The stats file: every MW2019 movement and weapon number the simulation
 * uses, each with its provenance. No value is invented: anything without a
 * public measurement is marked `estimated` with the method.
 *
 * Research notes behind this file (collected 2026-10-25): sym.gg has no
 * MW2019 data and TrueGameData no longer serves it, so nearly all movement
 * values are estimates from IW-engine lineage dvars (CoD4/WaW defaults) and
 * close relatives. They are placeholders to replace with measured values.
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

const WALK_SPEED = 190 * IW_UNIT;

export const STATS = {
  /** Ground and air movement for a player holding the stock M4A1. */
  movement: {
    walkSpeed: estimated(
      WALK_SPEED,
      'm/s',
      `IW-engine g_speed default of 190 u/s (${WAW_DVAR_DUMP}, https://xlabs-mirror.github.io/console_commands) times an assumed M4A1 move scale of 1.00. An unverified third-party table gives the M4A1 99% movement speed.`,
      0.05 * WALK_SPEED,
    ),
    sprintSpeed: estimated(
      256 * IW_UNIT,
      'm/s',
      'About 1.35x walk speed (256 u/s), between the CoD Mobile ratio (1.30) and IW lineage player_sprintSpeedScale 1.5, chosen to stay under the sourced 7.0 m/s upper bound (see sprintSpeedUpperBound).',
      0.3,
    ),
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
    tacticalSprintSpeed: estimated(
      307 * IW_UNIT,
      'm/s',
      'About 1.2x sprint speed (307 u/s), an assumed ratio for the IW8/IW9 family. No MW2019 measurement found.',
      0.5,
    ),
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
    strafeMultiplier: estimated(0.8, 'multiplier', `IW lineage player_strafeSpeedScale 0.8 (${WAW_DVAR_DUMP}).`, 0.05),
    backpedalMultiplier: estimated(0.7, 'multiplier', `IW lineage player_backSpeedScale 0.7 (${WAW_DVAR_DUMP}).`, 0.05),
    adsMoveMultiplier: estimated(
      0.6,
      'multiplier',
      'Ratio borrowed from CoD Mobile M4 (2.8 m/s ADS vs 4.67 m/s walk, https://callofduty.fandom.com/wiki/M4A1), which is not MW2019.',
      0.05,
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
  },
} as const;

export type Stats = typeof STATS;
