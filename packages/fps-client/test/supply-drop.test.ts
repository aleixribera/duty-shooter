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
    const said = dropAnnouncement('F6', 19.6);
    expect(said).toContain('F6');
    // Whole seconds, rounded.
    expect(said).toContain('20 s');
  });

  it('marks each crate with its countdown until it lands, and knows when it is opened', () => {
    const marks = dropMarks(state({ drops: [{ stage: 2, position: [10, 4, 20], lands: 100 }, { stage: 3, position: [0, 0, 0], lands: 50, opened: 'x' }] }), 90, null);
    expect(marks.map((m) => [m.stage, m.landsIn, m.opened])).toEqual([
      [2, 10, false],
      [3, 0, true],
    ]);
  });

  it('prompts a hold to open a landed crate in reach, not a falling one, nor one someone else is opening', () => {
    const near = player([11, 4, 20]);
    expect(dropPrompt(near, state(), 99, 'F')).toBeNull();
    const hold = dropPrompt(near, state(), 101, 'F')!;
    expect(hold).toContain('F');
    expect(dropPrompt(player([20, 4, 20]), state(), 101, 'F')).toBeNull();
    const opening = state({ drops: [{ stage: 2, position: [10, 4, 20], lands: 100, opening: { by: 'me', since: 101 } }] });
    const busy = dropPrompt(near, opening, 102, 'F')!;
    expect(busy).toBeTruthy();
    expect(busy).not.toBe(hold);
    // Someone else opening it: nothing to do there.
    expect(dropPrompt(near, state({ drops: [{ stage: 2, position: [10, 4, 20], lands: 100, opening: { by: 'mate', since: 101 } }] }), 102, 'F')).toBeNull();
    // The call-in says it is a resupply, never a gun.
    expect(dropAnnouncement('F6', 19.6)).toContain('full health');
    expect(dropAnnouncement('F6', 19.6)).not.toContain(STATS.weapons.sniper.traits.name);
  });
});

describe('the Preparation’s picker on loadouts (PLAN item 9g)', () => {
  it('offers the sniper, opened, and keeps a saved pick of it', () => {
    const kit = preparationKit({ primary: 'sniper', secondary: 'pistol', grenade: 'frag' });
    expect(kit.primaries).toContain('sniper');
    expect(kit.picked.primary).toBe('sniper');
    expect(preparationKit({ primary: 'm4a1', secondary: 'pistol', grenade: null }, ['m4a1', 'pistol']).primaries).not.toContain('sniper');
  });
});
