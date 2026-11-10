import type { HintLine } from '../hints';
import { TOUCH_GLYPHS, type TouchGlyph } from '../touch/controls';
import { escapeHtml } from '../ui/theme';

/**
 * The first-match hint (next-level ticket 26): one body-size line where the
 * toast stands, its controls as key caps (or the marks on the touch controls)
 * before what they do. It gives way to a toast, and it is never the signal
 * colour: nothing here is picked.
 */
export const HINT_LINE_CSS = `
.ds-hintline { position: absolute; left: 50%; bottom: calc(128px + var(--ds-safe-b)); transform: translateX(-50%); display: flex; align-items: center; gap: 10px; width: max-content; max-width: min(620px, calc(100vw - 32px)); box-sizing: border-box; padding: 8px 16px 8px 20px; background: var(--ds-plate-solid); box-shadow: inset 4px 0 0 var(--ds-text); font-size: var(--ds-type-body); line-height: 1.3; text-shadow: none; animation: ds-in var(--ds-slow) var(--ds-ease); }
.ds-hintline[hidden] { display: none; }
/* The scoreboard has the screen while it is up. */
.ds-hud.boarded .ds-hintline { visibility: hidden; }
.ds-hintline .keys { display: inline-flex; flex: none; gap: 4px; }
/* Its own cap, not the menus' (those hide on touch and in pad mode): the same look. */
.ds-hintline kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 7px; box-sizing: border-box; border: 1px solid var(--ds-line-2); border-bottom-width: 2px; border-radius: 3px; background: var(--ds-tint); font: 700 var(--ds-type-small) var(--ds-font); letter-spacing: 0.04em; color: var(--ds-text); }
.ds-hintline kbd.g { border-radius: 13px; border-bottom-width: 1px; padding: 0 4px; }
.ds-hintline kbd svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
@media (max-width: 640px) { .ds-hintline { width: calc(100vw - 24px); padding: 8px 12px 8px 16px; } }
/* A short screen (a phone on its side): the line drops below the crosshair's surroundings, between the corner readouts, or just over the touch plates. */
@media (max-height: 520px) { .ds-hintline { bottom: calc(14px + var(--ds-safe-b)); padding: 6px 12px 6px 16px; font-size: var(--ds-type-small); } html.ds-touch .ds-hintline { bottom: calc(74px + var(--ds-safe-b)); } .ds-hintline kbd { min-width: 22px; height: 22px; } }
`;

export function hintLineHtml(line: HintLine): string {
  const keys = line.keys
    .map((k) => {
      if (k.cap !== undefined) return `<kbd>${escapeHtml(k.cap)}</kbd>`;
      if (k.glyph === 'use') return '<kbd class="g">Use</kbd>';
      const svg = k.glyph !== undefined && k.glyph in TOUCH_GLYPHS ? TOUCH_GLYPHS[k.glyph as TouchGlyph] : '';
      return svg ? `<kbd class="g">${svg}</kbd>` : '';
    })
    .join('');
  return `${keys ? `<span class="keys">${keys}</span>` : ''}<span>${escapeHtml(line.text)}</span>`;
}
