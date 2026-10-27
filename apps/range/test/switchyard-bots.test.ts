import { describe, expect, it } from 'vitest';
import { buildNavGraph, createWorld, type ModeId, type RoundReason, type Vec3 } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { insidePolygon, mapSolids } from '../src/map/definition';
import { BOUNDARY, buildSwitchyard } from '../src/map/switchyard';

const map = buildSwitchyard();
const solids = mapSolids(map);
const nav = buildNavGraph(createWorld(solids), map.nav!);

/**
 * Three minutes of bots only on Switchyard, in one mode at one size: nobody
 * leaves the boundary, nobody roams in place for 8 s of live play, and the mode's own
 * thing happens (kills on both teams, many scorers, captures by both teams,
 * a Charge round played out).
 */
function run(mode: ModeId, perTeam: number) {
  const m = createNetworkedMatch({
    solids,
    spawns: map.spawns.ffa,
    teamSpawns: map.spawns.teams!,
    zones: map.zones,
    sites: map.sites,
    mode,
    modes: { tdm: { killLimit: null, timeLimit: null }, ffa: { killLimit: null, timeLimit: null }, outposts: { scoreLimit: null, timeLimit: null } },
    maxPlayers: perTeam * 2,
    bots: { nav, perTeam, maxPerTeam: perTeam, alwaysOn: true },
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
      if (!insidePolygon(BOUNDARY, p.position[0], p.position[2])) outside.push(`${p.id} at ${p.position}`);
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

describe('Switchyard: bots on their own', () => {
  for (const perTeam of [3, 6]) {
    const size = `${perTeam}v${perTeam}`;

    it(`play three minutes of ${size} team deathmatch: both teams score`, () => {
      const r = run('tdm', perTeam);
      expect(r.players).toBe(perTeam * 2);
      expect(r.outside).toEqual([]);
      expect(r.longest, r.where).toBeLessThan(8);
      const scores = r.m.server.mode.teamScores()!;
      expect(scores.every((t) => t.score > 0), JSON.stringify(scores)).toBe(true);
    }, 240_000);

    it(`play three minutes of ${size} free-for-all: kills spread round the yard`, () => {
      const r = run('ffa', perTeam);
      expect(r.players).toBe(perTeam * 2);
      expect(r.outside).toEqual([]);
      expect(r.longest, r.where).toBeLessThan(8);
      expect(r.m.server.mode.scores().filter((s) => s.kills > 0).length).toBeGreaterThanOrEqual(Math.min(6, perTeam * 2 - 1));
    }, 240_000);

    it(`play three minutes of ${size} Outposts: both teams take zones`, () => {
      const r = run('outposts', perTeam);
      expect(r.outside).toEqual([]);
      expect(r.longest, r.where).toBeLessThan(8);
      expect(r.captures).toEqual(new Set([1, 2]));
    }, 240_000);

    it(`play three minutes of ${size} Charge: rounds are played out`, () => {
      const r = run('charge', perTeam);
      expect(r.outside).toEqual([]);
      expect(r.longest, r.where).toBeLessThan(8);
      expect(r.rounds).toBeGreaterThanOrEqual(1);
    }, 240_000);
  }

  it('play 3v3 Charge to the end: the charge gets planted, and rounds go both ways', () => {
    const m = createNetworkedMatch({ solids, spawns: map.spawns.ffa, teamSpawns: map.spawns.teams!, sites: map.sites, mode: 'charge', bots: { nav, perTeam: 3, alwaysOn: true } });
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
    const log = JSON.stringify({ plants, rounds });
    expect(ended, log).toBe(true);
    expect(plants, log).toBeGreaterThan(0);
    expect(rounds.some((r) => r.winner === r.attackers), log).toBe(true);
    expect(rounds.some((r) => r.winner !== r.attackers), log).toBe(true);
  }, 300_000);
});
