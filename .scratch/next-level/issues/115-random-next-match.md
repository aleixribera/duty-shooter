# Random next match

Status: resolved
Release: v2.204.0

Spec: `../spec.md`; Aleix's request 8 (2026-11-14), before PLAN work. His words: "Can you add a button at the end of each match that starts another new game with a random map and mode and teams (if multiple players) once the normal timer to go to the lobby finishes? Make the admin able to press this."

Reading (the coordinator's): on the match-end screen the lobby host (the only player in a Bot Match) gets a "Random next match" button. If the host pressed it, then when the usual countdown back to the lobby ends, a new match starts straight away instead of the lobby, on a random map, a random mode valid for that map and player count, with the teams shuffled when there are several players. Everyone else sees that the host chose it. Play Online private lobbies and Bot Match; Battle Royale only if a random pick fits there.

Acceptance: a Bot Match ends, the host presses the button, the countdown runs out and a match on a different random map/mode starts with no lobby in between (frames); online, two scripted friends see "the host chose a random next match" and land in the new match with shuffled teams.

## Comments

- Pass 38 (2026-11-14): built. From the match's end (the nuke and the scoreboard) the host's end panel has a "Random next match" button (N, the D-pad's right, a click or a tap); it lights when asked and a second press takes it back. Everyone else reads "The host chose a random next match" (and, on the scoreboard, "it starts in 0:09"). When the scoreboard's time runs out the server starts the match itself, no lobby between: a lobby mode on another map in another mode (`randomNextMatch` in `fps-core/src/net/random-next.ts`, each pair as likely), the map's own bot count, sides dealt at random (shuffled, then alternately) when there are two or more people. The ask is for one match and goes with the host who made it (a new host doesn't inherit it). Never after a Battle Royale.
- Bot Match's in-page server holds one map, so it opens its lobby still asking, and the page (`BotSetup.pickRandom`) starts a Bot Match on a random map and mode at once, keeping humans vs bots and the skill, without the setup page.
- Found on the way: after a map switch in play, the online page hid the HUD (`followMap` read `hud.visible`, which had no getter); `Hud.visible` reads back now.
- Protocol 33 (a new client message, `random`).
- Review (one subagent): protocol not bumped, the ask outliving its host, the button rebuilt under a press each second, both D-pad sides toggling; all fixed. Left: the online map switch doesn't wait for the new map's lighting (it was lit in the 3 s countdown in every run here).
- Proof: `fps-core/test/random-next.test.ts` (pick, sides, the server's flow, taking it back, a host who leaves, the one-map server), `apps/range/test/bot-setup.test.ts`; frames in `random-next/after/` (`look.mjs`: Bot Match, N at the end, desktop and phone, then Switchyard Charge with no setup page between, 16 s after the press) and `random-next/online/` (`online.mjs`: a private lobby whose host socket asks; the friend's page shows the line and lands in the new match on Switchyard with no lobby, the sides dealt at random).

