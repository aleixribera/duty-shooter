// Hidden adaptive bots (PLAN 9h), measured: scripted Bot Matches with a strong or a weak stand-in for a person, and
// lopsided team matches, each played on the same seed with adapting off and on. Skips unless ADAPT_RUNS=1 (about 6 minutes;
// ADAPT_MINUTES sets each match's length, 12 by default).
import { describe, expect, it } from 'vitest';
import { skilledProfile, type BotProfile, type ModeId } from '@duty-shooter/fps-core';
import { createNetworkedMatch } from '@duty-shooter/fps-core/harness';
import { botMap, type BotMap } from './support/bots';
import { goodPlayer } from './support/royale';
import { BOUNDARY as TOWN, buildSurvivalTown } from '../src/map/survival-town';
import { BOUNDARY as YARD, buildSwitchyard } from '../src/map/switchyard';
import { BOUNDARY as NINE, buildStationNine } from '../src/map/station-nine';

const RUN = process.env['ADAPT_RUNS'] === '1';
const MINUTES = Number(process.env['ADAPT_MINUTES'] ?? 12);

const maps: Record<string, () => BotMap> = {
  'survival-town': () => botMap(buildSurvivalTown(), TOWN),
  switchyard: () => botMap(buildSwitchyard(), YARD),
  'station-nine': () => botMap(buildStationNine(), NINE),
};

/** A weak player's hands: an Easy bot's. */
const weakPlayer = (base: BotProfile): BotProfile => skilledProfile(base, 'easy');

interface Seat {
  readonly kills: number;
  readonly deaths: number;
}

/**
 * One match of `mode` on `b`, `MINUTES` long with no kill limit. `hands` makes
 * the first bot seated a stand-in for a person with those hands; `skills`
 * gives each bot after it a skill by its order (for a lopsided team match).
 */
function play(b: BotMap, mode: ModeId, perTeam: number, adapt: boolean, opts: { hands?: (base: BotProfile) => BotProfile; skills?: (i: number) => 'easy' | 'hard' | 'normal' }) {
  let first: string | null = null;
  // By name, so a bot rebuilt for a new nav keeps its hands.
  const made = new Map<string, BotProfile>();
  const profile = (name: string, base: BotProfile) => {
    let p = made.get(name);
    if (!p) {
      if (opts.hands && first === null) {
        first = name;
        p = opts.hands(base);
      } else p = opts.skills ? skilledProfile(base, opts.skills(made.size)) : base;
      made.set(name, p);
    }
    return p;
  };
  const m = createNetworkedMatch({
    solids: b.solids,
    ladders: b.map.ladders ?? [],
    spawns: b.map.spawns.ffa,
    teamSpawns: b.map.spawns.teams!,
    mode,
    modes: { tdm: { killLimit: null, timeLimit: null }, ffa: { killLimit: null, timeLimit: null } },
    maxPlayers: perTeam * 2,
    countdown: 0,
    bots: { nav: b.nav, perTeam, maxPerTeam: perTeam, alwaysOn: true, profile, adapt, standIn: (name) => name === first },
  });
  m.run(MINUTES * 60 * 60);
  const scores = m.server.mode.scores();
  const stand = scores.find((s) => s.name === first);
  const teams = m.server.mode.teamScores();
  const skillOf = (n: string) => (made.get(n) === undefined ? '?' : n === first ? 'S' : opts.skills ? opts.skills([...made.keys()].indexOf(n)) : 'n');
  const sides = teams?.map((t) => scores.filter((s) => s.team === t.team).map((s) => skillOf(s.name)[0]).join('')).join(' v ') ?? '';
  return { stand: stand ? ({ kills: stand.kills, deaths: stand.deaths } as Seat) : null, teams, scores, sides };
}

const kd = (s: Seat) => s.kills / Math.max(1, s.deaths);
const sum = (seats: readonly Seat[]) => seats.reduce((a, s) => ({ kills: a.kills + s.kills, deaths: a.deaths + s.deaths }), { kills: 0, deaths: 0 });

describe.skipIf(!RUN)('adaptive bots, measured', () => {
  const cases: [string, ModeId, number][] = [
    ['survival-town', 'tdm', 3],
    ['switchyard', 'tdm', 4],
    ['station-nine', 'tdm', 4],
    ['switchyard', 'ffa', 4],
    ['station-nine', 'ffa', 4],
  ];

  it("brings a strong player's kills-to-deaths toward 1, still above it, and lifts a weak one's", () => {
    const rows: string[] = [];
    const strong = { off: [] as Seat[], on: [] as Seat[] };
    const weak = { off: [] as Seat[], on: [] as Seat[] };
    for (const [name, mode, perTeam] of cases) {
      const b = maps[name]!();
      for (const [label, hands, into] of [
        ['strong', (base: BotProfile) => goodPlayer(base.name), strong],
        ['weak', weakPlayer, weak],
      ] as const) {
        const off = play(b, mode, perTeam, false, { hands }).stand!;
        const on = play(b, mode, perTeam, true, { hands }).stand!;
        into.off.push(off);
        into.on.push(on);
        rows.push(`${name} ${mode} ${label}: off ${off.kills}/${off.deaths} (${kd(off).toFixed(2)}), on ${on.kills}/${on.deaths} (${kd(on).toFixed(2)})`);
      }
    }
    const s = { off: kd(sum(strong.off)), on: kd(sum(strong.on)) };
    const w = { off: kd(sum(weak.off)), on: kd(sum(weak.on)) };
    rows.push(`strong over all: off ${s.off.toFixed(2)}, on ${s.on.toFixed(2)}; weak over all: off ${w.off.toFixed(2)}, on ${w.on.toFixed(2)}`);
    console.log(rows.join('\n'));
    expect(s.on).toBeLessThan(s.off);
    expect(s.on).toBeGreaterThan(1);
    expect(w.on).toBeGreaterThan(w.off);
  }, 3_600_000);

  it('ends a lopsided team match with a smaller gap than the same seed without adapting', () => {
    const rows: string[] = [];
    let offGap = 0;
    let onGap = 0;
    for (const [name, perTeam] of [['survival-town', 3], ['switchyard', 4], ['station-nine', 4]] as const) {
      const b = maps[name]!();
      // Bots are seated a side at a time in turn: every other one Hard, the rest Easy.
      const skills = (i: number) => (i % 2 === 0 ? 'hard' : 'easy');
      const gap = (adapt: boolean) => {
        const r = play(b, 'tdm', perTeam, adapt, { skills });
        const t = r.teams!;
        return { gap: Math.abs(t[0]!.score - t[1]!.score), text: `${t.map((x) => x.score).join('-')} (${r.sides})` };
      };
      const off = gap(false);
      const on = gap(true);
      offGap += off.gap;
      onGap += on.gap;
      rows.push(`${name} tdm lopsided: off ${off.text}, on ${on.text}`);
    }
    rows.push(`gap over all: off ${offGap}, on ${onGap}`);
    console.log(rows.join('\n'));
    expect(onGap).toBeLessThan(offGap);
  }, 3_600_000);
});
