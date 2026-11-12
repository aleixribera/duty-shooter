import { describe, expect, it } from 'vitest';
import type { Score } from '@duty-shooter/fps-core';
import { WORDY, eventWords, type EventWordsContext } from '../src/hud/event-words';
import type { PresentedEvent } from '../src/session';

const score = (id: string, team: number, bot = false) => ({ id, name: id.toUpperCase(), team, bot }) as unknown as Score;
const NAMES: Record<string, string> = { me: 'Me', mate: 'Mate', foe: 'Foe' };

function ctx(over: Partial<EventWordsContext> = {}): EventWordsContext {
  return {
    selfId: 'me',
    online: true,
    mode: 'tdm',
    scores: [score('me', 1), score('mate', 1), score('foe', 2, true)],
    self: { team: 1, alive: true },
    nameOf: (id) => NAMES[id] ?? id,
    cell: () => 'C4',
    useLabel: 'F',
    serverTime: 100,
    dropLands: () => undefined,
    ...over,
  };
}
const ev = (e: object) => e as PresentedEvent;

describe('what an event tells the player', () => {
  it('reports an offline kill in the kill feed, with the callout only for your own kill', () => {
    const yours = eventWords(ev({ type: 'kill', killer: 'me', victim: 'foe', zone: 'head', cause: 'bullet', weapon: 'm4a1' }), ctx({ online: false }));
    expect(yours.kill).toMatchObject({ killer: 'Me', victim: 'Foe', headshot: true, mine: true });
    expect(yours.eliminated).toEqual({ victim: 'Foe', headshot: true });
    const theirs = eventWords(ev({ type: 'kill', killer: 'foe', victim: 'mate', zone: 'chest', cause: 'bullet', weapon: 'm4a1' }), ctx({ online: false }));
    expect(theirs.kill?.mine).toBe(false);
    expect(theirs.eliminated).toBeUndefined();
    // Online the server's killFeed event is the feed: the kill itself says nothing.
    expect(eventWords(ev({ type: 'kill', killer: 'me', victim: 'foe', zone: 'head', cause: 'bullet', weapon: 'm4a1' }), ctx())).toEqual({});
  });

  it('marks bots and, in team modes, teams in an online kill feed row', () => {
    const row = eventWords(ev({ type: 'killFeed', killer: 'foe', killerName: 'Foe', victim: 'mate', victimName: 'Mate', headshot: false, cause: 'bullet', weapon: 'smg' }), ctx()).kill!;
    expect(row).toMatchObject({ killer: 'Foe', victim: 'Mate', mine: false, bots: { killer: true, victim: false }, teams: { killer: 2, victim: 1 }, down: false });
    const ffa = eventWords(ev({ type: 'killFeed', killer: 'foe', killerName: 'Foe', victim: 'mate', victimName: 'Mate', headshot: false, cause: 'bullet', weapon: 'smg' }), ctx({ mode: 'ffa' })).kill!;
    expect(ffa.teams).toEqual({});
    const self = eventWords(ev({ type: 'killFeed', killer: 'foe', killerName: 'Foe', victim: 'foe', victimName: 'Foe', headshot: false, cause: 'ring', weapon: null }), ctx()).kill!;
    expect(self.killer).toBeNull();
  });

  it('leaves bots unmarked in the kill feed when everyone but you is one (a Bot Match)', () => {
    const row = (scores: Score[]) =>
      eventWords(ev({ type: 'killFeed', killer: 'foe', killerName: 'Foe', victim: 'mate', victimName: 'Mate', headshot: false, cause: 'bullet', weapon: 'smg' }), ctx({ scores })).kill!;
    expect(row([score('me', 1), score('mate', 1, true), score('foe', 2, true)]).bots).toEqual({ killer: false, victim: false });
    // One other person in the match and the word says something again.
    expect(row([score('me', 1), score('mate', 1, true), score('foe', 2, true), score('pal', 2)]).bots).toEqual({ killer: true, victim: true });
  });

  it('tells only your own side who was revived', () => {
    expect(eventWords(ev({ type: 'revive', reviver: 'me', target: 'mate' }), ctx()).feed).toMatchObject({ team: 1, mine: true });
    expect(eventWords(ev({ type: 'revive', reviver: 'foe', target: 'foe' }), ctx())).toEqual({});
  });

  it('hides where the charge is from the defenders, but not the plant', () => {
    const pickup = ev({ type: 'charge', action: 'pickup', player: 'foe', team: 2, site: 'A', position: [0, 0, 0] });
    expect(eventWords(pickup, ctx())).toEqual({});
    expect(eventWords(pickup, ctx({ self: { team: 2, alive: true } })).feed).toBeDefined();
    const plant = eventWords(ev({ type: 'charge', action: 'plant', player: 'foe', team: 2, site: 'A', position: [0, 0, 0] }), ctx()).feed!;
    expect(plant.text).toContain('A');
    expect(plant.mine).toBe(false);
  });

  it('toasts your own gun game level, and tells everyone else only of the last gun', () => {
    const mine = eventWords(ev({ type: 'level', player: 'me', level: 2, weapon: 'smg', demoted: false }), ctx());
    expect(mine.toast).toBeDefined();
    expect(mine.feed).toBeUndefined();
    expect(eventWords(ev({ type: 'level', player: 'foe', level: 2, weapon: 'smg', demoted: false }), ctx())).toEqual({});
  });

  it("toasts your Reboot, and a teammate's dropped card only while you live", () => {
    const done = eventWords(ev({ type: 'reboot', action: 'done', player: 'mate', playerName: 'Mate', seats: ['me'], names: ['Me'], position: [0, 0, 0] }), ctx());
    expect(done.toast?.text).toContain('Mate');
    const drop = ev({ type: 'card', action: 'drop', player: null, playerName: null, owner: 'mate', ownerName: 'Mate', position: [0, 0, 0] });
    expect(eventWords(drop, ctx()).toast?.text).toContain('C4');
    expect(eventWords(drop, ctx({ self: { team: 1, alive: false } })).toast).toBeUndefined();
  });

  it('gives a ping its grid cell, except an enemy ping', () => {
    const spot = eventWords(ev({ type: 'ping', kind: 'go', player: 'mate', team: 1, position: [0, 0, 0] }), ctx()).feed!;
    expect(spot.text).toContain('C4');
    const enemy = eventWords(ev({ type: 'ping', kind: 'enemy', player: 'mate', team: 1, position: [0, 0, 0] }), ctx()).feed!;
    expect(enemy.text).not.toContain('C4');
  });

  it('says nothing for events that are only seen and heard', () => {
    for (const type of ['shot', 'impact', 'explosion', 'bounce', 'matchEnd'] as const) {
      expect(WORDY.has(type)).toBe(false);
      expect(eventWords(ev({ type }), ctx())).toEqual({});
    }
  });
});
