/**
 * Picture quality (next-level ticket 22): the tiers and what each one turns
 * on, the controller that moves the render scale to hold a frame time, the
 * search that picks a tier for Auto, and the frame-rate cap. No three.js and
 * no DOM: the renderer, the views and the Settings screen all read this one
 * table.
 */

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
/** What the player picks: a tier, or Auto, which measures and picks one. */
export type QualityChoice = 'auto' | QualityTier;

/** The tiers, cheapest first. */
export const QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];
export const QUALITY_CHOICES: readonly QualityChoice[] = ['auto', ...QUALITY_TIERS];

/** Everything a tier decides. One row of the table per tier, below. */
export interface QualityProfile {
  readonly tier: QualityTier;
  readonly name: string;
  /** The side of the rendered picture, as a share of the native one, while dynamic resolution is off. */
  readonly renderScale: number;
  /** The most pixels a frame renders (millions) before the scale: past it the frame renders smaller. */
  readonly megapixels: number;
  /** The sun's realtime shadow map: its side (texels), how far it reaches either side of the player (m), and its redraws a second at most. */
  readonly shadowMapSize: number;
  readonly shadowDistance: number;
  readonly shadowRate: number;
  /** Ambient occlusion (GTAO at half resolution): its samples a pixel, or 0 for none. */
  readonly aoSamples: number;
  /** Temporal anti-aliasing, or FXAA: one pass over the finished frame, no history and no velocity buffer. */
  readonly antialias: 'taa' | 'fxaa';
  /** Sun shafts. */
  readonly shafts: boolean;
  /** Bloom on flashes and glints. */
  readonly bloom: boolean;
  /** Heat shimmer far off. */
  readonly shimmer: boolean;
  /** MSAA samples on the viewmodel's own pass. */
  readonly viewmodelSamples: number;
  /** Particles drawn, as a share of the full count (sparks, dust, debris, casings). */
  readonly particles: number;
  /** Grass, plants and scattered props: the share planted, and how far they draw as a share of the full distance. */
  readonly scatterDensity: number;
  readonly scatterDistance: number;
  /** Texture anisotropy at most. */
  readonly anisotropy: number;
  /** Dust motes in the indoor light. */
  readonly dust: boolean;
}

/**
 * The table. High is the picture the game shipped with before tiers; Low is
 * for an integrated GPU or a phone; Ultra spends what a strong card has spare
 * on shadows, resolution and filtering. Measured frame times per tier and map
 * are in the ticket.
 */
export const QUALITY: Readonly<Record<QualityTier, QualityProfile>> = {
  low: {
    tier: 'low',
    name: 'Low',
    renderScale: 0.7,
    megapixels: 2.1,
    shadowMapSize: 1024,
    shadowDistance: 30,
    shadowRate: 30,
    aoSamples: 0,
    antialias: 'fxaa',
    shafts: false,
    bloom: false,
    shimmer: false,
    viewmodelSamples: 1,
    particles: 0.4,
    scatterDensity: 0.35,
    scatterDistance: 0.6,
    anisotropy: 2,
    dust: false,
  },
  medium: {
    tier: 'medium',
    name: 'Medium',
    renderScale: 0.85,
    megapixels: 2.6,
    shadowMapSize: 1024,
    shadowDistance: 36,
    shadowRate: 60,
    aoSamples: 0,
    antialias: 'taa',
    shafts: false,
    bloom: true,
    shimmer: false,
    viewmodelSamples: 4,
    particles: 0.7,
    scatterDensity: 0.65,
    scatterDistance: 0.8,
    anisotropy: 4,
    dust: true,
  },
  high: {
    tier: 'high',
    name: 'High',
    renderScale: 1,
    megapixels: 3.7,
    shadowMapSize: 2048,
    shadowDistance: 45,
    shadowRate: 60,
    aoSamples: 8,
    antialias: 'taa',
    shafts: true,
    bloom: true,
    shimmer: true,
    viewmodelSamples: 4,
    particles: 1,
    scatterDensity: 1,
    scatterDistance: 1,
    anisotropy: 8,
    dust: true,
  },
  ultra: {
    tier: 'ultra',
    name: 'Ultra',
    renderScale: 1,
    megapixels: 8.3,
    shadowMapSize: 4096,
    shadowDistance: 60,
    shadowRate: 120,
    aoSamples: 16,
    antialias: 'taa',
    shafts: true,
    bloom: true,
    shimmer: true,
    viewmodelSamples: 4,
    particles: 1,
    scatterDensity: 1,
    scatterDistance: 1.3,
    anisotropy: 16,
    dust: true,
  },
};

/** The tier a choice draws at: the chosen one, or under Auto the one it found (`found`), or its guess while it has none. */
export function tierOf(choice: QualityChoice, found: QualityTier | null, guess: QualityTier = 'medium'): QualityTier {
  return choice === 'auto' ? (found ?? guess) : choice;
}

/** The tier `steps` above (or below) another, kept inside the table. */
export function tierBy(tier: QualityTier, steps: number): QualityTier {
  const at = QUALITY_TIERS.indexOf(tier) + steps;
  return QUALITY_TIERS[Math.min(QUALITY_TIERS.length - 1, Math.max(0, at))]!;
}

/** The quality the views read as they are built, and the pipeline as it is put together. High until the page says otherwise. */
let current: QualityProfile = QUALITY.high;

/** A texture, as far as its filtering goes. */
interface Filtered {
  anisotropy: number;
  needsUpdate: boolean;
}

/** Every texture filtered by the tier, with the anisotropy it has on High, so a change of tier reaches the ones already loaded. */
const filtered: { readonly texture: WeakRef<Filtered>; readonly base: number }[] = [];

/** The anisotropy a texture gets now, from the one it has on High (`base`). */
export function anisotropyFor(base: number): number {
  return Math.max(1, Math.round((base * current.anisotropy) / QUALITY.high.anisotropy));
}

/** Gives a texture the tier's anisotropy (`base` is what it has on High), now and whenever the tier changes. */
export function filterByQuality<T extends Filtered>(texture: T, base: number): T {
  texture.anisotropy = anisotropyFor(base);
  filtered.push({ texture: new WeakRef(texture), base });
  return texture;
}

export function useQuality(profile: QualityProfile): void {
  if (profile === current) return;
  const before = current.anisotropy;
  current = profile;
  if (before === profile.anisotropy) return;
  for (let i = filtered.length - 1; i >= 0; i--) {
    const texture = filtered[i]!.texture.deref();
    if (!texture) filtered.splice(i, 1);
    else {
      texture.anisotropy = anisotropyFor(filtered[i]!.base);
      texture.needsUpdate = true;
    }
  }
}

export function currentQuality(): QualityProfile {
  return current;
}

/**
 * Whether the thing numbered `index` is among the `share` that is kept: the
 * same ones every time, spread evenly, and everything a smaller share keeps is
 * kept by a larger one.
 */
export function keeps(index: number, share: number): boolean {
  if (share >= 1) return true;
  // The golden ratio's multiples fill 0..1 evenly in any order.
  return (index * 0.6180339887498949) % 1 < share;
}

/** How many of `count` things a share keeps: at least one of anything there was any of. */
export function shareOf(count: number, share: number): number {
  return count <= 0 ? 0 : Math.max(1, Math.round(count * Math.min(1, Math.max(0, share))));
}

/* ------------------------------------------------------------------ */
/* What the machine says about itself                                  */
/* ------------------------------------------------------------------ */

/** What the page can read of the machine before drawing anything. */
export interface AdapterHints {
  readonly backend: 'webgpu' | 'webgl2';
  /** The adapter as the browser names it (vendor, architecture, device, renderer string), or '' where it says nothing. */
  readonly adapter: string;
  /** A software rasteriser (WebGPU's fallback adapter). */
  readonly software: boolean;
  /** A phone or a tablet. */
  readonly mobile: boolean;
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render|warp/i;
const DISCRETE = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|\brx ?\d{3,4}|arc\b|apple m\d (pro|max|ultra)/i;
const INTEGRATED = /intel|uhd|iris|hd graphics|adreno|mali|powervr|apple|radeon(?! rx| pro)|vega|videocore/i;

/**
 * Where Auto starts, and the most it may pick, from what the adapter says of
 * itself: software draws Low and stays there, a phone starts Low and may reach
 * High, an integrated GPU or the WebGL2 fallback starts Medium, a discrete card
 * High. A name that says nothing starts Medium.
 */
export function tierFromHints(hints: AdapterHints): { readonly start: QualityTier; readonly ceiling: QualityTier } {
  if (hints.software || SOFTWARE.test(hints.adapter)) return { start: 'low', ceiling: 'low' };
  if (hints.mobile) return { start: 'low', ceiling: 'high' };
  if (hints.backend === 'webgl2') return { start: 'medium', ceiling: 'high' };
  if (DISCRETE.test(hints.adapter)) return { start: 'high', ceiling: 'ultra' };
  if (INTEGRATED.test(hints.adapter)) return { start: 'medium', ceiling: 'ultra' };
  return { start: 'medium', ceiling: 'ultra' };
}

let forcedPixelCap: number | null = null;

/**
 * For a measurement (`?megapixels=<n>`): every tier's pixel cap set to
 * `megapixels` million, so a large window loads the GPU as no tier would let
 * it; null puts the tiers' own caps back.
 */
export function forcePixelCap(megapixels: number | null): void {
  forcedPixelCap = megapixels !== null && megapixels > 0 ? megapixels : null;
}

/** The most pixels `profile` renders a frame (millions). */
export function pixelCap(profile: QualityProfile): number {
  return forcedPixelCap ?? profile.megapixels;
}

/* ------------------------------------------------------------------ */
/* The display's refresh                                               */
/* ------------------------------------------------------------------ */

/** Refresh rates displays come in (Hz). */
const REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360] as const;
/** What a frame is held to where the display says nothing (a scripted browser with its frame limit off). */
export const FALLBACK_REFRESH = 60;

/**
 * The display's refresh, from the page's animation ticks: the browser never
 * ticks faster than the display, so the quickest steady interval seen is one
 * refresh, however many frames the game itself drops. Null until it has seen
 * enough, and for good where ticks come faster than any display. The rate it
 * holds only ever goes up, unless it is told to `relearn`.
 */
export class RefreshEstimator {
  readonly #window: number[] = [];
  #best: number | null = null;
  #unlimited = false;
  /** The next full window says the rate afresh, slower or not. */
  #fresh = false;

  /** One animation tick, `intervalMs` after the last. */
  tick(intervalMs: number): void {
    if (!(intervalMs > 0) || intervalMs > 250) return;
    this.#window.push(intervalMs);
    if (this.#window.length < 60) return;
    const sorted = this.#window.splice(0).sort((a, b) => a - b);
    // The quick fifth: past the odd early tick, well under the dropped frames.
    const quick = sorted[Math.floor(sorted.length * 0.2)]!;
    if (quick < 1000 / 400) {
      this.#unlimited = true;
      return;
    }
    if (this.#best === null || quick < this.#best || this.#fresh) this.#best = quick;
    this.#fresh = false;
  }

  /**
   * The display may have slowed (a window dragged to a 60 Hz screen from a
   * 144 Hz one, a laptop gone to battery): the next full window of ticks says
   * its rate afresh. The old rate stands until then.
   */
  relearn(): void {
    this.#window.length = 0;
    this.#fresh = true;
  }

  /** The refresh rate (Hz), snapped to one displays come in, or null while unknown. */
  get hz(): number | null {
    if (this.#unlimited || this.#best === null) return null;
    const raw = 1000 / this.#best;
    let near: number = REFRESH_RATES[0];
    for (const rate of REFRESH_RATES) if (Math.abs(rate - raw) < Math.abs(near - raw)) near = rate;
    return Math.abs(near - raw) / near <= 0.06 ? near : Math.round(raw);
  }
}

/** The frame time (ms) to hold: the cap's where there is one, the display's otherwise. */
export function targetFrameMs(capFps: number, refreshHz: number | null): number {
  const refresh = refreshHz ?? FALLBACK_REFRESH;
  return 1000 / (capFps > 0 ? Math.min(capFps, refresh) : refresh);
}

/* ------------------------------------------------------------------ */
/* The frame-rate cap                                                  */
/* ------------------------------------------------------------------ */

/** The caps the Settings screen offers (frames a second); 0 is the display's own rate. */
export const FRAME_CAPS = [0, 30, 60, 90, 120, 144, 240] as const;

/**
 * A frame-rate cap over the browser's animation ticks: says which ticks draw.
 * It keeps time by the cap's own beat rather than by the last frame drawn, so
 * 60 on a 144 Hz display averages 60 and not the 48 that waiting a whole
 * interval after each frame would give.
 */
export class FrameCap {
  #next = -Infinity;

  /** Whether the tick at `now` (ms) draws a frame under a cap of `fps` (0 for none). */
  due(now: number, fps: number): boolean {
    if (!(fps > 0)) return true;
    const interval = 1000 / fps;
    // A millisecond's grace: a tick that lands a hair early is this beat's, not the next one's.
    if (now < this.#next - 1) return false;
    // Far behind (a stall, or the first frame): start the beat again from here.
    this.#next = now - this.#next > interval * 2 ? now + interval : this.#next + interval;
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Dynamic resolution                                                  */
/* ------------------------------------------------------------------ */

export interface DynamicResolutionOptions {
  /** The least and the most of the native picture's side it renders. */
  readonly floor?: number;
  readonly ceiling?: number;
  /** The scale moves in steps this big. */
  readonly step?: number;
}

/** The lowest dynamic resolution goes: half the side, a quarter of the pixels. */
export const SCALE_FLOOR = 0.5;
/** Frames judged together (ms). */
const WINDOW_MS = 400;
/** After a change, frames this long are left out: the resize itself costs one. */
const SETTLE_MS = 250;
/** A frame this long is a stall (a load, a tab switch), not a slow picture. */
const STALL_MS = 250;
/** This many long frames in a row are no stall: the picture is that slow, and they are judged like any other. */
const STALLS_IN_A_ROW = 3;
/** Over budget past this share of the target; under it at this share or less. Between the two nothing moves. */
const OVER = 1.08;
const UNDER = 1.03;
/** How long the picture must hold its target before the scale tries a step up (ms), first and at most. */
const RAISE_AFTER_MS = 2000;
const RAISE_AFTER_MAX_MS = 60_000;
/** The share of a window's frames, its slowest, left out of its average: a hitch (a shader built, a collection) is not the picture's cost. */
const HITCH_SHARE = 0.1;
/** The most steps one window over budget takes off the scale. */
const MOST_STEPS_DOWN = 5;
/** A raise that is taken back within this long (ms) failed: the next one waits twice as long. */
const PROBE_MS = 3000;

/**
 * Dynamic resolution: moves the render scale to hold a target frame time.
 *
 * It drops fast and climbs slowly. A window is judged by the average of its
 * frames without the slowest tenth, so a lone hitch moves nothing while a
 * picture that misses every fifth refresh still reads as over. A window of frames over budget cuts the
 * scale at once, by as much as the overrun says (frame time follows the pixel
 * count, the square of the scale), a few steps at most. A step back up waits until the target has
 * been held for a while, and each step up that has to be taken back doubles
 * that wait: at the edge of what the machine can do, the scale sits a step
 * under it and tries the edge once a minute instead of pumping across it.
 */
export class DynamicResolution {
  readonly #floor: number;
  readonly #ceiling: number;
  readonly #step: number;
  #scale: number;
  readonly #window: number[] = [];
  #span = 0;
  #settle = 0;
  #held = 0;
  /** Frames over `STALL_MS` in a row. */
  #stalls = 0;
  #raiseAfter = RAISE_AFTER_MS;
  /** Ms since the last step up, or null when the last change was not one (or it has stuck). */
  #sinceRaise: number | null = null;

  constructor(options: DynamicResolutionOptions = {}) {
    this.#floor = options.floor ?? SCALE_FLOOR;
    this.#ceiling = options.ceiling ?? 1;
    this.#step = options.step ?? 0.05;
    this.#scale = this.#ceiling;
  }

  /** The scale to render at now. */
  get scale(): number {
    return this.#scale;
  }

  /** Starts again from `scale` (the top by default): a new map, or dynamic resolution switched on. */
  reset(scale = this.#ceiling): void {
    this.#scale = this.#quantise(scale);
    this.#window.length = 0;
    this.#span = this.#held = this.#stalls = 0;
    this.#settle = SETTLE_MS;
    this.#raiseAfter = RAISE_AFTER_MS;
    this.#sinceRaise = null;
  }

  #quantise(scale: number): number {
    const stepped = Math.round(scale / this.#step) * this.#step;
    return Math.round(Math.min(this.#ceiling, Math.max(this.#floor, stepped)) * 1000) / 1000;
  }

  /**
   * One frame took `frameMs` against a target of `targetMs`. Returns the scale
   * for the frames to come (the same one, most frames).
   */
  frame(frameMs: number, targetMs: number): number {
    if (!(frameMs > 0) || !(targetMs > 0)) return this.#scale;
    if (frameMs <= STALL_MS) this.#stalls = 0;
    else if (++this.#stalls < STALLS_IN_A_ROW) return this.#scale;
    if (this.#settle > 0) {
      this.#settle -= frameMs;
      return this.#scale;
    }
    if (this.#sinceRaise !== null) {
      this.#sinceRaise += frameMs;
      // The step up stuck: the next one need not wait longer than the first did.
      if (this.#sinceRaise > PROBE_MS) {
        this.#sinceRaise = null;
        this.#raiseAfter = RAISE_AFTER_MS;
      }
    }
    this.#window.push(frameMs);
    this.#span += frameMs;
    if (this.#span < WINDOW_MS || this.#window.length < 4) return this.#scale;
    const frames = this.#window.splice(0).sort((a, b) => a - b);
    const kept = frames.length - Math.max(1, Math.floor(frames.length * HITCH_SHARE));
    let sum = 0;
    for (let i = 0; i < kept; i++) sum += frames[i]!;
    const load = sum / kept / targetMs;
    const span = this.#span;
    this.#span = 0;
    if (load > OVER) {
      this.#held = 0;
      if (this.#scale <= this.#floor) return this.#scale;
      if (this.#sinceRaise !== null) {
        // The step up did not hold: back to where it held, and the next try waits twice as long.
        this.#raiseAfter = Math.min(RAISE_AFTER_MAX_MS, this.#raiseAfter * 2);
        this.#sinceRaise = null;
        return this.#move(this.#quantise(this.#scale - this.#step));
      }
      // Frame time follows the pixels: the side that fits is the root of the overrun, less a little to land inside.
      // No further than a few steps at once: under v-sync a frame a hair late reads as twice the work.
      const fits = Math.max(this.#scale * Math.sqrt(1 / load) * 0.98, this.#scale - this.#step * MOST_STEPS_DOWN);
      const next = this.#quantise(Math.min(fits, this.#scale - this.#step));
      return this.#move(next);
    }
    if (load > UNDER) {
      this.#held = 0;
      return this.#scale;
    }
    this.#held += span;
    if (this.#held >= this.#raiseAfter && this.#scale < this.#ceiling) {
      this.#held = 0;
      this.#sinceRaise = 0;
      return this.#move(this.#quantise(this.#scale + this.#step));
    }
    return this.#scale;
  }

  #move(scale: number): number {
    if (scale !== this.#scale) {
      this.#scale = scale;
      this.#settle = SETTLE_MS;
    }
    return this.#scale;
  }
}

/** How much the finished frame is sharpened: the usual amount at full scale, more the further it is stretched to fill the screen. */
export function sharpenFor(scale: number): number {
  const stretched = Math.min(1, Math.max(0, (1 - scale) / (1 - SCALE_FLOOR)));
  return 0.5 + stretched * 0.7;
}

/* ------------------------------------------------------------------ */
/* Auto: finding the tier                                              */
/* ------------------------------------------------------------------ */

/** After a change of tier, frames this long are left out (ms): shaders rebuild. */
const SEARCH_SETTLE_MS = 1200;
/** Frames judged for one tier (ms). */
const SEARCH_WINDOW_MS = 1800;

/**
 * Auto's first-run measurement: draws a tier for a moment and sees whether it
 * holds the target frame time, climbing from where the adapter's hints start
 * it while tiers hold, and dropping while they don't. It ends on the highest
 * tier that held (never over the ceiling), or on Low.
 */
export class TierSearch {
  readonly #ceiling: QualityTier;
  #tier: QualityTier;
  #found: QualityTier | null = null;
  #moved: 'up' | 'down' | null = null;
  #settle = SEARCH_SETTLE_MS;
  #times: number[] = [];
  #span = 0;
  /** Frames over a second in a row. */
  #stalls = 0;

  constructor(start: QualityTier, ceiling: QualityTier = 'ultra') {
    this.#ceiling = ceiling;
    this.#tier = QUALITY_TIERS.indexOf(start) > QUALITY_TIERS.indexOf(ceiling) ? ceiling : start;
  }

  /** The tier to draw now. */
  get tier(): QualityTier {
    return this.#found ?? this.#tier;
  }

  /** The tier it settled on, or null while it is still looking. */
  get found(): QualityTier | null {
    return this.#found;
  }

  /** One frame drawn at `tier` took `frameMs` against `targetMs`. */
  frame(frameMs: number, targetMs: number): void {
    if (this.#found || !(frameMs > 0)) return;
    if (this.#settle > 0) {
      this.#settle -= Math.min(frameMs, STALL_MS);
      return;
    }
    if (frameMs > STALL_MS * 4) {
      // One frame this long is a stall (a load, a tab left); several in a row are the tier itself, and it does not hold.
      if (++this.#stalls >= STALLS_IN_A_ROW) this.#judge(false);
      return;
    }
    this.#stalls = 0;
    this.#times.push(frameMs);
    this.#span += frameMs;
    if (this.#span < SEARCH_WINDOW_MS || this.#times.length < 12) return;
    const sorted = this.#times.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const slow = sorted.filter((t) => t > targetMs * 1.5).length / sorted.length;
    this.#judge(median <= targetMs * 1.12 && slow <= 0.1);
  }

  /** The tier on show held the target, or did not: up, down, or found. */
  #judge(holds: boolean): void {
    this.#times = [];
    this.#span = this.#stalls = 0;
    this.#settle = SEARCH_SETTLE_MS;
    if (holds) {
      if (this.#moved === 'down' || this.#tier === this.#ceiling) this.#found = this.#tier;
      else {
        this.#tier = tierBy(this.#tier, 1);
        this.#moved = 'up';
      }
    } else if (this.#tier === 'low') this.#found = 'low';
    else {
      const from = this.#moved;
      this.#tier = tierBy(this.#tier, -1);
      // The step up did not hold: the tier under it already did.
      if (from === 'up') this.#found = this.#tier;
      this.#moved = 'down';
    }
  }
}

/* ------------------------------------------------------------------ */
/* The governor: all of the above, over the page's frames              */
/* ------------------------------------------------------------------ */

/** What the governor reads of the settings. */
export interface GovernorSettings {
  readonly quality: QualityChoice;
  /** What Auto found on this machine, and the adapter it found it on. */
  readonly autoTier: QualityTier | null;
  readonly autoAdapter: string;
  readonly dynamicResolution: boolean;
  /** Frames a second, 0 for the display's own rate. */
  readonly fpsCap: number;
}

/** What the governor drives: the game on show. */
export interface QualityTarget {
  readonly quality: QualityProfile;
  setQuality(profile: QualityProfile): void;
  renderScale: number;
}

/** Judged time with the scale at its floor before the display's rate is asked afresh (ms), and the least between two askings. */
const FLOOR_RELEARN_MS = 8000;
const RELEARN_EVERY_MS = 60_000;

/**
 * Runs the frame-rate cap, the tier and the render scale from the page's
 * animation ticks. Each tick asks `tick` whether to draw; each frame drawn
 * reports to `drawn`, and `apply` puts the tier and the scale on the game.
 *
 * On Auto with nothing remembered for this adapter it searches: it starts
 * where the adapter's hints say, judges each tier for a couple of seconds and
 * settles on the highest that holds the target, then calls `onFound` so the
 * page can remember it.
 */
export class QualityGovernor {
  readonly #hints: AdapterHints;
  readonly #refresh = new RefreshEstimator();
  readonly #cap = new FrameCap();
  readonly #dynamic = new DynamicResolution();
  #settings: GovernorSettings;
  #search: TierSearch | null = null;
  #tier: QualityTier;
  #lastTick: number | null = null;
  /** When the last judged frame was drawn, or null when the one before was not judged. */
  #lastDrawn: number | null = null;
  readonly #stated: number | null;
  /** Judged time with the scale at its floor (ms), and when the display's rate was last asked afresh. */
  #atFloor = 0;
  #relearned = -Infinity;
  /** Auto settled on a tier: remember it. */
  onFound: ((tier: QualityTier, adapter: string) => void) | null = null;

  /** `refreshHz` states the display's rate where it cannot be measured (a scripted browser draws unpaced). */
  constructor(hints: AdapterHints, settings: GovernorSettings, refreshHz: number | null = null) {
    this.#hints = hints;
    this.#settings = settings;
    this.#stated = refreshHz;
    this.#tier = this.#choose();
    this.#dynamic.reset(QUALITY[this.#tier].renderScale);
    useQuality(QUALITY[this.#tier]);
  }

  /** The tier for the settings as they are, starting a search where Auto has nothing remembered for this adapter. */
  #choose(): QualityTier {
    const s = this.#settings;
    this.#search = null;
    if (s.quality !== 'auto') return s.quality;
    const hinted = tierFromHints(this.#hints);
    if (s.autoTier && s.autoAdapter === this.#hints.adapter) return tierBy(s.autoTier, 0);
    // One tier to choose from: nothing to measure.
    if (hinted.start === hinted.ceiling && hinted.start === 'low') return 'low';
    this.#search = new TierSearch(hinted.start, hinted.ceiling);
    return this.#search.tier;
  }

  #setTier(tier: QualityTier): void {
    if (tier === this.#tier) return;
    this.#tier = tier;
    this.#dynamic.reset(QUALITY[tier].renderScale);
    this.#lastDrawn = null;
    useQuality(QUALITY[tier]);
  }

  /** The settings changed. */
  use(settings: GovernorSettings): void {
    const was = this.#settings;
    this.#settings = settings;
    if (settings.quality !== was.quality || settings.autoTier !== was.autoTier || settings.autoAdapter !== was.autoAdapter) {
      // Auto with what it remembered cleared looks again; with what it has just found handed back, it keeps it.
      this.#setTier(this.#choose());
    }
    if (settings.dynamicResolution !== was.dynamicResolution) {
      this.#dynamic.reset(QUALITY[this.#tier].renderScale);
      this.#lastDrawn = null;
    }
  }

  get tier(): QualityTier {
    return this.#tier;
  }

  get profile(): QualityProfile {
    return QUALITY[this.#tier];
  }

  /** Auto is still looking for its tier: frames should be drawn at full rate, so there is something to judge. */
  get searching(): boolean {
    return this.#search !== null;
  }

  /** The render scale now: dynamic resolution's, or the tier's own with it off (and while Auto is looking). */
  get scale(): number {
    return this.#settings.dynamicResolution && !this.#search ? this.#dynamic.scale : QUALITY[this.#tier].renderScale;
  }

  /** Dynamic resolution is moving the scale now (on, and Auto not looking). */
  get dynamic(): boolean {
    return this.#settings.dynamicResolution && !this.#search;
  }

  /** The display's refresh rate (Hz), or null while unknown. */
  get refreshHz(): number | null {
    return this.#stated ?? this.#refresh.hz;
  }

  /** The frame time held (ms). */
  get targetMs(): number {
    return targetFrameMs(this.#settings.fpsCap, this.refreshHz);
  }

  /** An animation tick at `now` (ms): whether it draws a frame, under the cap. */
  tick(now: number): boolean {
    if (this.#lastTick !== null) this.#refresh.tick(now - this.#lastTick);
    this.#lastTick = now;
    // A cap at the display's own rate, or over it, caps nothing: counting its beats against the display's would pass over a tick now and then.
    // (The rate as measured: one that was stated is of a browser that draws unpaced, where the cap is all the pacing there is.)
    const cap = this.#settings.fpsCap;
    const hz = this.#refresh.hz;
    return this.#cap.due(now, hz !== null && cap >= hz * 0.97 ? 0 : cap);
  }

  /**
   * The tick at `now` drew its frame. `judged` says it was one of a run at
   * full rate with the game on show (not the menu's slowed backdrop, not a
   * frame behind a loading screen): only those say what the machine holds.
   */
  drawn(now: number, judged: boolean): void {
    const last = this.#lastDrawn;
    this.#lastDrawn = judged ? now : null;
    if (!judged || last === null) return;
    const frameMs = now - last;
    const target = this.targetMs;
    if (this.#search) {
      this.#search.frame(frameMs, target);
      const found = this.#search.found;
      const tier = this.#search.tier;
      if (found) this.#search = null;
      this.#setTier(tier);
      if (found) this.onFound?.(found, this.#hints.adapter);
      return;
    }
    if (!this.#settings.dynamicResolution) return;
    this.#dynamic.frame(frameMs, target);
    // The scale stuck at its floor may be the display gone slower, not the picture heavier: the rate measured only goes up,
    // so a window dragged to a 60 Hz screen would be held to the 144 Hz it came from. After a while there the rate is asked afresh.
    if (this.#dynamic.scale > SCALE_FLOOR) this.#atFloor = 0;
    else if (this.#stated === null && (this.#atFloor += frameMs) >= FLOOR_RELEARN_MS && now - this.#relearned >= RELEARN_EVERY_MS) {
      this.#atFloor = 0;
      this.#relearned = now;
      this.#refresh.relearn();
    }
  }

  /** A new stretch to judge (a benchmark's flight, a new map): the scale starts again from the tier's own. */
  restart(): void {
    this.#dynamic.reset(QUALITY[this.#tier].renderScale);
    this.#lastDrawn = null;
  }

  /** Puts the tier and the scale on `target`: a new game, or one whose tier or scale has moved. */
  apply(target: QualityTarget): void {
    const profile = QUALITY[this.#tier];
    if (target.quality !== profile) target.setQuality(profile);
    const scale = this.scale;
    if (target.renderScale !== scale) target.renderScale = scale;
  }
}
