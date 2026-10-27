import type { Vec3 } from '../math';
import { DEFUSE_TIME } from '../modes/charge';
import { siteCentre, type ChargeSite, type ChargeState, type Zone, type ZoneState } from '../modes/game-mode';
import { hashString } from '../random';
import type { PlayerId, TeamId } from '../simulation';
import type { BotObjective } from './bot';

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

/** Bots that walk with the carrier. */
const ESCORTS = 2;
/** How close (m) the carrier walks to a site's middle before planting, and a defuser to the charge. */
const PLANT_REACH = 1.2;
const DEFUSE_REACH = 1;
const ESCORT_RADIUS = 5;
const GUARD_RADIUS = 8;
/** A defuse begun with this little more than its own time left on the fuse (s) is made whatever is in view. */
const DEFUSE_SPARE = 2;

const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** The site the attackers go for this round: the same for the whole round, chosen afresh each round. */
export function targetSite(sites: readonly ChargeSite[], round: number): ChargeSite | null {
  return sites.length === 0 ? null : sites[hashString('round' + round) % sites.length]!;
}

/**
 * Charge orders for one bot team (`bots`, its living bots; `mates`, every
 * living player on it, people included). Attackers: the carrier heads for
 * the round's target site and plants there (see {@link BotObjective.use}),
 * with the nearest two as escort and the rest going ahead to the site; a
 * dropped charge is fetched by the nearest bot while the others cover it;
 * once planted, everyone guards it. Defenders split across the sites, the
 * nearer site first, and once the charge is planted the nearest one defuses
 * while the rest guard, the defuse made under fire only when the fuse is
 * nearly out.
 */
export function planCharge(team: TeamId, bots: readonly PlannedBot[], mates: readonly PlannedBot[], sites: readonly ChargeSite[], state: ChargeState): Map<PlayerId, BotObjective> {
  const orders = new Map<PlayerId, BotObjective>();
  const target = targetSite(sites, state.round);
  if (!target || state.phase === 'over') return orders;
  const nearest = (to: Vec3, among: readonly PlannedBot[]) => [...among].sort((a, b) => flat(a.position, to) - flat(b.position, to) || (a.id < b.id ? -1 : 1));
  const area = (site: ChargeSite): BotObjective => ({ position: siteCentre(site), radius: Math.max(2, Math.min(site.max[0] - site.min[0], site.max[2] - site.min[2]) / 2) });
  if (state.planted) {
    const at = state.planted.position;
    const guard: BotObjective = { position: at, radius: GUARD_RADIUS };
    let rest = bots;
    if (team !== state.attackers) {
      const [defuser] = nearest(at, bots);
      if (defuser) {
        orders.set(defuser.id, { position: at, radius: DEFUSE_REACH, use: true, urgent: state.remaining < DEFUSE_TIME + DEFUSE_SPARE });
        rest = bots.filter((b) => b !== defuser);
      }
    }
    for (const b of rest) orders.set(b.id, guard);
    return orders;
  }
  if (team === state.attackers) {
    let rest = [...bots];
    const carrier = mates.find((m) => m.id === state.carrier);
    if (carrier) {
      if (bots.some((b) => b.id === carrier.id)) {
        orders.set(carrier.id, { position: siteCentre(target), radius: PLANT_REACH, use: true });
        rest = rest.filter((b) => b.id !== carrier.id);
      }
      for (const escort of nearest(carrier.position, rest).slice(0, ESCORTS)) {
        orders.set(escort.id, { position: carrier.position, radius: ESCORT_RADIUS });
        rest = rest.filter((b) => b !== escort);
      }
    } else if (state.dropped) {
      const [fetcher] = nearest(state.dropped, rest);
      if (fetcher) {
        orders.set(fetcher.id, { position: state.dropped, radius: 0.6 });
        rest = rest.filter((b) => b !== fetcher);
      }
      for (const b of rest) orders.set(b.id, { position: state.dropped, radius: GUARD_RADIUS });
      return orders;
    }
    for (const b of rest) orders.set(b.id, area(target));
    return orders;
  }
  // Defenders: one at a time to the cheapest site, counting the bots already sent there.
  const sent = new Map<string, number>();
  const left = [...bots].sort((a, b) => (a.id < b.id ? -1 : 1));
  while (left.length > 0) {
    let best: { i: number; site: ChargeSite; cost: number } | null = null;
    for (const [i, bot] of left.entries()) {
      for (const site of sites) {
        const c = flat(bot.position, siteCentre(site)) + CROWDING * (sent.get(site.id) ?? 0);
        if (!best || c < best.cost) best = { i, site, cost: c };
      }
    }
    const [bot] = left.splice(best!.i, 1);
    orders.set(bot!.id, area(best!.site));
    sent.set(best!.site.id, (sent.get(best!.site.id) ?? 0) + 1);
  }
  return orders;
}
