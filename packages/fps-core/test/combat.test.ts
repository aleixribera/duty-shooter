import { describe, expect, it } from 'vitest';
import { DEG, STATS, TICK_SECONDS, type HitZone } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd } from '@duty-shooter/fps-core/harness';
import { SHOOTER, SHOT_INTERVAL, TARGET, aimAt, controlledBurst, drawn, eventsOf, lane, playerIn, shotTime } from './support/combat';
import { FLOOR, expectStat, ticks } from './support/movement';

const D = STATS.damage;
const H = STATS.health;

/** Torso damage per bullet at a distance, read straight from the stats file's range bands. */
function bandDamage(distance: number): number {
  if (distance <= D.closeRange.value) return D.closeDamage.value;
  if (distance <= D.midRange.value) return D.midDamage.value;
  return D.farDamage.value;
}

const multipliers: Record<HitZone, number> = {
  head: D.headMultiplier.value,
  neck: D.neckMultiplier.value,
  upperTorso: D.upperTorsoMultiplier.value,
  lowerTorso: D.lowerTorsoMultiplier.value,
  arm: D.armMultiplier.value,
  leg: D.legMultiplier.value,
};

/** Aims down sights at the target, then fires one aimed shot at `zone` and returns the outputs until it lands. */
function oneShot(distance: number, zone: HitZone) {
  const match = lane(distance);
  drawn(match);
  match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ ...aimAt(match, zone), buttons: ['Ads'] }) }));
  const aim = aimAt(match, zone);
  const outputs = [match.step({ [SHOOTER]: usercmd({ ...aim, buttons: ['Ads', 'Fire'] }) }), ...match.run(ticks(0.3), () => ({ [SHOOTER]: usercmd({ ...aim, buttons: ['Ads'] }) }))];
  return { match, outputs, hits: eventsOf(outputs, 'hit') };
}

describe('damage by range and hit zone', () => {
  for (const distance of [10, 35, 60]) {
    for (const zone of ['head', 'neck', 'upperTorso', 'lowerTorso', 'arm', 'leg'] as const) {
      it(`${zone} at ${distance} m does the band damage times the ${zone} multiplier`, () => {
        const { hits } = oneShot(distance, zone);

        expect(hits).toHaveLength(1);
        const hit = hits[0]!;
        expect(hit).toMatchObject({ shooter: SHOOTER, victim: TARGET, zone, killed: false });
        expect(hit.distance).toBeCloseTo(distance, 0);
        expect(hit.damage).toBeCloseTo(bandDamage(hit.distance) * multipliers[zone], 9);
      });
    }
  }

  it('takes the damage off the target health', () => {
    const { match, hits } = oneShot(10, 'upperTorso');

    expect(playerIn(match.latest, TARGET).health).toBeCloseTo(H.max.value - hits[0]!.damage, 9);
  });
});

describe('time to kill', () => {
  for (const distance of [10, 25, 50]) {
    it(`kills an upper-torso target at ${distance} m in the stats-file TTK`, () => {
      const match = lane(distance);
      drawn(match);
      match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ ...aimAt(match, 'upperTorso'), buttons: ['Ads'] }) }));

      const outputs = controlledBurst(match, 'upperTorso', ticks(1.5));

      const shots = eventsOf(outputs, 'shot');
      const hits = eventsOf(outputs, 'hit');
      const kill = eventsOf(outputs, 'kill')[0]!;
      expect(kill).toMatchObject({ killer: SHOOTER, victim: TARGET, cause: 'bullet', zone: 'upperTorso' });
      expect(hits.every((h) => h.zone === 'upperTorso')).toBe(true);
      const perShot = bandDamage(hits[0]!.distance);
      const shotsToKill = Math.ceil(H.max.value / perShot);
      expect(hits).toHaveLength(shotsToKill);
      // TTK: the gap between the first and the killing shot at the fire rate, plus the killing bullet's flight.
      const flight = hits[0]!.distance / STATS.weapon.muzzleVelocity.value;
      const expected = (shotsToKill - 1) * SHOT_INTERVAL + flight;
      const ttk = kill.tick * TICK_SECONDS - shotTime(shots[0]!);
      expect(ttk).toBeGreaterThanOrEqual(expected - 1e-9);
      expect(ttk).toBeLessThan(expected + TICK_SECONDS);
    });
  }
});

describe('range dummies', () => {
  it('dies, then stands back up at full health after the reset delay', () => {
    const match = lane(10);
    drawn(match);
    const outputs = controlledBurst(match, 'head', ticks(1));
    const kill = eventsOf(outputs, 'kill')[0]!;
    expect(playerIn(match.latest, TARGET).alive).toBe(false);

    const later = match.run(ticks(STATS.combat.dummyResetDelay.value + 0.1), () => ({}));

    const back = later.findIndex((o) => playerIn(o, TARGET).alive);
    expect(Math.abs((later[back]!.tick - kill.tick) * TICK_SECONDS - STATS.combat.dummyResetDelay.value)).toBeLessThanOrEqual(TICK_SECONDS);
    expect(playerIn(later.at(-1)!, TARGET)).toMatchObject({ health: H.max.value, position: [0, 0, -10] });
  });

  it('a rail dummy moves back and forth along its rail at its speed', () => {
    const speed = STATS.movement.walkSpeed.value;
    const match = createHeadlessMatch({
      boxes: [FLOOR],
      players: [{ id: TARGET, team: 2, position: [-5, 0, -20], dummy: { rail: { to: [5, 0, -20], speed } } }],
    });

    const outputs = match.run(ticks(4), () => ({}));

    const xs = outputs.map((o) => playerIn(o, TARGET).position[0]);
    expect(Math.max(...xs)).toBeCloseTo(5, 1);
    expect(xs.at(-1)).toBeLessThan(5);
    expect(Math.hypot(...playerIn(outputs[10]!, TARGET).velocity)).toBeCloseTo(speed, 6);
  });
});

describe('melee', () => {
  it('lunges at a target within lunge range and does the melee damage', () => {
    const match = lane(1.8);
    drawn(match);

    const press = match.latest.tick + 1;
    const outputs = match.run(ticks(0.5), (t) => ({ [SHOOTER]: usercmd({ buttons: t === press ? ['Melee'] : [] }) }));
    const first = outputs[0]!;

    expect(playerIn(first, SHOOTER).weapon.action).toBe('melee');
    const hit = eventsOf(outputs, 'hit')[0]!;
    expect(hit).toMatchObject({ cause: 'melee', victim: TARGET, damage: STATS.melee.damage.value });
    expect(Math.abs((hit.tick - first.tick + 1) * TICK_SECONDS - STATS.melee.impactTime.value)).toBeLessThanOrEqual(TICK_SECONDS);
    // The lunge closes the gap.
    expect(-playerIn(outputs.at(-1)!, SHOOTER).position[2]).toBeGreaterThan(0.8);
  });

  it('kills in two hits from full health', () => {
    const match = lane(1.5);
    drawn(match);
    const press = (t: number) => ({ [SHOOTER]: usercmd({ buttons: t % ticks(0.8) === 0 ? ['Melee'] : [] }) });

    const outputs = match.run(ticks(2), press);

    expect(eventsOf(outputs, 'hit').filter((h) => h.cause === 'melee').length).toBe(2);
    expect(eventsOf(outputs, 'kill')[0]).toMatchObject({ cause: 'melee', killer: SHOOTER });
  });

  it('misses a target beyond lunge range and stays put', () => {
    const match = lane(STATS.melee.lungeRange.value + 1.5);
    drawn(match);

    const press = match.latest.tick + 1;
    const outputs = match.run(ticks(0.5), (t) => ({ [SHOOTER]: usercmd({ buttons: t === press ? ['Melee'] : [] }) }));

    expect(eventsOf(outputs, 'hit')).toHaveLength(0);
    expect(eventsOf(outputs, 'melee')[0]).toMatchObject({ attacker: SHOOTER, victim: null });
    expect(playerIn(outputs.at(-1)!, SHOOTER).position).toEqual([0, 0, 0]);
  });
});

describe('flinch and regeneration', () => {
  /** A player target hit once in the upper torso; returns the match and the tick of the hit. */
  function hitOnce() {
    const match = lane(10, { targetIsPlayer: true });
    const still = usercmd({ yaw: Math.PI });
    match.run(ticks(STATS.weapon.drawTime.value) + 1, () => ({ [SHOOTER]: usercmd(), [TARGET]: still }));
    match.run(ticks(0.5), () => ({ [SHOOTER]: usercmd({ ...aimAt(match, 'upperTorso'), buttons: ['Ads'] }), [TARGET]: still }));
    const before = playerIn(match.latest, TARGET);
    const aim = aimAt(match, 'upperTorso');
    const press = match.latest.tick + 1;
    const outputs = match.run(ticks(0.2), (t) => ({ [SHOOTER]: usercmd({ ...aim, buttons: t === press ? ['Ads', 'Fire'] : ['Ads'] }), [TARGET]: still }));
    const hit = eventsOf(outputs, 'hit')[0]!;
    return { match, still, before, hit, after: playerIn(outputs.at(-1)!, TARGET) };
  }

  it("flinches the victim's view up by the flinch amount", () => {
    const { before, after } = hitOnce();

    expectStat((after.pitch - before.pitch) / DEG, STATS.combat.flinch, 'flinch pitch');
    expect(after.yaw).not.toBe(before.yaw);
  });

  it('regenerates to full only after the regen delay, over the regen duration', () => {
    const { match, still, hit } = hitOnce();
    const damaged = H.max.value - hit.damage;

    const outputs = match.run(ticks(H.regenDelay.value + H.regenDuration.value + 0.5), () => ({ [TARGET]: still }));

    const health = outputs.map((o) => playerIn(o, TARGET).health);
    const start = health.findIndex((h) => h > damaged + 1e-9);
    const full = health.findIndex((h) => h === H.max.value);
    expectStat((outputs[start]!.tick - hit.tick) * TICK_SECONDS, H.regenDelay, 'regen delay');
    // Regen fills the whole bar over the duration, so a partial bar refills proportionally faster.
    expectStat(((full - start + 1) * TICK_SECONDS * H.max.value) / hit.damage, H.regenDuration, 'regen duration (full bar)');
  });
});
