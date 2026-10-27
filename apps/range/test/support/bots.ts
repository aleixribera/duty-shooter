import { buildNavGraph, createWorld, type ModeId, type NavGraph, type RoundReason, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch, type NetworkedMatch } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids, type MapDefinition } from '../../src/map/definition';

/** A map ready for bot matches: its definition, collision, nav graph and boundary. */
export interface BotMap {
  readonly map: MapDefinition;
  readonly solids: ReturnType<typeof mapSolids>;
  readonly nav: NavGraph;
  readonly boundary: readonly (readonly [number, number])[];
}

export function botMap(map: MapDefinition, boundary: BotMap['boundary']): BotMap {
  const solids = mapSolids(map);
  return { map, solids, nav: buildNavGraph(createWorld(solids), map.nav!), boundary };
}

/** Every node reachable from node 0 along the links (or against them, with `reverse`). */
export function reachable(nav: NavGraph, reverse: boolean): Set<number> {
  const into: number[][] = nav.nodes.map(() => []);
  for (const [i, links] of nav.links.entries()) for (const l of links) into[reverse ? l.to : i]!.push(reverse ? i : l.to);
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) for (const next of into[queue.pop()!]!) if (!seen.has(next)) seen.add(next), queue.push(next);
  return seen;
}

/**
 * Three minutes of bots only, in one mode at one size, with no score or time
 * limit: who left the boundary, the longest a bot roamed in place during live
 * play (and where), the teams that captured a zone, and the rounds played.
 */
export function soak(b: BotMap, mode: ModeId, perTeam: number) {
  const m = createNetworkedMatch({
    solids: b.solids,
    spawns: b.map.spawns.ffa,
    teamSpawns: b.map.spawns.teams!,
    zones: b.map.zones,
    sites: b.map.sites,
    mode,
    modes: { tdm: { killLimit: null, timeLimit: null }, ffa: { killLimit: null, timeLimit: null }, outposts: { scoreLimit: null, timeLimit: null } },
    maxPlayers: perTeam * 2,
    bots: { nav: b.nav, perTeam, maxPerTeam: perTeam, alwaysOn: true },
  });
  const still = new Map<string, { at: Vec3; since: number }>();
  let longest = 0;
  let where = '';
  const outside: string[] = [];
  const captures = new Set<number>();
  let rounds = 0;
  for (let i = 0; i < 180 * 60; i++) {
    const out = m.step();
    for (const e of m.server.modeEvents) {
      if (e.type === 'capture') captures.add(e.team);
      if (e.type === 'roundEnd') rounds += 1;
    }
    // Only live play counts: between matches and in a round's freeze everyone is held where they stand.
    const live = m.server.phase === 'playing' && !m.server.mode.frozen();
    for (const p of out.players) {
      const bot = m.server.bots.get(p.id)?.bot;
      if (!p.alive || !bot || !live) {
        still.delete(p.id);
        continue;
      }
      if (!insidePolygon(b.boundary, p.position[0], p.position[2])) outside.push(`${p.id} at ${p.position}`);
      const s = still.get(p.id);
      // Fighting, holding an angle or planting is standing still on purpose; only roaming in place is stuck.
      if (!s || bot.activity !== 'roam' || Math.hypot(p.position[0] - s.at[0], p.position[2] - s.at[2]) > 1.5) still.set(p.id, { at: p.position, since: i });
      else if ((i - s.since) / 60 > longest) {
        longest = (i - s.since) / 60;
        where = `${p.id} at ${p.position.map((v) => v.toFixed(1))}`;
      }
    }
  }
  return { m, players: m.history.at(-1)!.players.length, outside, longest, where, captures, rounds };
}

/** A 3v3 Charge match of bots played to its end (15 minutes at most): the plants and every round's winner and attackers. */
export function chargeToEnd(b: BotMap, perTeam = 3): { ended: boolean; plants: number; rounds: { winner: number; reason: RoundReason; attackers: number }[]; m: NetworkedMatch } {
  const m = createNetworkedMatch({ solids: b.solids, spawns: b.map.spawns.ffa, teamSpawns: b.map.spawns.teams!, sites: b.map.sites, mode: 'charge', bots: { nav: b.nav, perTeam, alwaysOn: true } });
  const rounds: { winner: number; reason: RoundReason; attackers: number }[] = [];
  let attackers = 1;
  let plants = 0;
  let ended = false;
  for (let i = 0; i < 15 * 60 * 60 && !ended; i++) {
    m.step();
    for (const e of m.server.modeEvents) {
      if (e.type === 'roundStart') attackers = e.attackers;
      if (e.type === 'roundEnd') rounds.push({ winner: e.winner, reason: e.reason, attackers });
      if (e.type === 'charge' && e.action === 'plant') plants += 1;
      if (e.type === 'matchEnd') ended = true;
    }
  }
  return { ended, plants, rounds, m };
}
