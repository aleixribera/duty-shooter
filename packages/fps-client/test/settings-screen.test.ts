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
    const smooth = benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 12, 30)]);
    expect(smooth).toBeTruthy();
    expect(smooth).not.toMatch(/Switchyard|Survival Town/);
  });
  it('names the slowest map when the average misses 60 fps', () => {
    const slow = benchmarkVerdict([row('Switchyard', 8, 20), row('Zero Island', 21, 40)]);
    expect(slow).toContain('Zero Island');
    expect(slow).not.toContain('Switchyard');
  });
  it('names the map whose stutters drop under 30 fps', () => {
    const stutter = benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 10, 50)]);
    expect(stutter).toContain('Survival Town');
    expect(stutter).not.toContain('Switchyard');
    // Stutters on a map that averages 60 are not the same verdict as a map that misses 60.
    expect(stutter).not.toBe(benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 21, 40)]));
  });
  it('says nothing of no run', () => {
    expect(benchmarkVerdict([])).toBe('');
  });
});
