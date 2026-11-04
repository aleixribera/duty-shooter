import { describe, expect, it } from 'vitest';
import { STATS, type BattleRoyaleState, type PlayerOutput } from '@duty-shooter/fps-core';
import { FALL_SPEED, dropAnnouncement, dropMarks, dropPose, dropPrompt, gridCell } from '../src/ui/supply-drop';
import { preparationKit } from '../src/ui/preparation';

const D = STATS.royale.supplyDrop;

const state = (over: Partial<BattleRoyaleState> = {}): BattleRoyaleState => ({
  kind: 'battle-royale',
  squadSize: 2,
  stage: 2,
  circle: { x: 0, z: 0, radius: 300 },
  next: { x: 0, z: 0, radius: 100 },
  shrinkAt: 100,
  shrinkEnd: 150,
  damage: 2,
  alive: 40,
  squads: 20,
  drops: [{ stage: 2, position: [10, 4, 20], lands: 100 }],
  ...over,
});

function player(at: [number, number, number], over: Partial<PlayerOutput> = {}): PlayerOutput {
  return { id: 'me', team: 1, kind: 'player', alive: true, downed: null, position: at, loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' }, ...over } as unknown as PlayerOutput;
}

describe('a Supply Drop in the client (ticket 71)', () => {
  it('comes down under its canopy in its last seconds, then folds the canopy', () => {
    const drop = state().drops![0]!;
    expect(dropPose(drop, 100 - D.fall.value - 1).height).toBeNull();
    expect(dropPose(drop, 100 - 5).height).toBeCloseTo(5 * FALL_SPEED);
    expect(dropPose(drop, 100).height).toBe(0);
    expect(dropPose(drop, 100).chute).toBeCloseTo(1);
    expect(dropPose(drop, 110).chute).toBe(0);
  });

  it('names the map square it lands in, as the map letters them', () => {
    const bounds = { x0: -500, z0: -500, size: 1000 };
    expect(gridCell(bounds, -499, -499)).toBe('A1');
    expect(gridCell(bounds, 10, 20)).toBe('F6');
    expect(gridCell(bounds, 499, 499)).toBe('J10');
    expect(dropAnnouncement('F6', 19.6)).toBe('Supply Drop incoming in F6: the only sniper, landing in 20 s.');
  });

  it('marks each crate with its countdown until it lands, and knows when it is opened', () => {
    const marks = dropMarks(state({ drops: [{ stage: 2, position: [10, 4, 20], lands: 100 }, { stage: 3, position: [0, 0, 0], lands: 50, opened: 'x' }] }), 90, null);
    expect(marks.map((m) => [m.stage, m.landsIn, m.opened])).toEqual([
      [2, 10, false],
      [3, 0, true],
    ]);
  });

  it('prompts a hold to open a landed crate in reach, not a falling one, nor for whoever holds the sniper', () => {
    const near = player([11, 4, 20]);
    expect(dropPrompt(near, state(), 99, 'm4a1', 'F')).toBeNull();
    expect(dropPrompt(near, state(), 101, 'm4a1', 'F')).toBe('Hold F  Open Supply Drop');
    expect(dropPrompt(near, state(), 101, 'sniper', 'F')).toBeNull();
    expect(dropPrompt(player([20, 4, 20]), state(), 101, 'm4a1', 'F')).toBeNull();
    const opening = state({ drops: [{ stage: 2, position: [10, 4, 20], lands: 100, opening: { by: 'me', since: 101 } }] });
    expect(dropPrompt(near, opening, 102, 'm4a1', 'F')).toBe('Opening Supply Drop');
  });

  it('prompts a press to take a different weapon lying in reach', () => {
    const s = state({ drops: [], loose: [{ id: 1, weapon: 'sniper', position: [0, 0, 0] }, { id: 2, weapon: 'm4a1', position: [0.5, 0, 0] }] });
    expect(dropPrompt(player([0.4, 0, 0]), s, 0, 'm4a1', 'F')).toBe(`F  Take ${STATS.weapons.sniper.traits.name}`);
    expect(dropPrompt(player([0.4, 0, 0]), s, 0, 'sniper', 'F')).toBe(`F  Take ${STATS.weapons.m4a1.traits.name}`);
    expect(dropPrompt(player([5, 0, 0]), s, 0, 'm4a1', 'F')).toBeNull();
  });
});

describe('the Preparation’s picker (ticket 71)', () => {
  it('offers no sniper, and lights the M4A1 for a saved sniper pick', () => {
    const kit = preparationKit({ primary: 'sniper', secondary: 'pistol', grenade: 'frag' });
    expect(kit.primaries).not.toContain('sniper');
    expect(kit.primaries).toContain('m4a1');
    expect(kit.picked.primary).toBe('m4a1');
    expect(preparationKit({ primary: 'smg', secondary: 'pistol', grenade: null }).picked.primary).toBe('smg');
  });
});
