import { describe, expect, it } from 'vitest';
import { STATS, Simulation, anglesOf, box, buildNavGraph, createWorld, type BattleRoyaleState, type ModeContext, type NavGraph, type PlayerOutput, type SimEvent, type SimulationOptions, type UserCmd } from '@duty-shooter/fps-core';
import { BattleRoyale, playGround } from '@duty-shooter/fps-core/modes';
import { usercmd } from '@duty-shooter/fps-core/harness';
import { decodeSnapshot, encodeSnapshot } from '../src/net/codec';
import { ticks } from './support/movement';

const WORLD = createWorld([box({ min: [-100, -1, -100], max: [100, 0, 100], material: 'concrete' })]);

/** A Duo (ada, bea) a step apart, and eve of another Squad six metres off, weapons up. */
function duo(options: SimulationOptions = {}) {
  const sim = new Simulation(WORLD, { canDamage: (a, v) => a.team !== v.team, downs: () => true, ...options });
  sim.addPlayer({ id: 'ada', team: 1, position: [0, 0, 0] });
  sim.addPlayer({ id: 'bea', team: 1, position: [1.5, 0, 0] });
  sim.addPlayer({ id: 'eve', team: 2, position: [0, 0, 6] });
  const events: SimEvent[] = [];
  /** Seats keeping a button held whatever else goes on. */
  const held: Record<string, UserCmd> = {};
  const run = (seconds: number, cmds: (tick: number) => Parameters<Simulation['step']>[0] = () => ({})) => {
    for (let i = 0; i < ticks(seconds); i++) events.push(...sim.step({ ...held, ...cmds(i) }).events);
  };
  run(1);
  return { sim, events, run, held, ...helpers(sim, run) };
}

function helpers(sim: Simulation, run: (seconds: number, cmds?: (tick: number) => Parameters<Simulation['step']>[0]) => void) {
  const out = (id: string) => sim.output().players.find((p) => p.id === id) as PlayerOutput;
  const lowTo = (id: string, health: number) => sim.setPlayerState({ ...sim.playerState(id)!, health });
  /** Eve puts one round into `id`, wherever it lies. */
  const shoot = (id: string) => {
    const target = out(id);
    const eye = out('eve');
    const aim = anglesOf([target.position[0] - eye.position[0], target.position[1] + (target.stance === 'prone' ? 0.15 : 1.2) - eye.position[1] - eye.eyeHeight, target.position[2] - eye.position[2]]);
    run(0.3, (tick) => ({ eve: usercmd({ ...aim, ...(tick === 0 ? { buttons: ['Fire'], firePresses: [0] } : {}) }) }));
  };
  const knock = (id: string) => {
    lowTo(id, 1);
    // Hipfire at six metres can miss.
    for (let i = 0; i < 30 && out(id).alive && !out(id).downed; i++) shoot(id);
  };
  return { out, lowTo, shoot, knock };
}

const use = usercmd({ buttons: ['Use'] });

describe('going Downed', () => {
  it('at 0 health a seat with a standing squadmate goes Downed instead of dying', () => {
    const { out, knock, events } = duo();
    knock('ada');
    expect(out('ada').alive).toBe(true);
    expect(out('ada').downed).not.toBeNull();
    expect(events.filter((e) => e.type === 'kill')).toEqual([]);
    expect(events.find((e) => e.type === 'down')).toMatchObject({ attacker: 'eve', victim: 'ada', cause: 'bullet' });
  });

  it('with no rule for it nobody goes Downed: Solos and every other mode die at 0', () => {
    const { out, knock, events } = duo({ downs: () => false });
    knock('ada');
    expect(out('ada').alive).toBe(false);
    expect(out('ada').downed).toBeNull();
    expect(events.find((e) => e.type === 'kill')).toMatchObject({ killer: 'eve', victim: 'ada' });
  });

  it('with the rest of its Squad out, the seat just dies', () => {
    const { out, knock } = duo();
    knock('ada');
    knock('bea');
    expect(out('bea').alive).toBe(false);
  });

  it('a seat Downed has a prone body, crawls, and cannot fire or throw', () => {
    const { out, knock, run } = duo();
    knock('ada');
    run(1.5);
    expect(out('ada').stance).toBe('prone');
    const ammo = out('ada').weapon.ammo;
    const grenades = out('ada').grenades;
    const before = out('ada').position;
    run(1, (tick) => ({ ada: usercmd({ forward: 1, buttons: tick % 2 ? ['Sprint', 'Fire', 'Grenade'] : ['Sprint'], firePresses: tick % 2 ? [0] : [] }) }));
    const moved = Math.hypot(out('ada').position[0] - before[0], out('ada').position[2] - before[2]);
    expect(moved).toBeGreaterThan(0.3);
    expect(moved).toBeLessThan(1);
    expect(out('ada').weapon.ammo).toBe(ammo);
    expect(out('ada').grenades).toBe(grenades);
    expect(out('ada').weapon.canFire).toBe(false);
  });

  it('a frag being cooked falls from the hand when the seat goes Downed, still live', () => {
    const { sim, out, knock, run, events, held } = duo();
    held['ada'] = usercmd({ buttons: ['Grenade'] });
    run(0.5);
    knock('ada');
    expect(events.some((e) => e.type === 'grenade' && e.phase === 'drop')).toBe(true);
    expect(out('ada').grenade).toBeNull();
    expect(sim.output().grenades).toHaveLength(1);
  });

  it('a Downed seat does not regenerate', () => {
    const { out, knock, run } = duo();
    knock('ada');
    const health = out('ada').health;
    run(10);
    expect(out('ada').health).toBe(health);
  });
});

describe('Bleed-out', () => {
  it('kills a Downed seat at 30 s, to the credit of who Downed it', () => {
    const { out, knock, run, events } = duo();
    knock('ada');
    run(29.5);
    expect(out('ada').alive).toBe(true);
    expect(out('ada').downed!.bleedOut).toBeGreaterThan(0);
    expect(out('ada').downed!.bleedOut).toBeLessThan(1);
    run(0.6);
    expect(out('ada').alive).toBe(false);
    expect(events.find((e) => e.type === 'kill')).toMatchObject({ killer: 'eve', victim: 'ada', cause: 'bleedOut' });
  });

  it('is neither paused nor sped up by the Ring', () => {
    // Ada lies in the Ring; Bea stands clear of it.
    let burning = false;
    const { out, knock, run } = duo({ hazard: (at) => (burning && Math.hypot(at[0], at[2]) < 1 ? 500 : 0) });
    knock('ada');
    burning = true;
    run(29);
    expect(out('ada').alive).toBe(true);
    run(1.1);
    expect(out('ada').alive).toBe(false);
  });

  it('stands still through an intermission', () => {
    let playing = true;
    const { out, knock, run } = duo({ selfDamage: () => playing });
    knock('ada');
    playing = false;
    run(40);
    expect(out('ada').alive).toBe(true);
  });
});

describe('the second after going Down (ticket 54)', () => {
  it('a Downed seat lies with a pool as large as full health', () => {
    const { out, knock } = duo();
    knock('ada');
    expect(STATS.royale.downedHealth.value).toBe(100);
    expect(out('ada').health).toBe(100);
  });

  it('takes no damage for its first second, and every hit in it says so', () => {
    const { out, knock, shoot, events, run } = duo();
    knock('ada');
    const downAt = events.length;
    expect(STATS.royale.downedGrace.value).toBe(1);
    shoot('ada');
    shoot('ada');
    expect(out('ada').health).toBe(100);
    const shielded = events.slice(downAt).filter((e) => e.type === 'hit' && e.victim === 'ada');
    expect(shielded.length).toBeGreaterThan(0);
    for (const e of shielded) expect(e).toMatchObject({ damage: 0, killed: false });
    run(0.5);
    const after = events.length;
    for (let i = 0; i < 10 && out('ada').health === 100; i++) shoot('ada');
    expect(out('ada').health).toBeLessThan(100);
    expect(events.slice(after).some((e) => e.type === 'hit' && e.victim === 'ada' && e.damage > 0)).toBe(true);
  });

  it('a burst that Downs a seat does not Finish it', () => {
    const { out, lowTo, run, events } = duo();
    lowTo('ada', 1);
    const target = out('ada');
    const eye = out('eve');
    const aim = anglesOf([target.position[0] - eye.position[0], target.position[1] + 1.2 - eye.position[1] - eye.eyeHeight, target.position[2] - eye.position[2]]);
    // A full second of automatic fire, starting the moment Ada is on 1 HP.
    run(1, () => ({ eve: usercmd({ ...aim, buttons: ['Fire'] }) }));
    expect(events.some((e) => e.type === 'down' && e.victim === 'ada')).toBe(true);
    expect(out('ada').alive).toBe(true);
    expect(out('ada').health).toBe(100);
  });
});

describe('Finish', () => {
  it('enemies take a Downed seat down through its own health pool', () => {
    const { out, knock, shoot, events, run } = duo();
    knock('ada');
    run(STATS.royale.downedGrace.value);
    const pool = out('ada').health;
    expect(pool).toBeGreaterThan(0);
    shoot('ada');
    expect(out('ada').health).toBeLessThan(pool);
    while (out('ada').alive) shoot('ada');
    expect(events.find((e) => e.type === 'kill')).toMatchObject({ killer: 'eve', victim: 'ada', cause: 'bullet' });
    expect(out('ada').downed).toBeNull();
  });

  it('the Ring and a fall do not', () => {
    const { out, knock, sim, run } = duo();
    knock('ada');
    const pool = out('ada').health;
    const state = sim.playerState('ada')!;
    sim.setPlayerState({ ...state, move: { ...state.move, position: [0, 30, 0], grounded: false, airPeak: 30 } });
    run(3);
    expect(out('ada').health).toBe(pool);
  });
});

describe('Squad wipe', () => {
  it('a Squad with nobody standing is out: its Downed seats die with the last of them', () => {
    const { out, knock, events } = duo();
    knock('ada');
    knock('bea');
    expect(out('bea').alive).toBe(false);
    expect(out('ada').alive).toBe(false);
    expect(events.find((e) => e.type === 'kill' && e.victim === 'ada')).toMatchObject({ killer: 'eve', cause: 'wipe' });
  });

  it('counts a Squad out when its last standing seat leaves the match', () => {
    const { sim, out, knock, run } = duo();
    knock('ada');
    sim.removePlayer('bea');
    run(0.1);
    expect(out('ada').alive).toBe(false);
  });
});

describe('Revive', () => {
  const near = () => {
    const d = duo();
    d.knock('ada');
    d.run(1);
    return d;
  };

  it('holding use within reach for 5 s stands the seat up at half health with its loadout and remaining frags', () => {
    const { out, run, events } = near();
    const { loadout } = out('ada');
    const frags = out('ada').grenades;
    run(4.9, () => ({ bea: use }));
    expect(out('ada').downed).not.toBeNull();
    expect(out('ada').downed!.revive).toBeGreaterThan(0.9);
    expect(out('bea').reviving).toBeGreaterThan(0.9);
    run(0.2, () => ({ bea: use }));
    expect(out('ada').downed).toBeNull();
    expect(out('bea').reviving).toBeNull();
    expect(out('ada').health).toBeCloseTo(50, 3);
    expect(out('ada').loadout).toEqual(loadout);
    expect(out('ada').grenades).toBe(frags);
    expect(events.find((e) => e.type === 'revive')).toMatchObject({ reviver: 'bea', target: 'ada' });
  });

  it('gets the Revived seat up and shooting again', () => {
    const { out, run } = near();
    run(5.1, () => ({ bea: use }));
    run(2);
    expect(out('ada').stance).toBe('stand');
    expect(out('ada').weapon.canFire).toBe(true);
  });

  it('out of reach does nothing', () => {
    const { out, sim, run } = near();
    const state = sim.playerState('bea')!;
    sim.setPlayerState({ ...state, move: { ...state.move, position: [6, 0, 0] } });
    run(6, () => ({ bea: use }));
    expect(out('ada').downed).not.toBeNull();
    expect(out('ada').downed!.revive).toBe(0);
  });

  it('letting go starts it over', () => {
    const { out, run } = near();
    run(4, () => ({ bea: use }));
    run(0.1);
    expect(out('ada').downed!.revive).toBe(0);
    run(4, () => ({ bea: use }));
    expect(out('ada').downed).not.toBeNull();
  });

  it('moving away cancels it', () => {
    const { out, run } = near();
    run(2, () => ({ bea: use }));
    run(1.5, () => ({ bea: usercmd({ buttons: ['Use'], yaw: -Math.PI / 2, forward: 1 }) }));
    expect(out('bea').reviving).toBeNull();
    expect(out('ada').downed!.revive).toBe(0);
  });

  it('taking damage cancels it, on either side', () => {
    for (const hurt of ['ada', 'bea']) {
      const { out, run, shoot } = near();
      run(1, () => ({ bea: use }));
      expect(out('ada').downed!.revive).toBeGreaterThan(0);
      const before = out('ada').downed!.revive;
      shoot(hurt);
      expect(out('ada').downed!.revive).toBeLessThan(before);
    }
  });

  it('there is no limit on how often', () => {
    const { out, run, knock } = near();
    for (let i = 0; i < 3; i++) {
      run(5.1, () => ({ bea: use }));
      expect(out('ada').downed).toBeNull();
      run(2);
      knock('ada');
      expect(out('ada').downed).not.toBeNull();
      run(1);
    }
  });

  it('a reviver cannot fire or throw while at it', () => {
    const { out, run, events } = near();
    run(2, (tick) => ({ bea: usercmd({ buttons: tick % 2 ? ['Use', 'Fire'] : ['Use'], firePresses: tick % 2 ? [0] : [] }) }));
    expect(events.filter((e) => e.type === 'shot' && e.shooter === 'bea')).toEqual([]);
    expect(out('bea').stance).toBe('crouch');
  });

  it('only a squadmate can do it', () => {
    const { out, sim, run } = near();
    const state = sim.playerState('eve')!;
    sim.setPlayerState({ ...state, move: { ...state.move, position: [0, 0, 1] } });
    run(6, () => ({ eve: use }));
    expect(out('ada').downed).not.toBeNull();
  });

  it('one reviver at a time, and a Downed seat cannot revive', () => {
    const sim = new Simulation(WORLD, { canDamage: (a, v) => a.team !== v.team, downs: () => true });
    for (const [id, x] of [['ada', 0], ['bea', 1], ['cat', -1]] as const) sim.addPlayer({ id, team: 1, position: [x, 0, 0] });
    sim.addPlayer({ id: 'eve', team: 2, position: [0, 0, 6] });
    const run = (seconds: number, cmds: (tick: number) => Parameters<Simulation['step']>[0] = () => ({})) => {
      for (let i = 0; i < ticks(seconds); i++) sim.step(cmds(i));
    };
    run(1);
    const { out, knock } = helpers(sim, run);
    knock('ada');
    run(1);
    run(1, () => ({ bea: use }));
    run(1, () => ({ bea: use, cat: use }));
    expect(out('bea').reviving).not.toBeNull();
    expect(out('cat').reviving).toBeNull();
    knock('cat');
    run(1, () => ({ ada: use, bea: use }));
    expect(out('ada').reviving).toBeNull();
  });
});

describe('on the wire', () => {
  it('a seat Downed, and one reviving, reach other clients as they are', () => {
    const { sim, out, knock, run } = duo();
    knock('ada');
    run(1);
    run(2, () => ({ bea: use }));
    const seen = decodeSnapshot(encodeSnapshot({ tick: 1, serverTime: 1, ack: 0, self: null, players: sim.output().players, grenades: [], events: [] } as never));
    const ada = seen.players.find((p) => p.id === 'ada')!;
    const bea = seen.players.find((p) => p.id === 'bea')!;
    expect(ada.downed!.bleedOut).toBeCloseTo(out('ada').downed!.bleedOut, 0);
    expect(ada.downed!.revive).toBeCloseTo(0.4, 1);
    expect(bea.reviving).toBeCloseTo(0.4, 1);
    expect(seen.players.find((p) => p.id === 'eve')).toMatchObject({ downed: null, reviving: null });
  });
});

describe('the mode', () => {
  const NAV: NavGraph = buildNavGraph(WORLD, { area: [[-90, -90], [90, -90], [90, 90], [-90, 90]], spacing: 4 });
  const entrants = ['p1', 'p2', 'p3', 'p4'].map((id) => ({ id, name: id.toUpperCase(), team: null }));

  /** Two Duos: p1 and p2 on Squad 1, p3 and p4 on Squad 2. */
  function fours(state: Record<string, 'standing' | 'downed' | 'dead'>, people: readonly string[] = []) {
    const mode = new BattleRoyale({ squadSize: 2, seed: 4 });
    const ctx = {
      tick: 0, time: 1, matchTime: 1,
      players: entrants.map((e, i) => ({ id: e.id, team: i < 2 ? 1 : 2, kind: 'player', alive: (state[e.id] ?? 'standing') !== 'dead', downed: state[e.id] === 'downed' ? { bleedOut: 9, revive: 0 } : null, position: [0, 0, 0] })) as unknown as readonly PlayerOutput[],
      spawns: [{ position: [0, 0, 0], yaw: 0 }], teamSpawns: null, world: WORLD, zones: [], sites: [], using: new Set(), ground: playGround(NAV, WORLD), people: new Set(people),
    } as ModeContext;
    mode.start(entrants, ctx);
    return { mode, ctx };
  }

  it('Solos have no Downed, Duos do', () => {
    expect(new BattleRoyale({ squadSize: 1 }).downs()).toBe(false);
    expect(new BattleRoyale({ squadSize: 2 }).downs()).toBe(true);
  });

  it('being Downed does not count as alive: the seats left are the standing ones', () => {
    const { mode, ctx } = fours({ p1: 'downed' });
    expect(mode.result(ctx)).toBeNull();
    expect((mode.objective() as BattleRoyaleState).alive).toBe(3);
  });

  it('a Squad wins once every other seat is dead, with a mate of theirs still Downed', () => {
    const { mode, ctx } = fours({ p2: 'downed', p3: 'dead', p4: 'dead' });
    expect(mode.result(ctx)).toMatchObject({ winner: 1, reason: 'lastSquad' });
  });

  it('a person Downed is still in it: the match does not end early while they can be Revived', () => {
    const { mode, ctx } = fours({ p1: 'downed' }, ['p1']);
    expect(mode.result(ctx)).toBeNull();
  });

  it('the feed tells a down from an elimination, and only an elimination is a kill', () => {
    const { mode, ctx } = fours({});
    const [down] = mode.onEvents([{ type: 'down', attacker: 'p3', victim: 'p1', cause: 'bullet', zone: 'head', weapon: 'm4a1' }], ctx);
    expect(down).toMatchObject({ type: 'killFeed', down: true, killer: 'p3', victim: 'p1', headshot: true });
    expect(mode.scores().find((s) => s.id === 'p3')?.kills).toBe(0);
    expect(mode.scores().find((s) => s.id === 'p1')?.deaths).toBe(0);
    const [out] = mode.onEvents([{ type: 'kill', killer: 'p3', victim: 'p1', cause: 'bullet', zone: 'upperTorso', weapon: 'm4a1' }], ctx);
    expect(out).not.toHaveProperty('down');
    expect(mode.scores().find((s) => s.id === 'p3')?.kills).toBe(1);
  });
});
