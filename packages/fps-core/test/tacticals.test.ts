import { describe, expect, it } from 'vitest';
import { STATS, Simulation, TICK_SECONDS, createWorld, parseLoadout, smokeAmount, type Loadout, type PerkId, type PlayerSpawn, type Solid, type TickOutput, type Vec3 } from '@duty-shooter/fps-core';
import { box, usercmd } from '@duty-shooter/fps-core/harness';
import { botSees } from '../src/bots/sight';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import type { WireSnapshot } from '../src/net/protocol';
import { eventsOf, playerIn } from './support/combat';
import { FLOOR, ticks } from './support/movement';

const T = STATS.tactical;
const ME = 't';
const SMOKE: Loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: 'smoke', perk: null };
const FLASH: Loadout = { ...SMOKE, tactical: 'flash' };

/** A simulation on a flat floor (and `solids`), its world kept for asking what a bot would see. */
function arena(players: readonly PlayerSpawn[], solids: readonly Solid[] = []) {
  const world = createWorld([FLOOR, ...solids]);
  const sim = new Simulation(world, { canDamage: (a, v) => a.id !== v.id && a.team !== v.team });
  for (const p of players) sim.addPlayer(p);
  const outputs: TickOutput[] = [];
  const run = (seconds: number, cmds: () => Parameters<Simulation['step']>[0] = () => ({})) => {
    const out: TickOutput[] = [];
    for (let i = 0; i < ticks(seconds); i++) out.push(sim.step(cmds()));
    outputs.push(...out);
    return out;
  };
  // Weapons drawn before anything starts.
  run(1);
  return { world, sim, run, outputs, time: () => sim.time };
}

/** Holds the tactical for `held` seconds, then lets go. */
const tactical = (held: number) => (a: ReturnType<typeof arena>, who = ME, angles: { yaw?: number; pitch?: number } = {}) => {
  a.run(held, () => ({ [who]: usercmd({ buttons: ['Tactical'], ...angles }) }));
  a.run(TICK_SECONDS, () => ({ [who]: usercmd(angles) }));
};

describe('a smoke', () => {
  it('is thrown on its own button, one a life, and pops on its fuse into a cloud that hides a body from a bot, then thins out to nothing', () => {
    const a = arena([{ id: ME, team: 1, position: [0, 0, 0], loadout: SMOKE }]);
    expect(playerIn(a.sim.output(), ME).tacticals).toBe(T.perLife.value);
    tactical(0.3)(a);
    expect(playerIn(a.sim.output(), ME).tacticals).toBe(T.perLife.value - 1);
    expect(playerIn(a.sim.output(), ME).grenades).toBe(STATS.grenade.perLife.value);
    const thrown = a.time();
    a.run(T.smoke.fuse.value + 0.1);
    const pop = eventsOf(a.outputs, 'pop')[0]!;
    expect(pop.kind).toBe('smoke');
    expect(pop.tick * TICK_SECONDS - thrown).toBeCloseTo(T.smoke.fuse.value, 1);
    expect(eventsOf(a.outputs, 'explosion')).toHaveLength(0);
    // Once it has risen: two eyes either side of it, at head height, can't see each other through it.
    a.run(T.smoke.rise.value);
    const c = a.world.smoke!.clouds[0]!.at;
    const left: Vec3 = [c[0] - 6, 1.6, c[2]];
    const right: Vec3 = [c[0] + 6, 1.6, c[2]];
    expect(botSees(a.world, left, right)).toBe(false);
    // Past its edge, the same look is clear.
    expect(botSees(a.world, [c[0] - 6, 1.6, c[2] + 6], [c[0] + 6, 1.6, c[2] + 6])).toBe(true);
    // Its life over, the cloud and the canister are gone and nothing is hidden.
    a.run(T.smoke.life.value);
    expect(a.world.smoke!.clouds).toHaveLength(0);
    expect(a.sim.output().grenades).toHaveLength(0);
    expect(botSees(a.world, left, right)).toBe(true);
    // One a life.
    tactical(0.3)(a);
    expect(eventsOf(a.outputs.slice(-ticks(0.4)), 'grenade')).toHaveLength(0);
  });

  it('swells after the pop, holds, and thins out at the end', () => {
    expect(smokeAmount({ popped: 10 }, 9)).toBe(0);
    expect(smokeAmount({ popped: 10 }, 10)).toBe(0);
    expect(smokeAmount({ popped: 10 }, 10 + T.smoke.rise.value)).toBe(1);
    expect(smokeAmount({ popped: 10 }, 10 + T.smoke.life.value - T.smoke.fade.value / 2)).toBeCloseTo(0.5, 5);
    expect(smokeAmount({ popped: 10 }, 10 + T.smoke.life.value)).toBe(0);
  });

  it('never goes off in the hand, however long it is held', () => {
    const a = arena([{ id: ME, team: 1, position: [0, 0, 0], loadout: SMOKE }]);
    a.run(STATS.grenade.fuse.value + 2, () => ({ [ME]: usercmd({ buttons: ['Tactical'] }) }));
    expect(eventsOf(a.outputs, 'pop')).toHaveLength(0);
    expect(a.sim.output().grenades).toHaveLength(0);
    expect(playerIn(a.sim.output(), ME).grenade).toMatchObject({ phase: 'cook', kind: 'smoke' });
  });
});

describe('a flash', () => {
  // The thrower at the origin looks down -Z; the flash lands on the floor about 10 m out.
  const setting = (others: readonly PlayerSpawn[], solids: readonly Solid[] = []) => {
    const a = arena([{ id: ME, team: 1, position: [0, 0, 0], loadout: FLASH }, ...others], solids);
    // Thrown low and short: it lands and lies a few metres out before it goes.
    tactical(0.2)(a, ME, { pitch: -0.5 });
    a.run(T.flash.fuse.value + 0.2, () => ({ [ME]: usercmd({ pitch: -0.5, yaw: Math.PI }) }));
    const pop = eventsOf(a.outputs, 'pop')[0]!;
    return { a, pop, flashed: eventsOf(a.outputs, 'flashed') };
  };

  it('blinds an enemy who looks at it longer than one who looks away, and not one behind a wall, a teammate or anyone out of range', () => {
    const { pop, flashed } = setting([
      // Facing it, 6 m past where it lands (yaw 0 looks down -Z, so these face +Z: yaw π).
      { id: 'looks', team: 2, position: [0, 0, -16], yaw: 0 },
      { id: 'away', team: 2, position: [3, 0, -16], yaw: Math.PI },
      { id: 'walled', team: 2, position: [-12, 0, -8], yaw: 0 },
      { id: 'mate', team: 1, position: [2, 0, -14], yaw: 0 },
      { id: 'far', team: 2, position: [0, 0, -60], yaw: 0 },
    ], [box({ min: [-9, 0, -14], max: [-8.5, 4, -2], material: 'concrete' })]);
    expect(pop.kind).toBe('flash');
    const of = (id: string) => flashed.find((f) => f.player === id);
    // Which way they face: whoever is at -16 and sees the flash in front of them faces +Z, yaw π.
    const looks = of('looks');
    const away = of('away');
    expect(looks).toBeDefined();
    expect(away).toBeDefined();
    expect(looks!.by).toBe(ME);
    expect(Math.max(looks!.duration, away!.duration)).toBeGreaterThan(Math.min(looks!.duration, away!.duration) * 2);
    expect(of('walled')).toBeUndefined();
    expect(of('mate')).toBeUndefined();
    expect(of('far')).toBeUndefined();
    for (const f of flashed) {
      expect(f.duration).toBeGreaterThanOrEqual(T.flash.shortest.value * STATS.perks.blastVestFlash.value - 1e-9);
      expect(f.duration).toBeLessThanOrEqual(T.flash.longest.value + 1e-9);
    }
  });

  it('is shorter on a Blast Vest', () => {
    const plain = setting([{ id: 'e', team: 2, position: [0, 0, -14], yaw: 0 }]).flashed.find((f) => f.player === 'e')!;
    const vest = setting([{ id: 'e', team: 2, position: [0, 0, -14], yaw: 0, loadout: { ...SMOKE, perk: 'blastVest' } }]).flashed.find((f) => f.player === 'e')!;
    expect(vest.duration).toBeCloseTo(plain.duration * STATS.perks.blastVestFlash.value, 5);
  });
});

describe('perks', () => {
  it('Fast Hands reloads faster', () => {
    const reloadTime = (perk: PerkId | null) => {
      const a = arena([{ id: ME, team: 1, position: [0, 0, 0], loadout: { ...SMOKE, perk } }]);
      a.run(0.5, () => ({ [ME]: usercmd({ buttons: ['Fire'] }) }));
      a.run(0.3);
      const start = a.outputs.length;
      a.run(TICK_SECONDS, () => ({ [ME]: usercmd({ buttons: ['Reload'] }) }));
      a.run(5);
      const added = eventsOf(a.outputs.slice(start), 'reload').find((e) => e.phase === 'addAmmo')!;
      return added.tick - a.outputs[start]!.tick;
    };
    const plain = reloadTime(null);
    const fast = reloadTime('fastHands');
    expect(fast / plain).toBeCloseTo(1 / STATS.perks.fastHands.value, 1);
  });

  it('a Blast Vest lives through a frag at 2 m that kills without one', () => {
    const health = (perk: PerkId | null) => {
      const a = arena([
        { id: ME, team: 1, position: [0, 0, 0], loadout: SMOKE },
        { id: 'e', team: 2, position: [0, 0, -2], loadout: { ...SMOKE, perk } },
      ]);
      // Cooked to the end, it goes off in the hand, 2 m from them.
      a.run(STATS.grenade.fuse.value + 0.2, () => ({ [ME]: usercmd({ buttons: ['Grenade'] }) }));
      return playerIn(a.sim.output(), 'e').health;
    };
    expect(health(null)).toBe(0);
    expect(health('blastVest')).toBeGreaterThan(0);
  });
});

describe('the loadout', () => {
  it('takes a tactical and a perk, reads one from before them as having neither, and refuses what isn\'t one', () => {
    expect(parseLoadout({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag' })).toEqual({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: null, perk: null });
    expect(parseLoadout({ ...FLASH, perk: 'softSoles' })).toEqual({ ...FLASH, perk: 'softSoles' });
    expect(parseLoadout({ ...SMOKE, tactical: 'decoy' })).toBeNull();
    expect(parseLoadout({ ...SMOKE, perk: 'wallhack' })).toBeNull();
  });

  it('sends a tactical in the hand and the count left to the other players', () => {
    const a = arena([{ id: ME, team: 1, position: [0, 0, 0], loadout: FLASH }]);
    a.run(0.2, () => ({ [ME]: usercmd({ buttons: ['Tactical'] }) }));
    const me = playerIn(a.sim.output(), ME);
    const snap: WireSnapshot = { t: 'snap', tick: 1, ack: 0, self: null, players: [me], events: [], grenades: [] };
    const back = decodeSnapshot(encodeSnapshot(snap)) as WireSnapshot;
    expect(back.players[0]!.grenade).toMatchObject({ phase: 'cook', kind: 'flash' });
    expect(back.players[0]!.tacticals).toBe(me.tacticals);
  });
});
