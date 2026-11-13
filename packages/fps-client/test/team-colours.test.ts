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
  it('are the default set until a set is picked, and a team-less seat has none', () => {
    expect(teamPalette()).toBe(TEAM_PALETTES.off);
    expect(teamColours(1)).toBe(TEAM_PALETTES.off.teams[1]);
    expect(teamColours(2)).toBe(TEAM_PALETTES.off.teams[2]);
    expect(hexNumber(teamColours(1)!.colour)).toBe(Number.parseInt(TEAM_PALETTES.off.teams[1].colour.slice(1), 16));
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

  it('keep the enemy marker off the light and the text in every set', () => {
    for (const vision of COLOUR_VISIONS) {
      const enemy = TEAM_PALETTES[vision].enemy;
      expect(seenApart(enemy, '#ffe2b0', vision), `${vision}: light`).toBeGreaterThanOrEqual(35);
      expect(seenApart(enemy, '#fbf6ec', vision), `${vision}: text`).toBeGreaterThanOrEqual(35);
    }
  });

  it('change everywhere at once: the palette the world reads follows the setting', () => {
    useColourVision('tritanopia');
    expect(teamPalette()).toBe(TEAM_PALETTES.tritanopia);
    expect(teamColours(2)).toBe(TEAM_PALETTES.tritanopia.teams[2]);
    useColourVision('off');
    expect(teamColours(2)).toBe(TEAM_PALETTES.off.teams[2]);
  });

  it('give the HUD its tokens: the colours, and their channels for tints', () => {
    for (const vision of COLOUR_VISIONS) {
      const p = TEAM_PALETTES[vision];
      const tokens = paletteTokens(p);
      expect(tokens['--ds-blue'], vision).toBe(p.teams[1].colour);
      expect(tokens['--ds-orange'], vision).toBe(p.teams[2].colour);
      expect(tokens['--ds-enemy'], vision).toBe(p.enemy);
      expect(tokens['--ds-blue-rgb'], vision).toBe(rgbChannels(p.teams[1].colour));
    }
    expect(rgbChannels('#ff9a3c')).toBe('255 154 60');
  });
});
