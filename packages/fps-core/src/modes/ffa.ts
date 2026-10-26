import { distance } from '../math';
import type { PlayerId, PlayerInfo, SimEvent, TeamId } from '../simulation';
import type { GameMode, ModeContext, ModeEvent, Score, SpawnPoint } from './game-mode';

export interface FreeForAllOptions {
  /** Kills that win the match; null plays forever. */
  readonly scoreLimit?: number | null;
  /** Seconds between the end of a match and the next one. */
  readonly restartDelay?: number;
}

interface Entry {
  id: PlayerId;
  name: string;
  team: TeamId;
  kills: number;
  deaths: number;
}

/**
 * Free-for-all: everyone on their own team, instant respawn at the spawn
 * point furthest from living enemies, a kill feed, kills and deaths.
 */
export class FreeForAll implements GameMode {
  readonly name = 'Free-for-all';
  readonly respawnDelay = 0;
  readonly #entries = new Map<PlayerId, Entry>();
  #nextTeam = 1;
  readonly #scoreLimit: number | null;
  readonly #restartDelay: number;
  #endedAt: number | null = null;
  #winner: PlayerId | null = null;
  /** Rotates spawns when no living enemy separates them. */
  #nextSpawn = 0;

  constructor(options: FreeForAllOptions = {}) {
    this.#scoreLimit = options.scoreLimit ?? null;
    this.#restartDelay = options.restartDelay ?? 10;
  }

  join(id: PlayerId, name: string): TeamId {
    const team = this.#nextTeam++;
    this.#entries.set(id, { id, name, team, kills: 0, deaths: 0 });
    return team;
  }

  leave(id: PlayerId): void {
    this.#entries.delete(id);
  }

  canDamage(attacker: PlayerInfo, victim: PlayerInfo): boolean {
    return attacker.id !== victim.id;
  }

  chooseSpawn(id: PlayerId, ctx: ModeContext): SpawnPoint {
    const enemies = ctx.players.filter((p) => p.id !== id && p.alive);
    if (enemies.length === 0) {
      const spawn = ctx.spawns[this.#nextSpawn++ % ctx.spawns.length];
      if (!spawn) throw new Error('No spawn points');
      return spawn;
    }
    let best: SpawnPoint | undefined;
    let bestDistance = -1;
    for (const spawn of ctx.spawns) {
      const nearest = Math.min(...enemies.map((e) => distance(e.position, spawn.position)));
      if (nearest > bestDistance) {
        best = spawn;
        bestDistance = nearest;
      }
    }
    if (!best) throw new Error('No spawn points');
    return best;
  }

  onEvents(events: readonly SimEvent[]): ModeEvent[] {
    const out: ModeEvent[] = [];
    const headshots = new Set<PlayerId>();
    for (const e of events) if (e.type === 'hit' && e.killed && e.zone === 'head') headshots.add(e.victim);
    for (const e of events) {
      if (e.type !== 'kill') continue;
      const victim = this.#entries.get(e.victim);
      if (!victim) continue; // a dummy
      victim.deaths += 1;
      const killer = e.killer === null || e.killer === e.victim ? undefined : this.#entries.get(e.killer);
      // Once someone has won, later kills (the same tick, the intermission) no longer score.
      const scoring = this.#winner === null;
      if (killer && scoring) killer.kills += 1;
      out.push({
        type: 'killFeed',
        killer: killer?.id ?? null,
        killerName: killer?.name ?? null,
        victim: victim.id,
        victimName: victim.name,
        cause: e.cause,
        headshot: headshots.has(e.victim),
      });
      if (killer && scoring && this.#scoreLimit !== null && killer.kills >= this.#scoreLimit) {
        this.#winner = killer.id;
      }
    }
    return out;
  }

  update(ctx: ModeContext): { events: ModeEvent[]; restart: boolean } {
    if (this.#winner !== null && this.#endedAt === null) {
      this.#endedAt = ctx.time;
      return { events: [{ type: 'matchEnd', winner: this.#winner, winnerName: this.#entries.get(this.#winner)?.name ?? null }], restart: false };
    }
    if (this.#endedAt !== null && ctx.time - this.#endedAt >= this.#restartDelay) {
      this.#endedAt = null;
      this.#winner = null;
      for (const e of this.#entries.values()) {
        e.kills = 0;
        e.deaths = 0;
      }
      return { events: [{ type: 'matchStart' }], restart: true };
    }
    return { events: [], restart: false };
  }

  scores(): Score[] {
    return [...this.#entries.values()]
      .map((e) => ({ id: e.id, team: e.team, name: e.name, kills: e.kills, deaths: e.deaths, score: e.kills }))
      .sort((a, b) => b.score - a.score || a.deaths - b.deaths);
  }

  winner(): PlayerId | null {
    return this.#winner;
  }
}
