import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The in-game changelog's releases, read from git: one per version tag whose
 * commit changed the game itself, newest first, titled by the first words of
 * its commit message. A build without git (the container's) reads the copy
 * CI wrote beside this file first (`write.ts`).
 */

/** One release as the menu's Changelog lists it. */
export interface Release {
  /** `v2.186.8` */
  readonly version: string;
  /** The commit's day, `2026-11-12`. */
  readonly date: string;
  /** What changed, in a few words. */
  readonly title: string;
}

/** Where the copy for a build without git lives. */
export const CHANGELOG_FILE = new URL('../changelog.json', import.meta.url);

/** A commit changed the game when it touched the client, the server or the shared code outside their tests, scripts and notes. */
const GAME = /^(apps|packages)\//;
const NOT_GAME = /(^|\/)(test|scripts)\/|\.test\.ts$|\.md$/;
const TAG = /tag: (v\d+\.\d+\.\d+)\b/g;
/** Record and field separators in the log below. */
const RS = '\x1e';
const FS = '\x1f';
/** The tagged commits, with their tags, day, subject and the files they changed. */
const LOG = ['log', '--no-walk', '--tags', `--format=${RS}%D${FS}%cs${FS}%s`, '--name-only'];

function versionParts(v: string): number[] {
  return v.slice(1).split('.').map(Number);
}

/** Newer first. */
export function byVersion(a: string, b: string): number {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
}

/** A changelog line's longest: a few words, not the paragraph some early messages are. */
const TITLE_MAX = 100;

/** A subject with no early colon: its first sentence where that is short, else its words up to a comma (or a space) before the limit, and "…". */
function firstWords(subject: string): string {
  const end = subject.search(/[.;] /);
  if (end > 0 && end <= TITLE_MAX) return subject.slice(0, end);
  if (subject.length <= TITLE_MAX) return subject;
  const comma = subject.lastIndexOf(', ', TITLE_MAX);
  const cut = comma > 40 ? comma : subject.lastIndexOf(' ', TITLE_MAX);
  return `${subject.slice(0, cut > 0 ? cut : TITLE_MAX)}…`;
}

/**
 * A commit's subject as a changelog line: the words before its first colon, where the
 * message is "Title: what was wrong and how it was fixed"; its first words otherwise.
 * Null for a subject that says nothing but the version.
 */
export function releaseTitle(message: string): string | null {
  const subject = message.replace(/\s*\((ticket|tickets) [^)]*\)/gi, '');
  const colon = subject.indexOf(': ');
  let title = colon > 0 && colon <= TITLE_MAX ? subject.slice(0, colon) : firstWords(subject);
  title = title.replace(/[.\s]+$/, '').trim();
  if (!title || /^v\d+(\.\d+)*$/.test(title)) return null;
  // An early branch name used as the message: `character-and-weapon-presentation`.
  if (!/\s/.test(title)) title = title.replace(/-/g, ' ');
  return title[0]!.toUpperCase() + title.slice(1);
}

/** The releases in a `git log` run with `LOG`'s arguments. */
export function parseLog(log: string): Release[] {
  const out: Release[] = [];
  for (const record of log.split(RS)) {
    const [head = '', ...files] = record.split('\n');
    const [refs = '', date = '', subject = ''] = head.split(FS);
    const versions = [...refs.matchAll(TAG)].map((m) => m[1]!).sort(byVersion);
    const version = versions[0];
    if (!version || !files.some((f) => GAME.test(f) && !NOT_GAME.test(f))) continue;
    const title = releaseTitle(subject);
    if (title) out.push({ version, date, title });
  }
  out.sort((a, b) => byVersion(a.version, b.version));
  // A release that only redid the one before it (the same title) shows once, as the newer.
  return out.filter((r, i) => i === 0 || r.title !== out[i - 1]!.title);
}

/** The releases from the repository at `cwd`, or null where git or its history isn't there. */
export function gitReleases(cwd: string): Release[] | null {
  try {
    const log = execFileSync('git', LOG, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const releases = parseLog(log);
    return releases.length ? releases : null;
  } catch {
    return null;
  }
}

/** The releases for a build: from git, else from the copy CI wrote, else none (the menu then shows no Changelog). */
export function buildReleases(cwd: string): Release[] {
  const fromGit = gitReleases(cwd);
  if (fromGit) return fromGit;
  if (existsSync(CHANGELOG_FILE)) return JSON.parse(readFileSync(CHANGELOG_FILE, 'utf8')) as Release[];
  return [];
}
