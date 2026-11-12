import { DEFAULT_MAX_PLAYERS, MAX_BOTS_PER_TEAM, type LobbyPick, type LobbyState, type ModeId } from '@duty-shooter/fps-core';
import type { LobbyView } from '@duty-shooter/fps-client/ui';
import { MATCH_MAPS, TEAM_SIZES, asMapId, type MapId } from './map/catalogue';

/** The bots a side gets on a map in a mode: the map's team size, within what a side can hold. */
export function teamSize(map: string, mode: ModeId): number {
  return Math.min(MAX_BOTS_PER_TEAM, TEAM_SIZES[asMapId(map) ?? 'survival-town'][mode] ?? 3);
}

/**
 * Bot Match's setup: the lobby page offline, you alone with the bots the
 * match brings and your picks, kept between visits. The bots fill to the
 * map's team size for the mode, or a size of your own (the hidden + and -
 * keys) until the map or mode changes.
 */
export class BotSetup {
  #state: LobbyState;
  /** The Bot Match just played, shown on the setup page as the online lobby shows its last match. */
  last: Pick<LobbyView, 'mode' | 'result' | 'teamScores'> | null = null;

  constructor() {
    const map = MATCH_MAPS[0]!;
    this.#state = { host: 'you', players: ['you'], capacity: DEFAULT_MAX_PLAYERS, mode: 'tdm', bots: teamSize(map, 'tdm'), custom: false, maxBots: MAX_BOTS_PER_TEAM, hvb: false, maps: MATCH_MAPS, map, squadSize: 1, squads: {} };
  }

  get state(): LobbyState {
    return this.#state;
  }

  /** The picked map (Survival Town for one this build doesn't ship). */
  get mapId(): MapId {
    return asMapId(this.#state.map) ?? 'survival-town';
  }

  /** Takes the player's picks. */
  pick(picks: LobbyPick): void {
    const { fill: _fill, bots, squads: _squads, ...rest } = picks;
    const was = this.#state;
    const next = { ...was, ...rest };
    // A size of your own lasts until the map or mode changes (or Bots is switched); offline there is always at least one a side.
    const custom = bots !== undefined || (was.custom && picks.fill === undefined && next.map === was.map && next.mode === was.mode);
    this.#state = { ...next, custom, bots: custom ? Math.max(1, Math.min(MAX_BOTS_PER_TEAM, bots ?? was.bots)) : teamSize(next.map, next.mode) };
  }

  /** What the lobby page shows, for a player of this name. */
  view(name: string): LobbyView {
    return {
      lobby: this.#state,
      phase: 'lobby',
      selfId: 'you',
      names: { you: name.trim() || 'You' },
      pings: {},
      mode: this.last?.mode ?? this.#state.mode,
      result: this.last?.result ?? null,
      teamScores: this.last?.teamScores ?? null,
      loading: null,
      offline: true,
    };
  }
}
