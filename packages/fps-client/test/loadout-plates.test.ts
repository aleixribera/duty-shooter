import { describe, expect, it } from 'vitest';
import { kitPlatesHtml, type KitPlatesState } from '../src/hud/loadout-plates';

const state = (over: Partial<KitPlatesState> = {}): KitPlatesState => ({
  sets: [
    { name: 'Assault', primary: 'm4a1', secondary: 'pistol', tactical: 'smoke' },
    { name: 'Close', primary: 'smg', secondary: 'pistol', tactical: 'flash' },
    { name: 'Breach', primary: 'shotgun', secondary: 'revolver', tactical: null },
  ],
  chosen: 1,
  input: 'keys',
  ...over,
});

/** The plates' buttons as an element tree, for asking about each one. */
function plates(s: KitPlatesState): { lit: boolean; text: string; cap: string | null; gun: string }[] {
  return [...kitPlatesHtml(s).matchAll(/<button[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g)].map((m) => ({
    lit: m[1]!.includes('is-lit'),
    text: m[2]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    cap: /<kbd>(.*?)<\/kbd>/.exec(m[2]!)?.[1] ?? null,
    gun: /class="gun"><i class="cut" style="--still:url\('([^']*)'\)/.exec(m[2]!)?.[1] ?? '',
  }));
}

describe("the death screen's loadout plates (PLAN item 9d)", () => {
  it('shows each kept loadout: its name, its primary by name and silhouette, the one carried lit', () => {
    const p = plates(state());
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.lit)).toEqual([false, true, false]);
    expect(p[0]!.text).toContain('Assault');
    expect(p[0]!.text).toContain('M4A1');
    expect(p[0]!.gun).toMatch(/m4a1\.webp$/);
    expect(p[2]!.gun).toMatch(/shotgun\.webp$/);
  });

  it('marks the secondary and the tactical small, and leaves no tactical mark where there is none', () => {
    const html = kitPlatesHtml(state());
    expect(html.match(/class="cut sec"/g)).toHaveLength(3);
    expect(html.match(/class="ds-icon"/g)).toHaveLength(2);
  });

  it('names the key that picks each on a keyboard, the D-pad step on a pad, and nothing on glass', () => {
    expect(plates(state()).map((x) => x.cap)).toEqual(['1', '2', '3']);
    expect(plates(state({ input: 'pad' })).map((x) => x.cap)).toEqual(['◀', '', '▶']);
    expect(plates(state({ input: 'pad', chosen: 0 })).map((x) => x.cap)).toEqual(['', '▶', '']);
    expect(plates(state({ input: 'touch' })).map((x) => x.cap)).toEqual([null, null, null]);
  });

  it('escapes a kept loadout\'s own name', () => {
    const s = state();
    const html = kitPlatesHtml({ ...s, sets: [{ ...s.sets[0]!, name: '<b>Mine</b>' }] });
    expect(html).not.toContain('<b>Mine</b>');
    expect(html).toContain('&#60;b&#62;Mine');
  });
});

describe("the death screen's new-gun plate (PLAN item 9d)", () => {
  const fresh = (s: KitPlatesState): string | null => /<button[^>]*data-kit="new"[^>]*>(.*?)<\/button>/.exec(kitPlatesHtml(s))?.[1] ?? null;

  it('stands only while a new gun is offered, slim, with "New", its silhouette and name, apart from the three', () => {
    expect(fresh(state())).toBeNull();
    const html = fresh(state({ fresh: 'burst' }))!;
    expect(html).toContain('New');
    expect(html).toContain('Trident 5.56');
    expect(html).toMatch(/burst\.webp/);
    expect(kitPlatesHtml(state({ fresh: 'burst' })).match(/data-kit="\d"/g)).toHaveLength(3);
  });

  it('names 4 on a keyboard, the D-pad down on a pad, and nothing on glass', () => {
    expect(fresh(state({ fresh: 'burst' }))).toContain('<kbd>4</kbd>');
    expect(fresh(state({ fresh: 'burst', input: 'pad' }))).toContain('<kbd>▼</kbd>');
    expect(fresh(state({ fresh: 'burst', input: 'touch' }))).not.toContain('<kbd>');
  });
});
