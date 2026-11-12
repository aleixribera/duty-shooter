import { describe, expect, it } from 'vitest';
import { changelogHtml, dayName, releaseDays } from '../src/ui/changelog-screen';

const releases = [
  { version: 'v2.186.8', date: '2026-11-12', title: 'Muzzle smoke lit by the room' },
  { version: 'v2.186.7', date: '2026-11-12', title: 'Open timber deck stairs' },
  { version: 'v2.108.1', date: '2026-11-02', title: 'Battle <Royale>' },
];

describe('the Changelog screen', () => {
  it('writes a day out as read, whatever the time zone', () => {
    expect(dayName('2026-11-12')).toBe('12 November 2026');
    expect(dayName('2026-01-01')).toBe('1 January 2026');
  });

  it('groups the releases a day at a time, newest first', () => {
    const days = releaseDays(releases);
    expect(days.map((d) => d.day)).toEqual(['12 November 2026', '2 November 2026']);
    expect(days[0]!.releases.map((r) => r.version)).toEqual(['v2.186.8', 'v2.186.7']);
  });

  it('shows each release with its version, its words escaped', () => {
    const html = changelogHtml(releases);
    expect(html).toContain('<h2 class="ds-h2">12 November 2026</h2>');
    expect(html).toContain('<span class="t">Open timber deck stairs</span><span class="v" translate="no">v2.186.7</span>');
    expect(html).toContain('Battle &#60;Royale&#62;');
    expect(changelogHtml(null)).toBe('');
    expect(changelogHtml(null, true)).toContain("didn't load");
  });
});
