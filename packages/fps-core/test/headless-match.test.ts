import { describe, expect, it } from 'vitest';
import { box, createHeadlessMatch } from '@duty-shooter/fps-core/harness';

const floor = box({ min: [-10, -1, -10], max: [10, 0, 10], material: 'concrete' });

describe('headless match', () => {
  it('keeps an idle player standing where it spawned', () => {
    const match = createHeadlessMatch({
      boxes: [floor],
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
});
