import type { Vec3 } from '../math';
import type { Zone, ZoneState } from '../modes/game-mode';
import type { PlayerId, TeamId } from '../simulation';

/** A bot the planner gives orders to. */
export interface PlannedBot {
  readonly id: PlayerId;
  readonly position: Vec3;
}

/** What one more bot already sent to a zone adds to sending another there (m of extra walk). */
const CROWDING = 40;
/** Holding is worth less than taking: a held zone costs this much more (m). */
const HELD = 15;
/** A held zone needs one defender (two while the other team is in it or taking it); past that, sending more costs this much. */
const ENOUGH = 200;

/**
 * Outposts orders for one bot team: each bot gets a zone. Bots go for the
 * zones their team doesn't hold (the nearest neutral one to capture, a lost
 * one to contest), and a held zone keeps a defender (two while it is under
 * threat), spreading out rather than all running for the same place. The
 * cheapest bot-and-zone pair is settled first (distance plus crowding), so
 * the plan is deterministic and stable from one second to the next.
 */
export function planOutposts(team: TeamId, bots: readonly PlannedBot[], zones: readonly Zone[], states: readonly ZoneState[]): Map<PlayerId, Zone> {
  const orders = new Map<PlayerId, Zone>();
  if (zones.length === 0) return orders;
  const sent = new Map<string, number>();
  const cost = (bot: PlannedBot, zone: Zone) => {
    const state = states.find((s) => s.id === zone.id);
    const held = state?.owner === team;
    const threatened = held && state !== undefined && (state.contested || (state.capturing !== 0 && state.capturing !== team));
    const n = sent.get(zone.id) ?? 0;
    const walk = Math.hypot(bot.position[0] - zone.center[0], bot.position[2] - zone.center[2]);
    return walk + CROWDING * n + (held ? HELD : 0) + (held && n >= (threatened ? 2 : 1) ? ENOUGH : 0);
  };
  const left = [...bots].sort((a, b) => (a.id < b.id ? -1 : 1));
  while (left.length > 0) {
    let best: { i: number; zone: Zone; cost: number } | null = null;
    for (const [i, bot] of left.entries()) {
      for (const zone of zones) {
        const c = cost(bot, zone);
        if (!best || c < best.cost) best = { i, zone, cost: c };
      }
    }
    const [bot] = left.splice(best!.i, 1);
    orders.set(bot!.id, best!.zone);
    sent.set(best!.zone.id, (sent.get(best!.zone.id) ?? 0) + 1);
  }
  return orders;
}
