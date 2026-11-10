// The mouse and the long online life the look-pitch tests share (look-pitch.test.ts and its soak).
import { STATS, box, usercmd, type ButtonName, type PlayerOutput, type UserCmd } from '@duty-shooter/fps-core';
import type { NetworkedClient, NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { lookPitch } from '../../src/input';

export const DEG = Math.PI / 180;
export const FLOOR = box({ min: [-50, -1, -50], max: [50, 0, 50], material: 'concrete' });
export const minutes = (m: number) => Math.round(m * 60 * 60);

/**
 * The mouse as the game drives it: a spawn's facing first, then each frame's
 * movement kept inside the limits lookPitch sets from the last view and usercmd.
 */
export function hand(client: NetworkedClient) {
  let yaw = 0;
  let pitch = 0;
  let sent = usercmd();
  return {
    cmd(dy: number, buttons: ButtonName[] = []): UserCmd {
      const facing = client.client.takeSpawn();
      if (facing) ({ yaw, pitch } = facing);
      const self = client.latest?.self;
      pitch = lookPitch(pitch, dy, self ? self.pitch - sent.pitch : 0);
      sent = usercmd({ yaw, pitch, buttons });
      return sent;
    },
    /** The mouse pitch, the usercmd's. */
    get pitch() {
      return pitch;
    },
  };
}

export const seat = (m: NetworkedMatch, c: NetworkedClient) => m.server.latest.players.find((p) => p.id === c.client.id) as PlayerOutput;

/** Long and short bursts, a swap to the pistol and back now and then, a reload when dry; the mouse holds the aim level against the kick all along. */
export function fireHoldingLevel(m: NetworkedMatch, c: NetworkedClient, mouse: ReturnType<typeof hand>, ticks: number): void {
  for (let t = 0; t < ticks; t++) {
    const self = c.latest?.self;
    const view = self?.pitch ?? 0;
    const auto = self ? STATS.weapons[self.weapon.id].traits.fireMode === 'auto' : true;
    const cycle = t % 600;
    const burst = cycle < 50 || (cycle >= 120 && cycle < 300) || (cycle >= 360 && cycle < 380);
    const buttons: ButtonName[] = [];
    if (burst && (auto || t % 4 < 2)) buttons.push('Fire');
    if (self && self.weapon.ammo === 0 && t % 30 === 0) buttons.push('Reload');
    if (t % 1800 === 1500 || t % 1800 === 1700) buttons.push('SwitchWeapon');
    m.step({ [c.name]: mouse.cmd(-Math.max(-2 * DEG, Math.min(2 * DEG, view * 0.3)), buttons) });
  }
}

/** Pulls the mouse hard down for a second. */
export function pullDown(m: NetworkedMatch, c: NetworkedClient, mouse: ReturnType<typeof hand>): void {
  for (let i = 0; i < 60; i++) m.step({ [c.name]: mouse.cmd(-5 * DEG) });
}
