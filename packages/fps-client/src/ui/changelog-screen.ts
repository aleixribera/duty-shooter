import { escapeHtml as escape } from './theme';

/**
 * The Changelog screen: what each release changed in the game, newest first,
 * a day at a time. The releases come from the app (read from the release tags
 * in git when it was built); its markup is built as text from them alone, so
 * it can be checked without a page. The menu sets it in its page shell and
 * owns the buttons.
 */

/** One release: its version, its day (`2026-11-12`) and what changed, in a few words. */
export interface Release {
  readonly version: string;
  readonly date: string;
  readonly title: string;
}

/** A day of releases, newest first, under the day written out. */
export interface ReleaseDay {
  readonly day: string;
  readonly releases: readonly Release[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `2026-11-12` as "12 November 2026", read as written: no time zone moves it a day. */
export function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  return y && month && d ? `${d} ${month} ${y}` : date;
}

/** The releases (newest first) a day at a time, in the order they came. */
export function releaseDays(releases: readonly Release[]): ReleaseDay[] {
  const days: { day: string; releases: Release[] }[] = [];
  let last = '';
  for (const r of releases) {
    if (r.date !== last || days.length === 0) {
      days.push({ day: dayName(r.date), releases: [] });
      last = r.date;
    }
    days[days.length - 1]!.releases.push(r);
  }
  return days;
}

/** The screen's body: each day's name, then its releases as one list split by lines, what changed first and the version beside it. */
export function changelogHtml(releases: readonly Release[] | null, failed = false): string {
  if (failed) return '<p class="none">The changelog didn\'t load. Reload the page to try again.</p>';
  if (!releases) return '';
  return releaseDays(releases)
    .map(
      (d) =>
        `<section><h2 class="ds-h2">${escape(d.day)}</h2><ol>${d.releases
          .map((r) => `<li><span class="t">${escape(r.title)}</span><span class="v" translate="no">${escape(r.version)}</span></li>`)
          .join('')}</ol></section>`,
    )
    .join('');
}

export const CHANGELOG_SCREEN_CSS = `
/* The main menu's way into the Changelog, at the foot beside the key hints: the word and the version running now. */
.ds-version { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0; background: none; border: 0; color: var(--ds-text-2); font-size: var(--ds-type-small); font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgb(0 0 0 / 0.7); }
.ds-version b { font-weight: 600; color: var(--ds-text-2); transition: color var(--ds-fast); }
.ds-version span::before { content: '· '; }
.ds-version:hover b, .ds-version:focus-visible b, .ds-version[data-pad-focus] b { color: var(--ds-text); }
.ds-version:focus-visible, .ds-version[data-pad-focus] { outline: 2px solid var(--ds-light-half); outline-offset: 4px; }
/* The Changelog: a day's name, then its releases as one list split by 1px lines. */
/* The list takes the focus as it opens, for the keys to scroll it: a ring only for keyboard focus, inside its edge. */
.ds-log-body:focus:not(:focus-visible) { outline: none; }
.ds-log-body:focus-visible { outline: 2px solid var(--ds-light-half); outline-offset: -2px; }
.ds-log { max-width: 820px; }
.ds-log section { content-visibility: auto; contain-intrinsic-size: auto 480px; }
.ds-log section + section { margin-top: 32px; }
.ds-log ol { margin: 0; padding: 0; list-style: none; }
.ds-log li { display: flex; align-items: baseline; justify-content: space-between; gap: 6px 24px; padding: 10px 0; font-size: var(--ds-type-body); color: var(--ds-text); }
.ds-log li + li { border-top: 1px solid var(--ds-line); }
.ds-log .t { min-width: 0; overflow-wrap: anywhere; }
.ds-log .v { flex: none; font-size: var(--ds-type-small); color: var(--ds-text-2); font-variant-numeric: tabular-nums; }
.ds-log .none { margin: 0; max-width: 60ch; font-size: var(--ds-type-body); color: var(--ds-text-2); }
`;
