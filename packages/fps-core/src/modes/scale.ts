import type { ModeId } from './game-mode';

/** How big a match of a mode may get, and what that costs its bots. */
export interface MatchScale {
  /** The most people and bots a match holds. */
  readonly seats: number;
  /** The most bots a side a match fills to. */
  readonly botsPerTeam: number;
  /** Bots this far from every person think less often; null keeps them all at the full rate. */
  readonly farBots: { readonly range: number; readonly thinkEvery: number } | null;
  /** Grenade arcs all the bots together may simulate in a tick (`BotView.budget`). A whole aim is 27, and ten bots aiming in one tick held it up for tens of milliseconds. */
  readonly throwArcs: number;
  /** Routes the bots may plan in a tick; the bots after that keep to their last usercmd until the next, unless they're in the middle of something. Planning a route across a wide map can take 8 ms, and two in a tick neared the whole of it. */
  readonly plansPerTick: number;
}

/** The team modes, on a small map, where every bot is in somebody's sight. */
export const ARENA_SCALE: MatchScale = { seats: 32, botsPerTeam: 6, farBots: null, throwArcs: 2, plansPerTick: Infinity };

/** A kilometre-wide map. Battle Royale's load test settles these numbers. */
export const WIDE_SCALE: MatchScale = { seats: 60, botsPerTeam: 30, farBots: { range: 150, thinkEvery: 4 }, throwArcs: 1, plansPerTick: 1 };

export const MATCH_SCALES: Readonly<Record<ModeId, MatchScale>> = { tdm: ARENA_SCALE, ffa: ARENA_SCALE, outposts: ARENA_SCALE, charge: ARENA_SCALE, gungame: ARENA_SCALE, 'battle-royale': WIDE_SCALE };
