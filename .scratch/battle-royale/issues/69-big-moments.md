# The match's big moments

Status: resolved
Release: v2.131.0
Blocked by: none
Labels: enhancement

Kill feed lines for Battle Royale (who downed, finished, rebooted), "Squad wiped" callouts with how many Squads are left, a Kill Leader (most eliminations, at least 3) shown to everyone with a callout when it changes, the champion Squad (last match's winner, or the Kill Leader) introduced at the dive, and a victory beat for the winning Squad before the nuke ending. DESIGN.md; check at phone width; keep the centre clear.

## Comments

Checked against the game first. The kill feed already had who downed whom ("Downed"), who finished whom (by weapon, "Bled out" or "Squad out"), and Reboots ("X rebooted Y in F9") from tickets 57 and 70.

Added:
- **Squad wiped** (`squadOut` mode event): once for each Duos or Trios Squad when nobody in it is left standing. It gives the names, who put out the last of them, and how many Squads are left: "Squad wiped: Static and Pike, by Enemy · 28 Squads left". In Solos the kill feed says it already, so nothing is sent. The line is lit when the Squad is yours or your Squad did it.
- **Kill Leader** (`KILL_LEADER` = 3 eliminations): the seat with the most eliminations from 3 on. A tie keeps whoever got there first. The leader is sent in the Ring's state, so everyone sees it, late joiners too, as a quiet plate under the Ring line ("KILL LEADER Enemy 6", "You" when it's you). A `killLeader` event puts a feed line out each time a new seat takes it ("Enemy is the Kill Leader · 3 eliminations"), plus a toast when that seat is you. The Ring line, Kill Leader, outside warning and next-circle line now stack under the compass in one column, so none can overlap another.
- **Champion Squad at the dive**: the mode remembers the last match. The new match's champions are the Squad holding any of its winners, or else the Squad holding its Kill Leader; with neither back there is none. It travels in the Ring's state. In the Preparation's last 5 s it shows under the Alive count on the right, away from the centre: "Champion Squad / Filler and Enemy / Won the last match", or "Your Squad: champions", or "Last match's Kill Leader, N eliminations".
- **Victory beat** (`INTERMISSION.victory` = 3 s, `victoryBeat(mode)`): a Battle Royale's nuke phase is 3 s longer, and the nuke's shot and sound start 3 s later. In between, each player keeps their own view. The winners see "Victory / 1st / of N Squads" and everyone else sees "Match over / names / win, 1st of N Squads", at 30% height, the same spot as the out card. Then the nuke plays with the end panel as before. That card already says who won, so the match-end toast is not shown in a Battle Royale.
- The protocol is now 22 (new events and state fields, and the longer nuke phase).

Seen in a browser (Duos on the real server, `.scratch/battle-royale/t69/look.mjs`, 1920x1080 and 390x844). The harness gave the Enemy 6 outs from three bot Squads: three "Squad wiped ... by Enemy · 29/28/27 Squads left" lines, "Enemy is the Kill Leader · 3 eliminations", and the plate reading "KILL LEADER Enemy 6". At the time limit, "Match over / Filler and Enemy / win, 1st of 30 Squads" showed before the nuke; 3.5 s later the card was gone and the nuke and end panel were up. In the next match's dive, "Champion Squad / Filler and Enemy / Won the last match" showed. No page errors.

Tests: core 851 (5 new), client 367, server 53, range 243 + 167, typecheck clean. Measures (60 seats, all bots, Zero Island): Duos seed 1 server tick p99 2.88 ms, Trios 2.31 ms (ticket 66: 2.86 / 2.28). Local-bots worker: Solos mean 1.30 / p99 3.14 ms, Trios 1.35 / 3.25 ms.

Choices made without asking: the Kill Leader title stays with someone who has been put out, since their count is final and is still the one to beat. Champions come from the winners first, the Kill Leader second, as the ticket orders them.

Phone width: a long "Squad wiped" line wraps to two lines in the top-right feed, below the stack and well above the centre.

