import { describe, expect, it } from 'vitest';
import { CAMO_IDS, CAMO_MASTERY, camoOn, reticleOf, savedCamos, savedReticles } from '../src/customize';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';

describe('customizing (PLAN item 7)', () => {
  it('earns one camo a Mastery level, Gold last', () => {
    expect(CAMO_IDS.map((c) => CAMO_MASTERY[c])).toEqual([1, 2, 3, 4, 5]);
    expect(CAMO_MASTERY.gold).toBe(5);
  });

  it('wears a camo only while the gun has earned it', () => {
    expect(camoOn({ m4a1: 'forest' }, 'm4a1', 2)).toBe('forest');
    expect(camoOn({ m4a1: 'forest' }, 'm4a1', 1)).toBeNull();
    expect(camoOn({ m4a1: 'forest' }, 'smg', 5)).toBeNull();
  });

  it('keeps each optic its own reticle until one is picked', () => {
    expect(reticleOf({}, 'reflex')).toEqual({ colour: 'red', shape: 'dot' });
    expect(reticleOf({}, 'prism')).toEqual({ colour: 'red', shape: 'ring' });
    expect(reticleOf({ prism: { colour: 'green', shape: 'chevron' } }, 'prism')).toEqual({ colour: 'green', shape: 'chevron' });
  });

  it('reads saved camos and reticles, dropping what it does not know', () => {
    expect(savedCamos({ m4a1: 'gold', smg: 'pink', nope: 'sand' })).toEqual({ m4a1: 'gold' });
    expect(savedCamos('x')).toEqual({});
    expect(savedReticles({ reflex: { colour: 'cyan', shape: 'ring' }, prism: { colour: 'cyan', shape: 'star' }, scope: {} })).toEqual({ reflex: { colour: 'cyan', shape: 'ring' } });
  });

  it('carries camos and reticles through a save, and a save from before them has none', () => {
    const saved = { ...DEFAULT_SETTINGS, camos: { burst: 'urban' }, reticles: { reflex: { colour: 'amber', shape: 'chevron' } } };
    const back = parseSettings(JSON.parse(JSON.stringify(saved)));
    expect(back.camos).toEqual({ burst: 'urban' });
    expect(back.reticles).toEqual({ reflex: { colour: 'amber', shape: 'chevron' } });
    const { camos: _, reticles: __, ...old } = DEFAULT_SETTINGS;
    const before = parseSettings(JSON.parse(JSON.stringify(old)));
    expect(before.camos).toEqual({});
    expect(before.reticles).toEqual({});
  });
});
