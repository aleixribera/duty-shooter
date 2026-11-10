import { MAX_PITCH, Simulation, createWorld, usercmd, type Connection, type PlayerOutput } from '@duty-shooter/fps-core';
import { createHeadlessMatch, createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { describe, expect, it } from 'vitest';
import { lookPitch } from '../src/input';
import { DEG, FLOOR, fireHoldingLevel, hand, minutes, pullDown, seat } from './helpers/look';

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
