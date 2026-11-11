import { describe, expect, it } from 'vitest';
import { MENU_CSS } from '../src/ui/menu';

/** Every property the menu's rules set on exactly `selector` (as one of a rule's selectors). */
function props(selector: string): Set<string> {
  const set = new Set<string>();
  for (const [, selectors, body] of MENU_CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!selectors!.split(',').some((s) => s.trim() === selector)) continue;
    for (const d of body!.split(';')) {
      const p = d.split(':')[0]!.trim();
      if (p) set.add(p);
    }
  }
  return set;
}

// Ticket 56: ticket 12 removed the base rules for the pause menu's buttons,
// leaving the browser's light grey button under near-white text. Whatever the
// look, the rule has to replace each of the browser's own button styles.
describe("the pause menu's buttons", () => {
  it("set their own background, border and text colour, so none of the browser's button shows", () => {
    const set = props('.ds-pause .ds-item');
    for (const p of ['background', 'border', 'color']) expect(set, p).toContain(p);
  });

  it('light up when hovered, focused or picked with the pad', () => {
    for (const state of [':hover', ':focus-visible', '[data-pad-focus]']) {
      expect(props(`.ds-pause .ds-item${state}::before`), state).toContain('background');
    }
  });
});
