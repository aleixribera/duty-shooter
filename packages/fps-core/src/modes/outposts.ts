import { TICK_SECONDS, type PlayerId, type PlayerInfo, type SimEvent, type TeamId } from '../simulation';
import {
  RESPAWN_DELAY,
  inZone,
  type GameMode,
  type MatchEntrant,
  type MatchResult,
  type ModeContext,
  type ModeEvent,
  type ObjectiveState,
  type Score,
  type SpawnPoint,
  type TeamScore,
  type Zone,
  type ZoneState,
} from './game-mode';
import { TEAMS, TEAM_NAMES, TeamRoster } from './teams';

export interface OutpostsOptions {
  /** Team points that win the match; null for none. Defaults to 200. */
  readonly scoreLimit?: number | null;
  /** Seconds a match lasts; null for no limit. Defaults to 600. */
  readonly timeLimit?: number | null;
  /** Draws where players spawn (0 to 1, like `Math.random`, its default). */
  readonly random?: () => number;
}

/**
 * Seconds one player takes to capture a zone, neutral or the other team's.
 * Taking a held zone once took twice as long, and on Survival Town the team
 * that won both zones then held both for 84% of a match (median margin 731
 * points, two shut-outs in twelve bot matches): an attacker had to stand 20 s
 * in the open against defenders running back in (`.scratch/next-level/outposts-lock/`).
 */
export const CAPTURE_TIME = 10;
/** The capture rate grows by this much per extra player in the zone, up to {@link MAX_CAPTURE_RATE}. */
const RATE_PER_PLAYER = 0.5;
const MAX_CAPTURE_RATE = 2;
/** Points a held zone scores its team each second. */
const ZONE_POINTS_PER_SECOND = 1;
/** Spawns this far (m) beyond a held zone's edge count as near it. */
const NEAR_HELD = 20;

/** How fast `players` capture together: 1 for one, up to 2 for three or more. */
export function captureRate(players: number): number {
  return players <= 0 ? 0 : Math.min(MAX_CAPTURE_RATE, 1 + (players - 1) * RATE_PER_PLAYER);
}

interface ZoneRun {
  owner: TeamId;
  capturing: TeamId;
  progress: number;
  contested: boolean;
}

/**
 * Outposts: two teams fight over the map's zones. Standing in a zone captures
 * it, faster with more teammates (see {@link captureRate}), as fast from the
 * other team as from nobody; with both teams inside it is contested and
 * frozen. An empty zone's half-done capture drains away, and so does the
 * other team's progress while the holders stand in it. Every held zone scores
 * its team a point a second; kills score nothing for the team. The first team
 * to the score limit wins, or the leader at the time limit (a tie is a draw).
 * Respawns keep to the team's own side of the map (nearer its own team set
 * than the other's), and there favour its held zones, under the usual safety
 * rules: as in CoD's Domination, a team that holds every zone still comes back
 * from its own end, so the other team always has a front to push and the
 * holders don't appear around the zones from both sides (Survival Town's two
 * zones both sit mid-map, and the side holding both spawned all round them).
 */
export class Outposts implements GameMode {
  readonly id = 'outposts';
  readonly name = 'Outposts';
  readonly respawnDelay = RESPAWN_DELAY;
  readonly killLimit = null;
  readonly scoreLimit: number | null;
  readonly timeLimit: number | null;
  readonly #roster: TeamRoster;
  readonly #zones = new Map<string, ZoneRun>();
  /** The zones of the map being played, as of the last tick. */
  #layout: readonly Zone[] = [];
  readonly #points = new Map<TeamId, number>();
  #result: MatchResult | null = null;

  constructor(options: OutpostsOptions = {}) {
    this.scoreLimit = options.scoreLimit === undefined ? 200 : options.scoreLimit;
    this.timeLimit = options.timeLimit === undefined ? 600 : options.timeLimit;
    this.#roster = new TeamRoster(options.random, true);
  }

  join(id: PlayerId, name: string, _ctx?: ModeContext, side?: TeamId): TeamId {
    return this.#roster.join(id, name, (t) => this.#teamScore(t), side);
  }

  leave(id: PlayerId): void {
    this.#roster.leave(id);
  }

  rejoin(score: Score): void {
    this.#roster.rejoin(score);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id && attacker.team !== victim.team;
  }

  canRespawn(): boolean {
    return true;
  }

  frozen(): boolean {
    return false;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    const team = this.#roster.get(id)?.team ?? TEAMS[0];
    const held = ctx.zones.filter((z) => this.#zones.get(z.id)?.owner === team);
    const near = (s: SpawnPoint) => held.some((z) => Math.hypot(s.position[0] - z.center[0], s.position[2] - z.center[2]) <= z.radius + NEAR_HELD);
    const own = this.#roster.onOwnSide(team, ctx);
    return this.#roster.spawn(id, ctx, (s) => (own(s) ? 2 : 0) + (near(s) ? 1 : 0));
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#result = null;
    this.#zones.clear();
    this.#points.clear();
    return this.#roster.start(entrants);
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    const scoring = this.#result === null;
    const out: ModeEvent[] = this.#roster.recordKills(events, scoring, ctx, ctx.zones).feed;
    if (!scoring) return out;
    this.#layout = ctx.zones;
    for (const zone of ctx.zones) {
      const capture = this.#update(zone, ctx);
      if (capture) out.push(capture);
    }
    for (const zone of ctx.zones) {
      const owner = this.#zones.get(zone.id)?.owner ?? 0;
      if (owner !== 0) this.#points.set(owner, (this.#points.get(owner) ?? 0) + ZONE_POINTS_PER_SECOND * TICK_SECONDS);
    }
    if (this.scoreLimit !== null) {
      const [a, b] = TEAMS;
      const sa = this.#teamScore(a);
      const sb = this.#teamScore(b);
      if (Math.max(sa, sb) >= this.scoreLimit) this.#result = this.#decided(sa, sb, 'scoreLimit');
    }
    out.push(...this.#roster.score.events());
    return out;
  }

  /** A tick of one zone; the capture event when it changes hands. */
  #update(zone: Zone, ctx: ModeContext): ModeEvent | null {
    const run = this.#zones.get(zone.id) ?? { owner: 0, capturing: 0, progress: 0, contested: false };
    this.#zones.set(zone.id, run);
    const inside = ctx.players.filter((p) => p.alive && this.#roster.get(p.id) && inZone(zone, p.position));
    const counts = TEAMS.map((t) => inside.filter((p) => p.team === t).length);
    const present = TEAMS.filter((_, i) => counts[i]! > 0);
    run.contested = present.length > 1;
    if (run.contested) return null;
    const drain = () => {
      if (run.capturing === 0) return;
      run.progress = Math.max(0, run.progress - TICK_SECONDS / CAPTURE_TIME);
      if (run.progress === 0) run.capturing = 0;
    };
    const team = present[0];
    if (team === undefined || team === run.owner) {
      // Nobody, or only the holders: whatever capture was under way drains away.
      drain();
      return null;
    }
    if (run.capturing !== 0 && run.capturing !== team) {
      // The other side's half-done capture has to be undone first.
      drain();
      return null;
    }
    run.capturing = team;
    run.progress += (captureRate(counts[TEAMS.indexOf(team)]!) * TICK_SECONDS) / CAPTURE_TIME;
    if (run.progress < 1 - 1e-9) return null;
    const previous = run.owner;
    run.owner = team;
    run.capturing = 0;
    run.progress = 0;
    for (const p of inside) {
      const entry = this.#roster.get(p.id);
      if (entry && entry.team === team) this.#roster.score.give(p.id, 'capture');
    }
    return { type: 'capture', zone: zone.id, team, previous };
  }

  result(ctx: ModeContext): MatchResult | null {
    if (this.#result === null && this.timeLimit !== null && ctx.matchTime >= this.timeLimit - 1e-9) {
      const [a, b] = TEAMS;
      this.#result = this.#decided(this.#teamScore(a), this.#teamScore(b), 'timeLimit');
    }
    return this.#result;
  }

  #decided(sa: number, sb: number, reason: MatchResult['reason']): MatchResult {
    const [a, b] = TEAMS;
    const winner = sa === sb ? null : sa > sb ? a : b;
    return { winner, winnerName: winner === null ? null : (TEAM_NAMES[winner] ?? null), draw: winner === null, reason };
  }

  scores(): Score[] {
    return this.#roster.scores();
  }

  teamScores(): readonly TeamScore[] {
    return TEAMS.map((team) => ({ team, score: this.#teamScore(team) }));
  }

  objective(): Extract<ObjectiveState, { kind: 'outposts' }> {
    const zones: ZoneState[] = this.#layout.map((z) => {
      const run = this.#zones.get(z.id);
      return { id: z.id, owner: run?.owner ?? 0, capturing: run?.capturing ?? 0, progress: run?.progress ?? 0, contested: run?.contested ?? false };
    });
    return { kind: 'outposts', zones };
  }

  /** A team's whole points so far. */
  #teamScore(team: TeamId): number {
    // Rounded off first, so 200 seconds of a held zone are 200 points.
    return Math.floor((this.#points.get(team) ?? 0) + 1e-6);
  }
}
