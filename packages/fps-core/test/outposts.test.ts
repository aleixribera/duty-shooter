import { describe, expect, it } from 'vitest';
import { TICK_SECONDS, createWorld, planOutposts, type ModeContext, type ModeEvent, type PlayerOutput, type SpawnPoint, type Vec3, type Zone } from '@duty-shooter/fps-core';
import { CAPTURE_TIME, Outposts, captureRate } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const ZONES: readonly Zone[] = [
  { id: 'A', name: 'West', center: [-30, 0, 0], radius: 5, height: 3 },
  { id: 'B', name: 'Middle', center: [0, 0, 0], radius: 5, height: 3 },
  { id: 'C', name: 'East', center: [30, 0, 0], radius: 5, height: 3 },
];
const SPAWNS: readonly SpawnPoint[] = [
  { position: [-30, 0, 20], yaw: 0 },
  { position: [0, 0, 20], yaw: 0 },
  { position: [30, 0, 20], yaw: 0 },
  { position: [-30, 0, -20], yaw: 0 },
  { position: [0, 0, -20], yaw: 0 },
  { position: [30, 0, -20], yaw: 0 },
];
const WORLD = createWorld([FLOOR]);

/** Blue players b1..b4 (team 1) and orange o1..o4 (team 2), all far from every zone unless placed. */
const ENTRANTS = [1, 2, 3, 4].flatMap((i) => [
  { id: `b${i}`, name: `b${i}`, team: 1 },
  { id: `o${i}`, name: `o${i}`, team: 2 },
]);

/** A running Outposts match: place players, step ticks, read the zones. */
function outposts(options: { scoreLimit?: number | null; timeLimit?: number | null } = {}) {
  const mode = new Outposts(options);
  mode.start(ENTRANTS);
  const at = new Map<string, Vec3>(ENTRANTS.map((e, i) => [e.id, [100 + i * 5, 0, 100] as Vec3]));
  let tick = 0;
  const players = (): PlayerOutput[] => ENTRANTS.map((e) => ({ id: e.id, team: e.team, alive: true, kind: 'player', position: at.get(e.id)! }) as unknown as PlayerOutput);
  const ctx = (): ModeContext => ({ tick, time: tick * TICK_SECONDS, matchTime: tick * TICK_SECONDS, players: players(), spawns: SPAWNS, teamSpawns: null, world: WORLD, zones: ZONES, sites: [], using: new Set() });
  const events: ModeEvent[] = [];
  return {
    mode,
    ctx,
    /** Puts each player at the centre of a zone (by id), or far away (null). */
    place(where: Readonly<Record<string, string | null>>) {
      for (const [id, zone] of Object.entries(where)) {
        const z = ZONES.find((x) => x.id === zone);
        at.set(id, z ? [z.center[0] + (id.charCodeAt(1) - 49) * 0.5, 0, z.center[2]] : [100, 0, 100 + id.charCodeAt(1)]);
      }
    },
    run(seconds: number) {
      for (let i = 0; i < Math.round(seconds / TICK_SECONDS); i++) {
        tick++;
        events.push(...mode.onEvents([], ctx()));
        mode.result(ctx());
      }
    },
    zone: (id: string) => mode.objective().zones.find((z) => z.id === id)!,
    events,
  };
}

describe('Outposts capturing', () => {
  it('takes one player 10 s to capture a neutral zone', () => {
    const m = outposts();
    m.place({ b1: 'A' });
    m.run(CAPTURE_TIME - 0.1);
    expect(m.zone('A')).toMatchObject({ owner: 0, capturing: 1 });
    m.run(0.15);
    expect(m.zone('A')).toMatchObject({ owner: 1, capturing: 0, progress: 0 });
    expect(m.events).toContainEqual({ type: 'capture', zone: 'A', team: 1, previous: 0 });
  });

  it('captures faster with more players, up to twice as fast for three or more', () => {
    expect([1, 2, 3, 4, 6].map(captureRate)).toEqual([1, 1.5, 2, 2, 2]);
    for (const [n, seconds] of [
      [2, CAPTURE_TIME / 1.5],
      [3, CAPTURE_TIME / 2],
      [4, CAPTURE_TIME / 2],
    ] as const) {
      const m = outposts();
      m.place(Object.fromEntries([1, 2, 3, 4].slice(0, n).map((i) => [`b${i}`, 'B'])));
      m.run(seconds - 0.1);
      expect(m.zone('B').owner, `${n} players`).toBe(0);
      m.run(0.15);
      expect(m.zone('B').owner, `${n} players`).toBe(1);
    }
  });

  it('takes twice as long to flip a zone the other team holds', () => {
    const m = outposts();
    m.place({ o1: 'C' });
    m.run(CAPTURE_TIME + 0.1);
    expect(m.zone('C').owner).toBe(2);
    m.place({ o1: null, b1: 'C' });
    m.run(2 * CAPTURE_TIME - 0.1);
    expect(m.zone('C').owner).toBe(2);
    m.run(0.15);
    expect(m.zone('C').owner).toBe(1);
    expect(m.events).toContainEqual({ type: 'capture', zone: 'C', team: 1, previous: 2 });
  });

  it('freezes a zone with both teams inside, and goes on once it is cleared', () => {
    const m = outposts();
    m.place({ b1: 'A' });
    m.run(4);
    const before = m.zone('A').progress;
    m.place({ o1: 'A' });
    m.run(20);
    expect(m.zone('A')).toMatchObject({ owner: 0, capturing: 1, contested: true, progress: before });
    m.place({ o1: null });
    m.run(6.1);
    expect(m.zone('A')).toMatchObject({ owner: 1, contested: false });
  });

  it("drains a capture once the zone empties, and undoes the other team's before starting its own", () => {
    const m = outposts();
    m.place({ b1: 'B' });
    m.run(5);
    m.place({ b1: null });
    m.run(2);
    expect(m.zone('B').progress).toBeCloseTo(0.3, 2);
    m.place({ o1: 'B' });
    m.run(2.9);
    expect(m.zone('B').capturing).toBe(1);
    m.run(0.2);
    expect(m.zone('B').capturing).toBe(2);
  });
});

describe('Outposts scoring', () => {
  it('scores a point a second for each held zone, and nothing for kills', () => {
    const m = outposts();
    m.place({ b1: 'A', b2: 'B', o1: 'C' });
    m.run(CAPTURE_TIME + TICK_SECONDS / 2);
    const team = (t: number) => m.mode.teamScores().find((s) => s.team === t)!.score;
    expect([team(1), team(2)]).toEqual([0, 0]);
    m.run(10);
    expect([team(1), team(2)]).toEqual([20, 10]);
    m.mode.onEvents([{ type: 'kill', killer: 'b1', victim: 'o1', cause: 'bullet', weapon: 'm4a1' } as never], m.ctx());
    expect(team(1)).toBe(20);
    expect(m.mode.scores().find((s) => s.id === 'b1')!.kills).toBe(1);
  });

  it('gives each capturing player points on the scoreboard', () => {
    const m = outposts();
    m.place({ b1: 'A', b2: 'A' });
    m.run(CAPTURE_TIME);
    const row = (id: string) => m.mode.scores().find((s) => s.id === id)!;
    expect(row('b1').score).toBeGreaterThan(0);
    expect(row('b1').score).toBe(row('b2').score);
    expect(row('b3').score).toBe(0);
  });

  it('ends when a team reaches the score limit', () => {
    const m = outposts({ scoreLimit: 30 });
    m.place({ b1: 'A', b2: 'B', b3: 'C' });
    // Three zones held from 10 s on score 3 a second: 30 at 20 s.
    m.run(CAPTURE_TIME + 0.05);
    m.run(9.9);
    expect(m.mode.result(m.ctx())).toBeNull();
    m.run(0.2);
    expect(m.mode.result(m.ctx())).toMatchObject({ winner: 1, winnerName: 'Blue', draw: false, reason: 'scoreLimit' });
  });

  it('at the time limit the leader wins, and a tie is a draw', () => {
    const lead = outposts({ timeLimit: 30 });
    lead.place({ o1: 'B' });
    lead.run(30);
    expect(lead.mode.result(lead.ctx())).toMatchObject({ winner: 2, reason: 'timeLimit' });
    const tie = outposts({ timeLimit: 30 });
    tie.place({ b1: 'A', o1: 'C' });
    tie.run(30);
    expect(tie.mode.result(tie.ctx())).toMatchObject({ winner: null, draw: true, reason: 'timeLimit' });
  });

  it('defaults to 200 points or 600 s', () => {
    const m = new Outposts();
    expect([m.scoreLimit, m.timeLimit, m.killLimit]).toEqual([200, 600, null]);
  });
});

describe('Outposts spawns', () => {
  it("favour the team's held zones, but never within 8 m of a living enemy if another spawn will do", () => {
    const m = outposts();
    m.place({ b1: 'A' });
    m.run(CAPTURE_TIME + 0.1);
    // First spawns of the match go to the team's own set (none here, so anywhere): spawn everyone once.
    for (const e of ENTRANTS) m.mode.chooseSpawn(e.id, m.ctx());
    const spawn = m.mode.chooseSpawn('b2', m.ctx());
    expect(Math.hypot(spawn.position[0] - -30, spawn.position[2] - 0)).toBeLessThanOrEqual(25);
    // An enemy standing on the near spawn sends the next blue spawn elsewhere.
    m.place({ o2: null });
    const ctx = m.ctx();
    const camped = { ...ctx, players: ctx.players.map((p) => (p.id === 'o2' ? { ...p, position: [-30, 0, 18] as Vec3 } : p)) };
    for (let i = 0; i < 3; i++) {
      const s = m.mode.chooseSpawn('b3', camped);
      expect(Math.hypot(s.position[0] - -30, s.position[2] - 18)).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('Outposts on the server', () => {
  it('sends the zones in every snapshot, and the capture to every client', () => {
    const m = createNetworkedMatch({ solids: [FLOOR], spawns: SPAWNS, mode: 'outposts', zones: ZONES, latency: 0.03, seed: 2 });
    const c = m.join('Ada');
    for (let i = 0; i < ticks(1); i++) m.step();
    expect(c.client.match?.objective).toEqual({ kind: 'outposts', zones: ZONES.map((z) => ({ id: z.id, owner: 0, capturing: 0, progress: 0, contested: false })) });
    // Walk to the nearest zone and stand in it.
    const self = () => c.client.self!;
    const nearest = [...ZONES].sort((a, b) => Math.hypot(a.center[0] - self().position[0], a.center[2] - self().position[2]) - Math.hypot(b.center[0] - self().position[0], b.center[2] - self().position[2]))[0]!;
    for (let i = 0; i < ticks(30); i++) {
      const p = self().position;
      const dx = nearest.center[0] - p[0];
      const dz = nearest.center[2] - p[2];
      const far = Math.hypot(dx, dz) > 1;
      m.step({ Ada: { buttons: 0, forward: far ? 1 : 0, right: 0, yaw: Math.atan2(-dx, -dz), pitch: 0, firePresses: [] } });
    }
    const zone = (c.client.match?.objective?.kind === 'outposts' ? c.client.match.objective.zones : []).find((z) => z.id === nearest.id);
    expect(zone?.owner).toBe(c.client.self!.team);
    expect(c.frames.some((f) => f.server.some((e) => e.type === 'capture' && e.zone === nearest.id))).toBe(true);
  });
});

describe('the Outposts bot planner', () => {
  const state = (id: string, owner: number, extra: Partial<{ capturing: number; contested: boolean }> = {}) => ({ id, owner, capturing: 0, progress: 0, contested: false, ...extra });
  const bot = (id: string, x: number) => ({ id, position: [x, 0, 0] as Vec3 });

  it('sends bots to the zones their team does not hold, the nearest first, spreading them out', () => {
    // Two bots by the middle zone: one takes it, the other goes on to the far one rather than doubling up.
    const plan = planOutposts(1, [bot('a', -30), bot('b', -4), bot('c', 4)], ZONES, ZONES.map((z) => state(z.id, 0)));
    expect(Object.fromEntries([...plan].map(([id, z]) => [id, z.id]))).toEqual({ a: 'A', b: 'B', c: 'C' });
  });

  it('keeps one defender on a held zone, and two while the other team is taking it', () => {
    const bots = [bot('a', -30), bot('b', -29), bot('c', -28), bot('d', -27)];
    const quiet = planOutposts(1, bots, ZONES, [state('A', 1), state('B', 1), state('C', 2)]);
    expect([...quiet.values()].filter((z) => z.id === 'A')).toHaveLength(1);
    const threatened = planOutposts(1, bots, ZONES, [state('A', 1, { capturing: 2 }), state('B', 1), state('C', 2)]);
    expect([...threatened.values()].filter((z) => z.id === 'A')).toHaveLength(2);
    expect([...threatened.values()].some((z) => z.id === 'C')).toBe(true);
  });
});
