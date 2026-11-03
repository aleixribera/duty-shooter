import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoyaleHud, type RoyaleHudState } from '../src/hud/royale-hud';
import { installFakeDom, type FakeElement } from './helpers/fake-dom';

/** The Battle Royale HUD's own elements, by class. */
const PARTS = ['ds-br-top', 'ds-ringline', 'ds-outside', 'ds-out', 'ds-watch'] as const;

const state = (over: Partial<RoyaleHudState> = {}): RoyaleHudState => ({
  status: { stage: 1, stages: 6, phase: 'hold', seconds: 40, outside: false, toSafety: 0, damage: 1 },
  ring: { x: 0, z: 0, radius: 300 },
  next: { x: 0, z: 0, radius: 200 },
  alive: 50,
  squads: 40,
  kills: 0,
  heading: 0,
  at: { x: 0, z: 0 },
  mates: [],
  placement: null,
  out: false,
  seated: true,
  watching: null,
  mapKey: 'M',
  menuKey: 'Esc',
  mapOpen: false,
  ...over,
});

let dom: ReturnType<typeof installFakeDom>;
let root: FakeElement;
let hud: RoyaleHud;
beforeEach(() => {
  dom = installFakeDom();
  root = dom.root;
  hud = new RoyaleHud(root as unknown as HTMLElement, null);
});
afterEach(() => dom.restore());

const shown = (cls: string) => root.one(cls).shown;

describe('the Battle Royale HUD outside a Battle Royale', () => {
  it('shows none of its boxes on a fresh HUD in another mode (ticket 37)', () => {
    hud.update(null);
    for (const part of PARTS) expect(shown(part), part).toBe(false);
  });

  it('hides them all again after a Battle Royale', () => {
    hud.update(state({ out: true, watching: 'Ada' }));
    expect(shown('ds-br-top')).toBe(true);
    hud.update(null);
    for (const part of PARTS) expect(shown(part), part).toBe(false);
  });
});

describe('out of a Battle Royale', () => {
  it('gives your Squad’s place, then who you watch', () => {
    hud.update(state({ out: true, placement: { place: 3, of: 20 }, watching: 'Ada' }));
    expect(shown('ds-out')).toBe(true);
    expect(root.one('ds-out').text).toContain('3rd');
    // Who you watch is the spectator panel's to say (ticket 32); the bar keeps the place and the keys.
    expect(root.one('ds-watch').text).toContain('3rd');
    expect(root.one('ds-watch').text).not.toContain('Ada');
  });

  it('says Spectating while there is nobody to watch', () => {
    hud.update(state({ out: true, watching: null }));
    expect(root.one('ds-watch').text).toContain('Spectating');
  });

  it('tells a seat put out that its Squad fights on', () => {
    hud.update(state({ out: true, watching: 'Mate' }));
    expect(root.one('ds-out').text).toMatch(/You're out.*Your Squad fights on/);
  });

  it('gives a late arrival, who never had a seat, no out card: only who it watches (ticket 43)', () => {
    hud.update(state({ out: true, seated: false, at: null, watching: 'Ada' }));
    expect(shown('ds-out')).toBe(false);
    expect(shown('ds-watch')).toBe(true);
    expect(root.one('ds-watch').text).not.toMatch(/out|fights on/i);
  });

  it('names the key for the menu, where Leave is, not a Leave key (ticket 47)', () => {
    hud.update(state({ out: true, watching: 'Ada' }));
    const bar = root.one('ds-watch').text;
    expect(bar).toContain('Esc Menu');
    expect(bar).not.toContain('Leave');
  });
});
