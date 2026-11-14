import { STATS, type WeaponId } from '@duty-shooter/fps-core';
import { gunMask } from '../gun-stills';
import { escapeHtml, icon, patchHtml } from '../ui/theme';

/**
 * The death screen's loadout plates (PLAN item 9d): dead with a next life to come, your three kept loadouts stand in
 * the bottom third by themselves, under "You died" and whoever you watch, each with its name, its primary's
 * silhouette and name, and its secondary and tactical as small marks. The one the next life carries is lit. A click,
 * a tap, 1 2 3 or the D-pad picks another, and the respawn never waits for it.
 *
 * They stand in their own layer over the touch controls' look ground (which covers the screen), so a tap reaches them.
 */

/** One kept loadout as its plate shows it: what the next life would carry with it (a locked gun already swapped out). */
export interface KitPlate {
  readonly name: string;
  readonly primary: WeaponId;
  readonly secondary: WeaponId;
  readonly tactical: 'smoke' | 'flash' | null;
}

export interface KitPlatesState {
  readonly sets: readonly KitPlate[];
  /** The one the next life carries: lit. */
  readonly chosen: number;
  /** What picks: keys show 1 2 3 on the plates, a pad the D-pad's arrows on the lit one's neighbours, a finger no marks. */
  readonly input: 'keys' | 'pad' | 'touch';
  /** Back in the fight: the plates fade, and a click or tap that lands in the fade still counts (for the life after). */
  readonly leaving?: boolean;
}

export const KIT_PLATES_CSS = `
.ds-kits { position: fixed; left: 50%; bottom: calc(36px + var(--ds-safe-b)); transform: translateX(-50%); z-index: 7; display: flex; gap: 12px; pointer-events: none; color: var(--ds-text); text-shadow: none; user-select: none; -webkit-user-select: none; transition: opacity 300ms linear; }
.ds-kits[hidden] { display: none; }
.ds-kits.leaving { opacity: 0; }
/* On glass a thumb coming down to move in the fade would pick: there the fade takes no taps. */
html.ds-touch .ds-kits.leaving .kit { pointer-events: none; }
/* A page opened over the match (the pause menu, Settings) has the screen, as it does over the HUD. */
body:has(.ds-menu:not([hidden]) .ds-page) .ds-kits { visibility: hidden; }
.ds-kits .kit { --ds-ch: 10px; display: grid; grid-template-rows: auto 1fr auto; gap: 6px; width: clamp(150px, calc((100vw - 820px) / 3 - 8px), 228px); height: 136px; padding: 12px 14px 12px 16px; border: 0; background: none; text-align: left; pointer-events: auto; color: var(--ds-text-2); cursor: pointer; touch-action: manipulation; }
.ds-kits .kit:hover:not(.is-lit) { --ds-edge: var(--ds-light-half); }
.ds-kits .kit.is-lit { color: var(--ds-text); }
.ds-kits .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ds-kits .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 var(--ds-type-small)/1.2 var(--ds-font-display); letter-spacing: 0.12em; text-transform: uppercase; }
.ds-kits kbd { display: inline-flex; flex: none; align-items: center; justify-content: center; min-width: 24px; height: 24px; padding: 0 6px; box-sizing: border-box; border: 1px solid var(--ds-line-2); border-bottom-width: 2px; border-radius: 3px; background: var(--ds-tint); font: 700 var(--ds-type-small) var(--ds-font); color: var(--ds-text); }
.ds-kits kbd:empty { visibility: hidden; }
/* The gun is its own still cut out as a flat shape, in the plate's text colour, as big as its row lets it be. */
.ds-kits .gun { display: flex; align-items: center; min-height: 0; container-type: size; }
.ds-kits .cut { display: block; flex: none; background: currentColor; -webkit-mask: var(--still) var(--mask-at) / var(--mask-size) no-repeat; mask: var(--still) var(--mask-at) / var(--mask-size) no-repeat; }
.ds-kits .gun .cut { width: min(100cqw, 100cqh * var(--r)); height: min(100cqh, 100cqw / var(--r)); }
.ds-kits .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.ds-kits .primary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 var(--ds-type-body)/1.2 var(--ds-font-display); color: var(--ds-text); }
.ds-kits .side { display: flex; flex: none; align-items: center; gap: 6px; }
.ds-kits .side .sec { height: 16px; aspect-ratio: var(--r); }
.ds-kits .side .ds-icon { width: 20px; height: 20px; }
/* The toast, Range Control's caption and the first-match hint stand over the plates, not behind them (\`.kits\` on the HUD while they are up; a phone's caption is at the top already). */
.ds-hud.kits .ds-toast, .ds-hud.kits .ds-hintline { bottom: calc(190px + var(--ds-safe-b)); }
@media (min-width: 1001px) { .ds-hud.kits .ds-caption { bottom: calc(190px + var(--ds-safe-b)); } }
@media (max-width: 760px) { .ds-hud.kits .ds-toast, .ds-hud.kits .ds-hintline, html.ds-touch .ds-hud.kits .ds-caption { bottom: calc(214px + var(--ds-safe-b)); } }
@media (max-height: 520px) { .ds-hud.kits .ds-toast, .ds-hud.kits .ds-hintline, html.ds-touch .ds-hud.kits .ds-hintline, html.ds-touch .ds-hud.kits .ds-caption { bottom: calc(104px + var(--ds-safe-b)); } }
/* The spectator's panel up (a Charge round, out until the next): its words end 388 px in, and the plates' width above
   keeps them 400 px clear of either edge down to 1280 wide; on a narrower screen they stand over it. */
@media (max-width: 1279px) and (min-height: 521px) { .ds-hud:has(> .ds-spec:not([hidden])) ~ .ds-kits { bottom: calc(300px + var(--ds-safe-b)); } }
/* A phone: three across its width, the gun smaller, the secondary's mark dropped for room (its name is on the loadout screen). */
@media (max-width: 760px) {
  .ds-kits { gap: 8px; bottom: calc(96px + var(--ds-safe-b)); }
  .ds-kits .kit { width: calc((100vw - 32px - 16px - var(--ds-safe-l) - var(--ds-safe-r)) / 3); max-width: 200px; height: 104px; padding: 8px 8px 8px 10px; gap: 4px; }
  .ds-kits .primary { font-size: var(--ds-type-small); }
  .ds-kits .name { font-size: 11px; letter-spacing: 0.08em; }
  .ds-kits .side .sec { display: none; }
  .ds-kits .side .ds-icon { width: 16px; height: 16px; }
}
/* A phone on its side: little height, so the plates are short and sit on the bottom edge between the corner readouts. */
@media (max-height: 520px) {
  .ds-kits { bottom: calc(10px + var(--ds-safe-b)); }
  /* Clear of the spectator's buttons at the bottom right (204 px from the edge). */
  .ds-kits { gap: 8px; }
  .ds-kits .kit { width: min(150px, calc((100vw - 440px - var(--ds-safe-l) - var(--ds-safe-r)) / 3)); height: 84px; padding: 6px 8px 6px 10px; gap: 3px; }
  .ds-kits .side .sec { display: none; }
  /* With the spectator's panel down the left and its buttons at the bottom right, the plates go above those buttons,
     right of the panel and its hint. */
  .ds-hud:has(> .ds-spec:not([hidden])) ~ .ds-kits { left: auto; right: calc(16px + var(--ds-safe-r)); transform: none; bottom: calc(96px + var(--ds-safe-b)); }
  .ds-hud:has(> .ds-spec:not([hidden])) ~ .ds-kits .kit { width: min(150px, calc((100vw - 527px - var(--ds-safe-r)) / 3)); }
}
`;

/** The D-pad's arrow on the plate a press would light next, or nothing. */
function padCap(i: number, chosen: number): string {
  return i === chosen - 1 ? '◀' : i === chosen + 1 ? '▶' : '';
}

/** The plates' markup: one button each, the chosen one lit. */
export function kitPlatesHtml(state: KitPlatesState): string {
  return state.sets
    .map((set, i) => {
      const lit = i === state.chosen;
      const cap = state.input === 'keys' ? String(i + 1) : state.input === 'pad' ? padCap(i, state.chosen) : '';
      const primary = STATS.weapons[set.primary].traits.name;
      const secondary = STATS.weapons[set.secondary].traits.name;
      const tactical = set.tactical ? icon(set.tactical) : '';
      const gun = gunMask(set.primary);
      const sec = gunMask(set.secondary);
      return (
        `<button type="button" class="ds-plate kit${lit ? ' is-lit light-on' : ''}" data-kit="${i}" aria-pressed="${lit}" aria-label="${escapeHtml(`${set.name}: ${primary}, ${secondary}`)}">` +
        `<span class="top"><span class="name">${escapeHtml(set.name)}</span>${state.input === 'touch' ? '' : `<kbd>${cap}</kbd>`}</span>` +
        `<span class="gun"><i class="cut" style="${gun.style};--r:${gun.aspect.toFixed(3)}"></i></span>` +
        `<span class="foot"><span class="primary">${escapeHtml(primary)}</span><span class="side"><i class="cut sec" style="${sec.style};--r:${sec.aspect.toFixed(3)}" title="${escapeHtml(secondary)}"></i>${tactical}</span></span>` +
        `</button>`
      );
    })
    .join('');
}

/** The plates on the page: drawn again only when what they show changes. */
export class KitPlatesView {
  readonly root: HTMLDivElement;
  /** A plate clicked or tapped: its index. */
  onPick: ((index: number) => void) | null = null;
  #html = '';

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'ds-kits ds-ui';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Next loadout');
    parent.append(this.root);
    // A press on a plate is not a press on the game: the mouse button would also step the spectator's view on.
    for (const type of ['mousedown', 'pointerdown', 'touchstart'] as const) this.root.addEventListener(type, (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => {
      const plate = (e.target as Element).closest<HTMLElement>('[data-kit]');
      if (plate) this.onPick?.(Number(plate.dataset['kit']));
    });
  }

  update(state: KitPlatesState | null): void {
    const show = state !== null && state.sets.length > 0;
    if (this.root.hidden === show) this.root.hidden = !show;
    if (!state || !show) {
      this.#html = '';
      return;
    }
    this.root.classList.toggle('leaving', state.leaving === true);
    const html = kitPlatesHtml(state);
    if (html === this.#html) return;
    this.#html = html;
    patchHtml(this.root, html);
  }

  set visible(on: boolean) {
    this.root.style.display = on ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
