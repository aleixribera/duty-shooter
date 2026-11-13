# Random next match

Status: open

Spec: `../spec.md`; Aleix's request 8 (2026-11-14), before PLAN work. His words: "Can you add a button at the end of each match that starts another new game with a random map and mode and teams (if multiple players) once the normal timer to go to the lobby finishes? Make the admin able to press this."

Reading (the coordinator's): on the match-end screen the lobby host (the only player in a Bot Match) gets a "Random next match" button. If the host pressed it, then when the usual countdown back to the lobby ends, a new match starts straight away instead of the lobby, on a random map, a random mode valid for that map and player count, with the teams shuffled when there are several players. Everyone else sees that the host chose it. Play Online private lobbies and Bot Match; Battle Royale only if a random pick fits there.

Acceptance: a Bot Match ends, the host presses the button, the countdown runs out and a match on a different random map/mode starts with no lobby in between (frames); online, two scripted friends see "the host chose a random next match" and land in the new match with shuffled teams.

## Comments
