import { describe, expect, it } from 'vitest';
import { TickProfiler, causeOf, noFacts, type SlowTick } from '../src/net/tick-profile';
import { createNetworkedMatch } from '../src/harness/networked-match';
import type { TickFacts, TickProbe } from '../src/net/tick-profile';

/** A profiler on a hand-turned clock. */
function rig(slowMs = 8) {
  const clock = { now: 1000, cpu: 0 };
  const slow: SlowTick[] = [];
  const profiler = new TickProfiler({ now: () => clock.now, cpu: () => clock.cpu, slowMs, settleMs: 50, onSlow: (tick) => slow.push(tick) });
  const spend = (ms: number, onCpu = ms) => {
    clock.now += ms;
    clock.cpu += onCpu;
  };
  return { clock, slow, profiler, spend };
}

describe('tick profiler', () => {
  it('stays quiet about a tick under the line', () => {
    const { profiler, slow, spend } = rig();
    profiler.start();
    spend(3);
    profiler.phase('sim');
    profiler.end(noFacts());
    spend(100);
    profiler.flush();
    expect(slow).toEqual([]);
    expect(profiler.takeCauses()).toEqual({});
  });

  it('names the phase and the bot that took the time', () => {
    const { profiler, slow, spend } = rig();
    profiler.start();
    spend(1);
    profiler.phase('input');
    spend(0.5);
    profiler.thought('bot-a', 'roam');
    spend(9);
    profiler.thought('bot-b', 'flank');
    profiler.phase('think');
    spend(1);
    profiler.phase('sim');
    profiler.end({ ...noFacts(), plans: 4 });
    spend(100);
    profiler.flush();
    expect(slow).toHaveLength(1);
    expect(slow[0]).toMatchObject({ wall: 11.5, cpu: 11.5, cause: 'work:think', slowestBot: { id: 'bot-b', state: 'flank', ms: 9 }, facts: { plans: 4 } });
    expect(slow[0]!.phases['think']).toBe(9.5);
    expect(profiler.takeCauses()).toEqual({ 'work:think': 1 });
  });

  it('calls a tick that lost the CPU a stall, whichever phase it was in', () => {
    const { profiler, slow, spend } = rig();
    profiler.start();
    spend(30, 2);
    profiler.phase('sim');
    profiler.end(noFacts());
    spend(100);
    profiler.flush();
    expect(slow[0]).toMatchObject({ wall: 30, cpu: 2, cause: 'stall' });
  });

  it('holds a slow tick until the collector has had time to report, then blames the pause inside it', () => {
    const { profiler, slow, spend, clock } = rig();
    profiler.start();
    const from = clock.now;
    spend(12);
    profiler.phase('sim');
    profiler.end(noFacts());
    profiler.flush();
    expect(slow).toEqual([]);
    profiler.gc(from + 2, 9, 'major');
    profiler.gc(from + 500, 9, 'major');
    spend(60);
    profiler.flush();
    expect(slow[0]).toMatchObject({ cause: 'gc:major', gc: [{ kind: 'major', ms: 9 }] });
  });

  it('forgets a collection once nothing can overlap it', () => {
    const { profiler, spend } = rig();
    for (let i = 0; i < 2000; i++) {
      profiler.gc(i, 1, 'minor');
      spend(10);
      profiler.flush();
    }
    expect(profiler.heldCollections).toBeLessThan(20);
  });

  it('tells causes apart from what the tick did', () => {
    const base: Omit<SlowTick, 'cause'> = { at: 0, wall: 20, cpu: 20, lag: 0, phases: { sim: 15, send: 5 }, slowestBot: null, facts: noFacts(), gc: [] };
    expect(causeOf(base)).toBe('work:sim');
    expect(causeOf({ ...base, cpu: 8 })).toBe('stall');
    expect(causeOf({ ...base, gc: [{ kind: 'minor', ms: 10, offset: 0 }] })).toBe('gc:minor');
    // A parallel collection leaves the game's thread waiting, off the CPU: still the collector's.
    expect(causeOf({ ...base, cpu: 8, gc: [{ kind: 'major', ms: 12, offset: 0 }] })).toBe('gc:major');
  });
});

describe('the game server under a probe', () => {
  it('reports every phase in order, once a tick, with what the tick did', () => {
    const seen: string[][] = [];
    const facts: TickFacts[] = [];
    let current: string[] = [];
    const probe: TickProbe = {
      start: () => (current = []),
      phase: (name) => current.push(name),
      thought: () => undefined,
      end: (tick) => {
        seen.push(current);
        facts.push({ ...tick, modeEvents: [...tick.modeEvents] });
      },
    };
    const m = createNetworkedMatch({ solids: [], spawns: [{ position: [0, 0, 0], yaw: 0 }, { position: [5, 0, 5], yaw: 0 }], probe });
    m.join('one');
    m.join('two');
    for (let i = 0; i < 10; i++) m.step();
    expect(seen.length).toBeGreaterThanOrEqual(10);
    expect(seen.at(-1)).toEqual(['input', 'plan', 'think', 'sim', 'mode', 'events', 'send']);
    expect(facts.at(-1)!.snapshots).toBe(2);
    expect(facts.at(-1)!.bytes).toBeGreaterThan(0);
  });
});
