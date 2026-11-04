import { describe, expect, it } from 'vitest';
import { STATS, type BattleRoyaleState, type PlayerOutput } from '@duty-shooter/fps-core';
import { beaconLook, cardNote, rebootFeed, rebootMarks, rebootPrompt } from '../src/ui/reboot';

const R = STATS.royale.reboot;
const names: Record<string, string> = { p1: 'Ada', p2: 'Moss', p3: 'Joan' };
const nameOf = (id: string) => names[id] ?? id;

function state(over: Partial<BattleRoyaleState> = {}): BattleRoyaleState {
  return {
    kind: 'battle-royale',
    squadSize: 2,
    stage: 2,
    circle: { x: 0, z: 0, radius: 500 },
    next: { x: 0, z: 0, radius: 300 },
    shrinkAt: 100,
    shrinkEnd: 160,
    damage: 2,
    alive: 40,
    squads: 20,
    reboot: true,
    beacons: [{ position: [0, 0, 0] }, { position: [200, 0, 0], ready: 150 }],
    ...over,
  };
}
const me = (at: [number, number, number] = [1, 0, 0]) => ({ id: 'p2', alive: true, downed: null, position: at }) as unknown as PlayerOutput;

describe('the use prompt at a Beacon', () => {
  it('asks to hold use to reboot the seats whose Cards you carry, counts the channel down, and says when a Beacon rests', () => {
    const carrying = state({ cards: [{ owner: 'p1', team: 1, carrier: 'p2' }] });
    expect(rebootPrompt(me(), carrying, 10, 'F', nameOf)).toBe('Hold F  Reboot Ada');
    const busy = state({ cards: carrying.cards!, beacons: [{ position: [0, 0, 0], channel: { by: 'p2', since: 10 } }] });
    expect(rebootPrompt(me(), busy, 13, 'F', nameOf)).toBe(`Rebooting Ada  ${R.channel.value - 3} s`);
    expect(rebootPrompt(me([200, 0, 1]), carrying, 60, 'F', nameOf)).toBe('Beacon resting  1:30');
    // Nothing without a Card, or away from a Beacon.
    expect(rebootPrompt(me(), state(), 10, 'F', nameOf)).toBeNull();
    expect(rebootPrompt(me([50, 0, 0]), carrying, 10, 'F', nameOf)).toBeNull();
  });
});

describe('an out player’s Card', () => {
  it('says how long it lies, who carries it, and the reboot under way', () => {
    expect(cardNote('p1', state({ cards: [{ owner: 'p1', team: 1, position: [5, 0, 5], until: 100 }] }), 28, nameOf)).toBe('Your Reboot Card lies where you fell: 72 s for a squadmate to take it');
    expect(cardNote('p1', state({ cards: [{ owner: 'p1', team: 1, carrier: 'p2' }] }), 28, nameOf)).toBe('Moss carries your Reboot Card to a Beacon');
    expect(cardNote('p1', state({ cards: [{ owner: 'p1', team: 1, carrier: 'p2' }], beacons: [{ position: [0, 0, 0], channel: { by: 'p2', since: 20 } }] }), 28, nameOf)).toBe(`Moss is rebooting you: ${R.channel.value - 8} s`);
    expect(cardNote('p1', state(), 28, nameOf)).toBeNull();
  });
});

describe('the marks and the feed', () => {
  it('marks every Beacon by its state and only your own Squad’s Cards; nothing once Reboot has closed', () => {
    const s = state({ cards: [{ owner: 'p1', team: 1, position: [5, 0, 5], until: 100 }, { owner: 'p3', team: 2, position: [9, 0, 9], until: 100 }] });
    expect(rebootMarks(s, 1, 40, nameOf)).toEqual([
      { kind: 'beacon', x: 0, z: 0, state: 'ready' },
      { kind: 'beacon', x: 200, z: 0, state: 'resting' },
      { kind: 'card', x: 5, z: 5, state: 'lying', name: 'Ada', left: 60 },
    ]);
    const { reboot: _open, ...closed } = state();
    expect(rebootMarks(closed, 1, 40, nameOf)).toEqual([]);
    expect(beaconLook(null, 0, 0).glow).toBe(0);
    expect(beaconLook({ position: [0, 0, 0], channel: { by: 'p2', since: 0 } }, 1, 0).beam).toBeGreaterThan(0);
  });

  it('tells a Card taken and a Reboot begun and done, with the map square', () => {
    expect(rebootFeed({ type: 'card', action: 'take', ownerName: 'Ada', playerName: 'Moss' }, 'F6')).toBe("Moss took Ada's Reboot Card");
    expect(rebootFeed({ type: 'reboot', action: 'start', playerName: 'Moss', names: ['Ada', 'Joan'] }, 'F6')).toBe('Moss is rebooting Ada and Joan in F6');
    expect(rebootFeed({ type: 'reboot', action: 'done', playerName: 'Moss', names: ['Ada'] }, '')).toBe('Moss rebooted Ada');
    expect(rebootFeed({ type: 'card', action: 'expire', ownerName: 'Ada', playerName: null }, '')).toBeNull();
  });
});
