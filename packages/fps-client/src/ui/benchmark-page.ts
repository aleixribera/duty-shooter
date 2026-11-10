/**
 * The benchmark a player can open (next-level ticket 27, `?benchmark`, linked
 * from Settings > Video): pick a tier, fly every map's path once, and read
 * the average and 1% low frame time of each, the render scale dynamic
 * resolution settled on, the adapter and the backend, with one line to copy.
 *
 * The page only shows and asks; the range app flies the maps and hands back
 * what it measured. Plain DOM on the theme's page shell, no three.js.
 */
import { QUALITY, QUALITY_TIERS, type QualityTier } from '../quality';
import { escapeHtml, installTheme } from './theme';

/** What the page says of the machine and of the run before it starts. */
export interface BenchmarkFacts {
  readonly backend: string;
  /** The graphics adapter's name, or '' where the browser keeps it. */
  readonly adapter: string;
  /** The window's size in the screen's own pixels: what a tier's render scale and pixel cap are taken from. */
  readonly resolution: readonly [number, number];
  /** The maps flown, by name, and how long the whole run takes (s). */
  readonly maps: readonly string[];
  readonly seconds: number;
}

/** One map's run. */
export interface BenchmarkRow {
  readonly map: string;
  readonly meanMs: number;
  readonly low1Ms: number;
  /** The render scale dynamic resolution settled on, or null with it off. */
  readonly scale: number | null;
}

export interface BenchmarkCallbacks {
  /** Fly the maps at `tier`, dynamic resolution on or off. */
  run(tier: QualityTier, dynamicResolution: boolean): void;
  /** Give up the run under way. */
  stop(): void;
  /** Make `tier` the game's own quality setting. */
  use?(tier: QualityTier): void;
}

/** A frame time (ms) the average must stay under, and the one the 1% low must: 60 and 30 frames a second. */
const SMOOTH_MS = 1000 / 60;
const STUTTER_MS = 1000 / 30;

/**
 * What a run says, in a sentence: whether the tier held 60 frames a second on
 * every map, whether its stutters stayed short, and what to try if not.
 */
export function benchmarkVerdict(rows: readonly BenchmarkRow[], tier: QualityTier): string {
  if (rows.length === 0) return '';
  const name = QUALITY[tier].name;
  const slowest = rows.reduce((a, b) => (b.meanMs > a.meanMs ? b : a));
  const choppiest = rows.reduce((a, b) => (b.low1Ms > a.low1Ms ? b : a));
  const lower = QUALITY_TIERS[QUALITY_TIERS.indexOf(tier) - 1];
  const scaled = rows.some((r) => r.scale !== null && r.scale < 0.95);
  if (slowest.meanMs > SMOOTH_MS) return `${name} averages under 60 fps on ${slowest.map}${lower ? `: try ${QUALITY[lower].name}` : ''}.`;
  if (choppiest.low1Ms > STUTTER_MS) return `${name} holds 60 fps on average, but stutters on ${choppiest.map} drop under 30 fps${lower ? `: ${QUALITY[lower].name} may smooth them` : ''}.`;
  if (scaled) return `${name} holds 60 fps, by drawing smaller than the screen on some maps.`;
  return `${name} runs smoothly here: over 60 fps on every map, with short stutters.`;
}

const CSS = `
.ds-bench { position: fixed; inset: 0; z-index: 22; font: 400 var(--ds-type-body)/1.4 var(--ds-font); }
.ds-bench[hidden] { display: none; }
.ds-bench.flying { pointer-events: none; }
.ds-bench.flying .ds-page { display: none; }
.ds-bench .cols { display: grid; grid-template-columns: minmax(0, 720px) minmax(0, 520px); gap: 56px; align-items: start; }
.ds-bench h2 { margin: 0 0 6px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-bench h2 + p { margin: 0 0 12px; color: var(--ds-text-2); }
.ds-bench section + section { margin-top: 32px; }
.ds-bench .ds-readouts b { font-size: var(--ds-type-body); overflow-wrap: anywhere; }
.ds-bench table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.ds-bench th, .ds-bench td { padding: 12px 16px; text-align: right; border-bottom: 1px solid var(--ds-line); }
.ds-bench th:first-child, .ds-bench td:first-child { text-align: left; }
.ds-bench thead th { font-size: var(--ds-type-small); font-weight: 400; color: var(--ds-text-2); border-bottom-color: var(--ds-line-2); }
.ds-bench tbody td { background: var(--ds-panel); font-weight: 700; }
.ds-bench tbody td small { display: block; font-size: var(--ds-type-small); font-weight: 400; color: var(--ds-text-2); }
.ds-bench .line { display: block; width: 100%; min-height: 96px; padding: 12px 14px; background: var(--ds-ink); color: var(--ds-text); border: 1px solid var(--ds-line-2); border-radius: 0; font: 400 var(--ds-type-small)/1.5 ui-monospace, Consolas, monospace; resize: none; }
.ds-bench .line:focus { border-color: var(--ds-signal); outline: none; }
.ds-bench .copy { margin-top: 12px; display: flex; align-items: center; gap: 16px; }
.ds-bench .copy span { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-bench footer a.ds-btn { text-decoration: none; color: inherit; }
/* While it flies: one plate in the corner, the picture left alone. */
.ds-bench .plate { position: absolute; left: var(--ds-gutter); top: 28px; display: none; align-items: center; gap: 16px; padding: 10px 14px 10px 18px; background: var(--ds-scrim); box-shadow: inset 4px 0 0 var(--ds-signal); pointer-events: auto; }
.ds-bench.flying .plate { display: flex; }
.ds-bench .plate b { font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.ds-bench .plate span { font-size: var(--ds-type-body); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ds-text); min-width: 210px; }
.ds-bench .verdict { margin: 0 0 16px; padding: 12px 16px; background: var(--ds-panel); box-shadow: inset 4px 0 0 var(--ds-signal); color: var(--ds-text); font-weight: 700; }
.ds-bench .verdict + .ds-btn { margin: -4px 0 4px; }
.ds-bench .plate .ds-btn { min-height: 36px; padding: 0 14px; }
@media (max-width: 960px) {
  .ds-bench .cols { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .ds-bench .ds-page { background: var(--ds-scrim); }
  .ds-bench th, .ds-bench td { padding: 10px 8px; }
  .ds-bench .plate { top: 12px; }
  .ds-bench .plate span { min-width: 0; }
  .ds-bench .plate .ds-btn { min-height: 44px; }
  .ds-bench .ds-seg button { min-height: 44px; }
  /* After a run the results are what was come for: they lead, and the choices follow. */
  .ds-bench .cols.measured > div:last-child { order: -1; }
}
`;

const ms = (v: number) => `${v.toFixed(1)} ms`;
const fps = (v: number) => (v > 0 ? `${Math.round(1000 / v)} fps` : '');

export class BenchmarkPage {
  readonly #root: HTMLDivElement;
  readonly #callbacks: BenchmarkCallbacks;
  /** Where "Back to the game" goes. */
  readonly #home: string;
  #tier: QualityTier;
  #dynamic: boolean;
  #facts: BenchmarkFacts | null = null;
  #rows: readonly BenchmarkRow[] | null = null;
  #line = '';
  /** The tier the last run flew. */
  #ranTier: QualityTier;
  /** The game's quality was set to the tier flown. */
  #used = false;
  /** What stopped the last run short, to say on the page. */
  #note = '';

  constructor(parent: HTMLElement, callbacks: BenchmarkCallbacks, start: { tier: QualityTier; dynamicResolution: boolean; home: string }) {
    installTheme();
    if (!document.getElementById('ds-bench-css')) {
      const style = document.createElement('style');
      style.id = 'ds-bench-css';
      style.textContent = CSS;
      document.head.append(style);
    }
    this.#callbacks = callbacks;
    this.#tier = start.tier;
    this.#ranTier = start.tier;
    this.#dynamic = start.dynamicResolution;
    this.#home = start.home;
    this.#root = document.createElement('div');
    this.#root.className = 'ds-bench ds-ui';
    this.#root.addEventListener('click', (e) => this.#click(e));
    parent.append(this.#root);
    this.#render();
  }

  get tier(): QualityTier {
    return this.#tier;
  }

  get dynamicResolution(): boolean {
    return this.#dynamic;
  }

  /** The machine and the run, once the engine knows them: the page can start. */
  ready(facts: BenchmarkFacts): void {
    this.#facts = facts;
    if (!this.#root.classList.contains('flying')) this.#render();
  }

  /** A map's run began: the page gives way to the picture, with a plate saying which. */
  flying(map: string, index: number, of: number): void {
    if (!this.#root.classList.contains('flying') || !this.#root.querySelector('.plate')) {
      this.#root.classList.add('flying');
      // Only the map's name is read out as it changes: the progress beside it moves every frame.
      this.#root.innerHTML = `<div class="plate"><b role="status"></b><span data-progress></span><button type="button" class="ds-btn" data-act="stop">Stop</button></div>`;
      // The page's own buttons went with it: the keyboard is left on the one there is.
      this.#root.querySelector<HTMLElement>('[data-act="stop"]')?.focus();
    }
    this.#root.querySelector('.plate b')!.textContent = map;
    this.#root.querySelector('[data-progress]')!.textContent = `Map ${index + 1} of ${of}`;
  }

  /** How far through the map's run (0 to 1; under 0 while it gets ready), and the frame rate now. */
  progress(fraction: number, frameRate: number, index: number, of: number): void {
    const el = this.#root.querySelector('[data-progress]');
    if (!el) return;
    const text = fraction < 0 ? `Map ${index + 1} of ${of} · getting ready` : `Map ${index + 1} of ${of} · ${Math.round(fraction * 100)}% · ${Math.round(frameRate)} fps`;
    if (el.textContent !== text) el.textContent = text;
  }

  /** The run is over (or was stopped, with `note` saying so): the page comes back with what was measured. */
  done(rows: readonly BenchmarkRow[] | null, line: string, note = ''): void {
    this.#rows = rows;
    this.#line = line;
    this.#note = note;
    this.#root.classList.remove('flying');
    this.#render();
    this.#root.querySelector('.body')?.scrollTo(0, 0);
    this.#root.querySelector<HTMLElement>('[data-act="run"]')?.focus();
  }

  #click(e: Event): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const act = el.dataset['act'];
    if (act === 'tier') {
      this.#tier = el.dataset['value'] as QualityTier;
      this.#render(`[data-act="tier"][data-value="${this.#tier}"]`);
    } else if (act === 'dynamic') {
      this.#dynamic = el.dataset['value'] === 'on';
      this.#render(`[data-act="dynamic"][data-value="${el.dataset['value']}"]`);
    } else if (act === 'run') {
      this.#ranTier = this.#tier;
      this.#used = false;
      this.#callbacks.run(this.#tier, this.#dynamic);
    } else if (act === 'use') {
      this.#callbacks.use?.(this.#ranTier);
      this.#used = true;
      this.#render('[data-act="use"]');
    }
    else if (act === 'stop') this.#callbacks.stop();
    else if (act === 'copy') void this.#copy();
  }

  async #copy(): Promise<void> {
    const box = this.#root.querySelector<HTMLTextAreaElement>('.line');
    const said = this.#root.querySelector<HTMLElement>('[data-copied]');
    if (!box || !said) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(this.#line);
      copied = true;
    } catch {
      // No clipboard here (an insecure page, a browser that refuses): the line is selected instead, a key press from copied.
      box.focus();
      box.select();
    }
    said.textContent = copied ? 'Copied.' : 'Selected: press Ctrl+C to copy it.';
  }

  #render(focus = ''): void {
    const facts = this.#facts;
    const seg = (act: string, value: string, text: string, on: boolean) => `<button type="button" data-act="${act}" data-value="${value}" class="${on ? 'on' : ''}" aria-pressed="${on}">${escapeHtml(text)}</button>`;
    const tiers = QUALITY_TIERS.map((t) => seg('tier', t, QUALITY[t].name, t === this.#tier)).join('');
    const dynamic = seg('dynamic', 'off', 'Off', !this.#dynamic) + seg('dynamic', 'on', 'On', this.#dynamic);
    const machine = facts
      ? `<div class="ds-readouts"><div><span>Backend</span><b>${escapeHtml(facts.backend)}</b></div><div><span>Graphics adapter</span><b>${escapeHtml(facts.adapter || 'Not named by the browser')}</b></div><div><span>Window</span><b>${facts.resolution[0]} x ${facts.resolution[1]} px</b></div></div>`
      : '';
    const flown = facts ? `${facts.maps.join(', ')}. About ${Math.round(facts.seconds / 5) * 5} seconds, plus each map's loading.` : '';
    let results = '';
    if (this.#rows) {
      const scaled = this.#rows.some((r) => r.scale !== null);
      const body = this.#rows
        .map((r) => `<tr><td>${escapeHtml(r.map)}</td><td>${ms(r.meanMs)}<small>${fps(r.meanMs)}</small></td><td>${ms(r.low1Ms)}<small>${fps(r.low1Ms)}</small></td>${scaled ? `<td>${r.scale === null ? '' : `${Math.round(r.scale * 100)}%`}</td>` : ''}</tr>`)
        .join('');
      const ran = QUALITY[this.#ranTier].name;
      const use = this.#callbacks.use
        ? `<button type="button" class="ds-btn" data-act="use"${this.#used ? ' disabled' : ''}>${this.#used ? `The game now draws at ${escapeHtml(ran)}` : `Use ${escapeHtml(ran)} in the game`}</button>`
        : '';
      results = `<section><h2>Results</h2><p class="verdict" role="status">${escapeHtml(benchmarkVerdict(this.#rows, this.#ranTier))}</p>${use}<p>The average frame time, and the average of the slowest 1% of frames: what a stutter costs.</p>
<table><thead><tr><th scope="col">Map</th><th scope="col">Average</th><th scope="col">1% low</th>${scaled ? '<th scope="col">Render scale</th>' : ''}</tr></thead><tbody>${body}</tbody></table></section>
<section><h2>To share</h2><p>The same numbers as one line: paste it when you report slow play or compare machines.</p><textarea class="line" readonly rows="4" aria-label="The results as one line">${escapeHtml(this.#line)}</textarea>
<div class="copy"><button type="button" class="ds-btn" data-act="copy">Copy the line</button><span data-copied role="status"></span></div></section>`;
    } else if (this.#note) results = `<section><h2>Results</h2><p>${escapeHtml(this.#note)}</p></section>`;
    else results = `<section><h2>Results</h2><p>Nothing measured yet. The numbers show here once the last map has been flown.</p></section>`;
    this.#root.innerHTML = `<div class="ds-page">
<header><div class="heading"><div class="ds-crumb">Settings · Video</div><h1>Benchmark</h1></div></header>
<div class="body"><div class="cols${this.#rows ? ' measured' : ''}">
<div>
<section><h2>Quality tier</h2><p>The tier each map is drawn at. Your own setting is not changed.</p><div class="ds-seg" role="group" aria-label="Quality tier">${tiers}</div></section>
<section><h2>Dynamic resolution</h2><p>On, the render scale moves to hold the frame rate, and the results say where it settled. Off, every frame is drawn at the tier's own scale.</p><div class="ds-seg" role="group" aria-label="Dynamic resolution">${dynamic}</div></section>
<section><h2>This machine</h2><p>${facts ? escapeHtml(flown) : 'The engine is still loading.'}</p>${machine}</section>
</div>
<div>${results}</div>
</div></div>
<footer><a class="ds-btn" href="${escapeHtml(this.#home)}">Back to the game</a><div class="grow"></div><button type="button" class="ds-btn primary big" data-act="run"${facts ? '' : ' disabled'}>${facts ? (this.#rows ? 'Run again' : 'Run benchmark') : 'Loading the engine'}</button></footer>
</div>`;
    if (focus) this.#root.querySelector<HTMLElement>(focus)?.focus();
  }
}
