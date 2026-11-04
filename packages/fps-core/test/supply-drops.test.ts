import { describe, expect, it } from 'vitest';
import { BOT_NAMES, STATS, TICK_SECONDS, botProfile, box, buildNavGraph, createWorld, royaleProfile, type BattleRoyaleState, type ModeContext, type NavGraph, type PlayerOutput, type SimEvent, type SpawnPoint, type Vec3 } from '@duty-shooter/fps-core';
import { BattleRoyale, DROP_WEAPON, planDrops, planRing, playGround, royaleLoadout, type ModeActions } from '@duty-shooter/fps-core/modes';
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

describe('the sniper leaves the Battle Royale loadout', () => {
  it('a pick of the sniper starts with the M4A1; other picks are kept', () => {
    expect(royaleLoadout({ primary: 'sniper', secondary: 'pistol', grenade: 'frag' })).toEqual({ primary: 'm4a1', secondary: 'pistol', grenade: 'frag' });
    expect(royaleLoadout({ primary: 'smg', secondary: 'pistol', grenade: null })).toEqual({ primary: 'smg', secondary: 'pistol', grenade: null });
  });

  it('no bot brings it into a Battle Royale, and those who would take their next pick', () => {
    const arena = BOT_NAMES.map((n) => botProfile(n));
    expect(arena.some((p) => p.loadout.primary === 'sniper')).toBe(true);
    const royale = arena.map(royaleProfile);
    expect(royale.filter((p) => p.loadout.primary === 'sniper')).toEqual([]);
    for (const [i, p] of royale.entries()) if (arena[i]!.loadout.primary !== 'sniper') expect(p.loadout).toEqual(arena[i]!.loadout);
    // An anchor mostly carries the M4A1 instead.
    expect(royale.filter((p) => p.style === 'anchor').some((p) => p.loadout.primary === 'm4a1')).toBe(true);
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

  it('replays from its seed', () => {
    const ring = planRing(ground, seededRandom(9), 600);
    expect(planDrops(ring, ground, seededRandom(4))).toEqual(planDrops(ring, ground, seededRandom(4)));
  });
});

/** The mode alone, with seats that stand where told, hold use when told and carry what `act` says. */
function royale() {
  const ids = ['p1', 'p2', 'p3', 'p4'];
  const mode = new BattleRoyale({ squadSize: 2, seed: 5 });
  const where = new Map<string, Vec3>(ids.map((id, i) => [id, [i * 50, 0, 0]]));
  const alive = new Map(ids.map((id) => [id, true]));
  const primary = new Map<string, { id: 'm4a1' | 'smg' | 'sniper'; ammo: number; reserve?: number }>(ids.map((id) => [id, { id: 'm4a1', ammo: 30 }]));
  const using = new Set<string>();
  let team = new Map<string, number>();
  let time = 0;
  const act: ModeActions = {
    give: (id, weapon) => {
      const old = primary.get(id)!;
      primary.set(id, weapon as never);
      return old;
    },
    primary: (id) => primary.get(id) ?? null,
  };
  const ctx = (): ModeContext => ({
    tick: 0,
    time,
    matchTime: time,
    players: ids.map((id) => ({ id, team: team.get(id), alive: alive.get(id), downed: null, kind: 'player', position: where.get(id), loadout: { primary: primary.get(id)!.id } }) as unknown as PlayerOutput),
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
      for (const e of mode.onEvents(t === 0 ? sim : [], ctx())) if (e.type === 'drop' || e.type === 'loose') events.push(e.type === 'drop' ? `${e.action}${e.player ? ` ${e.player}` : ''}` : `loose ${e.player ?? '-'} ${e.weapon}`);
    }
  };
  const state = () => mode.objective() as BattleRoyaleState;
  return { mode, where, alive, primary, using, events, step, state, at: () => time };
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

  it('opens to a seat holding use at it for the open time: the sniper with its spare magazines in place of the primary, which falls beside it', () => {
    const r = royale();
    r.step(r.mode.ring[1]!.start + D.warning.value + 0.1);
    const crate = r.state().drops![0]!.position;
    r.where.set('p1', [crate[0] + 1, crate[1], crate[2]]);
    r.using.add('p1');
    r.step(D.openTime.value - 0.2);
    expect(r.primary.get('p1')!.id).toBe('m4a1');
    expect(r.state().drops![0]!.opening?.by).toBe('p1');
    r.step(0.3);
    expect(r.primary.get('p1')).toEqual({ id: DROP_WEAPON, ammo: SNIPER_MAG, reserve: SNIPER_MAG * D.magazines.value });
    expect(r.state().drops![0]!.opened).toBe('p1');
    expect(r.events.slice(-3)).toEqual(['start p1', 'open p1', 'loose - m4a1']);
    const left = r.state().loose![0]!;
    expect(left.weapon).toBe('m4a1');
    expect(flat(left.position, crate)).toBeLessThan(D.reach.value);
    // Opened, it gives no more.
    r.where.set('p3', [crate[0] - 1, crate[1], crate[2]]);
    r.using.add('p3');
    r.step(D.openTime.value + 0.5);
    expect(r.primary.get('p3')!.id).toBe('m4a1');
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
    expect(r.primary.get('p1')!.id).toBe('m4a1');
    r.where.set('p1', [crate[0] + 5, crate[1], crate[2]]);
    r.step(1);
    expect(r.primary.get('p1')!.id).toBe('m4a1');
    expect(r.events.filter((e) => e.startsWith('stop'))).toHaveLength(2);
  });

  it('a weapon on the ground goes to whoever presses use over it, who leaves their own there', () => {
    const r = royale();
    r.step(r.mode.ring[1]!.start + D.warning.value + 0.1);
    const crate = r.state().drops![0]!.position;
    r.where.set('p1', [crate[0], crate[1], crate[2] + 1]);
    r.using.add('p1');
    r.step(D.openTime.value + 0.1);
    r.using.delete('p1');
    const m4 = r.state().loose![0]!;
    r.primary.set('p2', { id: 'smg', ammo: 12 });
    r.where.set('p2', [m4.position[0] + 0.5, 0, m4.position[2]]);
    r.using.add('p2');
    r.step(0.5);
    expect(r.primary.get('p2')).toEqual({ id: 'm4a1', ammo: 30 });
    expect(r.state().loose!.map((l) => l.weapon)).toEqual(['smg']);
    // Held, it isn't swapped back: a new press is needed.
    expect(r.primary.get('p2')!.id).toBe('m4a1');
  });

  it('a seat that goes out with the sniper leaves it where it fell, with the rounds it had', () => {
    const r = royale();
    r.primary.set('p4', { id: 'sniper', ammo: 2, reserve: 5 });
    r.alive.set('p4', false);
    r.step(TICK_SECONDS, [{ type: 'kill', killer: 'p1', victim: 'p4', cause: 'bullet', zone: null, weapon: 'm4a1' } as SimEvent]);
    expect(r.state().loose).toEqual([{ id: 1, weapon: 'sniper', position: r.where.get('p4') }]);
    r.primary.set('p1', { id: 'm4a1', ammo: 30 });
    r.where.set('p1', r.where.get('p4')!);
    r.using.add('p1');
    r.step(TICK_SECONDS * 2);
    expect(r.primary.get('p1')).toEqual({ id: 'sniper', ammo: 2, reserve: 5 });
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

  it('a pick of the sniper spawns with the M4A1', () => {
    const m = match();
    const c = m.join('alice', { loadout: { primary: 'sniper', secondary: 'pistol', grenade: 'frag' } });
    m.run(ticks(1));
    expect(m.server.latest.players.find((p) => p.id === c.client.id)!.loadout.primary).toBe('m4a1');
  });

  it('a seat that opens a crate holds the sniper with a reserve it reloads from, and the HUD hears of it', () => {
    const m = match();
    const c = m.join('alice');
    m.run(ticks(0.5));
    c.client.loaded();
    const id = c.client.id!;
    const objective = () => m.server.matchStatus().objective as BattleRoyaleState;
    for (let i = 0; i < ticks(60) && !objective().drops?.length; i++) m.step();
    const drop = objective().drops![0]!;
    while (m.server.simulation.time < drop.lands + 0.1) m.step();
    m.server.simulation.respawn(id, [drop.position[0] + 1, drop.position[1], drop.position[2]], 0);
    m.run(ticks(D.openTime.value + 0.5), () => ({ alice: usercmd({ buttons: Button.Use }) }));
    const me = m.server.latest.players.find((p) => p.id === id)!;
    expect(me.weapon).toMatchObject({ id: 'sniper', slot: 0, reserve: SNIPER_MAG * D.magazines.value });
    expect(objective().drops![0]!.opened).toBe(id);
    expect(objective().loose?.map((l) => l.weapon)).toEqual(['m4a1']);
    // It reaches the client too, for its own prediction and HUD.
    m.run(ticks(0.5));
    expect(c.client.self?.weapon.reserve).toBe(SNIPER_MAG * D.magazines.value);
  });
});
