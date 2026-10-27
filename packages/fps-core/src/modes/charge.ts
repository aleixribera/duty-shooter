import type { Vec3 } from '../math';
import { TICK_SECONDS, type PlayerId, type PlayerInfo, type PlayerOutput, type SimEvent, type TeamId } from '../simulation';
import {
  RESPAWN_DELAY,
  inSite,
  type ChargeState,
  type GameMode,
  type MatchEntrant,
  type MatchResult,
  type ModeContext,
  type ModeEvent,
  type RoundPhase,
  type RoundReason,
  type Score,
  type SpawnPoint,
  type TeamScore,
} from './game-mode';
import { TEAMS, TEAM_NAMES, TeamRoster } from './teams';

export interface ChargeOptions {
  /** Rounds that win the match. Defaults to {@link ROUNDS_TO_WIN}. */
  readonly roundsToWin?: number;
  /** Seconds of play in a round before the defenders win it. Defaults to {@link ROUND_TIME}. */
  readonly roundTime?: number;
  /** Seconds of the opening freeze. Defaults to {@link FREEZE_TIME}. */
  readonly freezeTime?: number;
}

/** Seconds of play in a round, after the freeze. */
export const ROUND_TIME = 90;
/** Seconds from the plant to the detonation. */
export const FUSE_TIME = 40;
/** Seconds of holding use to plant, and to defuse. */
export const PLANT_TIME = 4;
export const DEFUSE_TIME = 6;
/** Seconds everyone is held still at a round's start. */
export const FREEZE_TIME = 5;
/** Seconds the round's result is shown before the next round. */
export const ROUND_END_TIME = 5;
export const ROUNDS_TO_WIN = 4;
/** The sides swap once this many rounds have been played. */
export const SWAP_AFTER = 3;
/** A defender within this distance (m) of the planted charge can defuse it. */
export const DEFUSE_RANGE = 1.5;
/** An attacker within this distance (m) of the dropped charge picks it up. */
export const PICKUP_RANGE = 1.2;
/** Moving this far (m) from where a plant or defuse began cancels it. */
const STILL = 0.3;
/** Scoreboard points for a plant and for a defuse. */
export const PLANT_POINTS = 3;
export const DEFUSE_POINTS = 3;

interface Action {
  readonly player: PlayerId;
  readonly kind: 'plant' | 'defuse';
  /** Seconds held so far. */
  held: number;
  /** Where the player stood when it began. */
  readonly from: Vec3;
  /** The site being planted at. */
  readonly site: string | null;
}

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/**
 * Charge: rounds of plant and defuse between attackers and defenders. One
 * attacker carries the charge, dropped where they die and picked up by any
 * attacker who walks over it; holding use in a site plants it, and holding
 * use beside it defuses it, both cancelled by moving, firing or being hurt.
 * The attackers win a round by the detonation or by killing every defender;
 * the defenders by the defuse, by killing every attacker before the plant, or
 * when the round clock runs out with nothing planted. Nobody respawns within a
 * round; each round starts everyone at their side's spawns, frozen for a
 * moment. The first team to win four rounds wins; sides swap after three.
 */
export class Charge implements GameMode {
  readonly id = 'charge';
  readonly name = 'Charge';
  readonly respawnDelay = RESPAWN_DELAY;
  readonly killLimit = null;
  /** Rounds that win the match: the team scores are rounds won. */
  readonly scoreLimit: number;
  readonly timeLimit = null;
  readonly #roundTime: number;
  readonly #freezeTime: number;
  readonly #roster = new TeamRoster();
  /** Match time (s), as of the last tick. */
  #now = 0;
  #round = 1;
  #attackers: TeamId = TEAMS[0];
  #phase: RoundPhase = 'freeze';
  /** Match time the phase ends. */
  #phaseEnds = 0;
  #carrier: PlayerId | null = null;
  #dropped: Vec3 | null = null;
  #planted: { site: string; position: Vec3 } | null = null;
  #action: Action | null = null;
  #outcome: { winner: TeamId; reason: RoundReason } | null = null;
  readonly #wins = new Map<TeamId, number>();
  /** Counts rounds, so the charge goes to a different attacker each round. */
  #handoffs = 0;
  /** Where each player last stood alive, for a carrier who leaves. */
  readonly #lastSeen = new Map<PlayerId, Vec3>();
  /** Events from between ticks (a carrier leaving), told with the next tick's. */
  #pending: ModeEvent[] = [];
  #result: MatchResult | null = null;

  constructor(options: ChargeOptions = {}) {
    this.scoreLimit = options.roundsToWin ?? ROUNDS_TO_WIN;
    this.#roundTime = options.roundTime ?? ROUND_TIME;
    this.#freezeTime = options.freezeTime ?? FREEZE_TIME;
  }

  join(id: PlayerId, name: string): TeamId {
    return this.#roster.join(id, name, (t) => this.#wins.get(t) ?? 0);
  }

  leave(id: PlayerId): void {
    if (this.#carrier === id) this.#drop(id, this.#lastSeen.get(id) ?? null, this.#pending);
    if (this.#action?.player === id) this.#action = null;
    this.#roster.leave(id);
    this.#lastSeen.delete(id);
  }

  rejoin(score: Score): void {
    this.#roster.rejoin(score);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id && attacker.team !== victim.team;
  }

  /** Never within a round: the next round brings everyone back. */
  canRespawn(): boolean {
    return false;
  }

  frozen(): boolean {
    return this.#phase === 'freeze' && this.#result === null;
  }

  /** The side's own spawns: the attackers always start from the first team set, the defenders from the second. */
  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    const sets = ctx.teamSpawns;
    const sided = sets && this.#attackers !== TEAMS[0] ? { ...ctx, teamSpawns: [sets[1] ?? [], sets[0] ?? []] } : ctx;
    return this.#roster.spawn(id, sided);
  }

  start(entrants: readonly MatchEntrant[]): ReadonlyMap<PlayerId, TeamId> {
    this.#result = null;
    this.#wins.clear();
    this.#lastSeen.clear();
    this.#pending = [];
    this.#now = 0;
    this.#round = 1;
    this.#attackers = TEAMS[0];
    this.#handoffs = 0;
    const teams = this.#roster.start(entrants);
    this.#beginRound();
    return teams;
  }

  /** A round's freeze: the charge to the next attacker in turn, nothing planted. */
  #beginRound(): void {
    this.#phase = 'freeze';
    this.#phaseEnds = this.#now + this.#freezeTime;
    this.#dropped = null;
    this.#planted = null;
    this.#action = null;
    this.#outcome = null;
    const attackers = this.#roster.members(this.#attackers).sort((a, b) => a.order - b.order);
    this.#carrier = attackers.length > 0 ? attackers[this.#handoffs % attackers.length]!.id : null;
    this.#handoffs += 1;
  }

  onEvents(events: readonly SimEvent[], ctx: ModeContext): ModeEvent[] {
    const scoring = this.#result === null;
    const out: ModeEvent[] = [...this.#pending, ...this.#roster.recordKills(events, scoring).feed];
    this.#pending = [];
    if (!scoring) return out;
    this.#now = ctx.matchTime;
    const players = ctx.players.filter((p) => this.#roster.get(p.id));
    for (const p of players) if (p.alive) this.#lastSeen.set(p.id, p.position);
    const of = (id: PlayerId) => players.find((p) => p.id === id);

    // A carrier who died (or is gone) drops the charge where they fell.
    if (this.#carrier !== null && !of(this.#carrier)?.alive) this.#drop(this.#carrier, of(this.#carrier)?.position ?? this.#lastSeen.get(this.#carrier) ?? null, out);
    // Nobody carries it: the attacker who walks over it picks it up (one with nothing dropped gets it handed over).
    if (this.#carrier === null && this.#planted === null && this.#phase !== 'over') {
      const living = players.filter((p) => p.alive && p.team === this.#attackers);
      const dropped = this.#dropped;
      const finder = dropped ? living.find((p) => flat(p.position, dropped) <= PICKUP_RANGE && Math.abs(p.position[1] - dropped[1]) < 1.5) : living[0];
      if (finder) {
        this.#carrier = finder.id;
        this.#dropped = null;
        out.push({ type: 'charge', action: 'pickup', player: finder.id, team: this.#attackers, site: null, position: finder.position });
      }
    }
    this.#act(events, ctx, players, out);
    this.#clock(players, out);
    return out;
  }

  #drop(id: PlayerId, at: Vec3 | null, out: ModeEvent[]): void {
    this.#carrier = null;
    this.#dropped = at;
    if (this.#action?.player === id) this.#action = null;
    if (at) out.push({ type: 'charge', action: 'drop', player: id, team: this.#attackers, site: null, position: at });
  }

  /** Planting and defusing: held use, standing still, not firing and not hurt, carried on or begun. */
  #act(events: readonly SimEvent[], ctx: ModeContext, players: readonly PlayerOutput[], out: ModeEvent[]): void {
    const disturbed = new Set<PlayerId>();
    for (const e of events) {
      if (e.type === 'shot') disturbed.add(e.shooter);
      else if (e.type === 'hit') disturbed.add(e.victim);
      else if (e.type === 'grenade') disturbed.add(e.player);
    }
    for (const p of players) if (p.landing && p.landing.damage > 0) disturbed.add(p.id);
    const able = (p: PlayerOutput | undefined): p is PlayerOutput => p !== undefined && p.alive && ctx.using.has(p.id) && !disturbed.has(p.id);
    const siteOf = (p: PlayerOutput) => ctx.sites.find((s) => inSite(s, p.position)) ?? null;
    const planted = this.#planted;
    const nearCharge = (p: PlayerOutput) => planted !== null && p.team !== this.#attackers && flat(p.position, planted.position) <= DEFUSE_RANGE && Math.abs(p.position[1] - planted.position[1]) < 1.5;

    const action = this.#action;
    if (action) {
      const p = players.find((q) => q.id === action.player);
      const still = p !== undefined && flat(p.position, action.from) <= STILL && Math.abs(p.position[1] - action.from[1]) < STILL;
      const valid =
        able(p) &&
        still &&
        (action.kind === 'plant' ? this.#phase === 'live' && this.#carrier === p.id && siteOf(p)?.id === action.site : this.#phase === 'planted' && nearCharge(p));
      if (!valid) this.#action = null;
    }
    if (!this.#action) {
      const carrier = players.find((p) => p.id === this.#carrier);
      if (this.#phase === 'live' && able(carrier) && siteOf(carrier)) {
        this.#action = { player: carrier.id, kind: 'plant', held: 0, from: carrier.position, site: siteOf(carrier)!.id };
      } else if (this.#phase === 'planted') {
        const defuser = players.find((p) => able(p) && nearCharge(p));
        if (defuser) this.#action = { player: defuser.id, kind: 'defuse', held: 0, from: defuser.position, site: null };
      }
    }
    const a = this.#action;
    if (!a) return;
    a.held += TICK_SECONDS;
    if (a.held < (a.kind === 'plant' ? PLANT_TIME : DEFUSE_TIME) - 1e-9) return;
    this.#action = null;
    const entry = this.#roster.get(a.player);
    const p = players.find((q) => q.id === a.player)!;
    if (a.kind === 'plant') {
      if (entry) entry.points += PLANT_POINTS;
      this.#planted = { site: a.site!, position: p.position };
      this.#carrier = null;
      this.#phase = 'planted';
      this.#phaseEnds = this.#now + FUSE_TIME;
      out.push({ type: 'charge', action: 'plant', player: a.player, team: p.team, site: a.site, position: p.position });
    } else {
      if (entry) entry.points += DEFUSE_POINTS;
      out.push({ type: 'charge', action: 'defuse', player: a.player, team: p.team, site: this.#planted!.site, position: this.#planted!.position });
      this.#endRound(p.team, 'defused', out);
    }
  }

  /** The round's clock and its endings: wipe-outs, the round running out, the detonation, and the next round. */
  #clock(players: readonly PlayerOutput[], out: ModeEvent[]): void {
    const defenders = this.#defenders;
    const side = (team: TeamId) => ({
      members: this.#roster.members(team).length,
      alive: players.filter((p) => p.team === team && p.alive).length,
    });
    // A side wiped out, where it had anyone to lose.
    const wiped = (team: TeamId) => {
      const s = side(team);
      return s.members > 0 && s.alive === 0;
    };
    const due = this.#now >= this.#phaseEnds - 1e-9;
    switch (this.#phase) {
      case 'freeze':
        if (due) {
          this.#phase = 'live';
          this.#phaseEnds += this.#roundTime;
        }
        return;
      case 'live':
        if (wiped(this.#attackers)) this.#endRound(defenders, 'eliminated', out);
        else if (wiped(defenders)) this.#endRound(this.#attackers, 'eliminated', out);
        else if (due) this.#endRound(defenders, 'time', out);
        return;
      case 'planted':
        // Once it is planted, only the defuse saves the defenders; with them all dead the detonation is certain, so the round ends there.
        if (due) {
          out.push({ type: 'charge', action: 'detonate', player: null, team: this.#attackers, site: this.#planted!.site, position: this.#planted!.position });
          this.#endRound(this.#attackers, 'detonated', out);
        } else if (wiped(defenders)) this.#endRound(this.#attackers, 'eliminated', out);
        return;
      case 'over':
        if (!due || this.#result !== null) return;
        if (this.#round === SWAP_AFTER) this.#attackers = defenders;
        this.#round += 1;
        this.#roster.newRound();
        this.#beginRound();
        out.push({ type: 'roundStart', round: this.#round, attackers: this.#attackers });
    }
  }

  #endRound(winner: TeamId, reason: RoundReason, out: ModeEvent[]): void {
    this.#phase = 'over';
    this.#phaseEnds = this.#now + ROUND_END_TIME;
    this.#action = null;
    this.#outcome = { winner, reason };
    const wins = (this.#wins.get(winner) ?? 0) + 1;
    this.#wins.set(winner, wins);
    out.push({ type: 'roundEnd', round: this.#round, winner, reason });
    if (wins >= this.scoreLimit) this.#result = { winner, winnerName: TEAM_NAMES[winner] ?? null, draw: false, reason: 'roundLimit' };
  }

  get #defenders(): TeamId {
    return this.#attackers === TEAMS[0] ? TEAMS[1] : TEAMS[0];
  }

  result(): MatchResult | null {
    return this.#result;
  }

  scores(): Score[] {
    return this.#roster.scores();
  }

  teamScores(): readonly TeamScore[] {
    return TEAMS.map((team) => ({ team, score: this.#wins.get(team) ?? 0 }));
  }

  objective(): ChargeState {
    const a = this.#action;
    return {
      kind: 'charge',
      round: this.#round,
      attackers: this.#attackers,
      phase: this.#phase,
      remaining: Math.max(0, this.#phaseEnds - this.#now),
      carrier: this.#carrier,
      dropped: this.#dropped,
      planted: this.#planted,
      action: a ? { player: a.player, kind: a.kind, progress: Math.min(1, a.held / (a.kind === 'plant' ? PLANT_TIME : DEFUSE_TIME)) } : null,
      outcome: this.#outcome,
    };
  }
}
