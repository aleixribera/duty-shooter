# Profile, rank and stats

Status: resolved

Release: v2.151.0

Spec: `../spec.md`

Nothing remembers the player. A profile in localStorage: XP from score, rank, lifetime and per-weapon stats, weapon mastery, daily challenges, a profile screen, XP on the match end. No invented numbers.

## Comments

Released in v2.151.0. Decisions:

- The Profile belongs to the browser: `localStorage` key `duty-shooter.profile.v1`, read through a parser that keeps every number that is one and drops the rest, so a damaged or hand-edited blob never throws and never shows a figure that was not stored. The model is pure (`packages/fps-client/src/profile/model.ts`); the store re-reads storage before it banks, so two tabs do not overwrite each other's matches.
- XP is the match's Score, plus a quarter of it for a win, plus what a Challenge completed in that match pays. Nothing else gives XP.
- A match is banked once, when it ends (in a Battle Royale, when your Squad has its place). Leaving early banks nothing, and so does joining a match already over. The Practice Range and `?explore` never bank: the game banks only where the driver is a real match.
- Rank 1 to 50 on one power curve through 800 XP (Rank 2) and 400,000 XP (Rank 50), each floor to the nearest 50. Ten titles of five Ranks each, the staff of a weapons test range: Observer, Range Hand, Spotter, Marksman, Armourer, Evaluator, Range Officer, Proof Master, Chief Evaluator, Test Director. The titles are mine: change them freely, they are one array.
- Lifetime: matches, wins, kills, deaths, K/D, headshots, Assists, Score, best streak, time played; Royale wins and best place appear once a Battle Royale has been played. Per weapon: kills, headshots, longest kill, and Mastery 0 to 5 at 25, 75, 150, 300 and 500 kills. Per-weapon figures come from the kill lines of the score events, which name the weapon and the metres.
- Challenges: three a day out of 23, drawn from the date alone, so the same three on every machine that day; at most one about a particular weapon and at most one that needs a particular Mode. A day is the browser's local calendar day. One pays once.
- The way in is the line under the name field on the main menu, "Rank 4 Observer … Profile" with the bar to the next Rank. It is not a sixth destination: the destination list stays places to play, and the same line is what shows the Rank beside the name.
- The screen is one page in two columns (you on the left: Rank, lifetime strip, today's Challenges; the weapons on the right), one column on a phone. No tabs. "Reset profile" is in the footer and asks once more, with "Keep it" focused and "Erase profile" in the alert colour.
- Bars are in the text colour on a line-colour track; signal stays on what can be pressed.
- An empty Profile shows zeros and says what counts. No figure on the screen is made up.

**Seen working**: after one scripted free-for-all the stored blob held that match's numbers and the screen showed them (`shots/profile-*.png`, `profile-foot-390.png`, `profile-reset-ask-*.png`, `menu-rank-*.png`). 26 unit tests in `test/profile.test.ts`, more in `test/score-ui.test.ts`.

**Integration (the owning session)**

- `#wonBy` in `game.ts` is the one place that says whether a seat won, shared by the music's ending and by what the Profile banks: the two had each their own copy.
- The Rank line's name on the main menu is in the text colour (it was the secondary grey, too faint under the title at 1920).
- A stored Profile was read back on a second visit of the same browser profile: Rank 3 Observer, 2,725 of 4,600 XP, Matches 1, on the menu line and on the Profile screen. A scripted browser has to stay open about 8 s after the match is banked, or Chrome is killed before local storage reaches the disk; that is the script, not the game.

**After a review (in this release)**

- Banking is its own piece, `MatchKeeper` in `profile/keeper.ts`: the match's time while it is played, banked once when it is over for you, never a match this page only saw the end of. It was three flags inside the game with no test; it has four now (600 frames of an ending bank one match).
- A match the browser would not store is no longer lost to the next one: the store keeps building on what it holds in memory after a failed write, instead of reading the older Profile back and dropping the match between. A Profile reset in another tab is honoured: the next match banks onto nothing, not onto this tab's stale copy.
- Not tested, only read and seen in a browser: that a hostile name comes out escaped on the lines beside the crosshair, the XP strip, the Profile screen and the MVP line (they all go through the HUD's one escape).
