import { describe, expect, it } from 'vitest';
import { FRAME_CAPS, PICTURE } from '../src/quality';
import { SECTION_NAMES, SETTINGS_SCREEN_CSS, capChoices, pictureFacts, sectionOrder } from '../src/ui/settings-screen';
import { benchmarkVerdict } from '../src/ui/benchmark-page';

describe("the Settings screen's sections", () => {
  it('are the same seven wherever they are read, Touch first where a finger plays', () => {
    const desk = sectionOrder(false);
    const phone = sectionOrder(true);
    expect([...desk].sort()).toEqual(Object.keys(SECTION_NAMES).sort());
    expect([...phone].sort()).toEqual([...desk].sort());
    expect(phone[0]).toBe('touch');
    expect(desk[0]).toBe('controls');
    expect(desk.indexOf('touch')).toBe(desk.indexOf('mouse') + 1);
  });
});

describe('what the Video section says of the picture', () => {
  it('reads every line from the one picture, drawn at the screen\'s own resolution', () => {
    const facts = new Map(pictureFacts());
    expect(facts.get('Resolution')).toBe("Your screen's own");
    expect(facts.get('Shadows')).toBe(`${PICTURE.shadowMapSize} px, ${PICTURE.shadowDistance} m`);
    expect(facts.get('Ambient occlusion')).toBe(`${PICTURE.aoSamples} samples`);
    expect(facts.get('Anti-aliasing')).toBe('Temporal');
    expect(facts.get('Texture filtering')).toBe(`${PICTURE.anisotropy}x`);
  });

  it("offers the display's own rate first, then each cap", () => {
    const caps = capChoices();
    expect(caps.length).toBe(FRAME_CAPS.length);
    expect(caps[0]).toEqual(['0', 'Display rate']);
    expect(caps[2]).toEqual(['60', '60 fps']);
  });
});

describe("the Settings screen's styles", () => {
  it('take every colour from the theme', () => {
    expect(SETTINGS_SCREEN_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('put the preview above the rows on a narrow screen, and after them where it reads out what they chose', () => {
    const narrow = SETTINGS_SCREEN_CSS.slice(SETTINGS_SCREEN_CSS.indexOf('@media (max-width: 960px)'));
    expect(narrow).toMatch(/\.ds-preview \{[^}]*order: -1/);
    expect(narrow).toMatch(/\.ds-preview\.after \{[^}]*order: 0/);
  });
});

describe("the benchmark's verdict", () => {
  const row = (map: string, meanMs: number, low1Ms: number) => ({ map, meanMs, low1Ms });
  it('says the machine runs smoothly when every map holds 60 fps and its stutters stay over 30', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 12, 30)])).toMatch(/^This machine runs the game smoothly/);
  });
  it('names the slowest map when the average misses 60 fps', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Zero Island', 21, 40)])).toMatch(/^This machine averages under 60 fps on Zero Island\./);
  });
  it('names the map whose stutters drop under 30 fps', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 10, 50)])).toBe('This machine holds 60 fps on average, but stutters on Survival Town drop under 30 fps.');
  });
  it('says nothing of no run', () => {
    expect(benchmarkVerdict([])).toBe('');
  });
});
