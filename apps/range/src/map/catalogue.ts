import type { TeamSizes } from '@duty-shooter/fps-core';

/** What the app knows about a map without building it. */
export interface MapEntry {
  /** The name players see. */
  readonly name: string;
  /**
   * The team size it plays at, by mode: with bots on, a lobby fills to it (a
   * mode without teams holds twice it). A mode missing here isn't played on it.
   */
  readonly teamSizes: TeamSizes;
  /** Built for matches: online lobbies and Bot Match play it (not the Practice Range or the island). */
  readonly match: boolean;
  /** Its lighting is baked at build time (bake/<map>.bin); the island lights itself. */
  readonly baked: boolean;
  /** It has a picture for the lobby (public/maps/<id>.jpg). */
  readonly picture: boolean;
}

/**
 * Every map the app ships, in menu order: the one place a new map is listed.
 * Data only, so the build config, the server and the page can all read it
 * without building a map. Its builder goes in maps.ts.
 *
 * Team sizes: the switchyard's long open yard takes 6v6, Survival Town's
 * streets 4v4; Station Nine, between them in size, plays 6v6 but Charge 4v4,
 * its two sites close together at one end. Modes where everyone is an enemy
 * (free-for-all, gun game) play emptier: 6 players on Survival Town and 8 on
 * the switchyard, so a spawn isn't a crossfire from every side.
 */
export const MAP_CATALOGUE = {
  'survival-town': { name: 'Survival Town', teamSizes: { tdm: 4, ffa: 3, outposts: 4, charge: 4, gungame: 3 }, match: true, baked: true, picture: true },
  switchyard: { name: 'Switchyard', teamSizes: { tdm: 6, ffa: 4, outposts: 6, charge: 6, gungame: 4 }, match: true, baked: true, picture: true },
  'station-nine': { name: 'Station Nine', teamSizes: { tdm: 6, ffa: 4, outposts: 6, charge: 4, gungame: 4 }, match: true, baked: true, picture: true },
  range: { name: 'Practice Range', teamSizes: {}, match: false, baked: true, picture: false },
  'zero-island': { name: 'Zero Island', teamSizes: { 'battle-royale': 30 }, match: false, baked: false, picture: true },
} as const satisfies Record<string, MapEntry>;

/** The maps the app ships. */
export type MapId = keyof typeof MAP_CATALOGUE;

export const MAP_IDS = Object.keys(MAP_CATALOGUE) as readonly MapId[];

/** `id` as a map id, or undefined when it names no map. */
export const asMapId = (id: string | null | undefined): MapId | undefined => MAP_IDS.find((m) => m === id);

/** The entry for `id`, or undefined when it names no map. */
export const mapEntry = (id: string | null | undefined): MapEntry | undefined => {
  const map = asMapId(id);
  return map && MAP_CATALOGUE[map];
};

/** The maps built for matches: what an online lobby and Bot Match play. */
export const MATCH_MAPS: readonly MapId[] = MAP_IDS.filter((id) => MAP_CATALOGUE[id].match);

/** The maps whose lighting is baked at build time. */
export const BAKED_MAPS: readonly MapId[] = MAP_IDS.filter((id) => MAP_CATALOGUE[id].baked);

/** The team size each map plays at, by mode (see MapEntry.teamSizes). */
export const TEAM_SIZES = Object.fromEntries(MAP_IDS.map((id) => [id, MAP_CATALOGUE[id].teamSizes])) as Readonly<Record<MapId, TeamSizes>>;
