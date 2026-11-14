import { describe, expect, it } from 'vitest';
import type { Score, ScoreLine } from '@duty-shooter/fps-core';
import { matchGainHtml } from '../src/hud/match-gain';
import { KILL_BEATS, SCORE_FEED_CSS, scoreFeedEntry } from '../src/hud/score-feed';
import { MatchTracker, applyMatch, emptyProfile, rankFloor, type MatchRecord } from '../src/profile';
import { mvpOf, scoreboard } from '../src/ui/model';
import { profileHtml, rankCorner } from '../src/ui/profile-screen';

const row = (id: string, team: number, score: number, kills: number, deaths: number, more: Partial<Score> = {}): Score => ({ id, team, name: id, kills, deaths, score, assists: 0, ...more });
const names = (id: string) => ({ v1: 'Vera', v2: 'Otto' })[id] ?? id;

describe('the score lines beside the crosshair', () => {
  it("lands a kill in DESIGN.md's beats and is gone by 1.8 s", () => {
    expect([KILL_BEATS.total, KILL_BEATS.lines, KILL_BEATS.medal]).toEqual([0.12, 0.3, 0.75]);
    expect(KILL_BEATS.linesGone).toBeLessThanOrEqual(1.8);
    expect(KILL_BEATS.medalGone).toBeLessThanOrEqual(1.8);
    // The animations end when the code removes them: a delayed one runs for what is left after its beat.
    const ends = (name: string) =>
      [...SCORE_FEED_CSS.matchAll(/animation: (ds-score-[a-z]+) ([\d.]+)s [^;]*?(?:([\d.]+)s )?both/g)].filter((m) => m[1] === name).map((m) => Math.round((Number(m[2]) + Number(m[3] ?? 0)) * 100) / 100);
    expect(ends('ds-score-line')).toEqual([KILL_BEATS.linesGone, KILL_BEATS.linesGone]);
    expect(ends('ds-score-medal')).toEqual([KILL_BEATS.medalGone]);
  });

  it('reads a headshot kill as two lines with their points, and sums them', () => {
    const lines: ScoreLine[] = [
      { reason: 'kill', points: 100, victim: 'v1', weapon: 'm4a1', metres: 31 },
      { reason: 'headshot', points: 50, victim: 'v1' },
    ];
    const entry = scoreFeedEntry(lines, names);
    expect(entry.lines).toEqual([
      { points: 100, label: 'Eliminated', note: 'Vera' },
      { points: 50, label: 'Headshot', note: '' },
    ]);
    expect(entry.points).toBe(150);
    expect(entry.medal).toBeNull();
  });

  it('names the best Medal of the event once, a long shot with its metres', () => {
    const long = scoreFeedEntry(
      [
        { reason: 'kill', points: 100, victim: 'v2', weapon: 'sniper', metres: 62 },
        { reason: 'longShot', points: 50, victim: 'v2', metres: 62 },
      ],
      names,
    );
    expect(long.medal).toBe('Long shot 62 m');
    expect(long.lines[1]).toEqual({ points: 50, label: 'Long shot', note: '62 m' });
    const double = scoreFeedEntry(
      [
        { reason: 'kill', points: 100, victim: 'v2' },
        { reason: 'revenge', points: 50, victim: 'v2' },
        { reason: 'doubleKill', points: 50 },
      ],
      names,
    );
    expect(double.medal).toBe('Double kill');
  });

  it('says who an assist was on', () => {
    expect(scoreFeedEntry([{ reason: 'assist', points: 50, victim: 'v1' }], names).lines[0]).toEqual({ points: 50, label: 'Assist', note: 'Vera' });
  });
});

describe('the scoreboard by Score', () => {
  it('puts the highest Score first on a team, whoever has the most kills', () => {
    const board = scoreboard([row('kills', 1, 900, 9, 2), row('helper', 1, 1250, 6, 4, { assists: 7 }), row('new', 1, 0, 0, 0)], 'tdm', {});
    if (board.kind !== 'tdm') throw new Error('tdm');
    expect(board.teams[0]!.rows.map((r) => [r.id, r.place, r.score, r.assists])).toEqual([
      ['helper', 1, 1250, 7],
      ['kills', 2, 900, 0],
      ['new', 3, 0, 0],
    ]);
  });

  it('in a free-for-all, ranks by the race (kills), as the bar and the results do (pass 47)', () => {
    const board = scoreboard([row('kills', 1, 900, 9, 2), row('helper', 1, 1250, 6, 4, { assists: 7 }), row('new', 1, 0, 0, 0)], 'ffa', {});
    if (board.kind !== 'ffa') throw new Error('ffa');
    expect(board.rows.map((r) => [r.id, r.place])).toEqual([
      ['kills', 1],
      ['helper', 2],
      ['new', 3],
    ]);
  });

  it('breaks a tie on Score by kills, then by fewer deaths', () => {
    const board = scoreboard([row('a', 1, 500, 4, 1), row('b', 1, 500, 5, 3), row('c', 1, 500, 5, 1)], 'ffa', {});
    if (board.kind !== 'ffa') throw new Error('ffa');
    expect(board.rows.map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('the MVP', () => {
  it('is the highest Score, with their kills and best Medal', () => {
    const mvp = mvpOf([row('a', 1, 900, 9, 2), row('me', 2, 1400, 8, 3, { medal: 'tripleKill' }), row('bot', 2, 300, 3, 5, { bot: true })], 'me');
    expect(mvp).toEqual({ id: 'me', name: 'me', bot: false, you: true, score: 1400, kills: 8, medal: 'tripleKill' });
  });

  it('is nobody while nobody has scored', () => {
    expect(mvpOf([row('a', 1, 0, 0, 0), row('b', 2, 0, 0, 1)], 'a')).toBeNull();
    expect(mvpOf([], null)).toBeNull();
  });
});

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({ mode: 'tdm', won: false, score: 1000, kills: 8, deaths: 5, assists: 2, headshots: 3, seconds: 300, bestStreak: 3, place: null, weapons: { m4a1: { kills: 8, headshots: 3, longest: 41 } }, reasons: { kill: 8, headshot: 3 }, medal: null, ...over });

describe('the "Your match" strip', () => {
  it('shows only your own readouts until the match is banked', () => {
    const html = matchGainHtml([['Score', '1,000']], null);
    expect(html).toContain('<span>Score</span><b>1,000</b>');
    expect(html).not.toContain('XP');
    expect(html).not.toContain('class="rank"');
  });

  it("gives the XP earned with a win's bonus as its own figure, and the Rank bar from where it stood to where it stands", () => {
    const { gain } = applyMatch(emptyProfile(), match({ won: true }), '2026-03-01');
    const html = matchGainHtml([['Score', '1,000']], gain);
    expect(html).toContain('<span>Win bonus</span><b>+250</b>');
    expect(html).toContain(`<span>XP earned</span><b>+${gain.xp.toLocaleString('en-US')}</b>`);
    expect(html).toContain(`Rank ${gain.after.rank}`);
    expect(html).toContain('--from:0.000');
    expect(gain.rankUp).toBe(true);
    expect(html).toContain('Rank up');
  });

  it('leaves the bonus out of a loss, and lists the Challenges the match moved', () => {
    const { gain } = applyMatch(emptyProfile(), match({ score: 300 }), '2026-03-01');
    const html = matchGainHtml([], gain);
    expect(html).not.toContain('Win bonus');
    expect(html).not.toContain('Rank up');
    for (const c of gain.challenges) expect(html).toContain(c.text);
  });

  it('names a gun the match opened, with an Equip it button where the screen takes a press, and Equipped once pressed (PLAN item 7)', () => {
    const { gain } = applyMatch({ ...emptyProfile(), xp: rankFloor(4) - 10 }, match({ score: 300 }), '2026-03-01');
    expect(gain.unlocks).toEqual(['burst']);
    expect(matchGainHtml([], gain)).toContain('<b>Trident 5.56</b>');
    expect(matchGainHtml([], gain)).not.toContain('data-equip');
    expect(matchGainHtml([], gain, { equipped: new Set() })).toContain('data-equip="burst"');
    expect(matchGainHtml([], gain, { equipped: new Set(['burst']) })).toContain('Equipped');
  });

  it("shows each gun's Mastery the match moved, most kills first, lit with the slot it opened when a level is reached (PLAN item 7)", () => {
    const profile = { ...emptyProfile(), weapons: { m4a1: { kills: 20, headshots: 0, longest: 0 }, pistol: { kills: 3, headshots: 0, longest: 0 } } };
    const { gain } = applyMatch(profile, match({ weapons: { pistol: { kills: 2, headshots: 0, longest: 9 }, m4a1: { kills: 8, headshots: 3, longest: 41 } } }), '2026-03-01');
    expect(gain.mastery.map((m) => m.id)).toEqual(['m4a1', 'pistol']);
    expect(gain.mastery[0]).toMatchObject({ kills: 8, total: 28, before: { level: 0 }, after: { level: 1 } });
    const html = matchGainHtml([], gain);
    expect(html).toContain('<b>M4A1</b><span class="up">Mastery 1</span>');
    expect(html).toContain('Optic open · 28 / 75 kills');
    // The pistol moved without a new level: its level unlit, its kills to the next.
    expect(html).toContain('Mastery 0</span>');
    expect(html).toContain('5 / 25 kills');
    expect(html.indexOf('M4A1')).toBeLessThan(html.indexOf('Warden 9'));
    // No kills, no Mastery rows; nor for a gun mastered before.
    expect(applyMatch(emptyProfile(), match({ weapons: {} }), '2026-03-01').gain.mastery).toEqual([]);
    expect(applyMatch({ ...emptyProfile(), weapons: { m4a1: { kills: 600, headshots: 0, longest: 0 } } }, match(), '2026-03-01').gain.mastery).toEqual([]);
    // A level reached leads, ahead of guns with more kills.
    const many = applyMatch(profile, match({ weapons: { smg: { kills: 9, headshots: 0, longest: 5 }, shotgun: { kills: 9, headshots: 0, longest: 5 }, burst: { kills: 9, headshots: 0, longest: 5 }, m4a1: { kills: 5, headshots: 0, longest: 5 } } }), '2026-03-01').gain;
    expect(many.mastery).toHaveLength(3);
    expect(many.mastery[0]!.id).toBe('m4a1');
  });
});

describe('the Profile screen', () => {
  it('shows an empty Profile as Rank 1 with zeros, and says what counts', () => {
    const html = profileHtml(emptyProfile(), '2026-03-01');
    expect(html).toContain('<b class="n">1</b>');
    expect(html).toContain('Observer');
    expect(html).toContain('<span>Matches</span><b>0</b>');
    // The line that says how to start counting.
    expect(html).toContain('class="none"');
    expect(html).toContain('No kills yet');
    // Three Challenges, none of them begun.
    expect(html.match(/class="task"/g)).toHaveLength(3);
    expect(html).not.toContain('Royale wins');
  });

  it('shows what a banked match left: the numbers, the weapon and its Mastery', () => {
    const { profile } = applyMatch(emptyProfile(), match({ kills: 30, weapons: { m4a1: { kills: 30, headshots: 4, longest: 41 } } }), '2026-03-01');
    const html = profileHtml(profile, '2026-03-01');
    expect(html).toContain('<span>Matches</span><b>1</b>');
    expect(html).toContain('<span>Kills</span><b>30</b>');
    expect(html).toContain('<span>K/D</span><b>6.00</b>');
    expect(html).toContain('4 headshots · longest 41 m');
    expect(html).toContain('Mastery 1 / 5');
    expect(html).toContain('45 to level 2');
    expect(html).not.toContain('class="none"');
    // The most used weapon leads the list.
    expect(html.indexOf('M4A1')).toBeLessThan(html.indexOf('No kills yet'));
  });

  it('lists the guns not yet opened after the open ones, each with the Rank that opens it (PLAN item 7)', () => {
    const fresh = profileHtml(emptyProfile(), '2026-03-01');
    expect(fresh.match(/class="gun shut"/g)).toHaveLength(5);
    expect(fresh).toMatch(/Opens at Rank<\/span><b>4<\/b>/);
    expect(fresh.indexOf('Warden 9')).toBeLessThan(fresh.indexOf('Trident 5.56'));
    expect(fresh.indexOf('Trident 5.56')).toBeLessThan(fresh.indexOf('Ridgeline .308'));
    expect(profileHtml({ ...emptyProfile(), xp: rankFloor(12) }, '2026-03-01')).not.toContain('class="gun shut"');
  });

  it("adds a Battle Royale's two figures once one has been played", () => {
    const { profile } = applyMatch(emptyProfile(), match({ mode: 'battle-royale', place: 4 }), '2026-03-01');
    const html = profileHtml(profile, '2026-03-01');
    expect(html).toContain('<span>Royale wins</span><b>0</b>');
    expect(html).toContain('<span>Best place</span><b>#4</b>');
  });

  it('gives the main menu its corner: the Rank in its badge, its title and XP, and the bar', () => {
    const fresh = rankCorner(emptyProfile());
    expect(fresh.badge).toContain('>1</span>');
    expect(fresh.meta).toContain('<b>Rank 1</b> Observer · 0 / ');
    const high = rankCorner({ ...emptyProfile(), xp: rankFloor(12) + 10 });
    expect(high.badge).toContain('aria-label="Rank 12"');
    expect(high.bar).toContain('XP to Rank 13');
  });
});

describe('a match from its score events to the Profile', () => {
  it('banks what the tracker counted: XP is the Score, the weapon gets its kills', () => {
    const tracker = new MatchTracker();
    tracker.score([
      { reason: 'kill', points: 100, victim: 'v1', weapon: 'smg', metres: 12 },
      { reason: 'headshot', points: 50, victim: 'v1' },
    ]);
    tracker.score([{ reason: 'kill', points: 100, victim: 'v2', weapon: 'smg', metres: 20 }]);
    tracker.played(120);
    const record = tracker.record({ mode: 'ffa', won: false, place: null, row: { score: 250, kills: 2, deaths: 1, assists: 0 } });
    const { profile, gain } = applyMatch(emptyProfile(), record, '2026-03-01');
    expect(gain.score).toBe(250);
    expect(gain.bonus).toBe(0);
    expect(profile.weapons.smg).toEqual({ kills: 2, headshots: 1, longest: 20 });
    expect(profile.stats.seconds).toBe(120);
  });
});
