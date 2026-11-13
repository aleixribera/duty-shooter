import { describe, expect, it } from 'vitest';
import { currentLighting, shownLighting, showsWorld, showWorld } from '../src/surface-materials';
import { LIGHTING, type Lighting } from '../src/surfaces';

const dusk: Lighting = { ...LIGHTING, sunDirection: [0.9, 0.1, 0.4] };

describe('the shared light', () => {
  it('goes back to the map on show after the Practice Range kept behind the menu took it', () => {
    const menuMap = {};
    const range = {};
    expect(showWorld(menuMap, dusk, null)).toBe(true);
    expect(showWorld(menuMap, dusk, null)).toBe(false);
    // The range is built behind the menu: its WorldView puts up its own light.
    expect(showWorld(range, LIGHTING, null)).toBe(true);
    expect(currentLighting()).toBe(LIGHTING);
    // The menu's map draws next and takes it back, the map's light (its sun's direction for glare and smoke) included.
    expect(showWorld(menuMap, dusk, null)).toBe(true);
    expect(currentLighting()).toBe(dusk);
    expect(shownLighting()).toBe(dusk);
    expect(showsWorld(menuMap)).toBe(true);
    expect(showsWorld(range)).toBe(false);
  });
});
