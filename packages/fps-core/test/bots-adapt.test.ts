import { describe, expect, it, vi } from 'vitest';
import { ADAPT_AFTER, ADAPT_CAP, ADAPT_RAMP, Bot, BotAdapter, FORM_WINDOW, GAP_LIFT, TICK_SECONDS, buildNavGraph, createWorld, formEdge, gapLift, type BotView, type SimEvent, type SpawnPoint } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

const kill = (killer: string, victim: string): SimEvent => ({ type: 'kill', killer, victim, cause: 'bullet', zone: 'upperTorso', weapon: 'm4a1' } as SimEvent);
const person = (id: string) => id.startsWith('p');

/** Steps `a` once a second from `from` to `to` (match seconds, with the match starting at 0). */
function run(a: BotAdapter, from: number, to: number, people: readonly string[], events: (t: number) => SimEvent[] = () => []): void {
  for (let t = from; t <= to; t++) {
    a.hear(events(t), t, person);
    a.step(t, t, people, null);
  }
}

describe('adaptive bots (PLAN 9h)', () => {
  it('asks a sharper edge of a winner and a slower one of a loser, never past the cap', () => {
    expect(formEdge(0, 0)).toBe(0);
    expect(formEdge(4, 1)).toBeGreaterThan(0);
    expect(formEdge(1, 4)).toBeLessThan(0);
    expect(formEdge(100, 0)).toBe(ADAPT_CAP);
    expect(formEdge(0, 100)).toBe(-ADAPT_CAP);
    // One lucky kill moves it, but not far.
    expect(formEdge(1, 0)).toBeLessThan(0.6 * ADAPT_CAP);
  });

  it('changes nothing in the first two minutes, however one-sided they are', () => {
    const a = new BotAdapter();
    run(a, 0, ADAPT_AFTER - 1, ['p1'], (t) => (t % 5 === 0 ? [kill('p1', `b${t}`)] : []));
    expect(a.personEdge('p1')).toBe(0);
    expect(a.edge(2, 'p1')).toBe(0);
  });

  it('moves an edge over about a minute, at most the cap per ramp, and holds it within the cap', () => {
    const a = new BotAdapter();
    const wins = (t: number) => (t % 4 === 0 ? [kill('p1', `b${t}`)] : []);
    run(a, 0, ADAPT_AFTER, ['p1'], wins);
    let last = a.personEdge('p1');
    const step = ADAPT_CAP / ADAPT_RAMP;
    for (let t = ADAPT_AFTER + 1; t <= ADAPT_AFTER + 2 * ADAPT_RAMP; t++) {
      run(a, t, t, ['p1'], wins);
      const now = a.personEdge('p1');
      expect(Math.abs(now - last)).toBeLessThanOrEqual(step + 1e-9);
      expect(now).toBeLessThanOrEqual(ADAPT_CAP);
      last = now;
    }
    expect(a.personEdge('p1')).toBeCloseTo(ADAPT_CAP, 5);
    // Half a minute in, it is about half way.
    const b = new BotAdapter();
    run(b, 0, ADAPT_AFTER + ADAPT_RAMP / 2, ['p1'], wins);
    expect(b.personEdge('p1')).toBeGreaterThan(0.4 * ADAPT_CAP);
    expect(b.personEdge('p1')).toBeLessThan(0.6 * ADAPT_CAP);
  });

  it('slows the bots fighting someone who keeps dying, and forgets fights older than the window', () => {
    const a = new BotAdapter();
    run(a, 0, ADAPT_AFTER + ADAPT_RAMP, ['p1'], (t) => (t % 4 === 0 ? [kill(`b${t}`, 'p1')] : []));
    expect(a.personEdge('p1')).toBeCloseTo(-ADAPT_CAP, 5);
    // Then nothing happens to them for a window: the losses age out and the edge goes back to standard.
    run(a, ADAPT_AFTER + ADAPT_RAMP + 1, ADAPT_AFTER + ADAPT_RAMP + FORM_WINDOW + ADAPT_RAMP + 1, ['p1']);
    expect(a.form('p1', ADAPT_AFTER + ADAPT_RAMP + FORM_WINDOW + ADAPT_RAMP + 1)).toEqual({ won: 0, lost: 0 });
    expect(a.personEdge('p1')).toBe(0);
  });

  it('counts fights for people only, and a Down finished off as one fight', () => {
    const a = new BotAdapter();
    const down: SimEvent = { type: 'down', attacker: 'p1', victim: 'b1', cause: 'bullet', zone: 'head', weapon: 'm4a1' } as SimEvent;
    a.hear([down], 1, person);
    a.hear([{ ...kill('p1', 'b1'), cause: 'bleedOut' } as SimEvent], 2, person);
    a.hear([kill('b2', 'b3'), { type: 'kill', killer: null, victim: 'p1', cause: 'fall', zone: null, weapon: null } as SimEvent], 3, person);
    expect(a.form('p1', 3)).toEqual({ won: 1, lost: 0 });
  });

  it('tunes only the bots fighting that person: a bot fighting a bot plays at its standard', () => {
    const a = new BotAdapter();
    run(a, 0, ADAPT_AFTER + 2 * ADAPT_RAMP, ['p1'], (t) => (t % 4 === 0 ? [kill('p1', `b${t}`)] : []));
    expect(a.edge(2, 'p1')).toBeCloseTo(ADAPT_CAP, 5);
    expect(a.edge(1, 'b7')).toBe(0);
    expect(a.edge(2, 'b8')).toBe(0);
  });

  it('lifts a team trailing by a big score gap a little, and nobody in a mode without teams', () => {
    expect(gapLift(5, 75)).toBe(0);
    expect(gapLift(30, 75)).toBe(GAP_LIFT);
    const a = new BotAdapter();
    for (let t = 0; t <= ADAPT_AFTER + ADAPT_RAMP; t++) a.step(t, t, [], { scores: [{ team: 1, score: 50 }, { team: 2, score: 10 }], limit: 75 });
    expect(a.liftOf(2)).toBeCloseTo(GAP_LIFT, 5);
    expect(a.liftOf(1)).toBe(0);
    expect(a.edge(2, 'b1')).toBeCloseTo(GAP_LIFT, 5);
    const ffa = new BotAdapter();
    for (let t = 0; t <= ADAPT_AFTER + ADAPT_RAMP; t++) ffa.step(t, t, [], null);
    expect(ffa.liftOf(1)).toBe(0);
  });
});

describe('adaptive bots on the server', () => {
  const SPREAD: readonly SpawnPoint[] = [-6, -3, 0, 3, 6].flatMap((x) => [{ position: [x, 0, 20], yaw: Math.PI }, { position: [x, 0, -20], yaw: 0 }] as SpawnPoint[]);
  const nav = buildNavGraph(createWorld([FLOOR]), { area: [[-30, -30], [30, -30], [30, 30], [-30, 30]] });

  it('gives the bots fighting a person who keeps dying a slower edge, leaves their allies alone, and holds the stand-in itself to standard', () => {
    const seen: { time: number; team: number; self: string; alice: number | null; bot: number | null }[] = [];
    const think = Bot.prototype.think;
    const spy = vi.spyOn(Bot.prototype, 'think').mockImplementation(function (this: Bot, view: BotView) {
      const other = view.players.find((p) => p.kind === 'player' && p.id !== view.self.id && p.id !== aliceId && p.team !== view.self.team);
      seen.push({ time: view.time, team: view.self.team, self: view.self.id, alice: view.edge ? view.edge(aliceId) : null, bot: view.edge && other ? view.edge(other.id) : null });
      return think.call(this, view);
    });
    let aliceId = '';
    try {
      const m = createNetworkedMatch({
        solids: [FLOOR],
        spawns: SPREAD,
        teamSpawns: [SPREAD.filter((s) => s.position[2] > 0), SPREAD.filter((s) => s.position[2] < 0)],
        mode: 'tdm',
        // No score gap to speak of: only Alice's form tunes anything.
        modes: { tdm: { killLimit: 10_000, timeLimit: null } },
        countdown: 0,
        bots: { nav, perTeam: 3, alwaysOn: true },
      });
      const alice = m.join('alice');
      for (let i = 0; i < ticks(3) && !alice.latest?.self; i++) m.step();
      aliceId = alice.latest!.self!.id;
      // Alice stands in the open and never fires: she loses every fight she is in.
      m.run(ticks(ADAPT_AFTER + 90));
      const aliceTeam = m.server.latest.players.find((p) => p.id === aliceId)!.team;
      const early = seen.filter((s) => s.time < ADAPT_AFTER - 1);
      expect(early.every((s) => s.alice === 0 && s.bot === 0)).toBe(true);
      const late = seen.filter((s) => s.time > ADAPT_AFTER + 80);
      const enemies = late.filter((s) => s.team !== aliceTeam);
      const allies = late.filter((s) => s.team === aliceTeam);
      expect(enemies.length).toBeGreaterThan(0);
      expect(allies.length).toBeGreaterThan(0);
      for (const s of enemies) {
        expect(s.alice!).toBeLessThan(0);
        expect(s.alice!).toBeGreaterThanOrEqual(-ADAPT_CAP);
        expect(s.bot).toBe(0);
      }
      for (const s of allies) expect(s.bot).toBe(0);
      // Never faster than the ramp, tick to tick.
      const one = seen.filter((s) => s.self === enemies[0]!.self);
      for (let i = 1; i < one.length; i++) expect(Math.abs(one[i]!.alice! - one[i - 1]!.alice!)).toBeLessThanOrEqual((ADAPT_CAP / ADAPT_RAMP) * TICK_SECONDS * 2 + 1e-9);
    } finally {
      spy.mockRestore();
    }
  });

  it('adapts nothing with adapting off, and never a stand-in itself', () => {
    const views: { self: string; edge: boolean }[] = [];
    const think = Bot.prototype.think;
    const spy = vi.spyOn(Bot.prototype, 'think').mockImplementation(function (this: Bot, view: BotView) {
      views.push({ self: view.self.id, edge: view.edge !== undefined });
      return think.call(this, view);
    });
    try {
      const options = { solids: [FLOOR], spawns: SPREAD, mode: 'ffa' as const, countdown: 0 };
      const off = createNetworkedMatch({ ...options, bots: { nav, perTeam: 2, alwaysOn: true, adapt: false } });
      off.run(ticks(1));
      expect(views.length).toBeGreaterThan(0);
      expect(views.some((v) => v.edge)).toBe(false);
      views.length = 0;
      let stand = '';
      const on = createNetworkedMatch({ ...options, bots: { nav, perTeam: 2, alwaysOn: true, standIn: (name) => (stand ||= name) === name } });
      on.run(ticks(1));
      const standId = [...on.server.bots].find(([, s]) => s.name === stand)![0];
      expect(views.filter((v) => v.self === standId).every((v) => !v.edge)).toBe(true);
      expect(views.filter((v) => v.self !== standId).every((v) => v.edge)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
