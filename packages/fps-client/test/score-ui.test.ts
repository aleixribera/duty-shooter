import { describe, expect, it } from 'vitest';
import type { Score, ScoreLine } from '@duty-shooter/fps-core';
import { matchGainHtml } from '../src/hud/match-gain';
import { scoreFeedEntry } from '../src/hud/score-feed';
import { MatchTracker, applyMatch, emptyProfile, rankFloor, type MatchRecord } from '../src/profile';
import { mvpOf, scoreboard } from '../src/ui/model';
import { profileHtml, rankLineHtml } from '../src/ui/profile-screen';

const row = (id: string, team: number, score: number, kills: number, deaths: number, more: Partial<Score> = {}): Score => ({ id, team, name: id, kills, deaths, score, assists: 0, ...more });
const names = (id: string) => ({ v1: 'Vera', v2: 'Otto' })[id] ?? id;

describe('the score lines beside the crosshair', () => {
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
  it('puts the highest Score first, whoever has the most kills', () => {
    const board = scoreboard([row('kills', 1, 900, 9, 2), row('helper', 1, 1250, 6, 4, { assists: 7 }), row('new', 1, 0, 0, 0)], 'ffa', {});
    if (board.kind !== 'ffa') throw new Error('ffa');
    expect(board.rows.map((r) => [r.id, r.place, r.score, r.assists])).toEqual([
      ['helper', 1, 1250, 7],
      ['kills', 2, 900, 0],
      ['new', 3, 0, 0],
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
});

describe('the Profile screen', () => {
  it('shows an empty Profile as Rank 1 with zeros, and says what counts', () => {
    const html = profileHtml(emptyProfile(), '2026-03-01');
    expect(html).toContain('<b class="n">1</b>');
    expect(html).toContain('Observer');
    expect(html).toContain('<span>Matches</span><b>0</b>');
    expect(html).toContain('Finish a match to start counting');
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
    expect(html).not.toContain('Finish a match to start counting');
    // The most used weapon leads the list.
    expect(html.indexOf('M4A1')).toBeLessThan(html.indexOf('No kills yet'));
  });

  it("adds a Battle Royale's two figures once one has been played", () => {
    const { profile } = applyMatch(emptyProfile(), match({ mode: 'battle-royale', place: 4 }), '2026-03-01');
    const html = profileHtml(profile, '2026-03-01');
    expect(html).toContain('<span>Royale wins</span><b>0</b>');
    expect(html).toContain('<span>Best place</span><b>#4</b>');
  });

  it('gives the main menu its line: the Rank, its title and the way in', () => {
    expect(rankLineHtml(emptyProfile())).toContain('<b>Rank 1</b>Observer');
    const high = rankLineHtml({ ...emptyProfile(), xp: rankFloor(12) + 10 });
    expect(high).toContain('<b>Rank 12</b>');
    expect(high).toContain('Profile');
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
