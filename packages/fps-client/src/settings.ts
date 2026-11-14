import { DEFAULT_LOADOUT, STATS, WEAPON_IDS, isStock, parseAttachments, parseLoadout, type Attachments, type Loadout, type WeaponId } from '@duty-shooter/fps-core';
import { DEFAULT_MIX, type MixLevels } from './audio/mix';
import type { PadLayout } from './gamepad';
import { CROSSHAIR_COLOURS, CROSSHAIR_LIMITS, CROSSHAIR_SHAPES, DEFAULT_CROSSHAIR, type CrosshairColour, type CrosshairOptions } from './hud/crosshair';
import { FRAME_CAPS } from './quality';
import { COLOUR_VISIONS, type ColourVision } from './team-colours';

/** Everything the player can bind. Escape (menu) is fixed. */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'fire'
  | 'ads'
  | 'sprint'
  | 'crouch'
  | 'prone'
  | 'jump'
  | 'reload'
  | 'melee'
  | 'switchWeapon'
  | 'grenade'
  | 'tactical'
  | 'use'
  | 'scoreboard'
  | 'map'
  | 'ping';

export const ACTIONS: readonly Action[] = ['forward', 'back', 'left', 'right', 'fire', 'ads', 'sprint', 'crouch', 'prone', 'jump', 'reload', 'melee', 'switchWeapon', 'grenade', 'tactical', 'use', 'scoreboard', 'map', 'ping'];

export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  forward: 'Move forward',
  back: 'Move backward',
  left: 'Move left',
  right: 'Move right',
  fire: 'Fire',
  ads: 'Aim down sights',
  sprint: 'Sprint',
  crouch: 'Crouch / slide',
  prone: 'Prone',
  jump: 'Jump / mantle',
  reload: 'Reload (hold: inspect)',
  melee: 'Melee',
  switchWeapon: 'Switch weapon (also 1 / 2, mouse wheel)',
  grenade: 'Grenade (hold to cook)',
  tactical: 'Tactical: smoke or flash (hold, release to throw)',
  use: 'Use (hold: plant / defuse / Revive)',
  scoreboard: 'Scoreboard',
  map: 'Island map (Battle Royale)',
  ping: 'Ping (hold: ping wheel)',
};

export interface Settings {
  /** Key codes (KeyboardEvent.code) or Mouse0/Mouse1/Mouse2 per action. */
  readonly bindings: Readonly<Record<Action, string>>;
  readonly adsMode: 'hold' | 'toggle';
  readonly crouchMode: 'hold' | 'toggle';
  /** Toggle (the default): a press runs until you stop, aim or fire. Hold: you run while the key is down. */
  readonly sprintMode: 'hold' | 'toggle';
  /** MW2019's mouse sensitivity scale: degrees per count = sensitivity x 0.0066. */
  readonly sensitivity: number;
  /** ADS sensitivity multiplier (low zoom). */
  readonly adsMultiplier: number;
  /** Controller button layout (MW2019's Default or Tactical). */
  readonly padLayout: PadLayout;
  /** Controller stick sensitivity, MW2019's 1-20 scale, horizontal and vertical. */
  readonly padSensitivityX: number;
  readonly padSensitivityY: number;
  /** Controller ADS sensitivity multiplier. */
  readonly padAdsMultiplier: number;
  readonly padInvertY: boolean;
  /** Stick deadzone, as a fraction of full travel. */
  readonly padDeadzone: number;
  /** Controller only: the look stick turns slower while the crosshair is on or beside an enemy (ticket 13). */
  readonly padAimAssist: boolean;
  /** How hard the controller rumbles, 0 (off) to 1 (ticket 13). */
  readonly padRumble: number;
  /** Touch look sensitivity, on the controller's 1-20 scale: how far a drag on the glass turns the view. */
  readonly touchSensitivity: number;
  /** Touch ADS sensitivity multiplier. */
  readonly touchAdsMultiplier: number;
  /** Touch only: the trigger pulls itself once the crosshair rests on an enemy in the weapon's range. */
  readonly touchAutoFire: boolean;
  /** Touch only: a drag turns slower while the crosshair is on or beside an enemy. */
  readonly touchAimAssist: boolean;
  /** MW2019's "ADS Field of View": affected by the FOV slider, or independent of it. */
  readonly adsFov: 'affected' | 'independent';
  /** Horizontal field of view at 16:9, in degrees. */
  readonly fov: number;
  readonly showFps: boolean;
  readonly showPing: boolean;
  readonly showRangeOverlay: boolean;
  /** The master volume, over everything (0..1). It was the only volume once, and keeps its name so a save from then keeps its level. */
  readonly volume: number;
  /** One volume per bus under the master (0..1): the score, the world and your own gun, the announcer, and the interface's own sounds. */
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly voiceVolume: number;
  readonly uiVolume: number;
  readonly name: string;
  /** What to carry, applied from the next spawn: always the chosen one of `loadouts`. */
  readonly loadout: Loadout;
  /** The three loadouts kept, each with its name (PLAN item 7); one is picked at spawn. */
  readonly loadouts: readonly LoadoutSet[];
  /** Which of `loadouts` is carried (0, 1 or 2). */
  readonly loadoutSet: number;
  /** Each gun's own build in the gunsmith (ticket 19), kept when another gun is carried; the loadout takes the build of the guns it carries. */
  readonly builds: Readonly<Partial<Record<WeaponId, Attachments>>>;
  readonly passphrase: string;
  readonly firefoxTipShown: boolean;
  /** Frames a second at most, or 0 for the display's own rate. */
  readonly fpsCap: number;
  /** Mouse look, up and down swapped. */
  readonly invertY: boolean;
  /** How much the camera and the weapon move with the body (bob, roll, landing dip, sway), 0..1. At 0 the view only turns where you turn it. */
  readonly cameraMotion: number;
  /** How much the view reacts to speed and to blasts (the sprint's wider FOV, damage and explosion shake), 0..1. */
  readonly fovEffects: number;
  /** Team colours and the enemy marker in a set that stays apart under a colour-vision deficiency. */
  readonly colourVision: ColourVision;
  /** The HUD's size, 0.8..1.3. */
  readonly hudScale: number;
  /** The announcer's lines as text. */
  readonly captions: boolean;
  readonly crosshair: CrosshairOptions;
}

/** MW2019's default bindings. */
const DEFAULT_BINDINGS: Readonly<Record<Action, string>> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  fire: 'Mouse0',
  ads: 'Mouse2',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  prone: 'ControlLeft',
  jump: 'Space',
  reload: 'KeyR',
  melee: 'KeyV',
  switchWeapon: 'KeyQ',
  grenade: 'KeyG',
  tactical: 'KeyE',
  use: 'KeyF',
  scoreboard: 'Tab',
  map: 'KeyM',
  ping: 'Mouse1',
};

/** The three loadouts a new player starts with, each a gun every Profile has open: the rifle, the SMG and the shotgun, with the pistol. */
export const DEFAULT_LOADOUT_SETS: readonly LoadoutSet[] = [
  { name: 'Main', loadout: DEFAULT_LOADOUT },
  { name: 'Close', loadout: { ...DEFAULT_LOADOUT, primary: 'smg' } },
  { name: 'Breach', loadout: { ...DEFAULT_LOADOUT, primary: 'shotgun' } },
];

export const DEFAULT_SETTINGS: Settings = {
  bindings: DEFAULT_BINDINGS,
  adsMode: 'hold',
  crouchMode: 'toggle',
  sprintMode: 'toggle',
  // Twice MW2019's defaults (5 and 6/6), which felt slow in the browser; FOV 90 instead of 80.
  sensitivity: 10,
  adsMultiplier: STATS.input.adsSensitivityMultiplier.value,
  padLayout: 'default',
  padSensitivityX: STATS.input.stickSensitivity.value * 2,
  padSensitivityY: STATS.input.stickSensitivity.value * 2,
  padAdsMultiplier: STATS.input.stickAdsMultiplier.value,
  padInvertY: false,
  padDeadzone: STATS.input.stickDeadzone.value,
  padAimAssist: true,
  padRumble: 1,
  // A thumb's swipe across half a phone turns about a right angle at 10; see touch/logic.ts for the rate.
  touchSensitivity: 10,
  touchAdsMultiplier: 1,
  touchAutoFire: true,
  touchAimAssist: true,
  adsFov: 'affected',
  fov: 90,
  showFps: false,
  showPing: true,
  showRangeOverlay: true,
  volume: DEFAULT_MIX.master,
  musicVolume: DEFAULT_MIX.music,
  effectsVolume: DEFAULT_MIX.effects,
  voiceVolume: DEFAULT_MIX.voice,
  uiVolume: DEFAULT_MIX.ui,
  name: '',
  loadout: DEFAULT_LOADOUT,
  loadouts: DEFAULT_LOADOUT_SETS,
  loadoutSet: 0,
  builds: {},
  passphrase: '',
  firefoxTipShown: false,
  fpsCap: 0,
  invertY: false,
  cameraMotion: 1,
  fovEffects: 1,
  colourVision: 'off',
  hudScale: 1,
  captions: true,
  crosshair: DEFAULT_CROSSHAIR,
};

/** The Settings screen's sections, and the settings each one holds: what "Restore defaults" puts back. */
export type SettingsSection = 'controls' | 'mouse' | 'touch' | 'video' | 'audio' | 'hud' | 'accessibility';
export const SECTION_SETTINGS: Readonly<Record<SettingsSection, readonly (keyof Settings)[]>> = {
  controls: ['bindings', 'adsMode', 'crouchMode', 'sprintMode'],
  mouse: ['sensitivity', 'adsMultiplier', 'invertY', 'padLayout', 'padSensitivityX', 'padSensitivityY', 'padAdsMultiplier', 'padInvertY', 'padDeadzone', 'padAimAssist', 'padRumble'],
  touch: ['touchSensitivity', 'touchAdsMultiplier', 'touchAutoFire', 'touchAimAssist'],
  video: ['fpsCap', 'fov', 'adsFov', 'showFps'],
  audio: ['volume', 'musicVolume', 'effectsVolume', 'voiceVolume', 'uiVolume'],
  hud: ['hudScale', 'showPing', 'showRangeOverlay', 'crosshair'],
  accessibility: ['cameraMotion', 'fovEffects', 'colourVision', 'captions'],
};

/** `settings` with one section back at its defaults; everything else, and what Auto measured, as it was. */
export function restoreDefaults(settings: Settings, section: SettingsSection): Settings {
  const patch: Partial<Record<keyof Settings, unknown>> = {};
  for (const key of SECTION_SETTINGS[section]) patch[key] = DEFAULT_SETTINGS[key];
  return { ...settings, ...(patch as Partial<Settings>) };
}

/** Whether a section is as it comes: nothing for "Restore defaults" to do. */
export function atDefaults(settings: Settings, section: SettingsSection): boolean {
  return SECTION_SETTINGS[section].every((key) => JSON.stringify(settings[key]) === JSON.stringify(DEFAULT_SETTINGS[key]));
}

const KEY = 'duty-shooter.settings.v1';

/** Stored with the settings: which defaults they were saved under. */
const DEFAULTS_VERSION = 2;

/**
 * The defaults before version 2. Saves were written whole, so a value still
 * at one of these is the old default rather than a choice, and moves to the
 * new default.
 */
const V1_DEFAULTS = { sensitivity: 5, padSensitivityX: 6, padSensitivityY: 6, fov: 80 } as const;

/** Reads browser storage, guarded: a blocked or full storage just means defaults. */
function readStorage(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {
    // Storage unavailable (private mode, quota): settings live for this session only.
  }
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => (options.includes(v as T) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string, max = 64) => (typeof v === 'string' ? v.slice(0, max) : fallback);

/** A stored crosshair over the default one, part by part. */
function parseCrosshair(raw: unknown): CrosshairOptions {
  const d = DEFAULT_CROSSHAIR;
  if (raw === null || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  return {
    shape: oneOf(r['shape'], CROSSHAIR_SHAPES, d.shape),
    size: clamp(r['size'], CROSSHAIR_LIMITS.size[0], CROSSHAIR_LIMITS.size[1], d.size),
    gap: clamp(r['gap'], CROSSHAIR_LIMITS.gap[0], CROSSHAIR_LIMITS.gap[1], d.gap),
    thickness: clamp(r['thickness'], CROSSHAIR_LIMITS.thickness[0], CROSSHAIR_LIMITS.thickness[1], d.thickness),
    colour: oneOf(r['colour'], Object.keys(CROSSHAIR_COLOURS) as CrosshairColour[], d.colour),
    dot: bool(r['dot'], d.dot),
    dynamic: bool(r['dynamic'], d.dynamic),
  };
}

/** One of the loadouts a player keeps: its name and what it carries. */
export interface LoadoutSet {
  readonly name: string;
  readonly loadout: Loadout;
}

/** `settings` carrying `loadout`, written into the chosen set as well. */
export function withLoadout(settings: Settings, loadout: Loadout): Settings {
  return { ...settings, loadout, loadouts: settings.loadouts.map((set, i) => (i === settings.loadoutSet ? { ...set, loadout } : set)) };
}

/** `settings` with the set `index` chosen: it is what the next spawn carries. */
export function pickLoadoutSet(settings: Settings, index: number): Settings {
  const set = settings.loadouts[index];
  return set ? { ...settings, loadoutSet: index, loadout: set.loadout } : settings;
}

/** The kept loadouts from storage. A save from before them keeps its one loadout as the first set; the chosen set is always the loadout carried. */
function savedSets(loadout: unknown, sets: unknown, chosen: unknown): Pick<Settings, 'loadout' | 'loadouts' | 'loadoutSet'> {
  const carried = savedLoadout(loadout) ?? DEFAULT_LOADOUT;
  const index = typeof chosen === 'number' && Number.isInteger(chosen) && chosen >= 0 && chosen < DEFAULT_LOADOUT_SETS.length ? chosen : 0;
  const kept: unknown[] = Array.isArray(sets) ? sets : [];
  const loadouts = DEFAULT_LOADOUT_SETS.map((d, i): LoadoutSet => {
    const raw = kept[i];
    if (i === index) return { name: setName(raw, d.name), loadout: carried };
    const saved = raw !== null && typeof raw === 'object' ? savedLoadout((raw as { loadout?: unknown }).loadout) : null;
    return { name: setName(raw, d.name), loadout: saved ?? d.loadout };
  });
  return { loadout: carried, loadouts, loadoutSet: index };
}

/** A kept set's name: up to 16 characters, or its default. */
function setName(raw: unknown, fallback: string): string {
  const name = raw !== null && typeof raw === 'object' ? (raw as { name?: unknown }).name : undefined;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 16) : fallback;
}

/** Merges stored values over the defaults, dropping anything malformed. */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (raw === null || typeof raw !== 'object') return d;
  const r = { ...(raw as Record<string, unknown>) };
  if (r['defaultsVersion'] !== DEFAULTS_VERSION) {
    for (const [key, old] of Object.entries(V1_DEFAULTS)) if (r[key] === old) r[key] = d[key as keyof typeof V1_DEFAULTS];
  }
  const storedBindings = (r['bindings'] ?? {}) as Record<string, unknown>;
  const bindings = Object.fromEntries(ACTIONS.map((a) => [a, str(storedBindings[a], d.bindings[a], 32)])) as Record<Action, string>;
  return {
    bindings,
    adsMode: oneOf(r['adsMode'], ['hold', 'toggle'], d.adsMode),
    crouchMode: oneOf(r['crouchMode'], ['hold', 'toggle'], d.crouchMode),
    sprintMode: oneOf(r['sprintMode'], ['hold', 'toggle'], d.sprintMode),
    sensitivity: clamp(r['sensitivity'], 0.1, 50, d.sensitivity),
    adsMultiplier: clamp(r['adsMultiplier'], 0.1, 3, d.adsMultiplier),
    padLayout: oneOf(r['padLayout'], ['default', 'tactical'], d.padLayout),
    padSensitivityX: clamp(r['padSensitivityX'], 1, 20, d.padSensitivityX),
    padSensitivityY: clamp(r['padSensitivityY'], 1, 20, d.padSensitivityY),
    padAdsMultiplier: clamp(r['padAdsMultiplier'], 0.1, 3, d.padAdsMultiplier),
    padInvertY: bool(r['padInvertY'], d.padInvertY),
    padDeadzone: clamp(r['padDeadzone'], 0, 0.5, d.padDeadzone),
    padAimAssist: bool(r['padAimAssist'], d.padAimAssist),
    padRumble: clamp(r['padRumble'], 0, 1, d.padRumble),
    touchSensitivity: clamp(r['touchSensitivity'], 1, 20, d.touchSensitivity),
    touchAdsMultiplier: clamp(r['touchAdsMultiplier'], 0.1, 3, d.touchAdsMultiplier),
    touchAutoFire: bool(r['touchAutoFire'], d.touchAutoFire),
    touchAimAssist: bool(r['touchAimAssist'], d.touchAimAssist),
    adsFov: oneOf(r['adsFov'], ['affected', 'independent'], d.adsFov),
    fov: clamp(r['fov'], STATS.input.minFov.value, STATS.input.maxFov.value, d.fov),
    showFps: bool(r['showFps'], d.showFps),
    showPing: bool(r['showPing'], d.showPing),
    showRangeOverlay: bool(r['showRangeOverlay'], d.showRangeOverlay),
    // A save from before the mix has only `volume`: it stays the master, and each bus starts at its default under it.
    volume: clamp(r['volume'], 0, 1, d.volume),
    musicVolume: clamp(r['musicVolume'], 0, 1, d.musicVolume),
    effectsVolume: clamp(r['effectsVolume'], 0, 1, d.effectsVolume),
    voiceVolume: clamp(r['voiceVolume'], 0, 1, d.voiceVolume),
    uiVolume: clamp(r['uiVolume'], 0, 1, d.uiVolume),
    name: str(r['name'], d.name, 16),
    ...savedSets(r['loadout'], r['loadouts'], r['loadoutSet']),
    builds: savedBuilds(r['builds']),
    passphrase: str(r['passphrase'], d.passphrase, 128),
    firefoxTipShown: bool(r['firefoxTipShown'], d.firefoxTipShown),
    // Everything from here on came with the Settings screen's sections: a save from before them has none, and gets the defaults.
    fpsCap: (FRAME_CAPS as readonly number[]).includes(r['fpsCap'] as number) ? (r['fpsCap'] as number) : d.fpsCap,
    invertY: bool(r['invertY'], d.invertY),
    cameraMotion: clamp(r['cameraMotion'], 0, 1, d.cameraMotion),
    fovEffects: clamp(r['fovEffects'], 0, 1, d.fovEffects),
    colourVision: oneOf(r['colourVision'], COLOUR_VISIONS, d.colourVision),
    hudScale: clamp(r['hudScale'], 0.8, 1.3, d.hudScale),
    captions: bool(r['captions'], d.captions),
    crosshair: parseCrosshair(r['crosshair']),
  };
}

/** The mix these settings ask for: the master and a level for each bus. */
export function mixOf(settings: Settings): MixLevels {
  return { master: settings.volume, music: settings.musicVolume, effects: settings.effectsVolume, voice: settings.voiceVolume, ui: settings.uiVolume };
}

/**
 * A name to play under from the first visit (next-level ticket 103): Play
 * Online joins in one click under the menu's name, and with none it only lit
 * the empty name box. Plain and visibly a stand-in, so it reads as one to
 * change; at most 16 characters, as every name.
 */
export function newcomerName(random: () => number = Math.random): string {
  return `Player ${1000 + Math.floor(random() * 9000)}`;
}

/** The settings, with a name given to a browser that has none yet (saved, so it stays the same visit to visit). */
export function settingsWithName(settings: Settings, random?: () => number): Settings {
  return settings.name.trim() ? settings : { ...settings, name: newcomerName(random) };
}

export function loadSettings(): Settings {
  const raw = readStorage();
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  writeStorage(JSON.stringify({ ...settings, defaultsVersion: DEFAULTS_VERSION }));
}

/** Human-readable name of a binding code. */
export function bindingLabel(code: string): string {
  if (code === 'Mouse0') return 'Left mouse';
  if (code === 'Mouse1') return 'Middle mouse';
  if (code === 'Mouse2') return 'Right mouse';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.replace(/(Left|Right)$/, ' $1').trim();
}

const RAD = Math.PI / 180;

/** Vertical FOV (radians) for a horizontal FOV defined at 16:9 (Hor+ at other aspects). */
export function verticalFov(horizontal16x9Deg: number): number {
  return 2 * Math.atan(Math.tan((horizontal16x9Deg * RAD) / 2) / (16 / 9));
}

/** The ADS horizontal FOV (at 16:9) for a sight of magnification `zoom` (the iron sights by default), under the ADS FOV setting. */
export function adsFovDeg(settings: Settings, zoom = STATS.weapon.ironSightZoom.value): number {
  const base = settings.adsFov === 'affected' ? settings.fov : STATS.input.defaultFov.value;
  return (2 * Math.atan(Math.tan((base * RAD) / 2) / zoom)) / RAD;
}

/**
 * Sensitivity scale while aiming: the ADS multiplier (the mouse's, or the
 * controller's) times MW2019's relative (monitor distance) scaling at its
 * coefficient, from the hipfire to the ADS FOV.
 */
export function adsSensitivityScale(settings: Settings, multiplier = settings.adsMultiplier, zoom?: number): number {
  const c = STATS.input.monitorDistanceCoefficient.value;
  const hip = verticalFov(settings.fov);
  const ads = verticalFov(adsFovDeg(settings, zoom));
  return multiplier * (Math.atan(c * Math.tan(ads / 2)) / Math.atan(c * Math.tan(hip / 2)));
}

/** Radians of yaw per mouse count at this sensitivity (hipfire). */
export function radiansPerCount(settings: Settings): number {
  return settings.sensitivity * STATS.input.yawPerCount.value * RAD;
}

/**
 * Turn rate (radians per second) at full stick deflection for a stick
 * sensitivity: linear in the sensitivity, through the sourced rate at the
 * default.
 */
export function stickTurnRate(sensitivity: number): number {
  return STATS.input.stickTurnRate.value * (sensitivity / STATS.input.stickSensitivity.value) * RAD;
}

/** The gunsmith's builds saved in this browser: each gun's, kept to what it takes. */
function savedBuilds(value: unknown): Partial<Record<WeaponId, Attachments>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Partial<Record<WeaponId, Attachments>> = {};
  for (const id of WEAPON_IDS) {
    const kit = parseAttachments(id, (value as Record<string, unknown>)[id]);
    if (kit && !isStock(kit)) out[id] = kit;
  }
  return out;
}

/** A loadout saved in this browser; one saved before tacticals (ticket 20) gets the default tactical rather than none. */
function savedLoadout(value: unknown): Loadout | null {
  const loadout = parseLoadout(value);
  if (!loadout) return null;
  return 'tactical' in (value as Record<string, unknown>) ? loadout : { ...loadout, tactical: DEFAULT_LOADOUT.tactical ?? null };
}
