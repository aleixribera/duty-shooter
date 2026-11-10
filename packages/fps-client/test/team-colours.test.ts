import { afterEach, describe, expect, it } from 'vitest';
import { COLOUR_VISIONS, TEAM_PALETTES, hexNumber, paletteTokens, rgbChannels, seenApart, teamColours, teamPalette, useColourVision, type ColourVision } from '../src/team-colours';

/** The least any two of a palette's three colours are apart, as `seeing` sees them. */
function closest(vision: ColourVision, seeing: ColourVision): number {
  const p = TEAM_PALETTES[vision];
  const [a, b, c] = [p.teams[1].colour, p.teams[2].colour, p.enemy];
  return Math.min(seenApart(a, b, seeing), seenApart(a, c, seeing), seenApart(b, c, seeing));
}

afterEach(() => useColourVision('off'));

describe('the team colours', () => {
  it("are DESIGN.md's blue and orange with a red enemy marker until a set is picked", () => {
    expect(teamPalette()).toBe(TEAM_PALETTES.off);
    expect(TEAM_PALETTES.off.teams[1].colour).toBe('#3d8bff');
    expect(TEAM_PALETTES.off.teams[2].colour).toBe('#ff9a3c');
    expect(TEAM_PALETTES.off.enemy).toBe('#ff6159');
    expect(hexNumber(teamColours(1)!.colour)).toBe(0x3d8bff);
    expect(teamColours(0)).toBeNull();
  });

  it('are close enough to confuse under each deficiency with the default set', () => {
    for (const seeing of ['deuteranopia', 'protanopia', 'tritanopia'] as const) expect(closest('off', seeing), seeing).toBeLessThan(40);
  });

  it('stay plainly apart under the deficiency each set is for, and with full colour vision', () => {
    for (const vision of ['deuteranopia', 'protanopia', 'tritanopia'] as const) {
      expect(closest(vision, vision), `${vision} seen with ${vision}`).toBeGreaterThanOrEqual(40);
      expect(closest(vision, 'off'), `${vision} seen with full vision`).toBeGreaterThanOrEqual(40);
    }
  });

  it('keep the enemy marker off the signal colour and the text in every set', () => {
    for (const vision of COLOUR_VISIONS) {
      const enemy = TEAM_PALETTES[vision].enemy;
      expect(seenApart(enemy, '#8fe3c8', vision), `${vision}: signal`).toBeGreaterThanOrEqual(35);
      expect(seenApart(enemy, '#f3f1ea', vision), `${vision}: text`).toBeGreaterThanOrEqual(35);
    }
  });

  it('change everywhere at once: the palette the world reads follows the setting', () => {
    useColourVision('tritanopia');
    expect(teamPalette()).toBe(TEAM_PALETTES.tritanopia);
    expect(teamColours(2)!.colour).toBe('#ffc93c');
    useColourVision('off');
    expect(teamColours(2)!.colour).toBe('#ff9a3c');
  });

  it('give the HUD its tokens: the colours, and their channels for tints', () => {
    const tokens = paletteTokens(TEAM_PALETTES.off);
    expect(tokens['--ds-blue']).toBe('#3d8bff');
    expect(tokens['--ds-orange']).toBe('#ff9a3c');
    expect(tokens['--ds-enemy']).toBe('#ff6159');
    expect(tokens['--ds-blue-rgb']).toBe('61 139 255');
    expect(rgbChannels('#ff9a3c')).toBe('255 154 60');
  });
});
