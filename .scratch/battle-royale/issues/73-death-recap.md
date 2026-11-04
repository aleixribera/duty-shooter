# Death recap and the match card

Status: resolved
Release: v2.132.0
Blocked by: none
Labels: enhancement

From `../research/mode-elements.md` (A list, new).

**Ticket: the death recap and the match card.** When you're Downed, Finished or out, the spectator panel shows who did it: their weapon, the distance, the damage each of you dealt to the other, and their health left. On the island map it marks where they stood. At match end, before the Battle Royale screen, each person gets one card: placement, eliminations, Downs, Revives and Reboots, damage, time alive, and their route across the island map, with where they fought and where they fell. The data comes from events the server already sends, nothing is stored after the match, and it follows `DESIGN.md`. Check it at desktop and phone width. It gives friends something to talk about in the 20 s before the next Start, the only retention we can earn without persistence.

## Comments

Built in the page (`packages/fps-client/src/ui/recap.ts`, `MatchLog`) from events a seat already gets: its own hits both ways (the hit event always reaches shooter and victim), Downs, outs, Revives, Reboots, and the shots it hears. Nothing on the server changed, so the protocol stays 22. It is dropped at the next `matchStart`.

**Death recap.** Downed: a plate at the bottom left above your health ("Downed by / Wren2 Bot / Wasp 9 · 17 m / You dealt 0 · They dealt 77 · Their health 100"). Out: the same block leads the spectator's panel for 20 s (`RECAP_OUT_MS`), then gives the panel its room back; the island map keeps a cross in the alert colour where they stood, with their name, while you're Downed or out ("Who put you down" in the key). Headlines: Downed by, Finished by (out while Downed, by someone), Eliminated by (out with no Down: Solos), "Bled out · Downed by" and "Squad out · Downed by" (keep the one who Downed you), Downed by the Ring / in a fall, Out to the Ring.
- Calls: "the damage each of you dealt" is this match's total between the two of you, not this life's. Distance is from their last hit on you. Where they stood is their seat as sent, else the eye of their last shot you heard; their health is shown only when their seat is sent ("–" otherwise, never a guess). Damage is what the hit events report (the damage a shot does, so a last shot's overkill counts), the same number the hit readout shows.

**Match card** (`packages/fps-client/src/hud/match-card.ts`). In a Battle Royale it takes the end panel's and the end scoreboard's place through the nuke and the scoreboard, after the victory beat; Tab still opens the board. Place big, a 3x2 readout strip (Eliminations from the scoreboard, Downs, Damage, Revives, Reboots as seats rebooted, Time alive), "Won by ..." when it isn't yours, "Back to the lobby in N s", and the island with your route (a point every 2 s when you've moved 3 m, broken at a Reboot), a dot where you landed, a diamond a fight (hits within 35 m and 20 s are one fight), and a cross where you went Downed (small) or out (large).

**Ticket 69's phone fixes.** The kill feed in a Battle Royale on a phone now starts under the column under the compass, wherever its foot is (a `ResizeObserver` keeps `--ds-brstack-foot`; no layout read a frame), so "Outside the Ring" can't cover it. At phone width each feed line stays one line: a long line gives up the middle of its names with an ellipsis, and "Squad wiped" keeps its "· N Squads left" whole (`squadWipedParts`).

Seen in a browser (`.scratch/battle-royale/t73/look.mjs`, Duos on the real server with the harness, headless and muted, 1920x1080 and 390x844): at phone width, outside the Ring with three feed lines, the warning's foot at 190 px and the feed's first line at 200 px, every line 26 px tall and inside the screen. Placed 14 m from a bot Squad and firing at one, I was Downed by its mate: the plate read "Downed by Briar2 Bot M4A1 · 2 m / You dealt 0 / They dealt 252 / Their health 100" (252 counts hits the harness healed while I was placed); the map showed the cross and name; out, the spectator's panel led with "Bled out · Downed by Briar2". At the time limit the card showed after the beat: "Your match 13th of 30 Squads ... Time alive 0:24 · Back to the lobby in 15 s" with the route, the fight and the two crosses, desktop and phone; the end panel was hidden. An earlier run showed Downs 1 and Damage 106 after I put one Downed. No page errors.

Tests: client 376 (9 new in `recap.test.ts`), typecheck clean. Server and simulation untouched, so no tick measure was needed; the page work is a few map lookups an event and one position a frame.

Not done: `design-audit` (five reviewer agents) was not run; the screenshots were checked by eye at both widths.
