import type { Vec3 } from '../math';
import type { KillWeapon, PlayerId, SimEvent, TeamId } from '../simulation';
import { STATS } from '../stats';
import { inZone, type ModeEvent, type Score, type Zone } from './game-mode';

const S = STATS.score;

/** Why a seat was given Score: a row of the points table. */
export type ScoreReason =
  | 'kill'
  /** Battle Royale: a Down, which scores as the kill. */
  | 'down'
  /** Battle Royale: the kill of a Downed seat. */
  | 'finish'
  | 'headshot'
  | 'assist'
  | 'longShot'
  | 'melee'
  | 'grenade'
  | 'firstBlood'
  | 'revenge'
  | 'doubleKill'
  | 'tripleKill'
  | 'multiKill'
  | 'streak3'
  | 'streak5'
  | 'streak7'
  | 'streak10'
  | 'zoneKill'
  | 'capture'
  | 'plant'
  | 'defuse'
  | 'revive'
  | 'reboot';

/** The reasons that are a Medal, least first: a scoreboard row carries the best one its seat earned this match. */
export const MEDALS = ['longShot', 'revenge', 'firstBlood', 'doubleKill', 'streak3', 'tripleKill', 'streak5', 'multiKill', 'streak7', 'streak10'] as const satisfies readonly ScoreReason[];
export type Medal = (typeof MEDALS)[number];

/** Whether a reason is a Medal. */
export function isMedal(reason: string): reason is Medal {
  return (MEDALS as readonly string[]).includes(reason);
}

/** The better of two Medals (the later in {@link MEDALS}). */
export function betterMedal(a: Medal | null | undefined, b: Medal | null | undefined): Medal | null {
  if (!a || !b) return a ?? b ?? null;
  return MEDALS.indexOf(a) >= MEDALS.indexOf(b) ? a : b;
}

/** One line of a score event: a reason and what it paid. */
export interface ScoreLine {
  readonly reason: ScoreReason;
  readonly points: number;
  /** Who was killed, Downed or finished, on the lines about them. */
  readonly victim?: PlayerId;
  /** What did it, on the kill or Down line itself (absent for a fall). */
  readonly weapon?: KillWeapon;
  /** How far the bullet flew, in whole metres: on a bullet's kill or Down line, and on its long shot line. */
  readonly metres?: number;
}

/** What the points table pays for each reason. */
export const SCORE_POINTS: Readonly<Record<ScoreReason, number>> = {
  kill: S.kill.value,
  down: S.kill.value,
  finish: S.finish.value,
  headshot: S.headshot.value,
  assist: S.assist.value,
  longShot: S.longShot.value,
  melee: S.melee.value,
  grenade: S.grenade.value,
  firstBlood: S.firstBlood.value,
  revenge: S.revenge.value,
  doubleKill: S.doubleKill.value,
  tripleKill: S.tripleKill.value,
  multiKill: S.multiKill.value,
  streak3: S.streak3.value,
  streak5: S.streak5.value,
  streak7: S.streak7.value,
  streak10: S.streak10.value,
  zoneKill: S.zoneKill.value,
  capture: S.capture.value,
  plant: S.plant.value,
  defuse: S.defuse.value,
  revive: S.revive.value,
  reboot: S.reboot.value,
};

const STREAKS: Readonly<Record<number, ScoreReason>> = { 3: 'streak3', 5: 'streak5', 7: 'streak7', 10: 'streak10' };

interface Row {
  score: number;
  assists: number;
  medal: Medal | null;
  /** Kills since they last died. */
  streak: number;
  /** Kills in the multi-kill under way, and when the last one was (simulation time). */
  chain: number;
  lastKillAt: number;
  /** Who last killed them, until they pay it back. */
  nemesis: PlayerId | null;
}

interface Dealt {
  readonly by: PlayerId;
  readonly at: number;
  readonly damage: number;
}

/** What a mode tells the keeper about a tick. */
export interface ScoreTick {
  /** Simulation time, in seconds. */
  readonly time: number;
  /** Nothing scores once the match is decided. */
  readonly scoring: boolean;
  /** A seat's team, or undefined for one that isn't in the match (a dummy). */
  team(id: PlayerId): TeamId | undefined;
  /** Outposts: the zones, and where a seat stands, for the zone-kill bonus. */
  readonly zones?: readonly Zone[];
  position?(id: PlayerId): Vec3 | undefined;
}

const fresh = (): Row => ({ score: 0, assists: 0, medal: null, streak: 0, chain: 0, lastKillAt: -Infinity, nemesis: null });

/**
 * Every seat's Score for the match, people and bots alike, kept by the mode
 * beside its kills and deaths. It reads a tick's simulation events for the
 * kills and what made each one worth more (see the points table,
 * `STATS.score`), takes the mode's own awards (a capture, a plant), and
 * hands back one `score` event a seat a tick, for that seat's client alone.
 * Score never decides a match: each mode still wins on its own counters.
 */
export class ScoreKeeper {
  readonly #rows = new Map<PlayerId, Row>();
  /** Damage each seat has taken lately, for Assists. */
  readonly #dealt = new Map<PlayerId, Dealt[]>();
  /** Seats that are Downed: their Down already scored as the kill. */
  readonly #downed = new Set<PlayerId>();
  /** The match has had its first kill. */
  #blooded = false;
  #pending = new Map<PlayerId, ScoreLine[]>();

  /** A new match: every row from zero. */
  start(ids: Iterable<PlayerId> = []): void {
    this.#rows.clear();
    this.#dealt.clear();
    this.#downed.clear();
    this.#pending.clear();
    this.#blooded = false;
    for (const id of ids) this.#rows.set(id, fresh());
  }

  join(id: PlayerId): void {
    this.#rows.set(id, fresh());
  }

  leave(id: PlayerId): void {
    this.#rows.delete(id);
    this.#dealt.delete(id);
    this.#downed.delete(id);
    this.#pending.delete(id);
  }

  /** A seat back from a drop: its Score, Assists and Medal as its row had them. */
  rejoin(score: Score): void {
    this.#rows.set(score.id, { ...fresh(), score: score.score, assists: score.assists, medal: score.medal ?? null });
  }

  /** What a seat's scoreboard row says of its Score. */
  of(id: PlayerId): Pick<Score, 'score' | 'assists' | 'medal'> {
    const row = this.#rows.get(id);
    return { score: row?.score ?? 0, assists: row?.assists ?? 0, ...(row?.medal ? { medal: row.medal } : {}) };
  }

  /** Gives `id` a row of the points table: a mode's own award (a capture, a plant, a Reboot). */
  give(id: PlayerId, reason: ScoreReason, about: Pick<ScoreLine, 'victim' | 'weapon' | 'metres'> = {}): void {
    const row = this.#rows.get(id);
    if (!row) return;
    const points = SCORE_POINTS[reason];
    row.score += points;
    if (reason === 'assist') row.assists += 1;
    if (isMedal(reason)) row.medal = betterMedal(row.medal, reason);
    const lines = this.#pending.get(id) ?? [];
    this.#pending.set(id, lines);
    lines.push({ reason, points, ...about });
  }

  /** A tick's simulation events: kills, Downs, Revives, and the damage that makes an Assist. */
  read(events: readonly SimEvent[], tick: ScoreTick): void {
    if (events.length === 0) return;
    // The bullet behind each kill, for its distance: the simulation tells of the kill before the hit.
    let shots: Map<string, number> | null = null;
    for (const e of events) {
      if (e.type !== 'hit' || e.shooter === e.victim || !this.#rows.has(e.victim) || !this.#rows.has(e.shooter)) continue;
      if (e.cause === 'bullet') (shots ??= new Map()).set(`${e.shooter}>${e.victim}`, e.distance);
      if (e.damage <= 0 || this.#downed.has(e.victim)) continue;
      const dealt = this.#dealt.get(e.victim) ?? [];
      this.#dealt.set(e.victim, dealt);
      while (dealt.length > 0 && dealt[0]!.at < tick.time - S.assistWindow.value - 1e-9) dealt.shift();
      dealt.push({ by: e.shooter, at: tick.time, damage: e.damage });
    }
    for (const e of events) {
      if (e.type === 'down') {
        if (!this.#rows.has(e.victim)) continue;
        this.#downed.add(e.victim);
        if (tick.scoring) this.#killed(e.attacker, e.victim, 'down', e, shots, tick);
        this.#dealt.delete(e.victim);
      } else if (e.type === 'kill') {
        const victim = this.#rows.get(e.victim);
        if (!victim) continue;
        const finished = this.#downed.delete(e.victim);
        if (!tick.scoring) {
          // Nothing more scores, but a death still ends a streak.
        } else if (!finished) this.#killed(e.killer, e.victim, 'kill', e, shots, tick);
        else if ((e.cause === 'bullet' || e.cause === 'melee' || e.cause === 'grenade') && this.#enemy(e.killer, e.victim, tick)) this.give(e.killer as PlayerId, 'finish', { victim: e.victim });
        victim.streak = 0;
        this.#dealt.delete(e.victim);
      } else if (e.type === 'revive') {
        this.#downed.delete(e.target);
        this.#dealt.delete(e.target);
        if (tick.scoring) this.give(e.reviver, 'revive');
      }
    }
  }

  /** The score events since the last call: one a seat, its lines in the order they were earned. */
  events(): ModeEvent[] {
    if (this.#pending.size === 0) return [];
    const out: ModeEvent[] = [];
    for (const [player, lines] of this.#pending) out.push({ type: 'score', player, lines });
    this.#pending = new Map();
    return out;
  }

  #enemy(killer: PlayerId | null, victim: PlayerId, tick: ScoreTick): boolean {
    if (killer === null || killer === victim || !this.#rows.has(killer)) return false;
    const team = tick.team(killer);
    return team !== undefined && team !== tick.team(victim);
  }

  /** `by` killed (or Downed) `victimId`: the kill and everything that makes it worth more, and the Assists. */
  #killed(
    by: PlayerId | null,
    victimId: PlayerId,
    reason: 'kill' | 'down',
    how: { readonly cause: string; readonly zone: string | null; readonly weapon: KillWeapon | null },
    shots: ReadonlyMap<string, number> | null,
    tick: ScoreTick,
  ): void {
    const victim = this.#rows.get(victimId);
    if (!victim) return;
    if (!this.#enemy(by, victimId, tick)) return;
    const id = by as PlayerId;
    const killer = this.#rows.get(id)!;
    const distance = how.cause === 'bullet' ? shots?.get(`${id}>${victimId}`) : undefined;
    this.give(id, reason, { victim: victimId, ...(how.weapon ? { weapon: how.weapon } : {}), ...(distance === undefined ? {} : { metres: Math.round(distance) }) });
    if (how.cause === 'bullet' && how.zone === 'head') this.give(id, 'headshot');
    if (distance !== undefined && distance > (how.weapon === 'sniper' ? S.longShotRangeSniper.value : S.longShotRange.value)) this.give(id, 'longShot', { metres: Math.round(distance) });
    if (how.cause === 'melee') this.give(id, 'melee');
    if (how.cause === 'grenade') this.give(id, 'grenade');
    if (!this.#blooded) {
      this.#blooded = true;
      this.give(id, 'firstBlood');
    }
    if (killer.nemesis === victimId) {
      killer.nemesis = null;
      this.give(id, 'revenge');
    }
    killer.chain = tick.time - killer.lastKillAt <= S.multiKillWindow.value + 1e-9 ? killer.chain + 1 : 1;
    killer.lastKillAt = tick.time;
    if (killer.chain === 2) this.give(id, 'doubleKill');
    else if (killer.chain === 3) this.give(id, 'tripleKill');
    else if (killer.chain >= 4) this.give(id, 'multiKill');
    killer.streak += 1;
    const streak = STREAKS[killer.streak];
    if (streak) this.give(id, streak);
    if (tick.zones && tick.zones.length > 0 && tick.position) {
      const at = [tick.position(id), tick.position(victimId)];
      if (tick.zones.some((zone) => at.some((p) => p !== undefined && inZone(zone, p)))) this.give(id, 'zoneKill');
    }
    victim.nemesis = id;
    // Everyone else who hurt them enough, lately enough.
    const since = tick.time - S.assistWindow.value - 1e-9;
    const totals = new Map<PlayerId, number>();
    for (const d of this.#dealt.get(victimId) ?? []) if (d.at >= since && d.by !== id) totals.set(d.by, (totals.get(d.by) ?? 0) + d.damage);
    for (const [helper, damage] of totals) {
      if (damage >= S.assistDamage.value - 1e-9 && this.#enemy(helper, victimId, tick)) this.give(helper, 'assist', { victim: victimId });
    }
  }
}
