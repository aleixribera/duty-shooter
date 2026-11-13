import { describe, expect, it } from 'vitest';
import type { Score } from '@duty-shooter/fps-core';
import { RosterNotices } from '../src/hud/roster-notices';

const row = (id: string, team: number, bot = false) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), team, kills: 0, deaths: 0, score: 0, assists: 0, ...(bot ? { bot } : {}) }) as Score;

describe('friends coming and going mid-match', () => {
  it('says nothing of those already in, then tells who joined, left and came back, in their side’s colour', () => {
    const n = new RosterNotices();
    expect(n.update([row('me', 1), row('marta', 2), row('cinder', 1, true)], 'me', 'tdm')).toEqual([]);
    expect(n.update([row('me', 1), row('marta', 2), row('pol', 1), row('cinder', 1, true)], 'me', 'tdm')).toEqual([{ text: 'Pol joined', team: 1 }]);
    expect(n.update([row('me', 1), row('pol', 1), row('cinder', 1, true)], 'me', 'tdm')).toEqual([{ text: 'Marta left', team: 2 }]);
    // The same rows again, or none at all (no snapshot yet), tell nothing.
    const same = [row('me', 1), row('pol', 1), row('marta', 2), row('cinder', 1, true)];
    expect(n.update(same, 'me', 'tdm')).toEqual([{ text: 'Marta is back', team: 2 }]);
    expect(n.update(same, 'me', 'tdm')).toEqual([]);
    expect(n.update([], 'me', 'tdm')).toEqual([]);
  });

  it('leaves bots out: they fill and give up seats quietly', () => {
    const n = new RosterNotices();
    n.update([row('me', 1), row('cinder', 2, true)], 'me', 'tdm');
    expect(n.update([row('me', 1), row('moss', 2, true)], 'me', 'tdm')).toEqual([]);
  });

  it('has no side colours in free-for-all, and only your own Squad in a Battle Royale', () => {
    const ffa = new RosterNotices();
    ffa.update([row('me', 3), row('marta', 4)], 'me', 'ffa');
    expect(ffa.update([row('me', 3)], 'me', 'ffa')).toEqual([{ text: 'Marta left', team: 0 }]);
    const br = new RosterNotices();
    br.update([row('me', 5), row('marta', 5), row('stranger', 9)], 'me', 'battle-royale');
    expect(br.update([row('me', 5)], 'me', 'battle-royale')).toEqual([{ text: 'Marta left', team: 0 }]);
  });

  it('keeps a seat a stand-in bot holds for a person: no "left", no "is back"', () => {
    const n = new RosterNotices();
    n.update([row('me', 5), row('marta', 5)], 'me', 'battle-royale');
    expect(n.update([row('me', 5), row('marta', 5, true)], 'me', 'battle-royale')).toEqual([]);
    expect(n.update([row('me', 5), row('marta', 5)], 'me', 'battle-royale')).toEqual([]);
  });

  it('starts afresh for a new match', () => {
    const n = new RosterNotices();
    n.update([row('me', 1), row('marta', 2)], 'me', 'tdm');
    n.reset();
    expect(n.update([row('me', 1), row('pol', 2)], 'me', 'tdm')).toEqual([]);
  });
});
