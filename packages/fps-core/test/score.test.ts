import { describe, expect, it } from 'vitest';
import { STATS, anglesOf, buildNavGraph, createWorld, zoneCentre, type ModeContext, type ModeEvent, type PlayerOutput, type ScoreLine, type SimEvent, type SpawnPoint, type Vec3, type Zone } from '@duty-shooter/fps-core';
import { BattleRoyale, FreeForAll, GUN_GAME_KILLS_PER_GUN, GunGame, Outposts, SCORE_POINTS, ScoreKeeper, TeamDeathmatch } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const S = STATS.score;
const WORLD = createWorld([FLOOR]);

function ctx(time = 0, players: readonly PlayerOutput[] = [], zones: readonly Zone[] = []): ModeContext {
  return { tick: 0, time, matchTime: time, players, spawns: [{ position: [0, 0, 0], yaw: 0 }], teamSpawns: null, world: WORLD, zones, sites: [], using: new Set() };
}

type How = Partial<Pick<Extract<SimEvent, { type: 'kill' }>, 'cause' | 'zone' | 'weapon'>>;
const kill = (killer: string | null, victim: string, how: How = {}): SimEvent => ({ type: 'kill', killer, victim, cause: 'bullet', zone: 'upperTorso', weapon: 'm4a1', ...how });
const hit = (shooter: string, victim: string, how: Partial<Extract<SimEvent, { type: 'hit' }>> = {}): SimEvent => ({
  type: 'hit', shooter, victim, zone: 'upperTorso', damage: 40, distance: 10, point: [0, 0, 0], killed: false, cause: 'bullet', weapon: 'm4a1', pellets: 1, ...how,
});

/** The lines `player` was told of in `events`, as `reason points`. */
function told(events: readonly ModeEvent[], player: string): string[] {
  return events.flatMap((e) => (e.type === 'score' && e.player === player ? e.lines.map((l) => `${l.reason} ${l.points}`) : []));
}
function linesOf(events: readonly ModeEvent[], player: string): ScoreLine[] {
  return events.flatMap((e) => (e.type === 'score' && e.player === player ? [...e.lines] : []));
}

/** A free-for-all of a, b, c and d, everyone their own team. */
function ffa(options: ConstructorParameters<typeof FreeForAll>[0] = {}) {
  const mode = new FreeForAll(options);
  mode.start(['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, team: null })));
  const row = (id: string) => mode.scores().find((s) => s.id === id)!;
  /** One tick at `time` with these simulation events. */
  const at = (time: number, ...events: SimEvent[]) => mode.onEvents(events, ctx(time));
  /** Uses up the first blood, so a test reads its own reasons only: d kills c, long before. */
  const blooded = () => {
    at(-100, kill('d', 'c'));
    return api;
  };
  const api = { mode, row, at, blooded };
  return api;
}

describe('the points table', () => {
  it('is the owner’s: a kill is 100 and everything else is read against it', () => {
    expect(Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.value]))).toEqual({
      kill: 100, headshot: 50, assist: 50, assistDamage: 30, assistWindow: 8, longShot: 25, longShotRange: 40, longShotRangeSniper: 90, revenge: 25, firstBlood: 50,
      multiKillWindow: 3.5, doubleKill: 50, tripleKill: 100, multiKill: 150, streak3: 50, streak5: 100, streak7: 150, streak10: 250, melee: 50, grenade: 25,
      capture: 150, zoneKill: 25, plant: 200, defuse: 300, finish: 25, revive: 100, reboot: 150,
    });
    // A Down pays what a kill pays.
    expect(SCORE_POINTS.down).toBe(S.kill.value);
  });
});

describe('score for a kill', () => {
  it('pays 100 for a kill, to the killer alone, and counts it on their row beside kills and deaths', () => {
    const m = ffa().blooded();
    const out = m.at(0, kill('a', 'b'));
    expect(told(out, 'a')).toEqual(['kill 100']);
    expect(linesOf(out, 'a')[0]).toEqual({ reason: 'kill', points: 100, victim: 'b', weapon: 'm4a1' });
    expect(out.filter((e) => e.type === 'score')).toHaveLength(1);
    expect(m.row('a')).toMatchObject({ kills: 1, deaths: 0, score: 100, assists: 0 });
    expect(m.row('b')).toMatchObject({ kills: 0, deaths: 1, score: 0, assists: 0 });
  });

  it('pays nothing for a fall, a suicide, or the kill of someone who is not in the match', () => {
    const m = ffa();
    const out = m.at(0, kill(null, 'a', { cause: 'fall', zone: null, weapon: null }), kill('b', 'b', { cause: 'grenade' }), kill('c', 'dummy'));
    expect(out.filter((e) => e.type === 'score')).toEqual([]);
    expect(m.mode.scores().map((s) => s.score)).toEqual([0, 0, 0, 0]);
  });

  it('adds 50 for a headshot: a bullet through the head, not a grenade', () => {
    const m = ffa().blooded();
    expect(told(m.at(0, kill('a', 'b', { zone: 'head' })), 'a')).toEqual(['kill 100', 'headshot 50']);
    expect(told(m.at(20, kill('a', 'c', { zone: 'head', cause: 'grenade', weapon: 'frag' })), 'a')).toEqual(['kill 100', 'grenade 25']);
  });

  it('adds 50 for a melee kill and 25 for a grenade kill', () => {
    const m = ffa().blooded();
    expect(told(m.at(0, kill('a', 'b', { cause: 'melee' })), 'a')).toEqual(['kill 100', 'melee 50']);
    expect(told(m.at(20, kill('b', 'c', { cause: 'grenade', weapon: 'frag' })), 'b')).toEqual(['kill 100', 'grenade 25']);
  });

  it('adds 50 for first blood, the first kill of the match and of the next match', () => {
    const m = ffa();
    expect(told(m.at(0, kill('a', 'b')), 'a')).toEqual(['kill 100', 'firstBlood 50']);
    expect(told(m.at(20, kill('c', 'd')), 'c')).toEqual(['kill 100']);
    m.mode.start(['a', 'b'].map((id) => ({ id, name: id, team: null })));
    expect(m.row('a').score).toBe(0);
    expect(told(m.at(40, kill('b', 'a')), 'b')).toEqual(['kill 100', 'firstBlood 50']);
  });

  it('adds 25 for a long shot past 40 m, past 90 m with the sniper, and tells its metres', () => {
    const m = ffa().blooded();
    // The simulation tells of the kill before the hit that made it.
    const shot = (time: number, victim: string, distance: number, weapon: 'm4a1' | 'sniper' = 'm4a1') => {
      // a dies in between, so no streak joins the lines.
      m.at(time - 5, kill(null, 'a', { cause: 'fall', zone: null, weapon: null }));
      return m.at(time, kill('a', victim, { weapon }), hit('a', victim, { distance, weapon, killed: true }));
    };
    expect(told(shot(0, 'b', 40), 'a')).toEqual(['kill 100']);
    const long = shot(20, 'b', 40.6);
    expect(told(long, 'a')).toEqual(['kill 100', 'longShot 25']);
    expect(linesOf(long, 'a')[0]).toEqual({ reason: 'kill', points: 100, victim: 'b', weapon: 'm4a1', metres: 41 });
    expect(linesOf(long, 'a')[1]).toEqual({ reason: 'longShot', points: 25, metres: 41 });
    expect(told(shot(40, 'c', 85, 'sniper'), 'a')).toEqual(['kill 100']);
    expect(told(shot(60, 'c', 91, 'sniper'), 'a')).toEqual(['kill 100', 'longShot 25']);
    // A grenade thrown that far is no long shot.
    m.at(70, kill(null, 'a', { cause: 'fall', zone: null, weapon: null }));
    expect(told(m.at(80, kill('a', 'd', { cause: 'grenade', weapon: 'frag' }), hit('a', 'd', { distance: 60, cause: 'grenade', weapon: 'frag', killed: true })), 'a')).toEqual(['kill 100', 'grenade 25']);
  });

  it('adds 25 for revenge on the seat that last killed you, once', () => {
    const m = ffa().blooded();
    m.at(0, kill('b', 'a'));
    expect(told(m.at(20, kill('a', 'b')), 'a')).toEqual(['kill 100', 'revenge 25']);
    expect(told(m.at(40, kill('a', 'b')), 'a')).toEqual(['kill 100']);
    // Killed by someone else since: no revenge on the first one.
    m.at(60, kill('b', 'a'));
    m.at(80, kill('c', 'a'));
    expect(told(m.at(100, kill('a', 'b')), 'a')).toEqual(['kill 100']);
  });

  it('pays multi-kills for kills within 3.5 s of the last: double 50, triple 100, then 150 each', () => {
    const m = ffa().blooded();
    const reasons = [0, 3.5, 7, 10.5, 14].map((t, i) => told(m.at(t, kill('a', i % 2 ? 'c' : 'b')), 'a').filter((l) => !l.startsWith('kill') && !l.startsWith('streak')));
    expect(reasons).toEqual([[], ['doubleKill 50'], ['tripleKill 100'], ['multiKill 150'], ['multiKill 150']]);
    // Past the window the next kill starts over.
    expect(told(m.at(14 + 3.6, kill('a', 'b')), 'a')).toEqual(['kill 100']);
    expect(told(m.at(14 + 3.6 + 1, kill('a', 'c')), 'a')).toEqual(['kill 100', 'doubleKill 50', 'streak7 150']);
  });

  it('pays two kills of one tick as a double kill, in one event', () => {
    const m = ffa().blooded();
    const out = m.at(0, kill('a', 'b', { cause: 'grenade', weapon: 'frag' }), kill('a', 'c', { cause: 'grenade', weapon: 'frag' }));
    expect(out.filter((e) => e.type === 'score')).toHaveLength(1);
    expect(told(out, 'a')).toEqual(['kill 100', 'grenade 25', 'kill 100', 'grenade 25', 'doubleKill 50']);
    expect(m.row('a').score).toBe(300);
  });

  it('pays streaks at 3, 5, 7 and 10 kills without dying, and a death starts it over', () => {
    const m = ffa().blooded();
    const streaks: string[][] = [];
    for (let i = 0; i < 10; i++) streaks.push(told(m.at(i * 10, kill('a', 'b')), 'a').filter((l) => l.startsWith('streak')));
    expect(streaks).toEqual([[], [], ['streak3 50'], [], ['streak5 100'], [], ['streak7 150'], [], [], ['streak10 250']]);
    expect(m.row('a').score).toBe(10 * 100 + 50 + 100 + 150 + 250);
    m.at(200, kill('c', 'a'));
    expect(told(m.at(210, kill('a', 'b')), 'a')).toEqual(['kill 100']);
    expect(told(m.at(220, kill('a', 'b')), 'a')).toEqual(['kill 100']);
    expect(told(m.at(230, kill('a', 'b')), 'a')).toEqual(['kill 100', 'streak3 50']);
  });

  it('keeps the best Medal of the match on the row', () => {
    const m = ffa();
    expect(m.row('a').medal).toBeUndefined();
    m.at(0, kill('a', 'b'));
    expect(m.row('a').medal).toBe('firstBlood');
    m.at(1, kill('a', 'c'));
    expect(m.row('a').medal).toBe('doubleKill');
    m.at(20, kill('a', 'c'));
    expect(m.row('a').medal).toBe('streak3');
    // A lesser one later doesn't replace it.
    m.at(40, kill('a', 'c'), hit('a', 'c', { distance: 70, killed: true }));
    expect(m.row('a').medal).toBe('streak3');
  });
});

describe('an Assist', () => {
  it('pays 50 to a seat that dealt 30 damage to the victim in the 8 s before someone else killed them', () => {
    const m = ffa().blooded();
    m.at(0, hit('c', 'b', { damage: 15 }));
    m.at(1, hit('c', 'b', { damage: 15 }));
    const out = m.at(8, hit('a', 'b', { damage: 70, killed: true }), kill('a', 'b'));
    expect(told(out, 'a')).toEqual(['kill 100']);
    expect(told(out, 'c')).toEqual(['assist 50']);
    expect(linesOf(out, 'c')[0]).toEqual({ reason: 'assist', points: 50, victim: 'b' });
    expect(m.row('c')).toMatchObject({ kills: 0, assists: 1, score: 50 });
    expect(m.row('a')).toMatchObject({ kills: 1, assists: 0, score: 100 });
  });

  it('is not earned by less damage, by damage too long ago, by the killer, or by damage from a life before', () => {
    const m = ffa().blooded();
    m.at(0, hit('c', 'b', { damage: 29 }));
    expect(told(m.at(1, kill('a', 'b')), 'c')).toEqual([]);
    m.at(10, hit('c', 'b', { damage: 80 }));
    expect(told(m.at(18.1, kill('a', 'b')), 'c')).toEqual([]);
    m.at(30, hit('a', 'b', { damage: 60 }));
    expect(m.at(31, kill('a', 'b')).filter((e) => e.type === 'score')).toHaveLength(1);
    // c hurt b, b died to a (an Assist), then b died again with nothing new from c.
    m.at(40, hit('c', 'b', { damage: 80 }));
    expect(told(m.at(41, kill('a', 'b')), 'c')).toEqual(['assist 50']);
    expect(told(m.at(42, kill('a', 'b')), 'c')).toEqual([]);
    expect(m.row('c').assists).toBe(1);
  });

  it('goes to everyone who earned it', () => {
    const m = ffa().blooded();
    const out = m.at(0, hit('c', 'b', { damage: 35 }), hit('d', 'b', { damage: 35 }), hit('a', 'b', { damage: 30, killed: true }), kill('a', 'b'));
    expect([told(out, 'c'), told(out, 'd')]).toEqual([['assist 50'], ['assist 50']]);
  });
});

describe('score and winning', () => {
  it('free-for-all is still won on kills, whatever the Score says', () => {
    const m = ffa({ killLimit: null, timeLimit: 60 });
    // a: one kill with every bonus. b: two plain kills.
    m.at(0, kill('a', 'c', { zone: 'head' }));
    m.at(10, kill('b', 'c'));
    m.at(20, kill('b', 'd'));
    m.at(30, hit('a', 'd', { damage: 50 }));
    m.at(31, kill('c', 'd'));
    expect(m.row('a').score).toBeGreaterThan(m.row('b').score);
    expect(m.mode.scores()[0]!.id).toBe('a');
    expect(m.mode.result(ctx(60))).toMatchObject({ winner: 'b', reason: 'timeLimit' });
  });

  it('team deathmatch is still won on kills: its team score is the team’s kills', () => {
    const mode = new TeamDeathmatch({ killLimit: 2 });
    mode.start([{ id: 'a', name: 'a', team: 1 }, { id: 'b', name: 'b', team: 2 }]);
    mode.onEvents([kill('a', 'b', { zone: 'head' })], ctx(0));
    expect(mode.teamScores()).toEqual([{ team: 1, score: 1 }, { team: 2, score: 0 }]);
    expect(mode.scores().find((s) => s.id === 'a')).toMatchObject({ kills: 1, score: 200 });
    expect(mode.result(ctx(1))).toBeNull();
    mode.onEvents([kill('a', 'b')], ctx(10));
    expect(mode.result(ctx(11))).toMatchObject({ winner: 1, reason: 'killLimit' });
    // Decided: nothing more scores.
    const after = mode.onEvents([kill('a', 'b')], ctx(20));
    expect(after.filter((e) => e.type === 'score')).toEqual([]);
    expect(mode.scores().find((s) => s.id === 'a')).toMatchObject({ kills: 2, score: 300 });
  });

  it('a team kill scores nothing', () => {
    const mode = new TeamDeathmatch();
    mode.start([{ id: 'a', name: 'a', team: 1 }, { id: 'a2', name: 'a2', team: 1 }, { id: 'b', name: 'b', team: 2 }]);
    const out = mode.onEvents([kill('a', 'a2')], ctx(0));
    expect(out.filter((e) => e.type === 'score')).toEqual([]);
  });

  it('gun game scores kills like everywhere, and keeps the ladder apart as progress', () => {
    const mode = new GunGame({ timeLimit: 60 });
    mode.start(['a', 'b', 'c'].map((id) => ({ id, name: id, team: null })));
    const row = (id: string) => mode.scores().find((s) => s.id === id)!;
    expect(told(mode.onEvents([kill('a', 'b', { zone: 'head' })], ctx(0)), 'a')).toEqual(['kill 100', 'headshot 50', 'firstBlood 50']);
    expect(row('a')).toMatchObject({ kills: 1, score: 200, progress: 1 });
    // b climbs further on plain kills: a still tops the scoreboard, b leads the ladder and wins on time.
    mode.onEvents([kill('b', 'c')], ctx(10));
    mode.onEvents([kill('b', 'c')], ctx(20));
    expect(row('b')).toMatchObject({ kills: 2, score: 200, progress: 2 });
    mode.onEvents([kill('a', 'c', { cause: 'melee' })], ctx(30));
    expect(row('a')).toMatchObject({ kills: 2, score: 350, progress: 2 });
    expect(mode.scores()[0]!.id).toBe('a');
    mode.onEvents([kill('b', 'c')], ctx(40));
    expect(row('b')).toMatchObject({ kills: 3, progress: 3 });
    expect(mode.result(ctx(60))).toMatchObject({ winner: 'b', reason: 'timeLimit' });
    // A seat back from a drop keeps both.
    mode.leave('a');
    mode.rejoin({ id: 'a', team: 1, name: 'a', kills: 2, deaths: 0, score: 350, assists: 0, progress: 2 });
    expect(row('a')).toMatchObject({ score: 350, progress: 2 });
    expect(GUN_GAME_KILLS_PER_GUN).toBeGreaterThan(2);
  });
});

describe('score in Outposts', () => {
  const ZONE: Zone = { id: 'A', name: 'Alpha', center: [0, 0, 0], radius: 5, height: 3 };
  const seats = [
    { id: 'b1', name: 'b1', team: 1 },
    { id: 'b2', name: 'b2', team: 1 },
    { id: 'o1', name: 'o1', team: 2 },
  ];
  const far: Vec3 = [80, 0, 80];
  const players = (where: Readonly<Record<string, Vec3>>): PlayerOutput[] => seats.map((e) => ({ id: e.id, team: e.team, alive: true, kind: 'player', position: where[e.id] ?? far }) as unknown as PlayerOutput);

  it('adds 25 to a kill made from inside a zone, or of someone standing in one', () => {
    const mode = new Outposts();
    mode.start(seats);
    const tick = (time: number, where: Readonly<Record<string, Vec3>>, ...events: SimEvent[]) => mode.onEvents(events, ctx(time, players(where), [ZONE]));
    expect(told(tick(0, {}, kill('b2', 'o1')), 'b2')).toEqual(['kill 100', 'firstBlood 50']);
    expect(told(tick(10, { b1: [1, 0, 1] }, kill('b1', 'o1')), 'b1')).toEqual(['kill 100', 'zoneKill 25']);
    expect(told(tick(20, { o1: [-2, 0, 0] }, kill('b1', 'o1')), 'b1')).toEqual(['kill 100', 'zoneKill 25']);
    expect(told(tick(30, { o1: [-2, 0, 0], b2: far }, kill('o1', 'b2')), 'o1')).toEqual(['kill 100', 'zoneKill 25']);
  });

  it('pays 150 for a capture to everyone of the team standing in the zone, and to nobody else', () => {
    const mode = new Outposts();
    mode.start(seats);
    const out: ModeEvent[] = [];
    for (let t = 0; t < 20 && !out.some((e) => e.type === 'capture'); t += 1 / 60) out.push(...mode.onEvents([], ctx(t, players({ b1: [1, 0, 1], b2: [-1, 0, 0] }), [ZONE])));
    expect(out.filter((e) => e.type === 'capture')).toHaveLength(1);
    expect([told(out, 'b1'), told(out, 'b2'), told(out, 'o1')]).toEqual([['capture 150'], ['capture 150'], []]);
    expect(mode.scores().map((s) => [s.id, s.score])).toEqual([['b1', 150], ['b2', 150], ['o1', 0]]);
  });
});

describe('score in Battle Royale', () => {
  const entrants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => ({ id, name: id, team: null }));
  /** Three Duos: p1 and p2, p3 and p4, p5 and p6. */
  function duos() {
    const mode = new BattleRoyale({ squadSize: 2, seed: 4 });
    const state = new Map<string, 'standing' | 'downed' | 'dead'>();
    const at = (time: number): ModeContext => ({
      ...ctx(time),
      players: entrants.map((e, i) => ({ id: e.id, team: Math.floor(i / 2) + 1, kind: 'player', alive: state.get(e.id) !== 'dead', downed: state.get(e.id) === 'downed' ? { bleedOut: 9, revive: 0 } : null, position: [i * 30, 0, 0] })) as unknown as PlayerOutput[],
    });
    mode.start(entrants, at(0));
    const row = (id: string) => mode.scores().find((s) => s.id === id)!;
    const tick = (time: number, ...events: SimEvent[]) => {
      for (const e of events) {
        if (e.type === 'down') state.set(e.victim, 'downed');
        else if (e.type === 'kill') state.set(e.victim, 'dead');
        else if (e.type === 'revive') state.set(e.target, 'standing');
      }
      const out = mode.onEvents(events, at(time));
      mode.result(at(time));
      return out;
    };
    return { mode, row, tick };
  }
  const down = (attacker: string, victim: string, zone: 'head' | 'upperTorso' = 'upperTorso'): SimEvent => ({ type: 'down', attacker, victim, cause: 'bullet', zone, weapon: 'm4a1' });

  it('a Down scores as the kill, with its bonuses and Assists; the finish adds 25', () => {
    const m = duos();
    m.tick(1, hit('p4', 'p1', { damage: 40 }));
    const out = m.tick(2, down('p3', 'p1', 'head'), hit('p3', 'p1', { zone: 'head', damage: 60, distance: 55 }));
    expect(told(out, 'p3')).toEqual(['down 100', 'headshot 50', 'longShot 25', 'firstBlood 50']);
    expect(told(out, 'p4')).toEqual(['assist 50']);
    expect(m.row('p3')).toMatchObject({ kills: 0, score: 225 });
    // Shooting the Downed seat earns no second Assist, and the finish pays its 25 and no more.
    m.tick(3, hit('p4', 'p1', { damage: 40 }));
    const finish = m.tick(4, kill('p3', 'p1', { zone: 'head' }), hit('p3', 'p1', { zone: 'head', killed: true }));
    expect(told(finish, 'p3')).toEqual(['finish 25']);
    expect(told(finish, 'p4')).toEqual([]);
    expect(m.row('p3')).toMatchObject({ kills: 1, score: 250 });
  });

  it('a Downed seat that bleeds out, or goes with its Squad, pays nothing more', () => {
    const m = duos();
    m.tick(1, down('p3', 'p1'));
    expect(told(m.tick(30, kill('p3', 'p1', { cause: 'bleedOut', zone: null, weapon: null })), 'p3')).toEqual([]);
    m.tick(40, down('p3', 'p5'));
    expect(told(m.tick(41, kill('p3', 'p5', { cause: 'wipe', zone: null, weapon: null })), 'p3')).toEqual([]);
    expect(m.row('p3')).toMatchObject({ kills: 2, score: 100 + 50 + 100 });
  });

  it('a seat killed outright, with nobody to Revive it, scores as a kill', () => {
    const m = duos();
    m.tick(1, down('p3', 'p1'));
    expect(told(m.tick(20, kill('p3', 'p2')), 'p3')).toEqual(['kill 100']);
  });

  it('a Revive pays 100 to the reviver, and the seat can be Downed for score again', () => {
    const m = duos();
    m.tick(1, down('p3', 'p1'));
    const out = m.tick(5, { type: 'revive', reviver: 'p2', target: 'p1' });
    expect(told(out, 'p2')).toEqual(['revive 100']);
    expect(m.row('p2').score).toBe(100);
    expect(told(m.tick(30, down('p3', 'p1')), 'p3')).toEqual(['down 100']);
  });

  it('placement is no part of Score', () => {
    const m = duos();
    m.tick(1, kill('p3', 'p1'), kill('p3', 'p2'));
    m.tick(20, kill('p5', 'p3'), kill('p5', 'p4'));
    expect(m.mode.result(ctx(21))).toMatchObject({ winner: 3, reason: 'lastSquad' });
    // The winners' mate who did nothing has nothing; the Squad that came second has what its kills paid.
    expect(m.row('p6')).toMatchObject({ place: 1, score: 0 });
    expect(m.row('p5')).toMatchObject({ place: 1, score: 100 + 100 + 50 });
    expect(m.row('p3')).toMatchObject({ place: 2, score: 100 + 50 + 100 + 50 });
  });
});

describe('the score keeper', () => {
  it('gives a seat back from a drop its Score, Assists and Medal', () => {
    const keeper = new ScoreKeeper();
    keeper.start(['a']);
    keeper.rejoin({ id: 'b', team: 2, name: 'b', kills: 3, deaths: 1, score: 450, assists: 2, medal: 'tripleKill' });
    expect(keeper.of('b')).toEqual({ score: 450, assists: 2, medal: 'tripleKill' });
    expect(keeper.of('a')).toEqual({ score: 0, assists: 0 });
    expect(keeper.events()).toEqual([]);
  });
});

describe('score on the wire', () => {
  const SPREAD: readonly SpawnPoint[] = [
    { position: [-25, 0, -25], yaw: 0 },
    { position: [25, 0, -25], yaw: 0 },
    { position: [-25, 0, 25], yaw: Math.PI },
    { position: [25, 0, 25], yaw: Math.PI },
  ];
  const BLUE: readonly SpawnPoint[] = [0, 3].map((x) => ({ position: [x, 0, 20], yaw: Math.PI }));
  const ORANGE: readonly SpawnPoint[] = [0, 3].map((x) => ({ position: [x, 0, -20], yaw: 0 }));

  function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
    return names.map((n) => {
      const c = m.join(n);
      for (let i = 0; i < ticks(3) && (c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
      expect(c.client.status, `${c.name} joined`).toBe('joined');
      return c;
    });
  }

  /** `shooter` fires at `victim`'s head until the server reports the kill. */
  function headshot(m: NetworkedMatch, shooter: NetworkedClient, victim: NetworkedClient): boolean {
    let aim = { yaw: 0, pitch: 0 };
    for (let i = 0; i < ticks(8); i++) {
      const me = shooter.client.self;
      const seen = shooter.client.others().find((p) => p.id === victim.client.id);
      if (!me || !seen) {
        m.step();
        continue;
      }
      const centre = zoneCentre(seen, 'head');
      const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
      aim = { yaw: want.yaw - (me.yaw - aim.yaw), pitch: want.pitch - (me.pitch - aim.pitch) };
      // Single shots, so each one is aimed.
      const out = m.step({ [shooter.name]: usercmd({ ...aim, buttons: i % 12 === 0 ? ['Ads', 'Fire'] : ['Ads'] }) });
      if (out.events.some((e) => e.type === 'kill' && e.victim === victim.client.id)) return true;
    }
    return false;
  }

  const scoreEvents = (c: NetworkedClient) => c.frames.flatMap((f) => f.server.filter((e): e is Extract<ModeEvent, { type: 'score' }> => e.type === 'score'));

  it('a real kill reaches every scoreboard with its Score, and its score event reaches the killer alone, once, over a bad link', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE, ORANGE], mode: 'tdm', latency: 0.08, jitter: 0.02, loss: 0.05, seed: 5 });
    const [a, b, c] = joinAll(m, 'a', 'b', 'c');
    expect(headshot(m, a!, b!)).toBe(true);
    m.run(ticks(1));
    const want = m.server.mode.scores().find((s) => s.id === a!.client.id)!;
    expect(want).toMatchObject({ kills: 1, assists: 0 });
    // The killing bullet was aimed at the head; whatever it hit, the row and the event agree.
    const [event, ...more] = scoreEvents(a!);
    expect(more).toEqual([]);
    expect(event!.player).toBe(a!.client.id);
    // The kill line says who, with what and from how far, for the killer's own Profile.
    expect(event!.lines[0]).toEqual({ reason: 'kill', points: 100, victim: b!.client.id, weapon: 'm4a1', metres: 40 });
    expect(event!.lines.map((l) => l.reason)).toContain('firstBlood');
    expect(event!.lines.reduce((sum, l) => sum + l.points, 0)).toBe(want.score);
    expect(want.score).toBeGreaterThanOrEqual(150);
    for (const client of [a!, b!, c!]) expect(client.client.scores.find((s) => s.id === a!.client.id)).toEqual(want);
    expect(scoreEvents(b!)).toEqual([]);
    expect(scoreEvents(c!)).toEqual([]);
  });

  it('bots earn Score by the same path, and their rows say so', () => {
    const nav = buildNavGraph(WORLD, { area: [[-28, -28], [28, -28], [28, 28], [-28, 28]], spacing: 2 });
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPREAD, teamSpawns: [BLUE, ORANGE], mode: 'tdm', latency: 0, seed: 3, bots: { nav, perTeam: 2 } });
    const [a] = joinAll(m, 'a');
    const kills = () => m.server.mode.scores().reduce((sum, s) => sum + s.kills, 0);
    for (let i = 0; i < ticks(120) && kills() < 4; i++) m.step();
    m.run(ticks(0.5));
    const rows = m.server.mode.scores();
    const bots = a!.client.scores.filter((s) => s.bot);
    expect(bots.length).toBe(3);
    expect(kills()).toBeGreaterThanOrEqual(4);
    // Every kill paid at least its 100 to whoever made it, bot or not.
    for (const s of rows) expect(s.score, s.name).toBeGreaterThanOrEqual(s.kills * 100);
    expect(bots.some((s) => s.kills > 0 && s.score >= 100)).toBe(true);
    // Nobody is told of a bot's Score.
    for (const e of a!.frames.flatMap((f) => f.server)) if (e.type === 'score') expect(e.player).toBe(a!.client.id);
  });
});
