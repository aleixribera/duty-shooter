import { MODE_IDS, STATS, WEAPON_IDS, type Medal, type ModeId, type ScoreReason, type WeaponId } from '@duty-shooter/fps-core';

/**
 * The Profile (ticket 17): what one browser remembers of its player between
 * matches. Total XP and the Rank it makes, lifetime numbers, each weapon's
 * kills and Mastery, and today's three Challenges. Everything here is plain
 * data and pure functions: the store keeps it in browser storage, the match
 * tracker feeds it, the menu and the HUD draw it.
 *
 * Only the local player's own numbers are ever recorded, and only from a
 * match that was played to its end.
 */

export const PROFILE_KEY = 'duty-shooter.profile.v1';
export const PROFILE_VERSION = 1;

/** A weapon's own numbers: kills made with it, how many through the head, and the longest of them (m). */
export interface WeaponRecord {
  readonly kills: number;
  readonly headshots: number;
  readonly longest: number;
}

export interface Lifetime {
  readonly matches: number;
  readonly wins: number;
  readonly kills: number;
  readonly deaths: number;
  readonly headshots: number;
  readonly assists: number;
  readonly score: number;
  /** Seconds in a match, alive or waiting to respawn. */
  readonly seconds: number;
  /** The most kills in a row without dying. */
  readonly bestStreak: number;
  readonly royaleWins: number;
  /** The best place a Squad of yours took in a Battle Royale, or null before the first. */
  readonly royaleBest: number | null;
  /** Matches played, by mode. */
  readonly modes: Readonly<Partial<Record<ModeId, number>>>;
}

/** Today's Challenges: the local date they were drawn for, and how far each has come. */
export interface Daily {
  readonly date: string;
  readonly progress: Readonly<Record<string, number>>;
}

export interface Profile {
  readonly version: typeof PROFILE_VERSION;
  readonly xp: number;
  readonly stats: Lifetime;
  readonly weapons: Readonly<Partial<Record<WeaponId, WeaponRecord>>>;
  readonly daily: Daily;
}

export function emptyProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    xp: 0,
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, assists: 0, score: 0, seconds: 0, bestStreak: 0, royaleWins: 0, royaleBest: null, modes: {} },
    weapons: {},
    daily: { date: '', progress: {} },
  };
}

/* ---------- Rank ---------- */

export const MAX_RANK = 50;
/** The two ends the curve is drawn through: the XP at which Rank 2 and Rank 50 begin. */
const RANK_TWO_XP = 800;
const MAX_RANK_XP = 400_000;
const CURVE = Math.log(MAX_RANK_XP / RANK_TWO_XP) / Math.log(MAX_RANK - 1);

/**
 * The ten titles, each held for five Ranks: the staff of a weapons test
 * range, from the one who watches to the one who signs it off.
 */
export const RANK_TITLES: readonly string[] = ['Observer', 'Range Hand', 'Spotter', 'Marksman', 'Armourer', 'Evaluator', 'Range Officer', 'Proof Master', 'Chief Evaluator', 'Test Director'];

/** The total XP at which `rank` begins: 0 for Rank 1, one smooth power curve from there, to the nearest 50. */
export function rankFloor(rank: number): number {
  const r = Math.max(1, Math.min(MAX_RANK, Math.floor(rank)));
  return r === 1 ? 0 : Math.round((RANK_TWO_XP * (r - 1) ** CURVE) / 50) * 50;
}

export function rankTitle(rank: number): string {
  const r = Math.max(1, Math.min(MAX_RANK, Math.floor(rank)));
  return RANK_TITLES[Math.floor((r - 1) / 5)]!;
}

export interface RankInfo {
  readonly rank: number;
  readonly title: string;
  readonly xp: number;
  /** The XP this Rank began at, and where the next begins (null at the last Rank). */
  readonly floor: number;
  readonly next: number | null;
  /** How far through this Rank, 0 to 1 (1 at the last Rank). */
  readonly share: number;
}

export function rankOf(xp: number): RankInfo {
  const total = Math.max(0, Math.floor(xp));
  let rank = 1;
  while (rank < MAX_RANK && total >= rankFloor(rank + 1)) rank++;
  const floor = rankFloor(rank);
  const next = rank < MAX_RANK ? rankFloor(rank + 1) : null;
  return { rank, title: rankTitle(rank), xp: total, floor, next, share: next === null ? 1 : (total - floor) / (next - floor) };
}

/* ---------- Mastery ---------- */

/** Kills with a weapon at which each level of Mastery is reached. */
export const MASTERY_KILLS: readonly number[] = [25, 75, 150, 300, 500];

export interface Mastery {
  /** 0 before the first threshold, up to 5. */
  readonly level: number;
  readonly of: number;
  /** The kills the next level takes, or null once mastered. */
  readonly next: number | null;
  /** How far from the last threshold to the next, 0 to 1 (1 once mastered). */
  readonly share: number;
}

export function masteryOf(kills: number): Mastery {
  const level = MASTERY_KILLS.filter((k) => kills >= k).length;
  const next = MASTERY_KILLS[level] ?? null;
  const from = level === 0 ? 0 : MASTERY_KILLS[level - 1]!;
  return { level, of: MASTERY_KILLS.length, next, share: next === null ? 1 : (kills - from) / (next - from) };
}

export interface WeaponRow extends WeaponRecord {
  readonly id: WeaponId;
  readonly name: string;
  readonly mastery: Mastery;
}

/** Every weapon of the arsenal with this Profile's numbers for it, the most used first. */
export function weaponRows(profile: Profile): WeaponRow[] {
  return WEAPON_IDS.map((id) => {
    const w = profile.weapons[id] ?? { kills: 0, headshots: 0, longest: 0 };
    return { id, name: STATS.weapons[id].traits.name, ...w, mastery: masteryOf(w.kills) };
  }).sort((a, b) => b.kills - a.kills);
}

/* ---------- A match, as the Profile takes it ---------- */

/** One finished match of the local player's. */
export interface MatchRecord {
  readonly mode: ModeId;
  readonly won: boolean;
  /** Their scoreboard row at the end: the server's numbers. */
  readonly score: number;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
  readonly headshots: number;
  readonly seconds: number;
  readonly bestStreak: number;
  /** Battle Royale: their Squad's place. */
  readonly place: number | null;
  readonly weapons: Readonly<Partial<Record<WeaponId, WeaponRecord>>>;
  /** How many times each row of the points table paid them. */
  readonly reasons: Readonly<Partial<Record<ScoreReason, number>>>;
  /** The best Medal they earned, or null. */
  readonly medal: Medal | null;
}

/* ---------- Challenges ---------- */

export interface Challenge {
  readonly id: string;
  readonly text: string;
  readonly target: number;
  /** XP paid once, when the target is reached. */
  readonly xp: number;
  /** `day`: matches add up through the day. `match`: the best single match counts. */
  readonly scope: 'day' | 'match';
  /** A day draws at most one Challenge about a weapon and one bound to a mode, so the three never all ask for the same thing. */
  readonly group: 'general' | 'weapon' | 'mode';
  /** What one match adds. */
  count(match: MatchRecord): number;
}

const reason = (r: ScoreReason) => (m: MatchRecord) => m.reasons[r] ?? 0;
const withWeapon = (id: WeaponId, target: number, xp: number): Challenge => ({
  id: `kills-${id}`,
  text: `${target} kills with the ${STATS.weapons[id].traits.name}`,
  target,
  xp,
  scope: 'day',
  group: 'weapon',
  count: (m) => m.weapons[id]?.kills ?? 0,
});

/** Every Challenge a day can draw. An id is never reused for a different task: stored progress is kept by it. */
export const CHALLENGES: readonly Challenge[] = [
  withWeapon('smg', 40, 1200),
  withWeapon('m4a1', 40, 1000),
  withWeapon('shotgun', 15, 1000),
  withWeapon('sniper', 10, 1200),
  withWeapon('pistol', 8, 1000),
  { id: 'headshots-match', text: '5 headshots in one match', target: 5, xp: 800, scope: 'match', group: 'general', count: (m) => m.headshots },
  { id: 'headshots', text: '15 headshots', target: 15, xp: 1000, scope: 'day', group: 'general', count: (m) => m.headshots },
  { id: 'wins', text: 'Win 2 matches', target: 2, xp: 1000, scope: 'day', group: 'general', count: (m) => (m.won ? 1 : 0) },
  { id: 'matches', text: 'Play 3 matches', target: 3, xp: 500, scope: 'day', group: 'general', count: () => 1 },
  { id: 'kills', text: '60 kills', target: 60, xp: 1000, scope: 'day', group: 'general', count: (m) => m.kills },
  { id: 'assists', text: '8 assists', target: 8, xp: 700, scope: 'day', group: 'general', count: (m) => m.assists },
  { id: 'triple-kill', text: 'A triple kill', target: 1, xp: 1200, scope: 'day', group: 'general', count: reason('tripleKill') },
  { id: 'double-kills', text: '3 double kills', target: 3, xp: 900, scope: 'day', group: 'general', count: reason('doubleKill') },
  { id: 'long-shots', text: '3 long shots', target: 3, xp: 900, scope: 'day', group: 'general', count: reason('longShot') },
  { id: 'revenge', text: '3 revenge kills', target: 3, xp: 700, scope: 'day', group: 'general', count: reason('revenge') },
  { id: 'melee', text: '2 melee kills', target: 2, xp: 800, scope: 'day', group: 'general', count: reason('melee') },
  { id: 'grenades', text: '3 grenade kills', target: 3, xp: 900, scope: 'day', group: 'general', count: reason('grenade') },
  { id: 'streak', text: '5 kills without dying', target: 5, xp: 1000, scope: 'match', group: 'general', count: (m) => m.bestStreak },
  { id: 'score-match', text: 'Score 2,500 in one match', target: 2500, xp: 1000, scope: 'match', group: 'general', count: (m) => m.score },
  { id: 'captures', text: 'Capture 4 zones', target: 4, xp: 800, scope: 'day', group: 'mode', count: reason('capture') },
  { id: 'charges', text: 'Plant or defuse the charge 2 times', target: 2, xp: 800, scope: 'day', group: 'mode', count: (m) => (m.reasons.plant ?? 0) + (m.reasons.defuse ?? 0) },
  { id: 'revives', text: '3 revives', target: 3, xp: 800, scope: 'day', group: 'mode', count: reason('revive') },
  { id: 'royale-top3', text: 'A Battle Royale finished in the top 3', target: 1, xp: 1500, scope: 'day', group: 'mode', count: (m) => (m.mode === 'battle-royale' && m.place !== null && m.place <= 3 ? 1 : 0) },
];

/** How many Challenges a day has. */
export const DAILY_CHALLENGES = 3;

/** The local calendar day a moment falls on, as `YYYY-MM-DD`: the key the day's Challenges are drawn by. */
export function dateKey(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** A day's three Challenges: the same three for the same date, on every machine. */
export function dailyChallenges(date: string): Challenge[] {
  // FNV-1a over the date, then mulberry32 from it: a fixed, well-mixed order of the list for each day.
  let seed = 2166136261;
  for (let i = 0; i < date.length; i++) seed = Math.imul(seed ^ date.charCodeAt(i), 16777619);
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = [...CHALLENGES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const picked: Challenge[] = [];
  for (const c of order) {
    if (picked.length === DAILY_CHALLENGES) break;
    if (c.group !== 'general' && picked.some((p) => p.group === c.group)) continue;
    picked.push(c);
  }
  return picked;
}

export interface ChallengeView {
  readonly id: string;
  readonly text: string;
  readonly target: number;
  readonly xp: number;
  readonly progress: number;
  readonly done: boolean;
}

/** Today's Challenges with this Profile's progress on them (none of it yesterday's). */
export function todaysChallenges(profile: Profile, date: string): ChallengeView[] {
  const progress = profile.daily.date === date ? profile.daily.progress : {};
  return dailyChallenges(date).map((c) => {
    const at = Math.min(c.target, progress[c.id] ?? 0);
    return { id: c.id, text: c.text, target: c.target, xp: c.xp, progress: at, done: at >= c.target };
  });
}

/* ---------- Taking a match ---------- */

/** A win pays a quarter of the match's Score again. */
export const WIN_BONUS = 0.25;

/** A Challenge this match moved. */
export interface ChallengeGain extends ChallengeView {
  readonly before: number;
  /** It reached its target in this match, and paid. */
  readonly completed: boolean;
}

/** What one match did to the Profile: the end screen's "Your match" strip. */
export interface MatchGain {
  readonly score: number;
  /** The win bonus, 0 without a win. */
  readonly bonus: number;
  /** XP from Challenges completed in this match. */
  readonly challengeXp: number;
  /** All of it: Score, bonus and Challenges. */
  readonly xp: number;
  readonly before: RankInfo;
  readonly after: RankInfo;
  readonly rankUp: boolean;
  /** Today's Challenges that this match moved. */
  readonly challenges: readonly ChallengeGain[];
}

/** The Profile after `match`, played on local day `date`, and what it gained. */
export function applyMatch(profile: Profile, match: MatchRecord, date: string): { profile: Profile; gain: MatchGain } {
  const score = Math.max(0, Math.floor(match.score));
  const bonus = match.won ? Math.round(score * WIN_BONUS) : 0;
  const had = profile.daily.date === date ? profile.daily.progress : {};
  const progress: Record<string, number> = {};
  const challenges: ChallengeGain[] = [];
  let challengeXp = 0;
  for (const c of dailyChallenges(date)) {
    const before = Math.min(c.target, had[c.id] ?? 0);
    const made = Math.max(0, Math.floor(c.count(match)));
    const after = Math.min(c.target, c.scope === 'day' ? before + made : Math.max(before, made));
    if (after > 0) progress[c.id] = after;
    if (after === before) continue;
    const completed = after >= c.target;
    if (completed) challengeXp += c.xp;
    challenges.push({ id: c.id, text: c.text, target: c.target, xp: c.xp, progress: after, done: completed, before, completed });
  }
  const xp = score + bonus + challengeXp;
  const s = profile.stats;
  const royale = match.mode === 'battle-royale';
  const weapons: Partial<Record<WeaponId, WeaponRecord>> = { ...profile.weapons };
  for (const id of WEAPON_IDS) {
    const add = match.weapons[id];
    if (!add) continue;
    const old = weapons[id] ?? { kills: 0, headshots: 0, longest: 0 };
    weapons[id] = { kills: old.kills + add.kills, headshots: old.headshots + add.headshots, longest: Math.max(old.longest, add.longest) };
  }
  const next: Profile = {
    version: PROFILE_VERSION,
    xp: profile.xp + xp,
    stats: {
      matches: s.matches + 1,
      wins: s.wins + (match.won ? 1 : 0),
      kills: s.kills + match.kills,
      deaths: s.deaths + match.deaths,
      headshots: s.headshots + match.headshots,
      assists: s.assists + match.assists,
      score: s.score + score,
      seconds: s.seconds + Math.max(0, Math.round(match.seconds)),
      bestStreak: Math.max(s.bestStreak, match.bestStreak),
      royaleWins: s.royaleWins + (royale && match.won ? 1 : 0),
      royaleBest: royale && match.place !== null ? Math.min(s.royaleBest ?? Infinity, match.place) : s.royaleBest,
      modes: { ...s.modes, [match.mode]: (s.modes[match.mode] ?? 0) + 1 },
    },
    weapons,
    daily: { date, progress },
  };
  const before = rankOf(profile.xp);
  const after = rankOf(next.xp);
  return { profile: next, gain: { score, bonus, challengeXp, xp, before, after, rankUp: after.rank > before.rank, challenges } };
}

/* ---------- Reading what storage holds ---------- */

const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(v)) : 0);
const record = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * A Profile from whatever storage gave back: each number kept if it is one,
 * anything else dropped to zero, and a blob that is not a version 1 Profile
 * at all read as a new one. Never throws.
 */
export function parseProfile(raw: unknown): Profile {
  const r = record(raw);
  if (r['version'] !== PROFILE_VERSION) return emptyProfile();
  const s = record(r['stats']);
  const modes: Partial<Record<ModeId, number>> = {};
  for (const mode of MODE_IDS) {
    const n = count(record(s['modes'])[mode]);
    if (n > 0) modes[mode] = n;
  }
  const weapons: Partial<Record<WeaponId, WeaponRecord>> = {};
  for (const id of WEAPON_IDS) {
    const w = record(record(r['weapons'])[id]);
    const kills = count(w['kills']);
    if (kills > 0) weapons[id] = { kills, headshots: Math.min(kills, count(w['headshots'])), longest: count(w['longest']) };
  }
  const d = record(r['daily']);
  const date = typeof d['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d['date']) ? d['date'] : '';
  const progress: Record<string, number> = {};
  if (date) {
    for (const c of CHALLENGES) {
      const n = Math.min(c.target, count(record(d['progress'])[c.id]));
      if (n > 0) progress[c.id] = n;
    }
  }
  const best = count(s['royaleBest']);
  return {
    version: PROFILE_VERSION,
    xp: count(r['xp']),
    stats: {
      matches: count(s['matches']),
      wins: count(s['wins']),
      kills: count(s['kills']),
      deaths: count(s['deaths']),
      headshots: count(s['headshots']),
      assists: count(s['assists']),
      score: count(s['score']),
      seconds: count(s['seconds']),
      bestStreak: count(s['bestStreak']),
      royaleWins: count(s['royaleWins']),
      royaleBest: best > 0 ? best : null,
      modes,
    },
    weapons,
    daily: { date, progress },
  };
}

/** A Profile from the text storage holds: unreadable text is a new Profile. */
export function readProfile(text: string | null): Profile {
  if (!text) return emptyProfile();
  try {
    return parseProfile(JSON.parse(text));
  } catch {
    return emptyProfile();
  }
}

/* ---------- How the numbers read ---------- */

/** A count with its thousands apart: "12,480". */
export function figure(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Time played as it reads on the Profile: "14 min", "3 h 05 min". */
export function playedFor(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Kills a death, to two places; with no deaths, the kills themselves. */
export function ratio(kills: number, deaths: number): string {
  return (kills / Math.max(1, deaths)).toFixed(2);
}

const MEDAL_NAMES: Readonly<Record<Medal, string>> = {
  longShot: 'Long shot',
  revenge: 'Revenge',
  firstBlood: 'First blood',
  doubleKill: 'Double kill',
  tripleKill: 'Triple kill',
  multiKill: 'Multi kill',
  streak3: 'Streak 3',
  streak5: 'Streak 5',
  streak7: 'Streak 7',
  streak10: 'Streak 10',
};

/** A Medal's name as the HUD and the end screen say it. */
export function medalName(medal: Medal): string {
  return MEDAL_NAMES[medal];
}

/** What each row of the points table reads as on a score line: "+100 Eliminated". */
export const REASON_NAMES: Readonly<Record<ScoreReason, string>> = {
  kill: 'Eliminated',
  down: 'Downed',
  finish: 'Finished',
  headshot: 'Headshot',
  assist: 'Assist',
  longShot: 'Long shot',
  melee: 'Melee',
  grenade: 'Grenade',
  firstBlood: 'First blood',
  revenge: 'Revenge',
  doubleKill: 'Double kill',
  tripleKill: 'Triple kill',
  multiKill: 'Multi kill',
  streak3: 'Streak 3',
  streak5: 'Streak 5',
  streak7: 'Streak 7',
  streak10: 'Streak 10',
  zoneKill: 'Zone kill',
  capture: 'Zone captured',
  plant: 'Charge planted',
  defuse: 'Charge defused',
  revive: 'Revive',
  reboot: 'Reboot',
};
