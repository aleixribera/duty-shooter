import { FreeForAll } from '../modes/ffa';
import type { GameMode, SpawnPoint } from '../modes/game-mode';
import { GameClient, type ClientFrame } from '../net/client';
import { createMemoryNetwork, type MemoryNetwork, type MemoryNetworkOptions } from '../net/memory';
import { GameServer } from '../net/server';
import { TICK_SECONDS, type PlayerSpawn, type TickOutput } from '../simulation';
import { usercmd, type UserCmd } from '../usercmd';
import { createWorld, type Solid } from '../world';

export interface NetworkedMatchOptions extends MemoryNetworkOptions {
  readonly solids: readonly Solid[];
  readonly spawns: readonly SpawnPoint[];
  readonly dummies?: readonly PlayerSpawn[];
  /** Defaults to free-for-all. */
  readonly mode?: GameMode;
  /** The server's passphrase; defaults to 'letmein'. */
  readonly passphrase?: string;
  readonly maxPlayers?: number;
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
  /** Connects a client that will join with `name` and `passphrase` (the server's by default). */
  join(name: string, options?: { passphrase?: string }): NetworkedClient;
  /** One tick: deliver due messages, step the server, then step every client with its usercmd. */
  step(cmds?: Readonly<Record<string, UserCmd>>): TickOutput;
  run(ticks: number, script?: NetworkedScript): TickOutput[];
  /** The server's outputs of every tick so far. */
  readonly history: readonly TickOutput[];
  client(name: string): NetworkedClient;
}

export function createNetworkedMatch(options: NetworkedMatchOptions): NetworkedMatch {
  const network = createMemoryNetwork(options);
  const passphrase = options.passphrase ?? 'letmein';
  const server = new GameServer(network.server, {
    world: createWorld(options.solids),
    mode: options.mode ?? new FreeForAll(),
    spawns: options.spawns,
    passphrase,
    ...(options.dummies ? { dummies: options.dummies } : {}),
    ...(options.maxPlayers === undefined ? {} : { maxPlayers: options.maxPlayers }),
  });
  const clients = new Map<string, { name: string; client: GameClient; frames: ClientFrame[] }>();
  const history: TickOutput[] = [];

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
    for (const c of clients.values()) c.frames.push(c.client.tick(cmds[c.name] ?? usercmd()));
    return out;
  };

  return {
    server,
    network,
    join(name, joinOptions = {}) {
      if (clients.has(name)) throw new Error(`Client ${name} already joined`);
      const client = new GameClient({ connection: network.connect(), world: createWorld(options.solids), name, passphrase: joinOptions.passphrase ?? passphrase });
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
    client(name) {
      const c = clients.get(name);
      if (!c) throw new Error(`No client ${name}`);
      return view(c);
    },
  };
}
