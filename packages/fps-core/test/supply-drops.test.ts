import { describe, expect, it } from 'vitest';
import { BOT_NAMES, STATS, TICK_SECONDS, botProfile, box, buildNavGraph, createWorld, royaleProfile, type BattleRoyaleState, type ModeContext, type NavGraph, type PlayerOutput, type SimEvent, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { BattleRoyale, planDrops, planRing, playGround, roomForDrop, type ModeActions } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, usercmd, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { seededRandom } from '../src/random';
import { Button } from '../src/usercmd';
import { createWeaponState, updateWeapon } from '../src/weapon/weapon';
import { ticks } from './support/movement';

const GROUND = box({ min: [-300, -1, -300], max: [300, 0, 300], material: 'concrete' });
const WORLD = createWorld([GROUND]);
const NAV: NavGraph = buildNavGraph(WORLD, { area: [[-240, -240], [240, -240], [240, 240], [-240, 240]], spacing: 4 });
const SPAWNS: readonly SpawnPoint[] = [{ position: [0, 0, 0], yaw: 0 }];
const D = STATS.royale.supplyDrop;
const SNIPER_MAG = STATS.weapons.sniper.handling.magazineSize.value;
const flat = (a: Vec3, b: { x: number; z: number } | Vec3) => ('x' in b ? Math.hypot(a[0] - b.x, a[2] - b.z) : Math.hypot(a[0] - b[0], a[2] - b[2]));

describe('Battle Royale on loadouts (PLAN item 9g)', () => {
  it('bots bring their own picks, the sniper among them', () => {
    const arena = BOT_NAMES.map((n) => botProfile(n));
    expect(arena.some((p) => p.loadout.primary === 'sniper')).toBe(true);
    for (const [i, p] of arena.map((a) => royaleProfile(a)).entries()) expect(p.loadout).toEqual(arena[i]!.loadout);
  });
});

describe('a weapon with a reserve', () => {
  const reload = (w: ReturnType<typeof createWeaponState>) => {
    const ctx = { movement: 'walk' as const, horizontalSpeed: 0, alive: true, seed: 1 };
    updateWeapon(w, usercmd({ buttons: Button.Reload }), ctx, TICK_SECONDS);
    for (let i = 0; i < ticks(5); i++) updateWeapon(w, usercmd({}), ctx, TICK_SECONDS);
  };

  it('reloads from it until it is spent, and no further', () => {
    const w = createWeaponState('sniper', 7);
    w.action = 'ready';
    w.ammo = 0;
    reload(w);
    expect([w.ammo, w.reserve]).toEqual([SNIPER_MAG, 2]);
    w.ammo = 1;
    reload(w);
    expect([w.ammo, w.reserve]).toEqual([3, 0]);
    w.ammo = 0;
    reload(w);
    expect([w.ammo, w.reserve, w.action]).toEqual([0, 0, 'ready']);
  });

  it('without one, a reload always fills the magazine', () => {
    const w = createWeaponState('sniper');
    w.action = 'ready';
    w.ammo = 0;
    reload(w);
    expect(w.ammo).toBe(SNIPER_MAG);
    expect(w.reserve).toBeUndefined();
  });
});

describe('planning the drops', () => {
  const ground = playGround(NAV, WORLD);

  it('one crate at the start of each Stage from the second to the fourth, landing well inside its next circle', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ring = planRing(ground, seededRandom(seed), 600);
      const drops = planDrops(ring, ground, seededRandom(seed + 100));
      expect(drops.map((d) => d.stage)).toEqual([2, 3, 4]);
      for (const d of drops) {
        const s = ring[d.stage - 1]!;
        expect(d.announce).toBeCloseTo(s.start);
        expect(d.lands).toBeCloseTo(s.start + D.warning.value);
        expect(flat(d.position, s.to)).toBeLessThanOrEqual(s.to.radius * D.ring.value + 1e-6);
      }
    }
  });

  it('lands only with room round it, clear of walls and posts (review, ticket 66)', () => {
    // Posts 1 m wide every 10 m: much of the ground has one within the crate's room.
    const posts = [];
    for (let x = -240; x <= 240; x += 10) for (let z = -240; z <= 240; z += 10) posts.push(box({ min: [x, 0, z], max: [x + 1, 3, z + 1], material: 'concrete' }));
    const kerb = box({ min: [-300, 0, -300], max: [300, 0.2, -200], material: 'concrete' });
    const world = createWorld([GROUND, kerb, ...posts]);
    expect(roomForDrop(world, [2, 0, 2])).toBe(false);
    expect(roomForDrop(world, [5.5, 0, 5.5])).toBe(true);
    expect(roomForDrop(createWorld([GROUND, kerb]), [0, 0.2, -250])).toBe(true);
    let cramped = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const ring = planRing(ground, seededRandom(seed), 600);
      cramped += planDrops(ring, ground, seededRandom(seed + 100)).filter((d) => !roomForDrop(world, d.position)).length;
      for (const d of planDrops(ring, ground, seededRandom(seed + 100), world)) expect(roomForDrop(world, d.position)).toBe(true);
    }
    // Without the world to look at, some would have landed against a post.
    expect(cramped).toBeGreaterThan(0);
  });

  it('lands in a town when one stands well inside its circle (request 3)', () => {
    const town = { x: 60, z: -40, radius: 40 };
    const towned = playGround(NAV, WORLD, [town]);
    let asked = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const ring = planRing(towned, seededRandom(seed), 600);
      for (const d of planDrops(ring, towned, seededRandom(seed + 100))) {
        const c = ring[d.stage - 1]!.to;
        expect(flat(d.position, c)).toBeLessThanOrEqual(c.radius * D.ring.value + 1e-6);
        if (Math.hypot(town.x - c.x, town.z - c.z) > c.radius * D.ring.value) continue;
        asked += 1;
        expect(Math.hypot(d.position[0] - town.x, d.position[2] - town.z)).toBeLessThanOrEqual(town.radius);
      }
    }
    expect(asked).toBeGreaterThan(10);
  });

  it('replays from its seed', () => {
    const ring = planRing(ground, seededRandom(9), 600);
    expect(planDrops(ring, ground, seededRandom(4))).toEqual(planDrops(ring, ground, seededRandom(4)));
  });
});

/** The mode alone, with seats that stand where told, hold use when told and carry a primary. */
function royale() {
  const ids = ['p1', 'p2', 'p3', 'p4'];
  const mode = new BattleRoyale({ squadSize: 2, seed: 5 });
  const where = new Map<string, Vec3>(ids.map((id, i) => [id, [i * 50, 0, 0]]));
  const alive = new Map(ids.map((id) => [id, true]));
  const primary = new Map<string, 'm4a1' | 'smg' | 'sniper'>(ids.map((id) => [id, 'm4a1']));
  const using = new Set<string>();
  const downed = new Set<string>();
  const resupplied: string[] = [];
  let team = new Map<string, number>();
  let time = 0;
  const act: ModeActions = {
    respawn: () => {},
    resupply: (id) => void resupplied.push(id),
  };
  const ctx = (): ModeContext => ({
    tick: 0,
    time,
    matchTime: time,
    players: ids.map((id) => ({ id, team: team.get(id), alive: alive.get(id), downed: downed.has(id) ? {} : null, kind: 'player', position: where.get(id), loadout: { primary: primary.get(id)! } }) as unknown as PlayerOutput),
    spawns: SPAWNS,
    teamSpawns: null,
    world: WORLD,
    zones: [],
    sites: [],
    using,
    ground: playGround(NAV, WORLD),
    people: new Set(),
    act,
  });
  team = new Map(mode.start(ids.map((id) => ({ id, name: id, team: null })), ctx()));
  const events: string[] = [];
  const step = (seconds: number, sim: SimEvent[] = []) => {
    for (let t = 0; t < seconds - 1e-9; t += TICK_SECONDS) {
      time += TICK_SECONDS;
      for (const e of mode.onEvents(t === 0 ? sim : [], ctx())) if (e.type === 'drop') events.push(`${e.action}${e.player ? ` ${e.player}` : ''}`);
    }
  };
  const state = () => mode.objective() as BattleRoyaleState;
  return { mode, where, alive, downed, primary, using, resupplied, events, step, state };
}

describe('a match’s Supply Drops', () => {
  it('announces each crate as its Stage starts, lands it after the warning, and tells it all in the state', () => {
    const r = royale();
    const stage2 = r.mode.ring[1]!.start;
    r.step(stage2 - TICK_SECONDS);
    expect(r.state().drops).toBeUndefined();
    r.step(TICK_SECONDS * 2);
    expect(r.events).toEqual(['announce']);
    const drop = r.state().drops![0]!;
    expect(drop.stage).toBe(2);
    expect(drop.lands).toBeCloseTo(stage2 + D.warning.value, 1);
    r.step(D.warning.value);
    expect(r.events).toEqual(['announce', 'land']);
  });

  it('opens to a seat holding use at it for the open time and resupplies it once', () => {
    const r = royale();
    r.step(r.mode.ring[1]!.start + D.warning.value + 0.1);
    const crate = r.state().drops![0]!.position;
    r.where.set('p1', [crate[0] + 1, crate[1], crate[2]]);
    r.using.add('p1');
    r.step(D.openTime.value - 0.2);
    expect(r.resupplied).toEqual([]);
    expect(r.state().drops![0]!.opening?.by).toBe('p1');
    r.step(0.3);
    expect(r.state().drops![0]!.opened).toBe('p1');
    expect(r.resupplied).toEqual(['p1']);
    expect(r.events.slice(-2)).toEqual(['start p1', 'open p1']);
    // Opened, it gives no more.
    r.where.set('p3', [crate[0] - 1, crate[1], crate[2]]);
    r.using.add('p3');
    r.step(D.openTime.value + 0.5);
    expect(r.resupplied).toEqual(['p1']);
  });

  it('does not open to a Downed seat', () => {
    const r = royale();
    r.step(r.mode.ring[1]!.start + D.warning.value + 0.1);
    const crate = r.state().drops![0]!.position;
    r.where.set('p1', [crate[0] + 1, crate[1], crate[2]]);
    r.downed.add('p1');
    r.using.add('p1');
    r.step(D.openTime.value + 0.5);
    expect(r.state().drops![0]!.opening).toBeUndefined();
    expect(r.resupplied).toEqual([]);
  });

  it('stops opening when use is let go or the opener steps away, and starts over', () => {
    const r = royale();
    r.step(r.mode.ring[1]!.start + D.warning.value + 0.1);
    const crate = r.state().drops![0]!.position;
    r.where.set('p1', [crate[0], crate[1], crate[2] + 1]);
    r.using.add('p1');
    r.step(1.5);
    r.using.delete('p1');
    r.step(0.1);
    expect(r.state().drops![0]!.opening).toBeUndefined();
    r.using.add('p1');
    r.step(1.5);
    expect(r.resupplied).toEqual([]);
    r.where.set('p1', [crate[0] + 5, crate[1], crate[2]]);
    r.step(1);
    expect(r.resupplied).toEqual([]);
    expect(r.events.filter((e) => e.startsWith('stop'))).toHaveLength(2);
  });

  it('nothing lies on the ground: a seat that goes out with the sniper leaves nothing behind', () => {
    const r = royale();
    r.primary.set('p4', 'sniper');
    r.alive.set('p4', false);
    r.step(TICK_SECONDS, [{ type: 'kill', killer: 'p1', victim: 'p4', cause: 'bullet', zone: null, weapon: 'm4a1' } as SimEvent]);
    expect(Object.keys(r.state())).not.toContain('loose');
    expect(r.events).toEqual([]);
  });
});

describe('on the server', () => {
  /** A short match (the Ring at a fifth of its pace), no bots, alice on open ground. */
  function match(): NetworkedMatch {
    return createNetworkedMatch({
      solids: [GROUND],
      spawns: SPAWNS,
      mode: 'battle-royale',
      modes: { battleRoyale: { squadSize: 1, seed: 3, timeLimit: 120 } },
      bots: { nav: NAV, perTeam: 0, maxPerTeam: 0 },
      countdown: 0.1,
      latency: 0.03,
    });
  }

  it('a pick of the sniper spawns with it, and a crate fills its opener’s frags and health', () => {
    const m = match();
    const c = m.join('alice', { loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag' } });
    m.run(ticks(0.5));
    c.client.loaded();
    const id = c.client.id!;
    const me = () => m.server.latest.players.find((p) => p.id === id)!;
    expect(me().loadout.primary).toBe('sniper');
    const objective = () => m.server.matchStatus().objective as BattleRoyaleState;
    for (let i = 0; i < ticks(60) && !objective().drops?.length; i++) m.step();
    const drop = objective().drops![0]!;
    while (m.server.simulation.time < drop.lands + 0.1) m.step();
    m.server.simulation.respawn(id, [drop.position[0] + 1, drop.position[1], drop.position[2]], 0, undefined, { health: 30, frags: 0 });
    m.run(ticks(D.openTime.value + 0.5), () => ({ alice: usercmd({ buttons: Button.Use }) }));
    expect(objective().drops![0]!.opened).toBe(id);
    expect(me().weapon).toMatchObject({ id: 'sniper', slot: 0 });
    expect(me().weapon.reserve).toBeUndefined();
    expect(me().grenades).toBe(STATS.royale.frags.value);
    expect(me().health).toBe(STATS.health.max.value);
  });
});
