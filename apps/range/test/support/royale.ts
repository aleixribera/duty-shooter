import { DEG, WIDE_MAP, WIDE_SCALE, botProfile, botSees, createWorld, zoneCentre, type BotProfile, type MatchResult, type PlayerOutput, type World } from '@duty-shooter/fps-core';
import type { BattleRoyale, SquadSize } from '@duty-shooter/fps-core/modes';
import { createNetworkedMatch, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { buildMapById, mapConcealment, mapSolids } from '../../src/map/maps';
import { islandNav } from './island-nav';

/** The island, once for a test file: building it takes a second or two, and its nav more. */
export function island() {
  const map = buildMapById('zero-island');
  const solids = mapSolids(map);
  const world: World = createWorld(solids, { terrain: map.terrain, concealment: mapConcealment(map), traps: map.soundTraps ?? [] });
  return { map, solids, world, nav: islandNav(map) };
}

export type Island = ReturnType<typeof island>;

/** A Revive as it started, and how it ended. */
export interface ReviveStart {
  readonly afterDown: number;
  readonly anySight: boolean;
  readonly knownSight: boolean;
  ended: 'done' | 'interrupted' | 'open';
}

/** Sight (m) an enemy is counted as having of a reviver within. */
const SIGHT = 70;
/** A Squad knows of an enemy it saw, heard or was told of this recently (s). */
const KNOWN = 10;

/** A seat's end, as a soak reads it. */
export interface Death {
  readonly time: number;
  readonly victim: string;
  readonly killer: string | null;
  readonly cause: string;
}

/** What a whole match came to. */
export interface RoyaleRun {
  readonly size: SquadSize;
  readonly seed: number;
  readonly result: MatchResult | null;
  /** Seconds of match when it ended. */
  readonly length: number;
  /** The highest Stage played. */
  readonly stage: number;
  readonly deaths: readonly Death[];
  readonly downs: number;
  readonly revives: number;
  /** Seconds from going Down to being Finished by an enemy, one entry per Finish (ticket 54). */
  readonly finishes: readonly number[];
  /** Tick cost (ms) over the match, of the server alone; `late` counts ticks over a frame (16.7 ms). */
  readonly tick: { readonly mean: number; readonly p99: number; readonly worst: number; readonly late: number };
  /** Every Revive started (ticket 64): how long after the Down, whether an enemy had sight of the reviver as it started (any, and one its Squad knew of in the last 10 s), and how it ended. */
  readonly reviveStarts: readonly ReviveStart[];
  /** Seconds of match at which each Squad was out, in order: how the field thinned. */
  readonly squadsOut: readonly number[];
  /** The longest (s) a standing bot roamed without moving 1.5 m, and who. */
  readonly stuck: { readonly seconds: number; readonly who: string };
  /** How the stand-in for a good player did, if there was one. */
  readonly good: { readonly won: boolean; readonly place: number | null; readonly kills: number } | null;
}

/**
 * A proxy for a good player, and only a proxy: a bot with a good player's hands
 * (fast reaction, tight aim, steady recoil) on the ordinary bot brain. No person
 * has been measured against these bots. It plays positions no better than they
 * do, so a real good player's edge may be larger, and their mistakes different.
 */
export function goodPlayer(name: string): BotProfile {
  return {
    ...botProfile(name),
    style: 'flanker',
    loadout: { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' },
    reaction: 0.2,
    aimError: 1.5 * DEG,
    wobble: 0.15,
    aimBias: 0,
    overshoot: 0.1,
    perceptionLag: 0.1,
    tracking: 0.95,
    turnRate: 400 * DEG,
    recoilControl: 0.9,
    aggression: 0.55,
    headshots: 0.35,
    fightRange: 18,
  };
}

export interface RoyaleOptions {
  readonly size: SquadSize;
  readonly seed: number;
  /** Seconds a match lasts at most, so the Ring keeps to it. Defaults to the stats file's. */
  readonly timeLimit?: number;
  /** Puts {@link goodPlayer} in the first bot's seat. */
  readonly good?: boolean;
  /** Called after each tick. */
  readonly each?: (m: NetworkedMatch, out: { readonly players: readonly PlayerOutput[] }, matchTime: number) => void;
}

/** Plays one Battle Royale on the island, bots in every seat, on the scale a real server uses. */
export function playRoyale(isle: Island, { size, seed, timeLimit, good, each }: RoyaleOptions): RoyaleRun {
  let hands: BotProfile | null = null;
  const profile = (name: string, base: BotProfile) => {
    if (!good || hands) return base;
    hands = goodPlayer(name);
    return hands;
  };
  const m = createNetworkedMatch({
    solids: isle.solids,
    terrain: isle.map.terrain!,
    concealment: isle.world.concealment,
    traps: isle.world.traps,
    spawns: isle.map.spawns.ffa,
    mode: 'battle-royale',
    modes: { battleRoyale: { squadSize: size, seed, ...(timeLimit === undefined ? {} : { timeLimit }) } },
    bots: { nav: isle.nav, perTeam: 30, alwaysOn: true, profile },
    teamSize: { 'battle-royale': 30 },
    maxPlayers: 60,
    net: WIDE_MAP,
    scale: WIDE_SCALE,
  });
  m.step();
  const mode = m.server.mode as BattleRoyale;
  const limit = mode.timeLimit;
  const deaths: Death[] = [];
  const costs: number[] = [];
  let result: MatchResult | null = null;
  let stage = 1;
  let downs = 0;
  let revives = 0;
  const downedAt = new Map<string, number>();
  const finishes: number[] = [];
  const reviveStarts: ReviveStart[] = [];
  const reviving = new Map<string, ReviveStart>();
  const still = new Map<string, { x: number; z: number; since: number }>();
  let stuck = { seconds: 0, who: '' };
  let teams: Set<number> | null = null;
  const squadsOut: number[] = [];
  let matchTime = 0;
  for (let tick = 0; tick < (limit + 2) * 60 && !result; tick++) {
    const t0 = performance.now();
    const out = m.step();
    costs.push(performance.now() - t0);
    // A whole match's outputs would fill the heap; a soak reads each once.
    (m.history as unknown[]).length = 0;
    (m.modeHistory as unknown[]).length = 0;
    matchTime = tick / 60;
    for (const e of out.events) {
      if (e.type === 'kill') {
        deaths.push({ time: matchTime, victim: e.victim, killer: e.killer, cause: e.cause });
        const since = downedAt.get(e.victim);
        if (since !== undefined && e.cause !== 'bleedOut' && e.cause !== 'wipe') finishes.push(matchTime - since);
        downedAt.delete(e.victim);
      } else if (e.type === 'down') {
        downs += 1;
        downedAt.set(e.victim, matchTime);
      } else if (e.type === 'revive') {
        revives += 1;
        downedAt.delete(e.target);
        const r = reviving.get(e.target);
        if (r) r.ended = 'done';
        reviving.delete(e.target);
      }
    }
    for (const p of out.players) {
      const open = reviving.get(p.id);
      if (open && (!p.alive || !p.downed || p.downed.revive === 0)) {
        if (open.ended === 'open') open.ended = 'interrupted';
        reviving.delete(p.id);
      }
      if (!p.alive || !p.downed || p.downed.revive === 0 || reviving.has(p.id)) continue;
      const by = m.server.simulation.playerState(p.id)?.downed?.revive?.by;
      const reviver = by ? out.players.find((q) => q.id === by) : undefined;
      if (!reviver) continue;
      const chest = zoneCentre({ position: reviver.position, yaw: reviver.yaw, stance: reviver.stance, eyeHeight: reviver.eyeHeight }, 'upperTorso');
      let anySight = false;
      let knownSight = false;
      for (const q of out.players) {
        if (!q.alive || q.downed || q.team === p.team || Math.hypot(q.position[0] - reviver.position[0], q.position[2] - reviver.position[2]) > SIGHT) continue;
        if (!botSees(isle.world, [q.position[0], q.position[1] + q.eyeHeight, q.position[2]], chest)) continue;
        anySight = true;
        const known = out.players.some((mate) => mate.team === p.team && mate.alive && ((k) => k !== null && matchTime - k.time < KNOWN)(m.server.bots.get(mate.id)?.bot.recall(q.id) ?? null));
        if (known) knownSight = true;
      }
      const start: ReviveStart = { afterDown: matchTime - (downedAt.get(p.id) ?? matchTime), anySight, knownSight, ended: 'open' };
      reviveStarts.push(start);
      reviving.set(p.id, start);
    }
    if (tick % 30 === 0) {
      const now = new Set(out.players.filter((p) => p.alive).map((p) => p.team));
      if (teams && now.size > 0) for (const t of teams) if (!now.has(t)) squadsOut.push(matchTime);
      if (now.size > 0) teams = now;
      for (const p of out.players) {
        const activity = m.server.bots.get(p.id)?.bot.activity;
        // A spell Down or out is no time stood still: the clock starts again once up.
        if (!p.alive || p.downed || activity === undefined) {
          still.delete(p.id);
          continue;
        }
        const [x, , z] = p.position;
        const s = still.get(p.id);
        if (!s || activity !== 'roam' || Math.hypot(x - s.x, z - s.z) > 1.5) still.set(p.id, { x, z, since: matchTime });
        else if (matchTime - s.since > stuck.seconds) stuck = { seconds: matchTime - s.since, who: `${p.id} at ${x.toFixed(0)},${z.toFixed(0)}` };
      }
    }
    for (const e of m.server.modeEvents) {
      if (e.type === 'matchEnd') result = e;
      if (e.type === 'stage') stage = Math.max(stage, e.stage);
    }
    each?.(m, out, matchTime);
  }
  const mean = costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length);
  costs.sort((a, b) => a - b);
  const seat = [...m.server.bots].find(([, b]) => b.bot.profile === hands)?.[0];
  const score = m.server.mode.scores().find((s) => s.id === seat);
  return {
    size,
    seed,
    result,
    length: matchTime,
    stage,
    deaths,
    downs,
    revives,
    finishes,
    tick: { mean, p99: costs[Math.floor(costs.length * 0.99)]!, worst: costs.at(-1)!, late: costs.filter((c) => c > 1000 / 60).length },
    reviveStarts,
    squadsOut,
    stuck,
    good: good && score ? { won: score.team === result?.winner, place: score.place ?? null, kills: score.kills } : null,
  };
}
