import { describe, expect, it } from 'vitest';
import { MENU_CSS } from '../src/ui/menu';

/** The declarations of the rule for exactly `selector`, or undefined. */
function rule(selector: string): string | undefined {
  const at = MENU_CSS.indexOf(`${String.fromCharCode(10)}${selector} {`);
  if (at < 0) return undefined;
  const open = MENU_CSS.indexOf('{', at);
  return MENU_CSS.slice(open + 1, MENU_CSS.indexOf('}', open));
}

// Ticket 56: ticket 12 removed the base rules for the pause menu's buttons,
// leaving the browser's light grey button under near-white text.
describe("the pause menu's buttons", () => {
  it('have a dark panel, no browser border, and the menu text colour', () => {
    const item = rule('.ds-pause .ds-item') ?? '';
    expect(item).toMatch(/background:\s*linear-gradient\(90deg, rgb\(12 15 21/);
    expect(item).toMatch(/border:\s*0/);
    expect(item).toMatch(/color:\s*var\(--ds-text\)/);
    expect(item).toMatch(/display:\s*grid/);
  });

  it('light up when hovered, focused or picked with the pad', () => {
    expect(MENU_CSS).toMatch(/\.ds-pause \.ds-item:hover, \.ds-pause \.ds-item:focus-visible, \.ds-pause \.ds-item\[data-pad-focus\] \{[^}]*border-left-color: var\(--ds-signal\)/);
  });
});
