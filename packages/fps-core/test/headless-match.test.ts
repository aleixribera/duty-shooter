import { describe, expect, it } from 'vitest';
import { box, createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';

const floor = box({ min: [-10, -1, -10], max: [10, 0, 10], material: 'concrete' });

describe('headless match', () => {
  it('keeps an idle player standing where it spawned', () => {
    const match = createHeadlessMatch({
      solids: [floor],
      players: [{ id: 'p1', team: 1, position: [0, 0, 0] }],
    });

    const outputs = match.run(120);

    expect(outputs).toHaveLength(120);
    const last = match.latest;
    expect(last.tick).toBe(120);
    expect(last.players).toEqual([
      expect.objectContaining({
        id: 'p1',
        team: 1,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
      }),
    ]);
  });

  it('reports the view angles carried by each tick usercmd', () => {
    const match = createHeadlessMatch({
      solids: [floor],
      players: [{ id: 'p1', team: 1, position: [0, 0, 0] }],
    });

    match.step({ p1: usercmd({ yaw: 0.5, pitch: -0.25 }) });
    expect(match.latest.players[0]).toMatchObject({ yaw: 0.5, pitch: -0.25 });

    match.step({ p1: usercmd({ yaw: 1.5, pitch: 0.1 }) });
    expect(match.latest.players[0]).toMatchObject({ yaw: 1.5, pitch: 0.1 });
  });

  it('keeps the last view angles when a player sends no usercmd for a tick', () => {
    const match = createHeadlessMatch({
      solids: [floor],
      players: [{ id: 'p1', team: 1, position: [0, 0, 0] }],
    });

    match.step({ p1: usercmd({ yaw: 0.75, pitch: 0.2 }) });
    match.step({});

    expect(match.latest.players[0]).toMatchObject({ yaw: 0.75, pitch: 0.2 });
  });
});
