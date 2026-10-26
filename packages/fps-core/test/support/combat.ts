import { STATS, TICK_SECONDS, anglesOf, zoneCentre, type HitZone, type PlayerOutput, type SimEvent, type TickOutput, type UserCmd, type Vec3 } from '@duty-shooter/fps-core';
import { box, createHeadlessMatch, usercmd, type HeadlessMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './movement';

export const SHOOTER = 'p';
export const TARGET = 'd';

/** Seconds between shots at the stats-file fire rate. */
export const SHOT_INTERVAL = 60 / STATS.weapon.fireRate.value;

/** The player's outputs from a tick, by id. */
export function playerIn(output: TickOutput, id: string): PlayerOutput {
  const p = output.players.find((x) => x.id === id);
  if (!p) throw new Error(`no ${id} in the outputs`);
  return p;
}

/** A lane: shooter at the origin facing -Z, a static dummy `distance` metres down range facing the shooter. */
export function lane(distance: number, options: { solids?: readonly import('@duty-shooter/fps-core').Solid[]; targetIsPlayer?: boolean } = {}): HeadlessMatch {
  return createHeadlessMatch({
    solids: options.solids ?? [FLOOR],
    players: [
      { id: SHOOTER, team: 1, position: [0, 0, 0] },
      { id: TARGET, team: 2, position: [0, 0, -distance], yaw: Math.PI, ...(options.targetIsPlayer ? {} : { dummy: {} }) },
    ],
  });
}

/** Steps until the shooter's weapon has finished drawing. */
export function drawn(match: HeadlessMatch, cmd: UserCmd = usercmd()): void {
  match.run(ticks(STATS.weapon.drawTime.value) + 1, () => ({ [SHOOTER]: cmd }));
}

/** Yaw and pitch from the shooter's eye to the centre of a zone on the target, as of the latest outputs. */
export function aimAt(match: HeadlessMatch, zone: HitZone, from = SHOOTER, at = TARGET): { yaw: number; pitch: number } {
  const shooter = playerIn(match.latest, from);
  const target = playerIn(match.latest, at);
  const eye: Vec3 = [shooter.position[0], shooter.position[1] + shooter.eyeHeight, shooter.position[2]];
  const centre = zoneCentre(target, zone);
  return anglesOf([centre[0] - eye[0], centre[1] - eye[1], centre[2] - eye[2]]);
}

/** Every event of one type across outputs, tagged with the tick it happened on. */
export function eventsOf<T extends SimEvent['type']>(outputs: readonly TickOutput[], type: T): (Extract<SimEvent, { type: T }> & { tick: number })[] {
  return outputs.flatMap((o) => o.events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type).map((e) => ({ ...e, tick: o.tick })));
}

/** Simulation time (s) of a shot event: the start of its tick plus its sub-tick fraction. */
export function shotTime(e: { tick: number; fraction: number }): number {
  return (e.tick - 1 + e.fraction) * TICK_SECONDS;
}

/** Angle (radians) between two unit vectors. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
  return Math.atan2(cross, d);
}

/**
 * Holds fire at a zone, ADS, pulling down against recoil: each tick's usercmd
 * pitch cancels the recoil the outputs show, so every shot aims at the zone.
 * Returns each tick's outputs.
 */
export function controlledBurst(match: HeadlessMatch, zone: HitZone, count: number, buttons: readonly ('Fire' | 'Ads')[] = ['Fire', 'Ads']): TickOutput[] {
  const outputs: TickOutput[] = [];
  let cmdYaw = playerIn(match.latest, SHOOTER).yaw;
  let cmdPitch = playerIn(match.latest, SHOOTER).pitch;
  for (let i = 0; i < count; i++) {
    const me = playerIn(match.latest, SHOOTER);
    const aim = aimAt(match, zone);
    // Output angles = usercmd angles + recoil offset; solve for the usercmd angles that aim at the zone.
    cmdYaw = aim.yaw - (me.yaw - cmdYaw);
    cmdPitch = aim.pitch - (me.pitch - cmdPitch);
    outputs.push(match.step({ [SHOOTER]: usercmd({ yaw: cmdYaw, pitch: cmdPitch, buttons }) }));
  }
  return outputs;
}

/** A tall concrete wall across the lane at `z`. */
export function wallAt(z: number, material: 'concrete' | 'metal' | 'wood' = 'concrete') {
  return box({ min: [-20, 0, z - 0.5], max: [20, 10, z], material });
}
