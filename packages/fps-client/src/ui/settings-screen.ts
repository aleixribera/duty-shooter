/**
 * The Settings screen's own pieces (next-level ticket 22): its sections and
 * their order, and the previews beside the rows: the crosshair as it will be
 * drawn, over a light, a mid and a dark backdrop; the team colours as they
 * will be drawn; the picture, what it draws, and on what.
 *
 * Plain DOM and the pure tables, no three.js: the menu has it before the
 * engine.
 */
import { CrosshairView, type CrosshairOptions } from '../hud/crosshair';
import { FRAME_CAPS, PICTURE, type QualityProfile } from '../quality';
import type { SettingsSection } from '../settings';
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
  /** The display's refresh rate as measured (Hz), or null while unknown. */
  readonly refreshHz: number | null;
}

/** What the picture draws, a line each, as the table in `quality.ts` has it. One look, on every machine. */
export function pictureFacts(q: QualityProfile = PICTURE): readonly (readonly [label: string, value: string])[] {
  return [
    ['Resolution', "Your screen's own"],
    ['Shadows', `${q.shadowMapSize} px, ${q.shadowDistance} m`],
    ['Ambient occlusion', `${q.aoSamples} samples`],
    ['Anti-aliasing', 'Temporal'],
    ['Sun shafts, bloom, heat shimmer', 'On'],
    ['Texture filtering', `${q.anisotropy}x`],
  ];
}

/** The frame-rate cap's choices as the list shows them. */
export function capChoices(): readonly (readonly [value: string, text: string])[] {
  return FRAME_CAPS.map((fps) => [String(fps), fps === 0 ? 'Display rate' : `${fps} fps`] as const);
}

type El = (tag: string, text?: string, cls?: string) => HTMLElement;

/** The Video section's preview: the picture, all it draws, and the machine drawing it. `refresh` redraws it in place. */
export function videoPreview(h: El, read: () => VideoStatus | null): { root: HTMLElement; refresh(): void } {
  const root = h('aside', '', 'ds-preview');
  root.setAttribute('aria-label', 'The picture');
  const refresh = () => {
    const status = read();
    root.replaceChildren();
    root.append(h('h3', 'The picture'));
    const list = h('dl', '', 'ds-tier');
    for (const [label, value] of pictureFacts()) {
      const row = h('div');
      row.append(h('dt', label), h('dd', value));
      list.append(row);
    }
    root.append(list);
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
  root.append(h('h3', 'Crosshair'), bands, note);
  const refresh = (next: CrosshairOptions) => {
    for (const view of views) {
      view.options = next;
      view.update(PREVIEW_SPREAD);
    }
    // Only a crosshair that moves needs a word: the preview shows it at rest.
    note.textContent = next.shape !== 'dot' && next.dynamic ? 'At rest. Moving and firing open it.' : '';
  };
  refresh(options);
  return { root, refresh };
}

/** The Accessibility section's preview: the two teams and the enemy marker in the colours chosen. */
export function teamPreview(h: El, vision: ColourVision): { root: HTMLElement; refresh(vision: ColourVision): void } {
  const root = h('aside', '', 'ds-preview');
  root.setAttribute('aria-label', 'Team colours preview');
  const list = h('div', '', 'ds-swatches');
  // The one thing the swatches can't show: soldiers already in the world keep their colours until the map changes.
  root.append(h('h3', 'Team colours'), list, h('p', 'Soldiers already on the map change at the next one.', 'ds-note'));
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
.ds-preview h3 { font-family: var(--ds-font-display); margin: 0 0 12px; font-size: var(--ds-type-heading); line-height: 1; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ds-text); }
.ds-preview .ds-note:empty { display: none; }
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
  .ds-preview.pinned h3, .ds-preview.pinned .ds-note { display: none; }
  /* One row of two buttons. */
  .ds-page > footer.ds-set-foot { flex-wrap: nowrap; gap: 8px; }
  .ds-set-foot .ds-btn { flex: 1 1 0; min-width: 0; padding: 0 12px; }
  /* The tabs scroll sideways under a finger, with no bar drawn under them. */
  .ds-page > header .aside:has(.ds-tabs) { flex: 1 1 100%; min-width: 0; }
  .ds-tabs { min-width: 0; scrollbar-width: none; }
}
`;
