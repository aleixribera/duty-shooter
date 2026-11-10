// Minutes of fire online with every primary: the soak tier (`npm run test:soak`).
import { MAX_PITCH, type WeaponId } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { describe, expect, it } from 'vitest';
import { DEG, FLOOR, fireHoldingLevel, hand, minutes, pullDown, seat } from './helpers/look';

describe('mouse look pitch limits, a long life online', () => {
  // Every primary for a long life online: the real server (and its wire checks) and the client's prediction.
  it.each(['m4a1', 'smg', 'shotgun', 'sniper'] satisfies WeaponId[])('after minutes of %s bursts held level online, the floor is in reach on the server and in prediction', (primary) => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [{ position: [0, 0, 0], yaw: 0 }], latency: 0.04 });
    const c = m.join('ann', { loadout: { primary, secondary: 'pistol', grenade: null } });
    const mouse = hand(c);
    fireHoldingLevel(m, c, mouse, minutes(4));
    // Held level, with far more than half a turn of kicks pulled against.
    expect(Math.abs(c.latest!.self!.pitch)).toBeLessThan(10 * DEG);
    expect(mouse.pitch).toBeLessThan(-180 * DEG);
    pullDown(m, c, mouse);
    expect(seat(m, c).pitch).toBeCloseTo(-MAX_PITCH, 5);
    expect(c.latest!.self!.pitch).toBeCloseTo(-MAX_PITCH, 5);
  });
});
