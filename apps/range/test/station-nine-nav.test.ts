import { describe, expect, it } from 'vitest';
import { Bot, Simulation, TICK_SECONDS, botProfile, createWorld, findPath, inSite, inZone, nearestNode, type Ladder, type PlayerOutput, type Vec3 } from '@duty-shooter/fps-core';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { insidePolygon } from '../src/map/definition';
import { botMap, reachable } from './support/bots';
import { BOUNDARY, BUNKER, DOCK, HOUSE, TOWER, TRENCH, buildStationNine } from '../src/map/station-nine';

const map = buildStationNine();
const { solids, nav } = botMap(map, BOUNDARY);
const ladders = map.ladders!;
const world = createWorld(solids, { ladders });

/** The nav node exactly at `p`, if there is one. */
const nodeAt = (p: Vec3) => nav.nodes.findIndex((n) => Math.hypot(n.position[0] - p[0], n.position[2] - p[2]) < 0.01 && Math.abs(n.position[1] - p[1]) < 0.1);

describe('Station Nine: nav graph', () => {
  it('covers the ground, the trench floor, the docks, the roofs and the tower decks', () => {
    const count = (f: (p: readonly number[]) => boolean) => nav.nodes.filter((n) => f(n.position)).length;
    expect(count((p) => Math.abs(p[1]!) < 0.1)).toBeGreaterThan(600);
    expect(count((p) => Math.abs(p[1]! - TRENCH.floor) < 0.1)).toBeGreaterThan(12);
    expect(count((p) => Math.abs(p[1]! - DOCK.top) < 0.1)).toBeGreaterThan(10);
    expect(count((p) => Math.abs(p[1]! - BUNKER.roof) < 0.1)).toBeGreaterThan(6);
    expect(count((p) => Math.abs(p[1]! - HOUSE.roof) < 0.1)).toBeGreaterThan(6);
    for (const s of [-1, 1]) expect(count((p) => Math.abs(p[1]! - TOWER.deck) < 0.1 && p[0]! * s > TOWER.x0 && p[0]! * s < TOWER.x1), `deck ${s}`).toBeGreaterThanOrEqual(2);
  });

  it('lets a bot get from anywhere to anywhere', () => {
    expect(reachable(nav, false).size).toBe(nav.nodes.length);
    expect(reachable(nav, true).size).toBe(nav.nodes.length);
  });

  it('links each ladder\'s foot and landing both ways', () => {
    for (const l of ladders) {
      const bottom = nodeAt(l.bottom);
      const top = nodeAt(l.landing);
      expect(bottom, `${l.bottom}`).toBeGreaterThanOrEqual(0);
      expect(top, `${l.landing}`).toBeGreaterThanOrEqual(0);
      expect(nav.links[bottom]!.some((k) => k.to === top && k.kind === 'ladder'), `${l.bottom} up`).toBe(true);
      expect(nav.links[top]!.some((k) => k.to === bottom && k.kind === 'ladder'), `${l.landing} down`).toBe(true);
    }
  });

  it('reaches the tower decks only by their ladders', () => {
    for (const l of ladders.filter((x) => x.landing[1] === TOWER.deck)) {
      const top = nodeAt(l.landing);
      const into = nav.links.flatMap((links, i) => links.filter((k) => k.to === top).map((k) => ({ from: nav.nodes[i]!.position, kind: k.kind })));
      expect(into.filter((k) => k.from[1] < TOWER.deck - 0.5).every((k) => k.kind === 'ladder')).toBe(true);
    }
  });

  it('puts every node inside the boundary, where a player can stand still', () => {
    const sim = new Simulation(world);
    sim.addPlayer({ id: 'p', team: 1, position: nav.nodes[0]!.position, yaw: 0 });
    const bad: string[] = [];
    for (const n of nav.nodes) {
      const p = n.position;
      if (!insidePolygon(BOUNDARY, p[0], p[2])) bad.push(`${p} outside`);
      sim.respawn('p', p, 0);
      let out = sim.step({ p: usercmd() });
      for (let i = 0; i < 20; i++) out = sim.step({ p: usercmd() });
      const q = out.players[0]!.position;
      if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > 0.1) bad.push(`${p.map((v) => v.toFixed(2))} moved to ${q.map((v) => v.toFixed(2))}`);
    }
    expect(bad).toEqual([]);
  });

  it('has a node near every spawn point', () => {
    for (const s of [...map.spawns.ffa, ...map.spawns.teams!.flat()]) {
      const near = nav.nodes.some((n) => Math.hypot(n.position[0] - s.position[0], n.position[2] - s.position[2]) < 3 && Math.abs(n.position[1] - s.position[1]) < 0.5);
      expect(near, `spawn ${s.position}`).toBe(true);
    }
  });

  it('has nav nodes on the floor of every Outposts zone and in both Charge sites', () => {
    for (const z of map.zones) expect(nav.nodes.filter((n) => inZone(z, n.position)).length, z.name).toBeGreaterThanOrEqual(3);
    for (const s of map.sites) expect(nav.nodes.filter((n) => inSite(s, n.position)).length, s.name).toBeGreaterThanOrEqual(4);
  });

  it('reaches every zone and site from both teams\' spawns', () => {
    const targets = [...map.zones.map((z) => ({ name: z.name, inside: (p: Vec3) => inZone(z, p) })), ...map.sites.map((s) => ({ name: s.name, inside: (p: Vec3) => inSite(s, p) }))];
    for (const [team, set] of map.spawns.teams!.entries()) {
      const from = nearestNode(nav, world, set[0]!.position);
      for (const t of targets) {
        const goal = nav.nodes.findIndex((n) => t.inside(n.position));
        expect(findPath(nav, from, goal), `team ${team + 1} to ${t.name}`).not.toBeNull();
      }
    }
  });
});

/** Steps a lone bot toward `goal` until `done`, for up to `seconds`; returns whether it got there and whether it used a ladder. */
function drive(sim: Simulation, bot: Bot, goal: Vec3, done: (p: PlayerOutput) => boolean, seconds = 40): { reached: boolean; laddered: boolean; at: PlayerOutput } {
  let out = sim.output();
  bot.goTo(goal);
  let laddered = false;
  for (let i = 0; i < seconds / TICK_SECONDS; i++) {
    const self = out.players[0]!;
    out = sim.step({ b: bot.think({ tick: out.tick, time: sim.time, self, players: out.players, events: out.events, isEnemy: () => false }) });
    laddered ||= out.players[0]!.movement === 'ladder';
    if (done(out.players[0]!)) return { reached: true, laddered, at: out.players[0]! };
  }
  return { reached: false, laddered, at: out.players[0]! };
}

describe('Station Nine: bots on the ladders', () => {
  const cases: [string, Ladder][] = ladders.map((l) => [`${l.bottom[0] > 0 ? 'east' : 'west'} ${l.landing[1] === TOWER.deck ? 'camera tower' : 'bunker'}`, l]);
  for (const [name, l] of cases) {
    it(`a bot climbs the ${name} ladder and comes back down to the ground`, () => {
      const out = Math.sign(l.bottom[0] - l.landing[0]);
      const start: Vec3 = [l.bottom[0] + out * 4, 0, l.bottom[2] + 1.5];
      const sim = new Simulation(world);
      sim.addPlayer({ id: 'b', team: 1, position: start, yaw: out > 0 ? Math.PI / 2 : -Math.PI / 2 });
      const bot = new Bot('b', botProfile('Kestrel'), nav, world);
      const up = drive(sim, bot, l.landing, (p) => p.position[1] > l.landing[1] - 0.05 && p.movement !== 'ladder' && Math.hypot(p.position[0] - l.landing[0], p.position[2] - l.landing[2]) < 1.2);
      expect(up.laddered, `${name}: never on the ladder, at ${up.at.position}`).toBe(true);
      expect(up.reached, `${name}: climb ended at ${up.at.position} (${up.at.movement})`).toBe(true);
      const down = drive(sim, bot, start, (p) => p.position[1] < 0.1 && Math.hypot(p.position[0] - start[0], p.position[2] - start[2]) < 1.2);
      expect(down.reached, `${name}: descent ended at ${down.at.position} (${down.at.movement})`).toBe(true);
    }, 30_000);
  }
});
