/**
 * TV mode: the page opened full screen on a living-room TV, read from a sofa with a controller (`?tv` in its
 * address, which the TV launcher adds). Settings left on Auto read bigger there: the menus' text and the HUD.
 */
let tv: boolean | null = null;

export function tvMode(): boolean {
  return (tv ??= typeof location !== 'undefined' && new URLSearchParams(location.search).has('tv'));
}

/** The menus' text size, `'auto'` being large in TV mode. */
export type MenuText = 'auto' | 'standard' | 'large';
export const MENU_TEXTS: readonly MenuText[] = ['auto', 'standard', 'large'];

/** Puts the menus' text at `size`: the page root carries `ds-text-large` while it is large. */
export function useMenuText(size: MenuText): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('ds-text-large', size === 'large' || (size === 'auto' && tvMode()));
}

/** The HUD's size in play: the setting, or its largest in TV mode while the setting is left at its default. */
export function hudScaleFor(setting: number, largest: number): number {
  return setting === 1 && tvMode() ? largest : setting;
}
