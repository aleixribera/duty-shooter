import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_SLOTS,
  Bot,
  SLOT_CHOICES,
  STATS,
  Simulation,
  TICK_SECONDS,
  anglesOf,
  botProfile,
  buildNavGraph,
  createWorld,
  heldRow,
  moddedRow,
  parseLoadout,
  recoilKick,
  royaleLoadout,
  shotLoudness,
  slotsOf,
  zoneCentre,
  type Attachments,
  type Loadout,
  type PlayerOutput,
  type SimEvent,
  type TickOutput,
  type Vec3,
  type WeaponId,
  type WeaponRow,
} from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import type { WireSnapshot } from '../src/net/protocol';
import { eventsOf, playerIn } from './support/combat';
import { FLOOR, ticks } from './support/movement';

// Ticket 19: attachments as sidegrades.

const ME = 'p';
const STOCK: Loadout = { primary: 'm4a1', secondary: 'pistol', grenade: 'frag', tactical: null, perk: null };
const kitted = (primary: Attachments, secondary: Attachments = {}): Loadout => ({ ...STOCK, attachments: { primary, secondary } });

/** A simulation on a flat floor, weapons drawn before anything starts. */
function arena(players: { id: string; team: number; at: Vec3; loadout?: Loadout; dummy?: boolean }[]) {
  const sim = new Simulation(createWorld([FLOOR]), { canDamage: (a, v) => a.id !== v.id && a.team !== v.team });
  for (const p of players) sim.addPlayer({ id: p.id, team: p.team, position: p.at, ...(p.loadout ? { loadout: p.loadout } : {}), ...(p.dummy ? { dummy: {} } : {}) });
  const outputs: TickOutput[] = [];
  const run = (seconds: number, cmds: () => Parameters<Simulation['step']>[0] = () => ({})) => {
    for (let i = 0; i < ticks(seconds); i++) outputs.push(sim.step(cmds()));
  };
  run(1);
  return { sim, run, outputs };
}

/** Every number a row has, flattened to `section.key` (band ranges by band name). */
function numbers(row: WeaponRow): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (prefix: string, value: unknown) => {
    if (value && typeof value === 'object' && 'value' in value && typeof (value as { value: unknown }).value === 'number') out.set(prefix, (value as { value: number }).value);
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}.${k}` : k, v);
  };
  walk('', row);
  return out;
}

/** Whether a larger value of a row number is better for the one holding the gun. */
function higherIsBetter(key: string): boolean {
  return /magazineSize|range|zoom|muzzleVelocity/.test(key);
}

describe('which guns take which attachments', () => {
  it('a scoped gun or one with its own optic takes no optic, the shotgun no muzzle, a belt or a cylinder no magazine, a sidearm no grip', () => {
    expect(slotsOf('m4a1')).toEqual(ATTACHMENT_SLOTS);
    expect(slotsOf('smg')).toEqual(ATTACHMENT_SLOTS);
    expect(slotsOf('burst')).toEqual(ATTACHMENT_SLOTS);
    expect(slotsOf('sniper')).toEqual(['muzzle', 'magazine', 'grip']);
    expect(slotsOf('dmr')).toEqual(['muzzle', 'magazine', 'grip']);
    expect(slotsOf('shotgun')).toEqual(['optic', 'grip']);
    expect(slotsOf('lmg')).toEqual(['optic', 'muzzle', 'grip']);
    expect(slotsOf('pistol')).toEqual(['muzzle', 'magazine']);
    expect(slotsOf('revolver')).toEqual(['muzzle']);
  });
});

describe('every attachment is a sidegrade', () => {
  it('gives something and takes something on every gun that takes it (the Reflex only changes the sight picture)', () => {
    for (const id of Object.keys(STATS.weapons) as WeaponId[]) {
      const stock = numbers(STATS.weapons[id]);
      for (const slot of slotsOf(id)) {
        for (const choice of SLOT_CHOICES[slot]) {
          const row = moddedRow(id, { [slot]: choice });
          const changed = [...numbers(row)].filter(([k, v]) => Math.abs(v - stock.get(k)!) > 1e-9);
          const better = changed.filter(([k, v]) => (v > stock.get(k)!) === higherIsBetter(k));
          const worse = changed.filter(([k, v]) => (v > stock.get(k)!) !== higherIsBetter(k));
          if (choice === 'reflex') {
            expect(changed, `${id} ${choice}`).toEqual([]);
            continue;
          }
          // A suppressor's gain (heard nearer, no flash) and a compensator's cost (heard farther) aren't in the row.
          if (choice !== 'suppressor') expect(better.length, `${id} ${choice} gains`).toBeGreaterThan(0);
          if (choice !== 'compensator') expect(worse.length, `${id} ${choice} costs`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('a stock gun is its own row, and the same build is the same row', () => {
    expect(moddedRow('m4a1')).toBe(STATS.weapons.m4a1);
    expect(moddedRow('m4a1', {})).toBe(STATS.weapons.m4a1);
    expect(moddedRow('m4a1', { grip: 'vertical', magazine: 'speed' })).toBe(moddedRow('m4a1', { magazine: 'speed', grip: 'vertical' }));
  });

  it('a vertical grip takes a fifth off the climb of every shot, a compensator most of the drift', () => {
    for (const i of [0, 1, 5, 12]) {
      expect(recoilKick(i, 'm4a1', { grip: 'vertical' }).pitch).toBeCloseTo(recoilKick(i, 'm4a1').pitch * 0.8, 9);
      expect(recoilKick(i, 'm4a1', { muzzle: 'compensator' }).yaw).toBeCloseTo(recoilKick(i, 'm4a1').yaw * 0.75, 9);
    }
  });

  it('the prism magnifies a gun with irons, and the view narrows with it', () => {
    expect(moddedRow('m4a1', { optic: 'prism' }).handling.zoom.value).toBe(2);
    expect(moddedRow('m4a1', { optic: 'prism' }).traits.sight).toBe('optic');
  });
});

describe('a gun with attachments in a match', () => {
  it('spawns with an extended magazine full, and a speed magazine reloads in seven tenths of the time', () => {
    const a = arena([
      { id: 'x', team: 1, at: [0, 0, 0], loadout: kitted({ magazine: 'extended' }) },
      { id: 's', team: 2, at: [5, 0, 0], loadout: kitted({ magazine: 'speed' }) },
      { id: 'n', team: 3, at: [10, 0, 0], loadout: STOCK },
    ]);
    const out = a.sim.output();
    expect(playerIn(out, 'x').weapon.ammo).toBe(45);
    expect(playerIn(out, 's').weapon.ammo).toBe(24);
    expect(playerIn(out, 'n').weapon.ammo).toBe(30);
    expect(heldRow(playerIn(out, 'x')).handling.magazineSize.value).toBe(45);
    // Shoot a few off, then reload: the magazine goes in at its add-ammo point, scaled.
    a.run(0.3, () => ({ s: usercmd({ buttons: ['Fire'] }), n: usercmd({ buttons: ['Fire'] }) }));
    a.run(0.3);
    const start = a.outputs.length;
    a.run(TICK_SECONDS, () => ({ s: usercmd({ buttons: ['Reload'] }), n: usercmd({ buttons: ['Reload'] }) }));
    a.run(4);
    const added = (who: string) => eventsOf(a.outputs.slice(start), 'reload').find((e) => e.player === who && e.phase === 'addAmmo')!.tick - a.outputs[start]!.tick;
    expect(added('s') / added('n')).toBeCloseTo(STATS.attachments.speed.reload.value, 1);
    expect(playerIn(a.sim.output(), 's').weapon.ammo).toBe(24);
  });

  it('a suppressed shot does a band less at a range a stock one still reaches with its first, and its shot says so', () => {
    const bands = Object.values(STATS.weapons.m4a1.damage.bands);
    const first = bands[0]!.range!.value;
    const at = first * 0.95;
    const hit = (primary: Attachments) => {
      const a = arena([
        { id: ME, team: 1, at: [0, 0, 0], loadout: kitted(primary) },
        { id: 'd', team: 2, at: [0, 0, -at], dummy: true },
      ]);
      const me = playerIn(a.sim.output(), ME);
      const eye: Vec3 = [me.position[0], me.position[1] + me.eyeHeight, me.position[2]];
      const c = zoneCentre(playerIn(a.sim.output(), 'd'), 'upperTorso');
      const aim = anglesOf([c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]]);
      // Into the sights first, then one shot.
      a.run(0.6, () => ({ [ME]: usercmd({ ...aim, buttons: ['Ads'] }) }));
      const from = a.outputs.length;
      a.run(TICK_SECONDS, () => ({ [ME]: usercmd({ ...aim, buttons: ['Fire', 'Ads'] }) }));
      a.run(0.5, () => ({ [ME]: usercmd({ ...aim, buttons: ['Ads'] }) }));
      const events = a.outputs.slice(from).flatMap((o) => o.events);
      return { damage: eventsOf(a.outputs.slice(from), 'hit')[0]?.damage ?? 0, shot: events.find((e) => e.type === 'shot') as Extract<SimEvent, { type: 'shot' }> };
    };
    const stock = hit({});
    const quiet = hit({ muzzle: 'suppressor' });
    expect(stock.damage).toBeGreaterThan(0);
    expect(quiet.damage).toBeLessThan(stock.damage);
    expect(quiet.shot.muzzle).toBe('suppressor');
    expect(stock.shot.muzzle).toBeUndefined();
  });

  it('a picked-up gun keeps what is on it, and so does the one left behind', () => {
    const a = arena([{ id: ME, team: 1, at: [0, 0, 0], loadout: kitted({ grip: 'angled' }) }]);
    const left = a.sim.giveWeapon(ME, { id: 'smg', ammo: 10, attachments: { muzzle: 'suppressor' } });
    expect(left).toEqual({ id: 'm4a1', ammo: 30, attachments: { grip: 'angled' } });
    expect(a.sim.primary(ME)).toEqual({ id: 'smg', ammo: 10, attachments: { muzzle: 'suppressor' } });
    expect(a.sim.playerState(ME)!.loadout.attachments).toEqual({ primary: { muzzle: 'suppressor' }, secondary: {} });
    // A stock gun picked up leaves nothing on the primary.
    a.sim.giveWeapon(ME, { id: 'm4a1', ammo: 30 });
    expect(a.sim.playerState(ME)!.loadout.attachments?.primary).toBeUndefined();
  });

  it('travels to the other players in the loadout, and the shot\'s muzzle with the shot', () => {
    const a = arena([{ id: ME, team: 1, at: [0, 0, 0], loadout: kitted({ optic: 'prism', muzzle: 'compensator' }) }]);
    const me = playerIn(a.sim.output(), ME);
    const shot: SimEvent = { type: 'shot', shooter: ME, weapon: 'm4a1', origin: [0, 1.6, 0], direction: [0, 0, -1], index: 0, fraction: 0, muzzle: 'compensator' };
    const snap: WireSnapshot = { t: 'snap', tick: 1, ack: 0, self: null, players: [me], events: [{ tick: 1, index: 0, event: shot }], grenades: [] };
    const back = decodeSnapshot(encodeSnapshot(snap)) as WireSnapshot;
    expect(back.players[0]!.loadout.attachments).toEqual({ primary: { optic: 'prism', muzzle: 'compensator' }, secondary: {} });
    expect(heldRow(back.players[0]!).handling.zoom.value).toBe(2);
    expect((back.events[0]!.event as Extract<SimEvent, { type: 'shot' }>).muzzle).toBe('compensator');
  });
});

describe('the loadout with attachments', () => {
  it('reads one from before attachments as stock, keeps what each gun takes, and sends a gun with what it can\'t take back stock', () => {
    expect(parseLoadout(STOCK)).toEqual(STOCK);
    expect(parseLoadout(kitted({ optic: 'reflex', grip: 'vertical' }, { muzzle: 'suppressor' }))).toEqual(kitted({ optic: 'reflex', grip: 'vertical' }, { muzzle: 'suppressor' }));
    // A grip on the pistol: the pistol goes stock, the rifle keeps its own.
    expect(parseLoadout(kitted({ muzzle: 'compensator' }, { grip: 'angled' }))).toEqual({ ...STOCK, attachments: { primary: { muzzle: 'compensator' } } });
    // Something that isn't an attachment at all.
    expect(parseLoadout(kitted({ optic: 'thermal' } as unknown as Attachments))).toEqual(STOCK);
    expect(parseLoadout({ ...STOCK, attachments: 'lots' })).toEqual(STOCK);
  });
});

describe('a bot hears a shot by its muzzle', () => {
  it('a suppressed shot from 30 m behind it goes unheard; a stock one is heard', () => {
    const open = createWorld([FLOOR]);
    const nav = buildNavGraph(open, {
      area: [
        [-40, -40],
        [40, -40],
        [40, 40],
        [-40, 40],
      ],
    });
    const heard = (muzzle?: 'suppressor') => {
      const sim = new Simulation(open);
      sim.addPlayer({ id: 'b', team: 1, position: [0, 0, 0], yaw: 0 });
      sim.addPlayer({ id: 't', team: 2, position: [0, 0, 30], yaw: 0 });
      const bot = new Bot('b', botProfile('Vandal'), nav, open);
      let out = sim.output();
      const shot: SimEvent = { type: 'shot', shooter: 't', weapon: 'm4a1', origin: [0, 1.6, 30], direction: [0, 0, 1], index: 0, fraction: 0, ...(muzzle ? { muzzle } : {}) };
      for (let i = 0; i < 3; i++) {
        const me = out.players.find((p: PlayerOutput) => p.id === 'b')!;
        const cmd = bot.think({ tick: out.tick, time: sim.time, self: me, players: out.players, events: i === 1 ? [shot] : [], isEnemy: (o: PlayerOutput) => o.team !== me.team, objective: { position: [0, 0, 0], radius: 1.5 } });
        out = sim.step({ b: cmd });
      }
      return bot.believedPosition('t') !== null;
    };
    expect(heard()).toBe(true);
    expect(heard('suppressor')).toBe(false);
  });

  it('counts only the slots a gun takes, whatever hands the build in', () => {
    // An Extended magazine on the belt-fed LMG past every parse: the belt stays 100 rounds.
    expect(moddedRow('lmg', { magazine: 'extended' }).handling.magazineSize.value).toBe(STATS.weapons.lmg.handling.magazineSize.value);
    expect(moddedRow('shotgun', { muzzle: 'suppressor' }).handling.muzzleVelocity.value).toBe(STATS.weapons.shotgun.handling.muzzleVelocity.value);
  });

  it('keeps the sideways drift pattern of the stock magazine', () => {
    for (let i = 0; i < 45; i++) expect(recoilKick(i, 'm4a1', { magazine: 'extended' }).yaw).toBeCloseTo(recoilKick(i, 'm4a1').yaw, 9);
  });

  it('reads a gun the loadout does not carry, picked up, as stock', () => {
    const loadout: Loadout = { ...parseLoadout({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag' })!, attachments: { primary: { magazine: 'extended' } } };
    expect(heldRow({ weapon: { id: 'm4a1', slot: 0 }, loadout }).handling.magazineSize.value).toBe(45);
    expect(heldRow({ weapon: { id: 'smg', slot: 0 }, loadout })).toBe(STATS.weapons.smg);
  });

  it('starts a Battle Royale sniper pick on a stock M4A1, the secondary keeping its build', () => {
    const picked: Loadout = { ...parseLoadout({ primary: 'sniper', secondary: 'pistol', grenade: 'frag' })!, attachments: { primary: { magazine: 'extended' }, secondary: { muzzle: 'suppressor' } } };
    const royale = royaleLoadout(picked);
    expect(royale.primary).toBe('m4a1');
    expect(royale.attachments).toEqual({ secondary: { muzzle: 'suppressor' } });
  });

  it('makes a compensated shot louder and a suppressed one quieter', () => {
    expect(shotLoudness('compensator')).toBeGreaterThan(1);
    expect(shotLoudness('suppressor')).toBeLessThan(1);
    expect(shotLoudness(undefined)).toBe(1);
  });
});
