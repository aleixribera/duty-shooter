import { describe, expect, it } from 'vitest';
import { FRAME_CAPS, QUALITY, QUALITY_TIERS } from '../src/quality';
import { SECTION_NAMES, SETTINGS_SCREEN_CSS, capChoices, sectionOrder, tierFacts, tierHeading, tierLine, tierShown, type VideoStatus } from '../src/ui/settings-screen';
import { benchmarkVerdict } from '../src/ui/benchmark-page';

const status = (over: Partial<VideoStatus> = {}): VideoStatus => ({ backend: 'WebGPU', adapter: 'nvidia rtx 4070', tier: 'high', searching: false, refreshHz: 60, ...over });

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

describe('what the Video section says of a tier', () => {
  it('reads every line from the tier table', () => {
    for (const tier of QUALITY_TIERS) {
      const q = QUALITY[tier];
      const facts = new Map(tierFacts(q, false));
      expect(facts.get('Render scale')).toBe(`${Math.round(q.renderScale * 100)}%`);
      expect(facts.get('Most pixels a frame')).toBe(`${q.megapixels.toFixed(1)} million`);
      expect(facts.get('Shadows')).toBe(`${q.shadowMapSize} px, ${q.shadowDistance} m`);
      expect(facts.get('Ambient occlusion')).toBe(q.aoSamples > 0 ? `${q.aoSamples} samples` : 'Off');
      expect(facts.get('Bloom')).toBe(q.bloom ? 'On' : 'Off');
      expect(facts.get('Texture filtering')).toBe(`${q.anisotropy}x`);
    }
  });

  it('says the scale moves where dynamic resolution moves it, instead of a number that is not the one drawn', () => {
    expect(new Map(tierFacts(QUALITY.medium, true)).get('Render scale')).toBe('50% to 100%, moving');
  });

  it('describes the tier picked by hand, else the one drawn, else what Auto remembers, else none', () => {
    expect(tierShown({ quality: 'low', autoTier: 'ultra' }, status({ tier: 'low' }))).toBe('low');
    expect(tierShown({ quality: 'ultra', autoTier: null }, null)).toBe('ultra');
    expect(tierShown({ quality: 'auto', autoTier: 'medium' }, status({ tier: 'high' }))).toBe('high');
    expect(tierShown({ quality: 'auto', autoTier: 'medium' }, null)).toBe('medium');
    expect(tierShown({ quality: 'auto', autoTier: null }, null)).toBeNull();
  });

  it('says where the tier came from', () => {
    expect(tierLine({ quality: 'high', autoTier: null }, status())).toMatch(/^Picked by hand/);
    expect(tierLine({ quality: 'auto', autoTier: null }, null)).toMatch(/measures this machine once the map is drawn/);
    expect(tierLine({ quality: 'auto', autoTier: 'low' }, null)).toMatch(/last time/);
    expect(tierLine({ quality: 'auto', autoTier: null }, status({ searching: true }))).toMatch(/^Trying High now/);
    expect(tierLine({ quality: 'auto', autoTier: 'high' }, status())).toBe('Auto measured this machine and chose it for nvidia rtx 4070.');
    expect(tierLine({ quality: 'auto', autoTier: 'high' }, status({ adapter: '' }))).toBe('Auto measured this machine and chose it.');
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

describe("the Video preview's heading", () => {
  it("names the tier picked by hand, Auto's pick once it has one, and says so while Auto is still measuring", () => {
    expect(tierHeading({ quality: 'low', autoTier: null }, status())).toBe('Low');
    expect(tierHeading({ quality: 'auto', autoTier: null }, null)).toBe('Not measured yet');
    expect(tierHeading({ quality: 'auto', autoTier: 'medium' }, null)).toBe('Auto: Medium');
    expect(tierHeading({ quality: 'auto', autoTier: null }, status({ searching: true, tier: 'high' }))).toBe('Auto: measuring');
    expect(tierLine({ quality: 'auto', autoTier: null }, status({ searching: true, tier: 'high' }))).toMatch(/^Trying High now/);
    expect(tierHeading({ quality: 'auto', autoTier: null }, status({ tier: 'ultra' }))).toBe('Auto: Ultra');
  });
});

describe("the benchmark's verdict", () => {
  const row = (map: string, meanMs: number, low1Ms: number, scale: number | null = null) => ({ map, meanMs, low1Ms, scale });
  it('says a tier runs smoothly when every map holds 60 fps and its stutters stay over 30', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 12, 30)], 'high')).toMatch(/^High runs smoothly/);
  });
  it('names the slowest map and the tier below when the average misses 60 fps', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Zero Island', 21, 40)], 'high')).toBe('High averages under 60 fps on Zero Island: try Medium.');
    expect(benchmarkVerdict([row('Zero Island', 21, 40)], 'low')).toBe('Low averages under 60 fps on Zero Island.');
  });
  it('names the map whose stutters drop under 30 fps', () => {
    expect(benchmarkVerdict([row('Switchyard', 8, 20), row('Survival Town', 10, 50)], 'ultra')).toMatch(/^Ultra holds 60 fps on average, but stutters on Survival Town drop under 30 fps: High may smooth them/);
  });
  it('says when it held the rate only by drawing smaller', () => {
    expect(benchmarkVerdict([row('Switchyard', 15, 25, 0.7)], 'ultra')).toMatch(/drawing smaller/);
  });
});
