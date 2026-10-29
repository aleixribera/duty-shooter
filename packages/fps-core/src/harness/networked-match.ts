import type { ModeEvent, ModeId, SpawnPoint } from '../modes/game-mode';
import { GameClient, type ClientFrame } from '../net/client';
import { createMemoryNetwork, type MemoryNetwork, type MemoryNetworkOptions } from '../net/memory';
import { GameServer, type BotOptions, type GameServerOptions, type LobbyEvent } from '../net/server';
import { TICK_SECONDS, type PlayerSpawn, type TickOutput } from '../simulation';
import { usercmd, type UserCmd } from '../usercmd';
import type { Loadout } from '../weapon/loadout';
import { createWorld, type Ladder, type Solid } from '../world';

export interface NetworkedMatchOptions extends MemoryNetworkOptions {
  readonly solids: readonly Solid[];
  readonly ladders?: readonly Ladder[];
  readonly spawns: readonly SpawnPoint[];
  /** One spawn set per team, for team deathmatch. */
  readonly teamSpawns?: readonly (readonly SpawnPoint[])[];
  readonly dummies?: readonly PlayerSpawn[];
  /** The mode the server starts in. Defaults to free-for-all (the live server defaults to team deathmatch). */
  readonly mode?: ModeId;
  readonly modes?: GameServerOptions['modes'];
  /** The map's Outposts zones. */
  readonly zones?: GameServerOptions['zones'];
  /** The map's Charge sites. */
  readonly sites?: GameServerOptions['sites'];
  readonly intermission?: { readonly nuke?: number; readonly vote?: number };
  /** The server's passphrase; defaults to 'letmein'. */
  readonly passphrase?: string;
  readonly maxPlayers?: number;
  readonly idleTimeout?: number;
  readonly bots?: BotOptions;
  readonly spawnProtection?: number;
  /** Seconds each match opens with, everyone held. 0 by default here, so a test plays from its first tick; the game's servers use MATCH_COUNTDOWN. */
  readonly countdown?: number;
  readonly reconnectGrace?: number;
  /** The map id the server reports. */
  readonly map?: string;
  readonly onLog?: (event: LobbyEvent) => void;
  /** Run a lobby between matches, with a host who starts them. */
  readonly lobby?: boolean;
  /** Humans vs bots from the start. */
  readonly hvb?: boolean;
  /** More maps the lobby's host may pick. */
  readonly maps?: GameServerOptions['maps'];
  /** The first map's team size by mode. */
  readonly teamSize?: GameServerOptions['teamSize'];
}

/** A client in the match, with every frame it produced. */
export interface NetworkedClient {
  readonly name: string;
  readonly client: GameClient;
  readonly frames: readonly ClientFrame[];
  readonly latest: ClientFrame | null;
}

/** Usercmds for one tick, keyed by client name. Clients without an entry send no input. */
export type NetworkedScript = (tick: number) => Readonly<Record<string, UserCmd>>;

/**
 * The headless match extended across the network: the real server and any
 * number of predicting clients from fps-core, connected through the
 * in-memory transport with latency, jitter and loss, all on one virtual clock.
 */
export interface NetworkedMatch {
  readonly server: GameServer;
  readonly network: MemoryNetwork;
  /** Connects a client that will join with `name` and `passphrase` (the server's by default), optionally asking for a mode. */
  join(name: string, options?: { passphrase?: string; mode?: ModeId; bots?: number; resume?: string; script?: boolean; loadout?: Loadout }): NetworkedClient;
  /** One tick: deliver due messages, step the server, then step every client with its usercmd. */
  step(cmds?: Readonly<Record<string, UserCmd>>): TickOutput;
  run(ticks: number, script?: NetworkedScript): TickOutput[];
  /** The server's outputs of every tick so far. */
  readonly history: readonly TickOutput[];
  /** The server's game-mode events (kill feed, match end and start) of every tick so far, aligned with `history`. */
  readonly modeHistory: readonly (readonly ModeEvent[])[];
  client(name: string): NetworkedClient;
}

export function createNetworkedMatch(options: NetworkedMatchOptions): NetworkedMatch {
  const network = createMemoryNetwork(options);
  const passphrase = options.passphrase ?? 'letmein';
  const server = new GameServer(network.server, {
    world: createWorld(options.solids, { ladders: options.ladders ?? [] }),
    mode: options.mode ?? 'ffa',
    spawns: options.spawns,
    ...(options.teamSpawns ? { teamSpawns: options.teamSpawns } : {}),
    ...(options.modes ? { modes: options.modes } : {}),
    ...(options.zones ? { zones: options.zones } : {}),
    ...(options.sites ? { sites: options.sites } : {}),
    ...(options.intermission ? { intermission: options.intermission } : {}),
    passphrase,
    ...(options.dummies ? { dummies: options.dummies } : {}),
    ...(options.maxPlayers === undefined ? {} : { maxPlayers: options.maxPlayers }),
    ...(options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout }),
    ...(options.bots ? { bots: options.bots } : {}),
    ...(options.spawnProtection === undefined ? {} : { spawnProtection: options.spawnProtection }),
    countdown: options.countdown ?? 0,
    ...(options.reconnectGrace === undefined ? {} : { reconnectGrace: options.reconnectGrace }),
    ...(options.map ? { map: options.map } : {}),
    ...(options.onLog ? { onLog: options.onLog } : {}),
    ...(options.lobby ? { lobby: true } : {}),
    ...(options.hvb ? { hvb: true } : {}),
    ...(options.teamSize ? { teamSize: options.teamSize } : {}),
    ...(options.maps ? { maps: options.maps } : {}),
  });
  const clients = new Map<string, { name: string; client: GameClient; frames: ClientFrame[] }>();
  const history: TickOutput[] = [];
  const modeHistory: (readonly ModeEvent[])[] = [];

  const view = (c: { name: string; client: GameClient; frames: ClientFrame[] }): NetworkedClient => ({
    name: c.name,
    client: c.client,
    frames: c.frames,
    get latest() {
      return c.frames.at(-1) ?? null;
    },
  });

  const step = (cmds: Readonly<Record<string, UserCmd>> = {}): TickOutput => {
    network.advance(TICK_SECONDS);
    const out = server.tick();
    history.push(out);
    modeHistory.push(server.modeEvents);
    for (const c of clients.values()) c.frames.push(c.client.tick(cmds[c.name] ?? usercmd()));
    return out;
  };

  return {
    server,
    network,
    join(name, joinOptions = {}) {
      // A name whose client has closed may join again (coming back after a drop).
      if (clients.get(name)?.client.status === 'joined') throw new Error(`Client ${name} already joined`);
      const client = new GameClient({
        connection: network.connect(),
        world: createWorld(options.solids, { ladders: options.ladders ?? [] }),
        name,
        passphrase: joinOptions.passphrase ?? passphrase,
        ...(joinOptions.mode ? { mode: joinOptions.mode } : {}),
        ...(joinOptions.bots === undefined ? {} : { bots: joinOptions.bots }),
        ...(joinOptions.resume ? { resume: joinOptions.resume } : {}),
        ...(joinOptions.script ? { script: true } : {}),
        ...(joinOptions.loadout ? { loadout: joinOptions.loadout } : {}),
      });
      const entry = { name, client, frames: [] as ClientFrame[] };
      clients.set(name, entry);
      return view(entry);
    },
    step,
    run(ticks, script = () => ({})) {
      const outs: TickOutput[] = [];
      for (let i = 0; i < ticks; i++) outs.push(step(script(history.length + 1)));
      return outs;
    },
    get history() {
      return history;
    },
    get modeHistory() {
      return modeHistory;
    },
    client(name) {
      const c = clients.get(name);
      if (!c) throw new Error(`No client ${name}`);
      return view(c);
    },
  };
}
