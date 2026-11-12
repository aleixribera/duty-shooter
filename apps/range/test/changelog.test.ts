import { describe, expect, it } from 'vitest';
import { byVersion, parseLog, releaseTitle } from '../changelog/releases';

const RS = '\x1e';
const FS = '\x1f';
/** A record as `git log --no-walk --tags --format=%x1e%D%x1f%cs%x1f%s --name-only` writes it. */
const record = (refs: string, date: string, subject: string, ...files: string[]) => `${RS}${refs}${FS}${date}${FS}${subject}\n\n${files.join('\n')}\n`;

describe('the changelog read from git', () => {
  it("titles a release by its message's words before the colon", () => {
    expect(releaseTitle('Brass casings, not black rods: the review said the ejected cases were two black rods.')).toBe('Brass casings, not black rods');
    expect(releaseTitle('Widen Survival Town\'s doors so players pass without snagging')).toBe("Widen Survival Town's doors so players pass without snagging");
    expect(releaseTitle('Battle Royale in a process of its own behind the one address (ticket 13)')).toBe('Battle Royale in a process of its own behind the one address');
    expect(releaseTitle('character-and-weapon-presentation')).toBe('Character and weapon presentation');
    expect(releaseTitle('v1.2.7')).toBeNull();
  });

  // Second-opinion review: early messages with no colon showed as whole paragraphs, up to 422 characters.
  it('keeps a long message with no early colon to its first words', () => {
    expect(releaseTitle('A smoke no longer hides a body an arm and a step away (2.5 m), from bots and from the aim helps. Two men inside one cloud used to stand side by side unseen.')).toBe('A smoke no longer hides a body an arm and a step away (2.5 m), from bots and from the aim helps');
    const long = releaseTitle("A controller now slows over an enemy you can see, as touch does, never pulling toward one, and it rumbles: each gun's shot by its kick, a tick for a hit (ticket 12)")!;
    expect(long).toBe('A controller now slows over an enemy you can see, as touch does, never pulling toward one…');
    expect(long.length).toBeLessThanOrEqual(101);
  });

  it('lists only releases that changed the game, newest first, the highest tag on a commit', () => {
    const log =
      record('tag: v2.1.0', '2026-11-02', 'Bots play Battle Royale: they drop, loot and fight.', 'packages/fps-core/src/bots.ts') +
      record('HEAD -> main, tag: v2.2.1, tag: v2.2.0, origin/main', '2026-11-12', 'Open timber deck stairs: an open flight.', 'apps/range/src/map/survival-town.ts', 'apps/range/test/survival-town.test.ts') +
      record('tag: v2.1.1', '2026-11-03', 'Ticket the end-of-match train not playing', '.scratch/next-level/issues/33.md') +
      record('tag: v2.1.2', '2026-11-03', 'Check the sniper against its row', 'apps/range/test/sniper.test.ts', 'apps/range/scripts/ttk.mjs', 'AGENTS.md');
    expect(parseLog(log)).toEqual([
      { version: 'v2.2.1', date: '2026-11-12', title: 'Open timber deck stairs' },
      { version: 'v2.1.0', date: '2026-11-02', title: 'Bots play Battle Royale' },
    ]);
  });

  it('shows a release that only redid the one before it once, as the newer', () => {
    const log = record('tag: v2.104.0', '2026-11-02', 'Bots play Battle Royale', 'packages/a.ts') + record('tag: v2.104.1', '2026-11-02', 'Bots play Battle Royale', 'packages/a.ts');
    expect(parseLog(log).map((r) => r.version)).toEqual(['v2.104.1']);
  });

  it('orders versions by number, not as text', () => {
    expect(['v2.9.0', 'v2.100.0', 'v2.10.3', 'v1.40.0'].sort(byVersion)).toEqual(['v2.100.0', 'v2.10.3', 'v2.9.0', 'v1.40.0']);
  });
});
