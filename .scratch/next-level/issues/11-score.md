# Kill confirmation and score

Status: resolved

Release: v2.151.0

Spec: `../spec.md`

Score events from the core (kill 100, headshot +50, assist, objective, streaks, revenge, long shot, first blood), a popup stack by the crosshair, medals for multi-kills, a kill sound worth hearing, score and assists on the scoreboard.

## Comments

Released in v2.151.0. Decisions:

**The core**

- One points table, `STATS.score` (`packages/fps-core/src/stats/score.ts`), every number a game value with its reason. Kill 100; headshot +50; Assist 50 (30 damage or more to the victim in the 8 s before, by a seat other than the killer); long shot +25 (past 40 m, the sniper past 90 m); revenge +25; first blood +50; double, triple, multi kill +50, +100, +150 (each kill within 3.5 s of the one before); streaks at 3, 5, 7, 10 kills without dying +50, +100, +150, +250; melee +50, grenade +25; Outposts capture 150 for each seat in the zone as it is taken, zone kill +25; Charge plant 200, defuse 300; Battle Royale Down scores as the kill, finish 25, Revive 100, Reboot 150.
- `ScoreKeeper` (`modes/score.ts`) keeps every seat's Score, people and bots alike, from the simulation's own events. Every mode owns one; nothing is scored after the match is decided.
- `Score.score` is now the match Score in every mode, with `assists` and the best `medal` beside it. Gun game's ladder moved to `Score.progress`; its win condition and its ranking read that, so nothing about who wins changed. Score never decides a match: the match bar and every win condition still read the mode's own counters.
- FFA has Assists too (damage to someone another seat then kills).
- A `score` mode event carries the lines in the order earned (`reason`, `points`, and on a kill or Down line the victim, the weapon and the metres). The server sends it to the seat that earned it and to nobody else. Protocol 26.
- Tests changed, each because the field's meaning changed and not to make one pass: gun game's tests read `progress` where they read `score`; Charge, Outposts and Reboot gained an assertion on what the table pays.

**The HUD**

- The stack stands right of and below the crosshair (124 px right, 16 px down at desktop size), so the centre stays clear: a Medal's name at 30 px, the running total at heading size counting up, then one line a reason, newest on top, six at most. A line goes after 2.5 s, a Medal after 2 s. Each row stands on a horizontal scrim that runs out to the right (DESIGN.md: text over the world stands on a scrim); the first version, text with a shadow alone, could not be read over a sunlit wall.
- At 860 px and narrower the stack is centred under the crosshair, three lines at most; in a window under 520 px high, two.
- Everything is in the text colour. Signal is kept for what can be pressed, so a Medal is told apart by size and by its sound, not by a colour.
- `.ds-elim` and its callout are gone. `Hud.eliminated` survives for the Practice Range alone, where nothing is scored: it puts "Eliminated" or "Headshot" and the dummy's name in the same stack, without a figure.
- A Down in a Battle Royale gets the kill's lines and the kill's sound, from its score line.
- Sounds (`audio/ui.ts`): the kill confirm was reworked into two parts, a headshot kill has its own (`headshotKill`), and `medal`, `rankUp` and `challengeDone` are new. Registering them took one-line inserts in `audio/types.ts`, `audio/voices.ts` and `audio/system.ts`, files the audio session is rewriting: check them when the two merge.
- Scoreboard: `#`, Player, Score, Kills, Deaths, Assists, Ping, sorted by Score, ties by kills then fewer deaths. At 1100 px and narrower the three counts become K, D, A (the full word stays as the cell's title), which is what lets a phone show all of them with the teams stacked.

**Seen working**: `.scratch/next-level/score/shots/` (`kill-headshot`, `kill`, `medal`, `scoreboard`, each `-1920` and `-390`), from `play.mjs` playing a free-for-all Bot Match with an aiming player. `tdm0/scoreboard-*.png` is the team board. `range-kill-1920.png` (`offline.mjs`) is the Practice Range: the line without a figure, and nothing stored.

**Integration (the owning session)**

- The snapshot codec's one-byte dictionary was full: Score's seven new words pushed it to 229 of 224 and every snapshot with a word past the limit decoded wrong (seen as a scripted Outposts match whose scoreboard was not a list). `assists` took the last one-byte place, since every scoreboard row carries it; everything else new went to a second page, `MORE_WORDS` in `net/codec.ts`, two bytes a word (a tag, then which). New words go at the end of that list from now on. `codec.test.ts` reads every word of both pages back.
- Protocol 26, not 25: 25 went out with recoil return (v2.150.0).
- Seen on the combined tree (Score, Profile and the sound arc together), on a copy of the repo with its own dev server: a scripted Outposts Bot Match with kill, headshot, Assist and double kill lines, the scoreboard at 1920 and 390, and the end panel; a gun game whose ladder still decides it while the board sorts by Score.

**After a review (in this release)**

- The lines beside the crosshair can shrink inside their column (`min-width: 0`): a long name pushed the points off a narrow screen.
- Left as they are, on purpose: a streak survives being Downed and ends only with a death or an elimination (a revive is the reward); the long shot is measured where the bullet's tick left the two players, which can differ from the kill line's distance by centimetres.
- Known and accepted: a player who rejoins a running match starts their streak, their multi-kill chain and their nemesis afresh, and the Score a stand-in bot earns while a seat is empty is on the scoreboard but not in the returning player's Profile counts.
