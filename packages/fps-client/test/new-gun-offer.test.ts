import { describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT_SETS } from '../src/settings';
import { rankFloor } from '../src/profile/model';
import { NEW_GUN_PASSES, newGunOffer, parseNewGunPasses } from '../src/new-gun-offer';

const kept = DEFAULT_LOADOUT_SETS.map((set) => set.loadout);

describe("the death screen's new-gun plate (PLAN item 9d)", () => {
  it('offers nothing to a new player: the starting guns are not new', () => {
    expect(newGunOffer(kept, 0, {})).toBeNull();
  });

  it('offers a gun opened by rank and in none of the loadouts, the first to open first; never a locked one', () => {
    expect(newGunOffer(kept, rankFloor(4), {})).toBe('burst');
    expect(newGunOffer(kept, rankFloor(4) - 1, {})).toBeNull();
    expect(newGunOffer(kept, rankFloor(12), {})).toBe('burst');
  });

  it('skips a gun already in a loadout, in either slot', () => {
    const withBurst = [{ ...kept[0]!, primary: 'burst' as const }, kept[1]!, kept[2]!];
    expect(newGunOffer(withBurst, rankFloor(6), {})).toBe('revolver');
    const withRevolver = [withBurst[0]!, { ...kept[1]!, secondary: 'revolver' as const }, kept[2]!];
    expect(newGunOffer(withRevolver, rankFloor(6), {})).toBeNull();
  });

  it('lets a gun go once passed on three deaths (or taken), and offers the next one opened', () => {
    expect(newGunOffer(kept, rankFloor(6), { burst: NEW_GUN_PASSES - 1 })).toBe('burst');
    expect(newGunOffer(kept, rankFloor(6), { burst: NEW_GUN_PASSES })).toBe('revolver');
  });

  it('reads a damaged save as nothing passed, and keeps only real guns and counts', () => {
    expect(parseNewGunPasses(null)).toEqual({});
    expect(parseNewGunPasses('x')).toEqual({});
    expect(parseNewGunPasses({ burst: 2, nope: 3, dmr: -1, lmg: 'a', sniper: 9 })).toEqual({ burst: 2, sniper: NEW_GUN_PASSES });
  });
});
