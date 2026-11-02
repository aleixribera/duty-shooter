import { MAX_PITCH, STATS, Simulation, box, createWorld, usercmd, type ButtonName, type Connection, type PlayerOutput, type UserCmd, type WeaponId } from '@duty-shooter/fps-core';
import { createHeadlessMatch, createNetworkedMatch, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { describe, expect, it } from 'vitest';
import { lookPitch } from '../src/input';

const DEG = Math.PI / 180;
const FLOOR = box({ min: [-50, -1, -50], max: [50, 0, 50], material: 'concrete' });
const minutes = (m: number) => Math.round(m * 60 * 60);

/**
 * The mouse as the game drives it: a spawn's facing first, then each frame's
 * movement kept inside the limits lookPitch sets from the last view and usercmd.
 */
function hand(client: NetworkedClient) {
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

const seat = (m: NetworkedMatch, c: NetworkedClient) => m.server.latest.players.find((p) => p.id === c.client.id) as PlayerOutput;

/** Long and short bursts, a swap to the pistol and back now and then, a reload when dry; the mouse holds the aim level against the kick all along. */
function fireHoldingLevel(m: NetworkedMatch, c: NetworkedClient, mouse: ReturnType<typeof hand>, ticks: number): void {
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
function pullDown(m: NetworkedMatch, c: NetworkedClient, mouse: ReturnType<typeof hand>): void {
  for (let i = 0; i < 60; i++) m.step({ [c.name]: mouse.cmd(-5 * DEG) });
}

describe('mouse look pitch limits', () => {
  it('still reaches the floor after a spray has kicked the view up', () => {
    const match = createHeadlessMatch({ solids: [], players: [{ id: 'p', team: 1, position: [0, 0, 0], loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' } }] });
    let pitch = 0;
    let self = match.latest.players[0] as PlayerOutput;
    // A long spray: the recoil stays on the view.
    for (let i = 0; i < 120; i++) self = match.step({ p: usercmd({ pitch, buttons: ['Fire'] }) }).players[0] as PlayerOutput;
    expect(self.pitch).toBeGreaterThan(5 * DEG);
    // Then the mouse pulls hard towards the floor, a frame at a time.
    for (let i = 0; i < 60; i++) {
      pitch = lookPitch(pitch, -5 * DEG, self.pitch - pitch);
      self = match.step({ p: usercmd({ pitch }) }).players[0] as PlayerOutput;
    }
    expect(self.pitch).toBeCloseTo(-MAX_PITCH, 5);
  });

  it('stops at the limits without pulling the pitch back', () => {
    expect(lookPitch(0, -2, 0)).toBeCloseTo(-MAX_PITCH);
    expect(lookPitch(0, 2, 0)).toBeCloseTo(MAX_PITCH);
    expect(lookPitch(0, -2, 20 * DEG)).toBeCloseTo(-MAX_PITCH - 20 * DEG);
    // Already past a limit (the offset changed): moving back in works, moving further out does not.
    expect(lookPitch(-MAX_PITCH, 0.1, 30 * DEG)).toBeCloseTo(-MAX_PITCH + 0.1);
    expect(lookPitch(MAX_PITCH - 0.1, 0.05, 20 * DEG)).toBeCloseTo(MAX_PITCH - 0.1);
  });

  it('keeps the floor in reach however much recoil the mouse has pulled against', () => {
    // Recoil never wears off, so holding the aim level moves the mouse pitch down by every kick: a whole life's worth of it.
    expect(lookPitch(-300 * DEG, -5 * DEG, 400 * DEG)).toBeCloseTo(-305 * DEG);
    expect(lookPitch(-300 * DEG, -200 * DEG, 400 * DEG)).toBeCloseTo(-MAX_PITCH - 400 * DEG);
  });

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

  it('back in its seat after a dropped connection, the view stays where it was and still reaches the floor', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [{ position: [0, 0, 0], yaw: 0 }], latency: 0.04, reconnectGrace: 60 });
    // Over a line that can be cut, as the network does; the client dials again on its own.
    let line!: Connection;
    const dial = (): Connection => (line = m.network.connect());
    const c = m.join('ann', { connection: dial(), reconnect: dial });
    const mouse = hand(c);
    fireHoldingLevel(m, c, mouse, minutes(1));
    for (let i = 0; i < 30; i++) m.step({ ann: mouse.cmd(0) });
    const before = seat(m, c);
    line.close('network went away');
    const views: number[] = [];
    for (let i = 0; i < 300; i++) {
      m.step({ ann: mouse.cmd(0) });
      // While away the seat may be out of the world; once back it must look where it did.
      const now = seat(m, c);
      if (now) views.push(now.pitch);
    }
    expect(c.client.status).toBe('joined');
    expect(seat(m, c).id).toBe(before.id);
    // Not a tick looking anywhere else.
    expect(views.length).toBeGreaterThan(60);
    expect(Math.max(...views.map((v) => Math.abs(v - before.pitch)))).toBeLessThan(0.001);
    pullDown(m, c, mouse);
    expect(seat(m, c).pitch).toBeCloseTo(-MAX_PITCH, 5);
  });

  it('a page that takes its seat back (reloaded) faces the usercmd angles that keep the view, the recoil left on the server', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: [{ position: [0, 0, 0], yaw: 0 }], latency: 0.04, reconnectGrace: 60 });
    let line!: Connection;
    const c = m.join('ann', { connection: (line = m.network.connect()) });
    const mouse = hand(c);
    fireHoldingLevel(m, c, mouse, minutes(1));
    for (let i = 0; i < 30; i++) m.step({ ann: mouse.cmd(0) });
    const held = c.client.snapshot!.self!;
    expect(held.viewPitch).toBeGreaterThan(45 * DEG);
    line.close('network went away');
    m.run(30);
    // A new page: a new client, resuming with the token the old one left.
    const back = m.join('ann', { resume: c.client.token! });
    let facing: { yaw: number; pitch: number } | null = null;
    for (let i = 0; i < 120 && !facing; i++) {
      m.step({});
      facing = back.client.takeSpawn();
    }
    expect(back.client.id).toBe(c.client.id);
    expect(facing!.pitch).toBeCloseTo(held.cmdPitch, 5);
    expect(facing!.yaw).toBeCloseTo(held.cmdYaw, 5);
  });

  it('Downed and Revived, the floor is still in reach', () => {
    const sim = new Simulation(createWorld([FLOOR]), { downs: () => true });
    sim.addPlayer({ id: 'p', team: 1, position: [0, 0, 0] });
    sim.addPlayer({ id: 'mate', team: 1, position: [5, 0, 0] });
    // A long life's recoil, held level by the mouse.
    let pitch = -400 * DEG;
    sim.setPlayerState({ ...sim.playerState('p')!, cmdPitch: pitch, viewPitch: 400 * DEG });
    sim.setPlayerState({ ...sim.playerState('p')!, downed: { since: sim.time, by: null, revive: null } });
    const view = () => sim.output().players[0]!;
    const look = (dy: number) => {
      const self = view();
      pitch = lookPitch(pitch, dy, self.pitch - pitch);
      sim.step({ p: usercmd({ pitch }) });
    };
    for (let i = 0; i < 60; i++) look(-5 * DEG);
    expect(view().downed).not.toBeNull();
    expect(view().pitch).toBeCloseTo(-MAX_PITCH, 5);
    for (let i = 0; i < 60; i++) look(5 * DEG);
    expect(view().pitch).toBeCloseTo(MAX_PITCH, 5);
    sim.setPlayerState({ ...sim.playerState('p')!, downed: null });
    for (let i = 0; i < 60; i++) look(-5 * DEG);
    expect(view().pitch).toBeCloseTo(-MAX_PITCH, 5);
  });
});
