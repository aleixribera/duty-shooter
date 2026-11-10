/**
 * The Settings screen's own pieces (next-level ticket 22): its sections and
 * their order, what a quality tier turns on as a list a player can read, and
 * the previews beside the rows: the crosshair as it will be drawn, over a
 * light, a mid and a dark backdrop; the team colours as they will be drawn;
 * the tier in effect.
 *
 * Plain DOM and the pure tables, no three.js: the menu has it before the
 * engine.
 */
import { CrosshairView, type CrosshairOptions } from '../hud/crosshair';
import { FRAME_CAPS, QUALITY, SCALE_FLOOR, type QualityProfile, type QualityTier } from '../quality';
import type { Settings, SettingsSection } from '../settings';
import { TEAM_PALETTES, type ColourVision } from '../team-colours';

export const SECTION_NAMES: Readonly<Record<SettingsSection, string>> = {
  controls: 'Controls',
  mouse: 'Mouse and pad',
  touch: 'Touch',
  video: 'Video',
  audio: 'Audio',
  hud: 'HUD and crosshair',
  accessibility: 'Accessibility',
};

/** The sections in the order their tabs stand: Touch first where a finger plays, after the mouse and the pad elsewhere. */
export function sectionOrder(touch: boolean): readonly SettingsSection[] {
  return touch ? ['touch', 'controls', 'mouse', 'video', 'audio', 'hud', 'accessibility'] : ['controls', 'mouse', 'touch', 'video', 'audio', 'hud', 'accessibility'];
}

/** What the page knows of the picture once the engine is up; null before. */
export interface VideoStatus {
  /** `WebGPU` or `WebGL 2`. */
  readonly backend: string;
  /** The graphics adapter's name, or '' where the browser keeps it. */
  readonly adapter: string;
  /** The tier being drawn. */
  readonly tier: QualityTier;
  /** Auto is still trying tiers. */
  readonly searching: boolean;
  /** The display's refresh rate as measured (Hz), or null while unknown. */
  readonly refreshHz: number | null;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;
const onOff = (v: boolean) => (v ? 'On' : 'Off');

/** What a tier turns on, a line each, as the table in `quality.ts` has it. */
export function tierFacts(q: QualityProfile, dynamicResolution: boolean): readonly (readonly [label: string, value: string])[] {
  return [
    ['Render scale', dynamicResolution ? `${percent(SCALE_FLOOR)} to 100%, moving` : percent(q.renderScale)],
    ['Most pixels a frame', `${q.megapixels.toFixed(1)} million`],
    ['Shadows', `${q.shadowMapSize} px, ${q.shadowDistance} m`],
    ['Ambient occlusion', q.aoSamples > 0 ? `${q.aoSamples} samples` : 'Off'],
    ['Anti-aliasing', q.antialias === 'taa' ? 'Temporal' : 'FXAA'],
    ['Sun shafts', onOff(q.shafts)],
    ['Bloom', onOff(q.bloom)],
    ['Heat shimmer', onOff(q.shimmer)],
    ['Particles', percent(q.particles)],
    ['Grass and scatter', `${percent(q.scatterDensity)}, drawn to ${percent(q.scatterDistance)}`],
    ['Texture filtering', `${q.anisotropy}x`],
  ];
}

/** The tier the Video preview describes: the one being drawn, else the one picked, else what Auto remembers. Null when Auto has yet to measure. */
export function tierShown(settings: Pick<Settings, 'quality' | 'autoTier'>, status: VideoStatus | null): QualityTier | null {
  if (settings.quality !== 'auto') return settings.quality;
  return status?.tier ?? settings.autoTier;
}

/** The preview's heading: the tier, Auto's pick, or that Auto has yet to pick one. */
export function tierHeading(settings: Pick<Settings, 'quality' | 'autoTier'>, status: VideoStatus | null): string {
  const tier = tierShown(settings, status);
  if (settings.quality !== 'auto') return QUALITY[settings.quality].name;
  if (status?.searching) return 'Auto: measuring';
  return tier ? `Auto: ${QUALITY[tier].name}` : 'Not measured yet';
}

/** The line under the tier's name: where it came from. */
export function tierLine(settings: Pick<Settings, 'quality' | 'autoTier'>, status: VideoStatus | null): string {
  if (settings.quality !== 'auto') return 'Picked by hand. Auto would measure this machine and choose for it.';
  if (!status) return settings.autoTier ? 'What Auto measured on this machine last time.' : 'Auto measures this machine once the map is drawn, and remembers what it finds.';
  if (status.searching) return `Trying ${QUALITY[status.tier].name} now. Auto draws each tier for a couple of seconds and keeps the highest one that holds the frame rate; below is what ${QUALITY[status.tier].name} turns on.`;
  return `Auto measured this machine and chose it${status.adapter ? ` for ${status.adapter}` : ''}.`;
}

/** The frame-rate cap's choices as the list shows them. */
export function capChoices(): readonly (readonly [value: string, text: string])[] {
  return FRAME_CAPS.map((fps) => [String(fps), fps === 0 ? 'Display rate' : `${fps} fps`] as const);
}

type El = (tag: string, text?: string, cls?: string) => HTMLElement;

/** The Video section's preview: the tier in effect and all it turns on. `refresh` redraws it in place. */
export function videoPreview(h: El, read: () => { settings: Settings; status: VideoStatus | null }): { root: HTMLElement; refresh(): void } {
  const root = h('aside', '', 'ds-preview');
  root.setAttribute('aria-label', 'The quality tier in effect');
  const refresh = () => {
    const { settings, status } = read();
    const tier = tierShown(settings, status);
    root.replaceChildren();
    root.append(h('h3', tierHeading(settings, status)), h('p', tierLine(settings, status), 'ds-sub'));
    if (tier) {
      const list = h('dl', '', 'ds-tier');
      for (const [label, value] of tierFacts(QUALITY[tier], settings.dynamicResolution)) {
        const row = h('div');
        row.append(h('dt', label), h('dd', value));
        list.append(row);
      }
      root.append(list);
    }
    if (status) {
      const parts = [status.backend, status.adapter, status.refreshHz ? `${Math.round(status.refreshHz)} Hz display` : ''].filter(Boolean);
      root.append(h('p', parts.join(' · '), 'ds-note'));
    }
  };
  refresh();
  return { root, refresh };
}

/** The spread (px) the preview's crosshair stands at: a rifle from the hip, at rest. */
const PREVIEW_SPREAD = 14;

/** The HUD section's preview: the crosshair as drawn, over a bright, a mid and a dark backdrop. */
export function crosshairPreview(h: El, options: CrosshairOptions): { root: HTMLElement; refresh(options: CrosshairOptions): void } {
  const root = h('aside', '', 'ds-preview');
  root.setAttribute('aria-label', 'Crosshair preview');
  const bands = h('div', '', 'ds-xbands');
  bands.setAttribute('aria-hidden', 'true');
  const views = ['sky', 'wall', 'shade'].map((band) => {
    const el = h('div', '', `band ${band}`);
    bands.append(el);
    return new CrosshairView(el);
  });
  const note = h('p', '', 'ds-note');
  root.append(h('h3', 'Crosshair'), h('p', 'As it is drawn in play, over a bright, a mid and a dark backdrop.', 'ds-sub'), bands, note);
  const refresh = (next: CrosshairOptions) => {
    for (const view of views) {
      view.options = next;
      view.update(PREVIEW_SPREAD);
    }
    note.textContent = next.shape === 'dot' ? 'A dot alone: nothing opens or closes.' : next.dynamic ? 'Shown standing still with a rifle. Moving and firing open it.' : 'Fixed: it keeps this gap whatever you do.';
  };
  refresh(options);
  return { root, refresh };
}

/** The Accessibility section's preview: the two teams and the enemy marker in the colours chosen. */
export function teamPreview(h: El, vision: ColourVision): { root: HTMLElement; refresh(vision: ColourVision): void } {
  const root = h('aside', '', 'ds-preview');
  root.setAttribute('aria-label', 'Team colours preview');
  const list = h('div', '', 'ds-swatches');
  root.append(h('h3', 'Team colours'), h('p', 'Each team keeps its mark as well as its colour. Soldiers already in the world change at the next map.', 'ds-sub'), list);
  const refresh = (next: ColourVision) => {
    const palette = TEAM_PALETTES[next];
    list.replaceChildren();
    const swatch = (mark: string, name: string, colour: string, cloth: string | null) => {
      const row = h('div');
      const chip = h('i', mark);
      chip.style.background = colour;
      row.append(chip, h('span', name));
      if (cloth) {
        const worn = h('u');
        worn.style.background = cloth;
        worn.title = 'Uniform';
        row.append(worn, h('small', 'Uniform'));
      }
      list.append(row);
    };
    swatch('◆', 'Blue team', palette.teams[1].colour, palette.teams[1].uniform);
    swatch('▲', 'Orange team', palette.teams[2].colour, palette.teams[2].uniform);
    swatch('▼', 'Enemy marker', palette.enemy, null);
  };
  refresh(vision);
  return { root, refresh };
}

export const SETTINGS_SCREEN_CSS = `
/* Settings: the rows hold the left edge, a preview of what they change answers on the right. */
.ds-set { display: grid; grid-template-columns: minmax(0, 980px) minmax(280px, 400px); gap: 40px; align-items: start; }
.ds-set.solo { grid-template-columns: minmax(0, 980px); }
.ds-preview { position: sticky; top: 0; padding: 0 0 4px; }
.ds-preview h3 { margin: 0 0 6px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ds-text); }
.ds-preview .ds-sub { margin: 0 0 12px; font-size: var(--ds-type-body); color: var(--ds-text-2); }
.ds-preview .ds-note { margin: 12px 0 0; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-tier { display: grid; gap: 1px; margin: 0; background: var(--ds-line); }
.ds-tier > div { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; min-height: 36px; padding: 8px 14px; background: var(--ds-panel); }
.ds-tier dt { font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-tier dd { margin: 0; font-size: var(--ds-type-body); font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.ds-xbands { display: grid; grid-template-columns: repeat(3, 1fr); height: 150px; border: 1px solid var(--ds-line); }
.ds-xbands .band { position: relative; overflow: hidden; }
.ds-xbands .sky { background: var(--ds-preview-sky); }
.ds-xbands .wall { background: var(--ds-preview-wall); }
.ds-xbands .shade { background: var(--ds-preview-shade); }
.ds-swatches { display: grid; gap: 1px; background: var(--ds-line); }
.ds-swatches > div { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; background: var(--ds-panel); font-size: var(--ds-type-body); }
.ds-swatches i { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 32px; font-style: normal; font-size: var(--ds-type-body); color: var(--ds-ink); }
.ds-swatches span { flex: 1; min-width: 0; font-weight: 700; }
.ds-swatches u { flex: none; width: 28px; height: 20px; text-decoration: none; }
.ds-swatches small { font-size: var(--ds-type-small); color: var(--ds-text-2); }
/* A row whose control is an action: a button or a link in the control's place. */
.ds-row .ds-btn { width: 100%; min-height: 40px; padding: 0 12px; }
.ds-row a.ds-btn { display: flex; align-items: center; justify-content: center; box-sizing: border-box; color: var(--ds-text); text-decoration: none; }
.ds-row > label small { display: block; margin-top: 2px; font-size: var(--ds-type-small); color: var(--ds-text-2); }
.ds-row select:disabled, .ds-slider input:disabled { opacity: 0.5; cursor: default; }
.ds-set-foot .narrow { display: none; }
@media (max-width: 1280px) {
  .ds-set { grid-template-columns: minmax(0, 1fr) minmax(240px, 320px); gap: 24px; }
}
@media (max-width: 960px) {
  .ds-set, .ds-set.solo { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .ds-preview { position: static; order: -1; }
  /* A preview that reads out what the rows chose comes after them. */
  .ds-preview.after { order: 0; }
  .ds-xbands { height: 96px; }
  /* The crosshair's preview stays in sight over its rows: only the picture, on the page's ink. */
  .ds-preview.pinned { position: sticky; top: -20px; z-index: 2; margin: -20px calc(-1 * var(--ds-gutter)) 0; padding: 12px var(--ds-gutter); background: var(--ds-ink); border-bottom: 1px solid var(--ds-line); }
  .ds-preview.pinned h3, .ds-preview.pinned .ds-sub, .ds-preview.pinned .ds-note { display: none; }
  /* One row of two buttons; what the wide footer says in words, the tab above says here. */
  .ds-page > footer.ds-set-foot { flex-wrap: nowrap; gap: 8px; }
  .ds-set-foot .ds-btn { flex: 1 1 0; min-width: 0; padding: 0 12px; }
  .ds-set-foot .wide, .ds-set-foot .ds-saved { display: none; }
  .ds-set-foot .narrow { display: inline; }
  /* The tabs scroll sideways under a finger, with no bar drawn under them. */
  .ds-page > header .aside:has(.ds-tabs) { flex: 1 1 100%; min-width: 0; }
  .ds-tabs { min-width: 0; scrollbar-width: none; }
}
`;
