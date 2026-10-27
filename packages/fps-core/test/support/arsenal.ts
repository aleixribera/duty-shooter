import { expect } from 'vitest';
import { Button, STATS, type HitZone, type Solid, type TickOutput, type UserCmd, type WeaponId } from '@duty-shooter/fps-core';
import { createHeadlessMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { SHOOTER, TARGET, aimAt, eventsOf, playerIn, shotTime, wallAt } from './combat';
import { FLOOR, ticks } from './movement';

const row = (id: WeaponId) => STATS.weapons[id];
const idle = usercmd();

export const isAuto = (id: WeaponId) => row(id).traits.fireMode === 'auto';

/** A loadout that puts `id` in hand: a primary in the first slot, or the pistol switched to. */
export function loadoutFor(id: WeaponId) {
  return row(id).traits.slot === 'primary' ? { primary: id, secondary: 'pistol' as const, grenade: null } : { primary: 'm4a1' as const, secondary: id, grenade: null };
}

/**
 * A shooter holding `id`, raised and ready, on an empty range, or facing a
 * player `distance` metres down range (through `solids`, if any).
 */
export function holding(id: WeaponId, distance?: number, solids: readonly Solid[] = []): HeadlessMatch {
  const players = [{ id: SHOOTER, team: 1, position: [0, 0, 0] as const, loadout: loadoutFor(id) }];
  const m = createHeadlessMatch({
    solids: [FLOOR, wallAt(-500), ...solids],
    players: distance === undefined ? players : [...players, { id: TARGET, team: 2, position: [0, 0, -distance] as const, yaw: Math.PI }],
  });
  const w = () => playerIn(m.latest, SHOOTER).weapon;
  if (row(id).traits.slot === 'secondary') {
    m.run(ticks(1), () => ({ [SHOOTER]: idle }));
    m.step({ [SHOOTER]: usercmd({ buttons: ['SwitchWeapon'] }) });
  }
  for (let i = 0; i < ticks(3) && !(w().id === id && w().action === 'ready'); i++) m.step({ [SHOOTER]: idle });
  return m;
}

/** The trigger as each weapon wants it: held for full auto, a fresh press each tick for the rest. */
export function trigger(id: WeaponId, buttons = 0, angles: { yaw?: number; pitch?: number } = {}): UserCmd {
  return isAuto(id) ? usercmd({ ...angles, buttons: buttons | Button.Fire }) : usercmd({ ...angles, buttons, firePresses: [0.5] });
}

/**
 * Aims down sights at a zone of the target (for `settle` seconds, letting a
 * scope settle), then fires until it dies, pulling against recoil and scope
 * sway so every shot is on the zone. With `hip`, fires from the hip
 * instead. Returns the outputs of the firing.
 */
export function fightTo(m: HeadlessMatch, id: WeaponId, zone: HitZone, options: { settle?: number; hip?: boolean; seconds?: number } = {}): TickOutput[] {
  const ads = options.hip ? 0 : Button.Ads;
  const settle = options.settle ?? row(id).handling.adsTime.value + 0.05;
  if (!options.hip) m.run(ticks(settle), () => ({ [SHOOTER]: usercmd({ buttons: ads, ...aimAt(m, zone) }) }));
  const outputs: TickOutput[] = [];
  let cmdYaw = playerIn(m.latest, SHOOTER).yaw;
  let cmdPitch = playerIn(m.latest, SHOOTER).pitch;
  for (let i = 0; i < ticks(options.seconds ?? 3) && playerIn(m.latest, TARGET).alive; i++) {
    const me = playerIn(m.latest, SHOOTER);
    const aim = aimAt(m, zone);
    // Output angles = usercmd angles + recoil; shots leave along them plus the sway.
    cmdYaw = aim.yaw - (me.yaw - cmdYaw) - me.weapon.sway[0];
    cmdPitch = aim.pitch - (me.pitch - cmdPitch) - me.weapon.sway[1];
    outputs.push(m.step({ [SHOOTER]: trigger(id, ads, { yaw: cmdYaw, pitch: cmdPitch }) }));
  }
  return outputs;
}

/** Hits to kill and the time from the first shot to the killing shot, as the simulation plays it. */
export function measuredKill(id: WeaponId, distance: number, zone: HitZone = 'upperTorso', options: { settle?: number; hip?: boolean } = {}) {
  const m = holding(id, distance);
  const outputs = fightTo(m, id, zone, options);
  const hits = eventsOf(outputs, 'hit').filter((h) => h.victim === TARGET);
  const kill = hits.findIndex((h) => h.killed);
  const shots = eventsOf(outputs, 'shot');
  expect(kill, `${id} kills at ${distance} m`).toBeGreaterThanOrEqual(0);
  return { hits: kill + 1, time: shotTime(shots[kill]!) - shotTime(shots[0]!), zone: hits[0]!.zone, outputs };
}
