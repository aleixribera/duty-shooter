import { fallDamage } from './health';
import type { Vec3 } from './math';
import type { MantleBand } from './movement/mantle';
import { createMoveState, pmove, type MoveState, type MovementState, type Stance } from './movement/pmove';
import { STATS } from './stats';
import { usercmd, type UserCmd } from './usercmd';
import type { World } from './world';

/** Simulation rate in ticks per second, identical on client and server. */
export const TICK_RATE = 60;
/** Length of one tick in seconds. */
export const TICK_SECONDS = 1 / TICK_RATE;

export type PlayerId = string;
export type TeamId = number;

export interface PlayerSpawn {
  readonly id: PlayerId;
  readonly team: TeamId;
  /** Feet position in world space (metres). */
  readonly position: Vec3;
  readonly yaw?: number;
  readonly pitch?: number;
}

/** What the simulation reports about one player after a tick. */
export interface PlayerOutput {
  readonly id: PlayerId;
  readonly team: TeamId;
  /** Feet position in world space (metres). */
  readonly position: Vec3;
  /** Velocity in metres per second. */
  readonly velocity: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  /** What the player is doing this tick. */
  readonly movement: MovementState;
  /** The mantle height band while mantling, otherwise null. */
  readonly mantle: MantleBand | null;
  /** The stance the player is in or moving into. */
  readonly stance: Stance;
  /** Eye height above the feet (m); eases between stances over their transition times. */
  readonly eyeHeight: number;
  readonly health: number;
  readonly alive: boolean;
  /** Set only on the tick the player lands: how far they fell (m) and the fall damage taken. */
  readonly landing: Landing | null;
}

export interface Landing {
  readonly fallHeight: number;
  readonly damage: number;
}

/** Everything observable about the match after a tick. Plain data. */
export interface TickOutput {
  /** Number of ticks stepped so far; 0 before the first step. */
  readonly tick: number;
  /** Players in the order they were added. */
  readonly players: readonly PlayerOutput[];
}

/** Usercmds for one tick, keyed by player. A missing entry means no input. */
export type TickCmds = Readonly<Partial<Record<PlayerId, UserCmd>>>;

interface PlayerState {
  readonly id: PlayerId;
  readonly team: TeamId;
  readonly move: MoveState;
  pitch: number;
  health: number;
  landing: Landing | null;
}

/** Turns -0 into 0 so outputs compare cleanly with deep equality. */
function clean(v: Vec3): Vec3 {
  return [v[0] + 0, v[1] + 0, v[2] + 0];
}

/**
 * The fixed-tick, deterministic simulation. Steps one tick at a time from a
 * set of usercmds; the same world, players and cmds always give the same
 * outputs.
 */
export class Simulation {
  readonly world: World;
  #tick = 0;
  readonly #players = new Map<PlayerId, PlayerState>();

  constructor(world: World) {
    this.world = world;
  }

  get tick(): number {
    return this.#tick;
  }

  addPlayer(spawn: PlayerSpawn): void {
    if (this.#players.has(spawn.id)) {
      throw new Error(`Player ${spawn.id} is already in the simulation`);
    }
    this.#players.set(spawn.id, {
      id: spawn.id,
      team: spawn.team,
      move: createMoveState(spawn.position, spawn.yaw ?? 0),
      pitch: spawn.pitch ?? 0,
      health: STATS.health.max.value,
      landing: null,
    });
  }

  removePlayer(id: PlayerId): void {
    this.#players.delete(id);
  }

  /** Advances the simulation by one tick and returns the resulting outputs. */
  step(cmds: TickCmds = {}): TickOutput {
    for (const player of this.#players.values()) {
      // No usercmd means no input; the view keeps its last angles.
      // A dead player's input is ignored apart from the view.
      const sent = cmds[player.id];
      const alive = player.health > 0;
      const cmd = sent && alive ? sent : usercmd({ yaw: sent?.yaw ?? player.move.yaw, pitch: sent?.pitch ?? player.pitch });
      player.pitch = cmd.pitch;
      pmove(player.move, cmd, this.world, TICK_SECONDS);
      player.landing = null;
      const fell = player.move.landedFrom;
      if (fell !== null) {
        const damage = alive ? fallDamage(fell) : 0;
        player.health = Math.max(0, player.health - damage);
        player.landing = { fallHeight: fell, damage };
      }
    }
    this.#tick += 1;
    return this.output();
  }

  /** The outputs as of the last step. */
  output(): TickOutput {
    return {
      tick: this.#tick,
      players: [...this.#players.values()].map((p) => ({
        id: p.id,
        team: p.team,
        position: clean(p.move.position),
        velocity: clean(p.move.velocity),
        yaw: p.move.yaw,
        pitch: p.pitch,
        movement: p.move.movement,
        mantle: p.move.mantleBand,
        stance: p.move.stance,
        eyeHeight: p.move.eyeHeight,
        health: p.health,
        alive: p.health > 0,
        landing: p.landing,
      })),
    };
  }
}
