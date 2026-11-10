import { describe, expect, it } from 'vitest';
import { STATS, WEAPON_IDS, type ScoreLine } from '@duty-shooter/fps-core';
import { CHALLENGES, DAILY_CHALLENGES, MASTERY_KILLS, MAX_RANK, MatchKeeper, MatchTracker, PROFILE_KEY, ProfileStore, RANK_TITLES, applyMatch, dailyChallenges, dateKey, emptyProfile, figure, masteryOf, parseProfile, playedFor, rankFloor, rankOf, rankTitle, readProfile, todaysChallenges, weaponRows, type MatchRecord, type ProfileStorage } from '../src/profile';

const match = (over: Partial<MatchRecord> = {}): MatchRecord => ({ mode: 'tdm', won: false, score: 1000, kills: 8, deaths: 5, assists: 2, headshots: 3, seconds: 600, bestStreak: 3, place: null, weapons: {}, reasons: {}, medal: null, ...over });

/** Storage in memory, as a browser's: strings by key. */
function memory(initial: Record<string, string> = {}): ProfileStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('the Rank curve', () => {
  it('starts at 0, reaches Rank 2 at 800 XP and Rank 50 at 400,000', () => {
    expect(rankFloor(1)).toBe(0);
    expect(rankFloor(2)).toBe(800);
    expect(rankFloor(MAX_RANK)).toBe(400_000);
  });

  it('rises at every Rank, and each Rank takes more than the one before', () => {
    let step = 0;
    for (let r = 2; r <= MAX_RANK; r++) {
      const now = rankFloor(r) - rankFloor(r - 1);
      expect(now, `rank ${r}`).toBeGreaterThan(step);
      step = now;
    }
  });

  it('reads a Rank from XP, with how far through it', () => {
    expect(rankOf(0)).toMatchObject({ rank: 1, title: 'Observer', floor: 0, next: 800, share: 0 });
    expect(rankOf(799).rank).toBe(1);
    expect(rankOf(800)).toMatchObject({ rank: 2, floor: 800, share: 0 });
    expect(rankOf(400)).toMatchObject({ rank: 1, share: 0.5 });
    expect(rankOf(399_999).rank).toBe(MAX_RANK - 1);
    expect(rankOf(400_000)).toMatchObject({ rank: MAX_RANK, title: 'Test Director', next: null, share: 1 });
    // XP goes on past the last Rank; the Rank does not.
    expect(rankOf(9_000_000).rank).toBe(MAX_RANK);
    // Every XP from 0 up gives a Rank no lower than the XP before it.
    let last = 1;
    for (let xp = 0; xp <= 400_000; xp += 250) {
      const r = rankOf(xp).rank;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it('has ten titles, five Ranks each', () => {
    expect(RANK_TITLES).toHaveLength(10);
    expect(new Set(RANK_TITLES).size).toBe(10);
    expect(rankTitle(1)).toBe('Observer');
    expect(rankTitle(5)).toBe('Observer');
    expect(rankTitle(6)).toBe('Range Hand');
    expect(rankTitle(46)).toBe('Test Director');
    expect(rankTitle(50)).toBe('Test Director');
  });
});

describe('Mastery', () => {
  it('steps at 25, 75, 150, 300 and 500 kills', () => {
    expect(MASTERY_KILLS).toEqual([25, 75, 150, 300, 500]);
    expect(masteryOf(0)).toEqual({ level: 0, of: 5, next: 25, share: 0 });
    expect(masteryOf(24).level).toBe(0);
    expect(masteryOf(25)).toMatchObject({ level: 1, next: 75, share: 0 });
    expect(masteryOf(50)).toMatchObject({ level: 1, share: 0.5 });
    expect(masteryOf(499).level).toBe(4);
    expect(masteryOf(500)).toEqual({ level: 5, of: 5, next: null, share: 1 });
  });

  it('lists every weapon, the most used first, with its real name', () => {
    const { profile } = applyMatch(emptyProfile(), match({ weapons: { smg: { kills: 30, headshots: 4, longest: 22 }, sniper: { kills: 2, headshots: 2, longest: 140 } } }), '2026-11-09');
    const rows = weaponRows(profile);
    expect(rows.map((r) => r.id).sort()).toEqual([...WEAPON_IDS].sort());
    expect(rows[0]).toMatchObject({ id: 'smg', name: STATS.weapons.smg.traits.name, kills: 30, headshots: 4, longest: 22 });
    expect(rows[0]!.mastery.level).toBe(1);
    expect(rows[1]).toMatchObject({ id: 'sniper', kills: 2, longest: 140 });
    expect(rows.at(-1)!.kills).toBe(0);
  });
});

describe('the daily Challenges', () => {
  it('offers at least fifteen, each worth 500 to 1500 XP, each with its own id', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.xp, c.id).toBeGreaterThanOrEqual(500);
      expect(c.xp, c.id).toBeLessThanOrEqual(1500);
      expect(c.target, c.id).toBeGreaterThan(0);
    }
  });

  it('draws the same three for a date, every time', () => {
    const a = dailyChallenges('2026-11-09').map((c) => c.id);
    expect(a).toHaveLength(DAILY_CHALLENGES);
    expect(new Set(a).size).toBe(DAILY_CHALLENGES);
    for (let i = 0; i < 5; i++) expect(dailyChallenges('2026-11-09').map((c) => c.id)).toEqual(a);
  });

  it('changes from day to day, reaches every Challenge, and never asks for two weapons or two modes at once', () => {
    const seen = new Set<string>();
    const draws = new Set<string>();
    const day = new Date(2026, 0, 1);
    for (let i = 0; i < 365; i++) {
      const picked = dailyChallenges(dateKey(day));
      expect(picked).toHaveLength(DAILY_CHALLENGES);
      expect(picked.filter((c) => c.group === 'weapon').length).toBeLessThanOrEqual(1);
      expect(picked.filter((c) => c.group === 'mode').length).toBeLessThanOrEqual(1);
      for (const c of picked) seen.add(c.id);
      draws.add(picked.map((c) => c.id).join());
      day.setDate(day.getDate() + 1);
    }
    expect(seen.size).toBe(CHALLENGES.length);
    expect(draws.size).toBeGreaterThan(200);
  });

  it('keys a day by the local date', () => {
    expect(dateKey(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09');
    expect(dateKey(new Date(2027, 0, 3, 0, 0))).toBe('2027-01-03');
  });
});

describe('a match taken into the Profile', () => {
  // A date whose draw the tests below lean on: found, not assumed.
  const dayWith = (...ids: string[]) => {
    const day = new Date(2026, 0, 1);
    for (let i = 0; i < 4000; i++) {
      const key = dateKey(day);
      const drawn = dailyChallenges(key).map((c) => c.id);
      if (ids.every((id) => drawn.includes(id))) return key;
      day.setDate(day.getDate() + 1);
    }
    throw new Error(`no day draws ${ids.join()}`);
  };
  /** A match that moves no Challenge but the ones a test means to. */
  const quiet = { score: 0, kills: 0, assists: 0, headshots: 0, bestStreak: 0 };

  it('pays the match Score as XP, and a quarter more as its own figure in a win', () => {
    // A day whose Challenges this match cannot touch, so the XP is the Score's alone.
    const day = dayWith('melee', 'grenades', 'triple-kill');
    const lost = applyMatch(emptyProfile(), match({ score: 1230, won: false }), day);
    expect(lost.gain).toMatchObject({ score: 1230, bonus: 0, challengeXp: 0, xp: 1230, rankUp: true });
    expect(lost.gain.before.rank).toBe(1);
    expect(lost.gain.after.rank).toBe(2);
    expect(lost.profile.xp).toBe(1230);
    const won = applyMatch(emptyProfile(), match({ score: 1230, won: true }), day);
    expect(won.gain).toMatchObject({ score: 1230, bonus: 308, challengeXp: 0, xp: 1538 });
    expect(won.profile.xp).toBe(1538);
    expect(won.gain.challenges).toEqual([]);
  });

  it('adds the match to the lifetime numbers and to each weapon', () => {
    const day = '2026-11-09';
    const first = applyMatch(emptyProfile(), match({ mode: 'ffa', won: true, score: 900, kills: 9, deaths: 4, assists: 1, headshots: 2, seconds: 300.4, bestStreak: 4, weapons: { m4a1: { kills: 7, headshots: 2, longest: 38 } } }), day).profile;
    const second = applyMatch(first, match({ mode: 'ffa', score: 500, kills: 5, deaths: 6, assists: 0, headshots: 1, seconds: 200, bestStreak: 2, weapons: { m4a1: { kills: 3, headshots: 1, longest: 12 }, pistol: { kills: 2, headshots: 0, longest: 9 } } }), day).profile;
    expect(second.stats).toEqual({ matches: 2, wins: 1, kills: 14, deaths: 10, headshots: 3, assists: 1, score: 1400, seconds: 500, bestStreak: 4, royaleWins: 0, royaleBest: null, modes: { ffa: 2 } });
    expect(second.weapons).toEqual({ m4a1: { kills: 10, headshots: 3, longest: 38 }, pistol: { kills: 2, headshots: 0, longest: 9 } });
  });

  it('keeps Battle Royale wins and the best place', () => {
    const day = '2026-11-09';
    let p = applyMatch(emptyProfile(), match({ mode: 'battle-royale', place: 4 }), day).profile;
    expect(p.stats).toMatchObject({ royaleWins: 0, royaleBest: 4 });
    p = applyMatch(p, match({ mode: 'battle-royale', place: 1, won: true }), day).profile;
    p = applyMatch(p, match({ mode: 'battle-royale', place: 7 }), day).profile;
    expect(p.stats).toMatchObject({ royaleWins: 1, royaleBest: 1, wins: 1, modes: { 'battle-royale': 3 } });
  });

  it('moves a Challenge through the day, pays it once when it is reached, and says a Rank was crossed', () => {
    const day = dayWith('wins');
    const wins = CHALLENGES.find((c) => c.id === 'wins')!;
    const one = applyMatch(emptyProfile(), match({ ...quiet, won: true }), day);
    expect(one.gain.challenges.find((c) => c.id === 'wins')).toMatchObject({ before: 0, progress: 1, target: 2, done: false, completed: false });
    expect(todaysChallenges(one.profile, day).find((c) => c.id === 'wins')).toMatchObject({ progress: 1, done: false });
    const two = applyMatch(one.profile, match({ ...quiet, won: true }), day);
    expect(two.gain.challenges.find((c) => c.id === 'wins')).toMatchObject({ before: 1, progress: 2, done: true, completed: true });
    expect(two.gain.challengeXp).toBeGreaterThanOrEqual(wins.xp);
    expect(two.gain.xp).toBe(two.gain.score + two.gain.bonus + two.gain.challengeXp);
    expect(two.profile.xp - one.profile.xp).toBe(two.gain.xp);
    expect(two.gain.rankUp).toBe(true);
    expect(two.gain.after.rank).toBeGreaterThan(two.gain.before.rank);
    expect(todaysChallenges(two.profile, day).find((c) => c.id === 'wins')).toMatchObject({ progress: 2, done: true });
    // Done is done: a third win moves nothing and pays nothing for it.
    const three = applyMatch(two.profile, match({ ...quiet, won: true }), day);
    expect(three.gain.challenges.find((c) => c.id === 'wins')).toBeUndefined();
    expect(three.profile.xp - two.profile.xp).toBe(three.gain.xp);
  });

  it('counts a one-match Challenge by the best match, not the sum', () => {
    const day = dayWith('headshots-match');
    const a = applyMatch(emptyProfile(), match({ ...quiet, headshots: 3 }), day);
    const b = applyMatch(a.profile, match({ ...quiet, headshots: 4 }), day);
    expect(todaysChallenges(b.profile, day).find((c) => c.id === 'headshots-match')).toMatchObject({ progress: 4, done: false });
    const c = applyMatch(b.profile, match({ ...quiet, headshots: 6 }), day);
    expect(c.gain.challenges.find((x) => x.id === 'headshots-match')).toMatchObject({ before: 4, progress: 5, completed: true });
  });

  it("starts a new day's Challenges from nothing", () => {
    const day = dayWith('matches');
    const p = applyMatch(emptyProfile(), match(), day).profile;
    expect(todaysChallenges(p, day).find((c) => c.id === 'matches')!.progress).toBe(1);
    expect(todaysChallenges(p, '1999-01-01').every((c) => c.progress === 0)).toBe(true);
    const next = applyMatch(p, match(), '2031-05-05').profile;
    expect(next.daily.date).toBe('2031-05-05');
    const ids = dailyChallenges('2031-05-05').map((c) => c.id);
    expect(Object.keys(next.daily.progress).every((id) => ids.includes(id))).toBe(true);
    expect(applyMatch(p, match(quiet), '2031-05-05').profile.daily).toEqual({ date: '2031-05-05', progress: ids.includes('matches') ? { matches: 1 } : {} });
  });
});

describe('what storage holds', () => {
  it('reads back what was written', () => {
    const { profile } = applyMatch(emptyProfile(), match({ mode: 'battle-royale', place: 2, weapons: { shotgun: { kills: 4, headshots: 1, longest: 7 } } }), '2026-11-09');
    expect(parseProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
  });

  it('recovers from text that is not a Profile', () => {
    for (const text of [null, '', 'not json', '{', 'null', '42', '[]', '"x"', '{"version":2,"xp":5000}', '{"xp":5000}']) expect(readProfile(text), String(text)).toEqual(emptyProfile());
  });

  it('keeps the numbers that are numbers and drops the rest', () => {
    const p = parseProfile({
      version: 1,
      xp: 1234.9,
      stats: { matches: 3, wins: -2, kills: 'many', deaths: null, headshots: Infinity, assists: NaN, score: 900, seconds: 61, bestStreak: 4, royaleWins: {}, royaleBest: 0, modes: { ffa: 2, chess: 9, tdm: 'x' } },
      weapons: { smg: { kills: 10, headshots: 99, longest: 31.7 }, laser: { kills: 5 }, pistol: 'gun', sniper: { kills: 0, headshots: 3 } },
      daily: { date: 'yesterday', progress: { wins: 1 } },
    });
    expect(p.xp).toBe(1234);
    expect(p.stats).toEqual({ matches: 3, wins: 0, kills: 0, deaths: 0, headshots: 0, assists: 0, score: 900, seconds: 61, bestStreak: 4, royaleWins: 0, royaleBest: null, modes: { ffa: 2 } });
    expect(p.weapons).toEqual({ smg: { kills: 10, headshots: 10, longest: 31 } });
    expect(p.daily).toEqual({ date: '', progress: {} });
    expect(parseProfile({ version: 1, daily: { date: '2026-11-09', progress: { wins: 99, nonsense: 4, kills: 'x' } } }).daily).toEqual({ date: '2026-11-09', progress: { wins: 2 } });
    expect(parseProfile({ version: 1, stats: [], weapons: 7, daily: 'x' })).toEqual(emptyProfile());
  });
});

describe('the Profile store', () => {
  const at = () => new Date(2026, 10, 9, 20, 0);

  it('banks a match under duty-shooter.profile.v1 and reads it back in a new session', () => {
    const storage = memory();
    const store = new ProfileStore(storage, at);
    expect(store.profile).toEqual(emptyProfile());
    const gain = store.bank(match({ score: 2000, won: true }));
    expect(gain.score).toBe(2000);
    expect(gain.bonus).toBe(500);
    expect(PROFILE_KEY).toBe('duty-shooter.profile.v1');
    expect(JSON.parse(storage.data.get(PROFILE_KEY)!)).toEqual(store.profile);
    const again = new ProfileStore(storage, at);
    expect(again.profile.xp).toBe(gain.xp);
    expect(again.profile.stats).toEqual(store.profile.stats);
    expect(again.today).toBe('2026-11-09');
    expect(todaysChallenges(again.profile, again.today)).toEqual(todaysChallenges(store.profile, store.today));
  });

  it("keeps the Course's best time: only a faster run replaces it, a match leaves it be, and an old save reads as none", () => {
    const storage = memory();
    const store = new ProfileStore(storage, at);
    expect(store.bankCourse(15.2)).toBeNull();
    expect(store.bankCourse(16)).toBe(15.2);
    expect(store.profile.courseBest).toBe(15.2);
    expect(store.bankCourse(13.9)).toBe(15.2);
    store.bank(match({ score: 100 }));
    expect(new ProfileStore(storage, at).profile.courseBest).toBe(13.9);
    expect(parseProfile({ ...emptyProfile(), courseBest: undefined }).courseBest).toBeNull();
    expect(parseProfile({ ...emptyProfile(), courseBest: -3 }).courseBest).toBeNull();
  });

  it('builds on a match another tab banked meanwhile', () => {
    const storage = memory();
    const a = new ProfileStore(storage, at);
    const b = new ProfileStore(storage, at);
    a.bank(match({ score: 700 }));
    b.bank(match({ score: 300 }));
    expect(b.profile.stats).toMatchObject({ matches: 2, score: 1000 });
  });

  it('starts over from corrupt storage, and from storage that throws', () => {
    expect(new ProfileStore(memory({ [PROFILE_KEY]: '{"version":1,"xp":"lots"' }), at).profile).toEqual(emptyProfile());
    const broken: ProfileStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const store = new ProfileStore(broken, at);
    expect(store.profile).toEqual(emptyProfile());
    // The session still counts, it just is not kept.
    store.bank(match({ score: 400 }));
    store.bank(match({ score: 600 }));
    expect(store.profile.stats).toMatchObject({ matches: 2, score: 1000 });
    store.reset();
    expect(store.profile).toEqual(emptyProfile());
    expect(new ProfileStore(null, at).bank(match({ score: 10 })).score).toBe(10);
  });

  it('keeps a match that storage would not take, and builds the next one on it', () => {
    // Storage that still reads but is full: the older Profile comes back from it, and nothing new goes in.
    const storage = memory();
    const store = new ProfileStore(storage, at);
    store.bank(match({ score: 500 }));
    const full: ProfileStorage = { ...storage, setItem: () => { throw new Error('full'); } };
    const session = new ProfileStore(full, at);
    session.bank(match({ score: 700 }));
    session.bank(match({ score: 300 }));
    expect(session.profile.stats).toMatchObject({ matches: 3, score: 1500 });
    expect(new ProfileStore(storage, at).profile.stats).toMatchObject({ matches: 1, score: 500 });
  });

  it('does not undo a reset made in another tab', () => {
    const storage = memory();
    const a = new ProfileStore(storage, at);
    const b = new ProfileStore(storage, at);
    b.bank(match({ score: 900 }));
    a.reset();
    b.bank(match({ score: 100 }));
    expect(b.profile.stats).toMatchObject({ matches: 1, score: 100 });
    expect(new ProfileStore(storage, at).profile.stats).toMatchObject({ matches: 1, score: 100 });
  });

  it('resets to nothing', () => {
    const storage = memory();
    const store = new ProfileStore(storage, at);
    store.bank(match());
    store.reset();
    expect(store.profile).toEqual(emptyProfile());
    expect(storage.data.has(PROFILE_KEY)).toBe(false);
    expect(new ProfileStore(storage, at).profile).toEqual(emptyProfile());
  });
});

describe('the match tracker', () => {
  const line = (reason: ScoreLine['reason'], more: Partial<ScoreLine> = {}): ScoreLine => ({ reason, points: 0, ...more });

  it('counts kills by weapon with their headshots and the longest, from the score events alone', () => {
    const t = new MatchTracker();
    t.score([line('kill', { victim: 'b', weapon: 'smg', metres: 12 }), line('headshot'), line('firstBlood')]);
    t.score([line('kill', { victim: 'c', weapon: 'smg', metres: 30 }), line('doubleKill')]);
    t.score([line('kill', { victim: 'd', weapon: 'sniper', metres: 120 }), line('headshot'), line('longShot', { metres: 120 }), line('streak3')]);
    // A grenade's kill has no gun to credit, a melee kill no weapon at all; an assist is not a kill.
    t.score([line('kill', { victim: 'e', weapon: 'frag' }), line('grenade')]);
    t.score([line('kill', { victim: 'f' }), line('melee'), line('streak5')]);
    t.score([line('assist', { victim: 'g' })]);
    const r = t.record({ mode: 'ffa', won: true, place: null, row: { score: 950, kills: 5, deaths: 1, assists: 1 } });
    expect(r.weapons).toEqual({ smg: { kills: 2, headshots: 1, longest: 30 }, sniper: { kills: 1, headshots: 1, longest: 120 } });
    expect(r.headshots).toBe(2);
    expect(r.reasons).toMatchObject({ kill: 5, headshot: 2, firstBlood: 1, doubleKill: 1, longShot: 1, grenade: 1, melee: 1, assist: 1, streak3: 1, streak5: 1 });
    expect(r.medal).toBe('streak5');
    expect(t.medal).toBe('streak5');
    expect(r).toMatchObject({ mode: 'ffa', won: true, score: 950, kills: 5, deaths: 1, assists: 1, bestStreak: 5 });
  });

  it('ends a streak at a death, counts a Down as the kill and not its finish, and adds up the time', () => {
    const t = new MatchTracker();
    t.score([line('down', { victim: 'b', weapon: 'm4a1', metres: 20 })]);
    t.score([line('finish', { victim: 'b' })]);
    t.score([line('down', { victim: 'c', weapon: 'm4a1', metres: 8 })]);
    t.died();
    t.score([line('kill', { victim: 'd', weapon: 'pistol', metres: 5 })]);
    t.score([line('revive')]);
    t.played(1.5);
    t.played(2);
    const r = t.record({ mode: 'battle-royale', won: false, place: 3, row: { score: 425, kills: 3, deaths: 1, assists: 0 } });
    expect(r.bestStreak).toBe(2);
    expect(r.weapons).toEqual({ m4a1: { kills: 2, headshots: 0, longest: 20 }, pistol: { kills: 1, headshots: 0, longest: 5 } });
    expect(r.reasons).toMatchObject({ down: 2, finish: 1, kill: 1, revive: 1 });
    expect(r.seconds).toBe(3.5);
    expect(r.place).toBe(3);
    expect(r.medal).toBeNull();
  });
});

describe('how the numbers read', () => {
  it('sets thousands apart and says time played in minutes, then hours', () => {
    expect(figure(0)).toBe('0');
    expect(figure(12480)).toBe('12,480');
    expect(playedFor(59)).toBe('0 min');
    expect(playedFor(14 * 60 + 30)).toBe('14 min');
    expect(playedFor(3 * 3600 + 5 * 60)).toBe('3 h 05 min');
  });
});

describe('a match on its way into the Profile', () => {
  const at = () => new Date(2026, 10, 9, 20, 0);
  const row = { score: 1200, kills: 9, deaths: 4, assists: 1 };
  const about = () => ({ mode: 'tdm' as const, won: true, place: null, row });
  const playing = { playing: true, over: false, about };
  const over = { playing: false, over: true, about };
  const between = { playing: false, over: false, about };

  it('banks a match once, however long its end stays on screen, with the time it was played', () => {
    const store = new ProfileStore(memory(), at);
    const keeper = new MatchKeeper(store);
    for (let frame = 0; frame < 600; frame++) keeper.update(1 / 60, playing);
    expect(keeper.gain).toBeNull();
    for (let frame = 0; frame < 600; frame++) keeper.update(1 / 60, over);
    expect(keeper.gain).not.toBeNull();
    expect(store.profile.stats).toMatchObject({ matches: 1, wins: 1, score: 1200, kills: 9 });
    expect(store.profile.stats.seconds).toBeCloseTo(10, 5);
  });

  it('does not bank a match this page only saw the end of', () => {
    const store = new ProfileStore(memory(), at);
    const keeper = new MatchKeeper(store);
    for (let frame = 0; frame < 60; frame++) keeper.update(1 / 60, over);
    expect(keeper.gain).toBeNull();
    expect(store.profile.stats.matches).toBe(0);
  });

  it('banks nothing between the playing and the result, and the next match on its own', () => {
    const store = new ProfileStore(memory(), at);
    const keeper = new MatchKeeper(store);
    keeper.update(1, playing);
    keeper.update(1, between);
    expect(store.profile.stats.matches).toBe(0);
    keeper.update(1, over);
    expect(store.profile.stats.matches).toBe(1);
    // The next match starts clean: its end banks it, and nothing of the last one comes along.
    keeper.begin();
    expect(keeper.gain).toBeNull();
    keeper.update(1, over);
    expect(store.profile.stats.matches).toBe(1);
    keeper.update(2, playing);
    keeper.update(1, over);
    expect(store.profile.stats).toMatchObject({ matches: 2 });
    expect(store.profile.stats.seconds).toBeCloseTo(3, 5);
  });

  it('keeps the score events and deaths it is told, and nothing with no Profile to keep them in', () => {
    const store = new ProfileStore(memory(), at);
    const keeper = new MatchKeeper(store);
    keeper.update(1, playing);
    keeper.score([{ reason: 'kill', points: 100, weapon: 'm4a1', metres: 20 } as ScoreLine]);
    keeper.score([{ reason: 'kill', points: 100, weapon: 'm4a1', metres: 30 } as ScoreLine]);
    keeper.died();
    keeper.score([{ reason: 'kill', points: 100, weapon: 'm4a1', metres: 10 } as ScoreLine]);
    keeper.update(1, over);
    expect(store.profile.stats.bestStreak).toBe(2);
    const none = new MatchKeeper(null);
    none.update(1, playing);
    none.update(1, over);
    expect(none.gain).toBeNull();
  });
});
