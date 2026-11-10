/**
 * The picture (next-level ticket 35): one look for every machine, drawn at
 * the screen's own resolution, and the frame-rate cap. There are no tiers and
 * no render scale: a lower setting only made the game look worse, so the
 * full look is the only one, and the work goes into making it cheap. No
 * three.js and no DOM: the renderer and the views all read this one table.
 */

/** What the look spends, in one place. */
export interface QualityProfile {
  /** The sun's realtime shadow map: its side (texels), how far it reaches either side of the player (m), and its redraws a second at most. */
  readonly shadowMapSize: number;
  readonly shadowDistance: number;
  readonly shadowRate: number;
  /** Ambient occlusion (GTAO at half resolution): its samples a pixel. Temporal AA averages its noise over frames. */
  readonly aoSamples: number;
  /** MSAA samples on the viewmodel's own pass. */
  readonly viewmodelSamples: number;
  /** Particles drawn, as a share of the full count (sparks, dust, debris, casings). */
  readonly particles: number;
  /** Grass, plants and scattered props: the share planted, and how far they draw as a share of the full distance. */
  readonly scatterDensity: number;
  readonly scatterDistance: number;
  /** Texture anisotropy at most. */
  readonly anisotropy: number;
}

/** The look: everything on, at the screen's own resolution. */
export const PICTURE: QualityProfile = {
  shadowMapSize: 2048,
  shadowDistance: 45,
  shadowRate: 60,
  aoSamples: 8,
  viewmodelSamples: 4,
  particles: 1,
  scatterDensity: 1,
  scatterDistance: 1,
  anisotropy: 8,
};

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

/** What the page can read of the machine before drawing anything: shown on the benchmark page and in Settings. */
export interface AdapterHints {
  readonly backend: 'webgpu' | 'webgl2';
  /** The adapter as the browser names it (vendor, architecture, device, renderer string), or '' where it says nothing. */
  readonly adapter: string;
  /** A software rasteriser (WebGPU's fallback adapter). */
  readonly software: boolean;
  /** A phone or a tablet. */
  readonly mobile: boolean;
}

/* ------------------------------------------------------------------ */
/* The display's refresh                                               */
/* ------------------------------------------------------------------ */

/** Refresh rates displays come in (Hz). */
const REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240, 360] as const;
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
/* The pacer: the cap, over the page's frames                          */
/* ------------------------------------------------------------------ */

/**
 * Runs the frame-rate cap from the page's animation ticks: each tick asks
 * `tick` whether to draw.
 *
 * The display's rate is read again only when the page says the window may
 * be on another screen (`displayMoved`), never on a timer: a slow machine on
 * a 144 Hz screen whose browser ticks every other refresh would otherwise be
 * read as a 72 Hz display.
 */
export class FramePacer {
  readonly #refresh = new RefreshEstimator();
  readonly #cap = new FrameCap();
  readonly #stated: number | null;
  #fpsCap: number;
  #lastTick: number | null = null;

  /** `fpsCap` in frames a second (0 for the display's own rate); `refreshHz` states the display's rate where it cannot be measured (a scripted browser draws unpaced). */
  constructor(fpsCap: number, refreshHz: number | null = null) {
    this.#fpsCap = fpsCap;
    this.#stated = refreshHz;
  }

  /** The cap changed in Settings. */
  set fpsCap(fps: number) {
    this.#fpsCap = fps;
  }

  /** The display's refresh rate (Hz), or null while unknown. */
  get refreshHz(): number | null {
    return this.#stated ?? this.#refresh.hz;
  }

  /** The window moved, or the screen under it changed: read the display's rate afresh, slower or not. */
  displayMoved(): void {
    this.#refresh.relearn();
  }

  /** An animation tick at `now` (ms): whether it draws a frame, under the cap. */
  tick(now: number): boolean {
    if (this.#lastTick !== null) this.#refresh.tick(now - this.#lastTick);
    this.#lastTick = now;
    // A cap at the display's own rate, or over it, caps nothing: counting its beats against the display's would pass over a tick now and then.
    // (The rate as measured: one that was stated is of a browser that draws unpaced, where the cap is all the pacing there is.)
    const cap = this.#fpsCap;
    const hz = this.#refresh.hz;
    return this.#cap.due(now, hz !== null && cap >= hz * 0.97 ? 0 : cap);
  }
}
