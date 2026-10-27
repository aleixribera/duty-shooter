import { describe, expect, it } from 'vitest';
import { STATS, SWAY_SETTLED, TICK_SECONDS, WEAPON_IDS, type PlayerOutput } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { holding, measuredKill, trigger } from './support/arsenal';
import { SHOOTER, TARGET, aimAt, eventsOf, playerIn } from './support/combat';
import { ticks } from './support/movement';

const R = STATS.weapons.sniper;
const SETTLE = R.accuracy.swaySettle!.value;
const idle = usercmd();
const aimed = usercmd({ buttons: ['Ads'] });

describe('sniper kills', () => {
  it('kills in one shot to the head, neck or upper torso at any range', () => {
    for (const distance of [6, 40, 80]) {
      // At 80 m the round drops about 5 cm, past the neck's height: aimed at the neck, it hits the chest.
      for (const zone of distance > 50 ? (['head', 'upperTorso'] as const) : (['head', 'neck', 'upperTorso'] as const)) {
        const kill = measuredKill('sniper', distance, zone, { settle: SETTLE });
        expect(kill.zone, `${zone} at ${distance} m`).toBe(zone);
        expect(kill.hits, `${zone} at ${distance} m`).toBe(1);
      }
    }
  });

  it('needs two hits to the lower torso, an arm or a leg', () => {
    for (const zone of ['lowerTorso', 'arm', 'leg'] as const) {
      const kill = measuredKill('sniper', 40, zone, { settle: SETTLE });
      expect(kill.zone, zone).toBe(zone);
      expect(kill.hits, zone).toBe(2);
    }
  });

  it('works the bolt after every shot, so a miss costs over a second', () => {
    const m = holding('sniper');
    m.step({ [SHOOTER]: trigger('sniper') });
    expect(playerIn(m.latest, SHOOTER).weapon.action).toBe('cycle');
    const shots = eventsOf(m.run(ticks(2), () => ({ [SHOOTER]: trigger('sniper') })), 'shot');
    expect(shots).toHaveLength(1);
    expect(R.handling.cycleTime!.value).toBeGreaterThan(1);
  });
});

describe('the scope', () => {
  /** Largest sideways sway (radians) over the outputs; the vertical sway is a smaller share of the same amplitude. */
  const swayOver = (outputs: readonly PlayerOutput[]) => Math.max(...outputs.map((p) => Math.abs(p.weapon.sway[0])));

  it('sways in full while moving, and settles to a fifth over its settle time standing still', () => {
    const m = holding('sniper');
    const run = (seconds: number, cmd = aimed) => m.run(ticks(seconds), () => ({ [SHOOTER]: cmd })).map((o) => playerIn(o, SHOOTER));
    const full = R.accuracy.sway!.value * (Math.PI / 180);
    const walking = usercmd({ buttons: ['Ads'], forward: 1 });
    // A whole sway cycle is a little over three seconds.
    run(R.handling.adsTime.value, walking);
    const moving = swayOver(run(3.4, walking));
    run(SETTLE + 0.1);
    const settled = swayOver(run(3.4));

    expect(moving).toBeGreaterThan(full * 0.9);
    expect(moving).toBeLessThanOrEqual(full + 1e-9);
    expect(settled).toBeLessThanOrEqual(full * SWAY_SETTLED + 1e-9);
    expect(settled).toBeGreaterThan(full * SWAY_SETTLED * 0.9);

    // Moving again starts it over.
    expect(swayOver(run(3.4, walking))).toBeGreaterThan(full * 0.9);
  });

  it('sends the shot where the sway points', () => {
    const m = holding('sniper', 60);
    m.run(ticks(0.8), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'], ...aimAt(m, 'upperTorso') }) }));
    const me = playerIn(m.latest, SHOOTER);
    expect(Math.hypot(...me.weapon.sway)).toBeGreaterThan(0.002);
    // Aiming dead on without allowing for the sway misses the upper torso at 60 m.
    const aim = aimAt(m, 'upperTorso');
    const outputs = [m.step({ [SHOOTER]: trigger('sniper', 1 << 1, aim) }), ...m.run(ticks(0.3), () => ({ [SHOOTER]: aimed }))];
    const hit = eventsOf(outputs, 'hit').find((h) => h.victim === TARGET);
    expect(hit?.zone).not.toBe('upperTorso');
  });

  it('magnifies more than any iron sight, and has no sway without a scope', () => {
    for (const id of WEAPON_IDS) {
      if (id === 'sniper') continue;
      expect(R.handling.zoom.value).toBeGreaterThan(STATS.weapons[id].handling.zoom.value);
      const m = holding(id);
      const outputs = m.run(ticks(1), () => ({ [SHOOTER]: aimed })).map((o) => playerIn(o, SHOOTER));
      expect(swayOver(outputs), id).toBe(0);
    }
    expect(R.traits.sight).toBe('scope');
  });
});

describe('sniper handling', () => {
  it('is the slowest to aim and the worst from the hip', () => {
    for (const id of WEAPON_IDS) {
      if (id === 'sniper') continue;
      expect(R.handling.adsTime.value, id).toBeGreaterThan(STATS.weapons[id].handling.adsTime.value);
      expect(R.accuracy.hipSpreadStill.value, id).toBeGreaterThan(STATS.weapons[id].accuracy.hipSpreadStill.value);
    }
    const m = holding('sniper');
    m.step({ [SHOOTER]: idle });
    expect(playerIn(m.latest, SHOOTER).weapon.spread).toBe(R.accuracy.hipSpreadStill.value);
  });

  it('goes through cover that stops a rifle round', () => {
    const walls = [-3, -4, -5].map((z) => box({ min: [-10, 0, z - 0.2], max: [10, 4, z], material: 'wood' }));
    const through = (id: 'sniper' | 'm4a1') => {
      const m = holding(id, 8, walls);
      m.run(ticks(1), () => ({ [SHOOTER]: usercmd({ buttons: ['Ads'], ...aimAt(m, 'upperTorso') }) }));
      const me = playerIn(m.latest, SHOOTER);
      const aim = aimAt(m, 'upperTorso');
      const outputs = [
        m.step({ [SHOOTER]: trigger(id, 1 << 1, { yaw: aim.yaw - me.weapon.sway[0], pitch: aim.pitch - me.weapon.sway[1] }) }),
        ...m.run(ticks(0.2), () => ({ [SHOOTER]: aimed })),
      ];
      return eventsOf(outputs, 'hit').filter((h) => h.victim === TARGET);
    };

    expect(through('m4a1')).toHaveLength(0);
    expect(through('sniper')).toHaveLength(1);
  });
});

describe('sniper timing', () => {
  it('cycles the bolt in its cycle time', () => {
    const m = holding('sniper');
    m.step({ [SHOOTER]: trigger('sniper') });
    const actions = m.run(ticks(R.handling.cycleTime!.value + 0.1), () => ({ [SHOOTER]: idle })).map((o) => playerIn(o, SHOOTER).weapon.action);
    expect((actions.indexOf('ready') + 2) * TICK_SECONDS).toBeCloseTo(R.handling.cycleTime!.value, 1);
  });
});
