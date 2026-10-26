import { STATS } from '@duty-shooter/fps-core';

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
  | 'scoreboard';

export const ACTIONS: readonly Action[] = ['forward', 'back', 'left', 'right', 'fire', 'ads', 'sprint', 'crouch', 'prone', 'jump', 'reload', 'melee', 'scoreboard'];

export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  forward: 'Move forward',
  back: 'Move backward',
  left: 'Move left',
  right: 'Move right',
  fire: 'Fire',
  ads: 'Aim down sights',
  sprint: 'Sprint (double-tap: tactical sprint)',
  crouch: 'Crouch / slide',
  prone: 'Prone',
  jump: 'Jump / mantle',
  reload: 'Reload (hold: inspect)',
  melee: 'Melee',
  scoreboard: 'Scoreboard',
};

export type GraphicsPreset = 'low' | 'normal' | 'high';

export interface Settings {
  /** Key codes (KeyboardEvent.code) or Mouse0/Mouse1/Mouse2 per action. */
  readonly bindings: Readonly<Record<Action, string>>;
  readonly adsMode: 'hold' | 'toggle';
  readonly crouchMode: 'hold' | 'toggle';
  /** MW2019's mouse sensitivity scale: degrees per count = sensitivity x 0.0066. */
  readonly sensitivity: number;
  /** ADS sensitivity multiplier (low zoom). */
  readonly adsMultiplier: number;
  /** MW2019's "ADS Field of View": affected by the FOV slider, or independent of it. */
  readonly adsFov: 'affected' | 'independent';
  /** Horizontal field of view at 16:9, in degrees. */
  readonly fov: number;
  readonly preset: GraphicsPreset;
  readonly showFps: boolean;
  readonly showPing: boolean;
  readonly showRangeOverlay: boolean;
  readonly volume: number;
  readonly name: string;
  readonly passphrase: string;
  readonly firefoxTipShown: boolean;
}

/** MW2019's default bindings. */
export const DEFAULT_BINDINGS: Readonly<Record<Action, string>> = {
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
  scoreboard: 'Tab',
};

export const DEFAULT_SETTINGS: Settings = {
  bindings: DEFAULT_BINDINGS,
  adsMode: 'hold',
  crouchMode: 'toggle',
  sensitivity: 5,
  adsMultiplier: STATS.input.adsSensitivityMultiplier.value,
  adsFov: 'affected',
  fov: STATS.input.defaultFov.value,
  preset: 'normal',
  showFps: false,
  showPing: true,
  showRangeOverlay: true,
  volume: 0.8,
  name: '',
  passphrase: '',
  firefoxTipShown: false,
};

const KEY = 'duty-shooter.settings.v1';

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

/** Merges stored values over the defaults, dropping anything malformed. */
export function parseSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (raw === null || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const storedBindings = (r['bindings'] ?? {}) as Record<string, unknown>;
  const bindings = Object.fromEntries(ACTIONS.map((a) => [a, str(storedBindings[a], d.bindings[a], 32)])) as Record<Action, string>;
  return {
    bindings,
    adsMode: oneOf(r['adsMode'], ['hold', 'toggle'], d.adsMode),
    crouchMode: oneOf(r['crouchMode'], ['hold', 'toggle'], d.crouchMode),
    sensitivity: clamp(r['sensitivity'], 0.1, 50, d.sensitivity),
    adsMultiplier: clamp(r['adsMultiplier'], 0.1, 3, d.adsMultiplier),
    adsFov: oneOf(r['adsFov'], ['affected', 'independent'], d.adsFov),
    fov: clamp(r['fov'], STATS.input.minFov.value, STATS.input.maxFov.value, d.fov),
    preset: oneOf(r['preset'], ['low', 'normal', 'high'], d.preset),
    showFps: bool(r['showFps'], d.showFps),
    showPing: bool(r['showPing'], d.showPing),
    showRangeOverlay: bool(r['showRangeOverlay'], d.showRangeOverlay),
    volume: clamp(r['volume'], 0, 1, d.volume),
    name: str(r['name'], d.name, 16),
    passphrase: str(r['passphrase'], d.passphrase, 128),
    firefoxTipShown: bool(r['firefoxTipShown'], d.firefoxTipShown),
  };
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
  writeStorage(JSON.stringify(settings));
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

/** The ADS horizontal FOV (at 16:9) for the iron sights, under the ADS FOV setting. */
export function adsFovDeg(settings: Settings): number {
  const base = settings.adsFov === 'affected' ? settings.fov : STATS.input.defaultFov.value;
  return (2 * Math.atan(Math.tan((base * RAD) / 2) / STATS.weapon.ironSightZoom.value)) / RAD;
}

/**
 * Sensitivity scale while aiming: the ADS multiplier times MW2019's
 * relative (monitor distance) scaling at its coefficient, from the hipfire
 * to the ADS FOV.
 */
export function adsSensitivityScale(settings: Settings): number {
  const c = STATS.input.monitorDistanceCoefficient.value;
  const hip = verticalFov(settings.fov);
  const ads = verticalFov(adsFovDeg(settings));
  return settings.adsMultiplier * (Math.atan(c * Math.tan(ads / 2)) / Math.atan(c * Math.tan(hip / 2)));
}

/** Radians of yaw per mouse count at this sensitivity (hipfire). */
export function radiansPerCount(settings: Settings): number {
  return settings.sensitivity * STATS.input.yawPerCount.value * RAD;
}
