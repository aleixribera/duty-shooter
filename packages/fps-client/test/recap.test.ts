import { describe, expect, it } from 'vitest';
import { MatchLog, recapHtml, ROUTE_EVERY, type RecapLookup } from '../src/ui/recap';

const lookup = (seats: Record<string, { health: number; position: [number, number, number] }> = {}): RecapLookup => ({
  nameOf: (id) => ({ a: 'Ada', k: 'Kite', m: 'Mate' })[id] ?? id,
  isBot: (id) => id === 'k',
  seat: (id) => seats[id] ?? null,
  weaponName: (cause, weapon) => (cause === 'melee' ? 'Melee' : weapon === 'm4a1' ? 'M4A1' : weapon),
});
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const at = (x: number, z: number): [number, number, number] => [x, 0, z];

describe('the death recap (ticket 73)', () => {
  it('says who put you Downed, with what, from how far, the damage both ways and their health', () => {
    const log = new MatchLog();
    log.reset('a');
    log.hit({ shooter: 'a', victim: 'k', damage: 30, distance: 40 }, 1, at(0, 0));
    log.hit({ shooter: 'k', victim: 'a', damage: 40, distance: 42.4 }, 1.2, at(0, 0));
    log.hit({ shooter: 'k', victim: 'a', damage: 60, distance: 41.6 }, 1.4, at(0, 0));
    log.hit({ shooter: 'm', victim: 'k', damage: 99, distance: 10 }, 1.4, at(0, 0));
    log.down({ attacker: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup({ k: { health: 70.4, position: [30, 2, 25] } }), at(0, 0));
    const r = log.recap!;
    expect(r).toMatchObject({ what: 'downed', name: 'Kite', bot: true, weapon: 'M4A1', dealt: 30, taken: 100, health: 70, at: [30, 25] });
    expect(r.distance).toBeCloseTo(41.6);
    const t = text(recapHtml(r));
    expect(t).toContain('Downed by');
    expect(t).toContain('Kite');
    expect(t).toContain('Bot');
    expect(t).toContain('M4A1 · 42 m');
    expect(t).toMatch(/You dealt 30 They dealt 100 Their health 70/);
  });

  it('names the finisher once Downed, and keeps the one who Downed you for a Bleed-out', () => {
    const log = new MatchLog();
    log.reset('a');
    log.down({ attacker: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    log.kill({ killer: 'm', victim: 'a', cause: 'melee', weapon: null }, lookup(), at(1, 1));
    expect(log.recap).toMatchObject({ what: 'finished', name: 'Mate', weapon: 'Melee' });

    log.reset('a');
    log.down({ attacker: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    log.kill({ killer: 'k', victim: 'a', cause: 'bleedOut', weapon: null }, lookup(), at(0, 0));
    expect(log.recap).toMatchObject({ what: 'bledOut', name: 'Kite', weapon: 'M4A1' });
    expect(text(recapHtml(log.recap!))).toContain('Bled out · Downed by');
  });

  it('puts the attacker where their last shot was heard when they are too far to be sent, and shows no health it does not know', () => {
    const log = new MatchLog();
    log.reset('a');
    log.shot('k', [210, 30, -90]);
    log.kill({ killer: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    expect(log.recap).toMatchObject({ what: 'eliminated', at: [210, -90], health: null });
    expect(text(recapHtml(log.recap!))).toContain('Their health –');
  });

  it('says the Ring with nobody named', () => {
    const log = new MatchLog();
    log.reset('a');
    log.down({ attacker: null, victim: 'a', cause: 'ring', weapon: null }, lookup(), at(0, 0));
    expect(text(recapHtml(log.recap!))).toBe('Downed by the Ring');
    log.kill({ killer: null, victim: 'a', cause: 'ring', weapon: null }, lookup(), at(0, 0));
    expect(log.recap).toMatchObject({ what: 'ring', name: null, at: null });
    expect(text(recapHtml(log.recap!))).toBe('Out to the Ring');
  });

  it('says your own frag, not a fall, for a frag that put you out', () => {
    const log = new MatchLog();
    log.reset('a');
    log.kill({ killer: 'a', victim: 'a', cause: 'grenade', weapon: 'frag' }, lookup(), at(0, 0));
    expect(log.recap).toMatchObject({ what: 'self', name: null });
    expect(text(recapHtml(log.recap!))).toBe('Out to your own frag');
    log.reset('a');
    log.kill({ killer: null, victim: 'a', cause: 'fall', weapon: null }, lookup(), at(0, 0));
    expect(text(recapHtml(log.recap!))).toBe('Out in a fall');
  });

  it('clears when you are back up, and ignores other seats', () => {
    const log = new MatchLog();
    log.reset('a');
    log.down({ attacker: 'k', victim: 'm', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    expect(log.recap).toBeNull();
    log.down({ attacker: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    log.revive({ reviver: 'm', target: 'a' });
    expect(log.recap).toBeNull();
  });
});

describe('the match card (ticket 73)', () => {
  it('counts your Downs, Revives, Reboots, damage and time alive', () => {
    const log = new MatchLog();
    log.reset('a');
    log.down({ attacker: 'a', victim: 'k', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    log.down({ attacker: 'k', victim: 'm', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(0, 0));
    log.revive({ reviver: 'a', target: 'm' });
    log.reboot({ player: 'a', seats: ['m', 'x'] });
    log.hit({ shooter: 'a', victim: 'k', damage: 33.4, distance: 10 }, 0, at(0, 0));
    log.hit({ shooter: 'a', victim: 'k', damage: 33.4, distance: 10 }, 0, at(0, 0));
    for (let i = 0; i < 60; i++) log.sample(0.5, at(i, 0));
    log.sample(0.5, null);
    const c = log.card({ place: 3, of: 30 }, 2);
    expect(c).toMatchObject({ place: 3, of: 30, eliminations: 2, downs: 1, revives: 1, reboots: 2, damage: 67 });
    expect(c.alive).toBeCloseTo(30);
  });

  it('draws the route every few seconds, skipping standing still, and breaks it at a Reboot', () => {
    const log = new MatchLog();
    log.reset('a');
    const step = ROUTE_EVERY;
    log.sample(step, at(0, 0));
    log.sample(step, at(0, 1));
    log.sample(step, at(0, 10));
    log.reboot({ player: 'm', seats: ['a'] });
    log.sample(step, at(400, 400));
    expect(log.card(null, 0).route).toEqual([{ x: 0, z: 0 }, { x: 0, z: 10 }, null, { x: 400, z: 400 }]);
  });

  it('makes one fight mark of hits close in time and place, and marks where you fell', () => {
    const log = new MatchLog();
    log.reset('a');
    log.hit({ shooter: 'a', victim: 'k', damage: 10, distance: 10 }, 0, at(0, 0));
    log.hit({ shooter: 'k', victim: 'a', damage: 10, distance: 10 }, 5, at(5, 5));
    log.hit({ shooter: 'a', victim: 'm', damage: 10, distance: 10 }, 100, at(300, 0));
    log.down({ attacker: 'k', victim: 'a', cause: 'bullet', weapon: 'm4a1' }, lookup(), at(300, 2));
    log.kill({ killer: 'k', victim: 'a', cause: 'bleedOut', weapon: null }, lookup(), at(301, 2));
    const c = log.card(null, 0);
    expect(c.fights).toEqual([{ x: 0, z: 0 }, { x: 300, z: 0 }]);
    expect(c.fell).toEqual([{ x: 300, z: 2, out: false }, { x: 301, z: 2, out: true }]);
  });

  it('starts empty at the next match', () => {
    const log = new MatchLog();
    log.reset('a');
    log.hit({ shooter: 'a', victim: 'k', damage: 10, distance: 10 }, 0, at(0, 0));
    log.sample(5, at(0, 0));
    log.reset('a');
    expect(log.card(null, 0)).toMatchObject({ damage: 0, alive: 0, route: [], fights: [], fell: [] });
  });
});
