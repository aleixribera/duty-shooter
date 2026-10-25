import { Simulation, type PlayerSpawn, type TickCmds, type TickOutput } from '../simulation';
import { createWorld, type Box } from '../world';

export interface HeadlessMatchOptions {
  /** The world, as material-tagged boxes. */
  readonly boxes: readonly Box[];
  /** Players present from tick 0. */
  readonly players?: readonly PlayerSpawn[];
}

/** Supplies the usercmds for a given tick (1-based: the tick being stepped). */
export type CmdScript = (tick: number) => TickCmds;

/**
 * A match run entirely in-process with no rendering: the single automated
 * seam. Build a world, script usercmds tick by tick, read the outputs.
 */
export interface HeadlessMatch {
  /** Steps one tick with the given usercmds. */
  step(cmds?: TickCmds): TickOutput;
  /** Steps `ticks` ticks, asking `script` for each tick's usercmds. Returns each tick's outputs. */
  run(ticks: number, script?: CmdScript): TickOutput[];
  /** Outputs after the most recent tick (tick 0 before any step). */
  readonly latest: TickOutput;
  /** Outputs of every tick stepped so far, oldest first. */
  readonly history: readonly TickOutput[];
}

export function createHeadlessMatch(options: HeadlessMatchOptions): HeadlessMatch {
  const sim = new Simulation(createWorld(options.boxes));
  for (const spawn of options.players ?? []) sim.addPlayer(spawn);

  const history: TickOutput[] = [];
  let latest = sim.output();

  const step = (cmds: TickCmds = {}): TickOutput => {
    latest = sim.step(cmds);
    history.push(latest);
    return latest;
  };

  return {
    step,
    run(ticks, script = () => ({})) {
      const outputs: TickOutput[] = [];
      for (let i = 0; i < ticks; i++) outputs.push(step(script(sim.tick + 1)));
      return outputs;
    },
    get latest() {
      return latest;
    },
    get history() {
      return history;
    },
  };
}
