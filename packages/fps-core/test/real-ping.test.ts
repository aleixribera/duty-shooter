import { describe, expect, it } from 'vitest';
import { STATS, anglesOf, zoneCentre, type PlayerOutput, type SpawnPoint, type UserCmd } from '@duty-shooter/fps-core';
import { createNetworkedMatch, usercmd, type NetworkedClient, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { FLOOR, ticks } from './support/movement';

/**
 * Online at real ping (PLAN item 3): a WebSocket is TCP, so 2% loss is no lost
 * packet but a late one, a round trip and more behind, with everything after
 * it waiting. At 100 ms and 150 ms of round trip the shooter's hits must
 * count, a moving player must not be pulled back, and others must not jump.
 * `PING_REPORT=1` prints each condition's numbers.
 */
const CONDITIONS = [
  { name: '100 ms, 2% loss', latency: 0.05, jitter: 0.005, loss: 0.02, tcp: true },
  { name: '150 ms, 2% loss', latency: 0.075, jitter: 0.005, loss: 0.02, tcp: true },
] as const;
/** Each condition is played on these seeds: where the losses fall decides what a run meets. */
const SEEDS = [11, 12, 13];
/** Two ticks of Bob's walk, with a margin. */
const STEP_LIMIT = (STATS.movement.walkSpeed.value / 60) * 2.2;
type Condition = (typeof CONDITIONS)[number] & { readonly seed: number };

const LANE: readonly SpawnPoint[] = [
  { position: [0, 0, 0], yaw: 0 },
  { position: [0, 0, -20], yaw: Math.PI },
];

function match(condition: Condition, countdown = 0): NetworkedMatch {
  return createNetworkedMatch({ solids: [FLOOR], spawns: LANE, spawnProtection: 0, countdown, ...condition });
}

function joinAll(m: NetworkedMatch, ...names: string[]): NetworkedClient[] {
  const clients = names.map((n) => m.join(n));
  for (let i = 0; i < ticks(3) && clients.some((c) => c.client.status !== 'joined' || !c.latest?.self); i++) m.step();
  for (const c of clients) expect(c.client.status, `${c.name} joined`).toBe('joined');
  return clients;
}

/** Aims at `target`'s upper torso as the client draws it, cancelling the recoil it predicts on its own view. */
function aimAtSeen(c: NetworkedClient, target: string, last: { yaw: number; pitch: number }) {
  const me = c.client.self!;
  const seen = c.client.others().find((p) => p.id === target)!;
  const centre = zoneCentre(seen, 'upperTorso');
  const want = anglesOf([centre[0] - me.position[0], centre[1] - me.position[1] - me.eyeHeight, centre[2] - me.position[2]]);
  return { yaw: want.yaw - (me.yaw - last.yaw), pitch: want.pitch - (me.pitch - last.pitch) };
}

/** A strafing, sprinting, jumping, crouching walk. */
const walk = (t: number): UserCmd =>
  usercmd({
    forward: t % 120 < 80 ? 1 : -0.5,
    right: Math.sin(t / 25),
    yaw: t * 0.01,
    buttons: [...(t % 200 < 100 ? (['Sprint'] as const) : []), ...(t % 90 === 0 ? (['Jump'] as const) : []), ...(t % 300 > 250 ? (['Crouch'] as const) : [])],
  });

/** Alice taps at strafing Bob as her screen shows him while Bob walks: what the shooter, the mover and the watcher each meet. */
function play(condition: Condition) {
  const m = match(condition);
  const [alice, bob] = joinAll(m, 'alice', 'bob');
  const bobId = bob!.client.id!;
  let aim = { yaw: 0, pitch: 0 };
  const start = m.history.length;
  let worstCorrection = 0;
  let worstStep = 0;
  let steps = 0;
  let jumps = 0;
  let seenBefore: PlayerOutput | undefined;
  let settled = 0;
  let stalled = 0;
  m.run(ticks(30), (t) => {
    // Bob's own view, while he lives: a death or a respawn moves him on purpose.
    const self = bob!.client.self;
    settled = self?.alive ? settled + 1 : 0;
    if (settled > 30) worstCorrection = Math.max(worstCorrection, Math.hypot(...bob!.client.correction));
    const seen = alice!.client.others().find((p) => p.id === bobId);
    // From 3 s in: the first stall teaches the client how far back to draw others.
    if (seen && seenBefore && seen.alive && seenBefore.alive && t - start > 180) {
      const step = Math.hypot(seen.position[0] - seenBefore.position[0], seen.position[2] - seenBefore.position[2]);
      worstStep = Math.max(worstStep, step);
      steps++;
      if (step > STEP_LIMIT) jumps++;
    }
    seenBefore = seen;
    for (const c of [alice!, bob!]) if (c.client.status !== 'joined') stalled++;
    aim = aimAtSeen(alice!, bobId, aim);
    const tap = t % 20 === 0 && t - start > 60 && !!seen?.alive;
    const strafe = Math.floor(t / 45) % 2 === 0 ? 1 : -1;
    return {
      alice: usercmd({ ...aim, buttons: tap ? ['Ads', 'Fire'] : ['Ads'] }),
      bob: usercmd({ yaw: Math.PI, right: strafe }),
    };
  });
  const ticked = m.history.slice(start);
  const shooter = alice!.client.id;
  // A shot that leaves the barrel after Bob's death has reached the server hits nothing: the kill already counted.
  const shots = ticked.filter((o) => o.events.some((e) => e.type === 'shot' && e.shooter === shooter) && o.players.find((p) => p.id === bobId)?.alive).length;
  const hits = ticked.flatMap((o) => o.events).filter((e) => e.type === 'hit' && e.shooter === shooter && e.victim === bobId).length;
  return { shots, hits, agreement: hits / shots, worstCorrection, worstStep, steps, jumps, stalled, ping: alice!.client.ping };
}

/** Bob walks alone: the largest correction his prediction needs. */
function walkAlone(condition: Condition) {
  const m = match(condition);
  const [bob] = joinAll(m, 'bob');
  let worst = 0;
  let visible = 0;
  m.run(ticks(30), (t) => {
    const c = Math.hypot(...bob!.client.correction);
    worst = Math.max(worst, c);
    if (c > 0.05) visible++;
    return { bob: walk(t) };
  });
  return { worst, visibleTicks: visible };
}

/** Bob holds forward from the lobby on, through the match's opening countdown and past its end. */
function walkThroughCountdown(condition: Condition) {
  const m = match(condition, 2);
  const [bob] = joinAll(m, 'bob');
  const ends = bob!.client.match?.countdownEnds ?? null;
  let worst = 0;
  let heldFor = 0;
  const from = bob!.client.self!.position;
  m.run(ticks(4), () => {
    worst = Math.max(worst, Math.hypot(...bob!.client.correction));
    // Where the server has him: when it lets him walk.
    const there = m.server.latest.players.find((p) => p.id === bob!.client.id)!.position;
    if (Math.hypot(there[0] - from[0], there[2] - from[2]) < 1e-6) heldFor = m.server.simulation.time;
    return { bob: usercmd({ forward: 1 }) };
  });
  const moved = Math.hypot(bob!.client.self!.position[0] - from[0], bob!.client.self!.position[2] - from[2]);
  return { ends, heldFor, worst, moved };
}

describe('online at real ping', () => {
  for (const condition of CONDITIONS) {
    it(`counts the shooter's hits and pulls nobody back at ${condition.name}`, () => {
      const runs = SEEDS.map((seed) => ({ duel: play({ ...condition, seed }), alone: walkAlone({ ...condition, seed }) }));
      const shots = runs.reduce((n, r) => n + r.duel.shots, 0);
      const hits = runs.reduce((n, r) => n + r.duel.hits, 0);
      const duel = {
        shots,
        agreement: hits / shots,
        stalled: runs.reduce((n, r) => n + r.duel.stalled, 0),
        worstCorrection: Math.max(...runs.map((r) => r.duel.worstCorrection)),
        worstStep: Math.max(...runs.map((r) => r.duel.worstStep)),
        jumps: runs.reduce((n, r) => n + r.duel.jumps, 0) / runs.reduce((n, r) => n + r.duel.steps, 0),
      };
      const alone = { worst: Math.max(...runs.map((r) => r.alone.worst)), visibleTicks: runs.reduce((n, r) => n + r.alone.visibleTicks, 0) };
      if (process.env['PING_REPORT']) console.info(JSON.stringify({ condition: condition.name, hits, ...duel, alone, pings: runs.map((r) => Math.round(r.duel.ping * 1000)) }));

      expect(duel.shots).toBeGreaterThan(60);
      expect(duel.agreement).toBeGreaterThan(0.9);
      expect(duel.stalled).toBe(0);
      expect(alone.worst).toBeLessThan(0.05);
      // Under fire, the hits he takes nudge him a few centimetres at most.
      expect(duel.worstCorrection).toBeLessThan(0.1);
      // Drawn, Bob moves at most two ticks of his walk in one (the server runs off his late usercmds two a tick),
      // bar the odd stutter when two losses fall together, and never teleports.
      expect(duel.jumps).toBeLessThan(0.005);
      expect(duel.worstStep).toBeLessThan(0.5);

      // Held through the countdown on his own screen as on the server: no pull back when it ends.
      const countdown = walkThroughCountdown({ ...condition, seed: SEEDS[0]! });
      if (process.env['PING_REPORT']) console.info(JSON.stringify({ condition: condition.name, countdown }));
      // He stands until the countdown ends on the server, and walks within a round trip of it.
      expect(countdown.ends).not.toBeNull();
      expect(countdown.heldFor).toBeGreaterThan(countdown.ends! - 0.05);
      expect(countdown.heldFor).toBeLessThan(countdown.ends! + 2 * condition.latency + 0.1);
      expect(countdown.moved).toBeGreaterThan(3);
      expect(countdown.worst).toBeLessThan(0.05);
    });
  }
});
