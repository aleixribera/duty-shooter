# Preparation screen

Status: resolved
Release: v2.111.0
Blocked by: 11,12

Spec: `../spec.md`

Spec: Preparation. Owner's change: the loadout selector is in the game, over the live 3D scene, not a separate page, with a visible 20 s timer. The staged 20 s: island, Ring igniting, Squad, loadout selector, drone and heartbeat, 60 ALIVE, then the dive in the last 5 s. Ready logic and the load gate.

## Comments

- The Preparation is Battle Royale's Countdown: the server holds `matchStart` 20 s (`PREPARATION.seconds`) after the lobby's Start, and the match status carries `preparation` (when it began, who is ready, how many people, how many pages still loading). Protocol 17 adds the client messages `ready` and `loaded`. The HUD's Countdown stays hidden in Battle Royale; the Preparation page replaces it.
- Stages are the client's camera off the server clock, so every page sees the same moment: 0 to 7 s the island from high over your side, slowly turning, while the Ring's wall fades in (0.5 to 4.5 s); then your Squad at its spawn, lit by a key light (the blast light borrowed, so no shader rebuild), pushing in, framed right of the picker; the last 5 s the dive from 230 m above and up to 90 m behind your eyes down to them, levelling out as you land. The dive starts inside the Ring: from a spawn on the shore facing in, behind would be out through the wall, so it pulls closer. The distance haze is thinned (a new uniform, `setHaze`) while high up, so the island reads, and comes back as you land.
- The picker is the Settings loadout (Primary, Secondary, Grenade) as segmented buttons on a left card over the scene; a pick goes to the server at once (`setLoadout`) and is saved. It locks for the dive: the server ignores `loadout` in a Battle Royale once the hold is over, and the page disables it in the dive. "60 ALIVE" and the number of Squads stay at the top right throughout.
- Ready: the one big button. Pressed, it says what it waits for. When every person (bots don't count) is ready, the hold ends at once with the dive's 5 s. Not ready at 0 drops you with what is picked. Ready also takes the pointer lock (it is a click); without Ready, the page shows "Play, Click to take control" after the drop, because a browser only gives pointer lock on a gesture.
- Load gate: each page sends `loaded` once it has the Preparation on screen. A page still loading at the dive moment holds the drop up to 10 s more (`PREPARATION.loadLimit`); one that still hasn't loaded then gets a stand-in bot for its seat, which hands it back the moment `loaded` arrives. Script clients count as loaded.
- Sound: a drone in overlapping 4 s segments that rises, and a heartbeat from 1.5 s that quickens from 1.05 s to 0.5 s apart, both synthesised in the ui profile, silent at 0.
- Esc during the Preparation opens the pause menu as in play. On a gamepad the page takes the pad's navigation and A presses the button.
- Bot Match: Battle Royale isn't offered there yet (ticket 15, Local bots), so this ships online only; the offline driver's `ready` and `loaded` are no-ops and other modes keep the 5 s Countdown.
- Seen in a real Battle Royale on Zero Island (`.scratch/battle-royale/prep/play.mjs`, real server with 58 bots, Chrome, shots in `.scratch/battle-royale/shots/prep/`): opens over the game as the lobby goes, ~20 s on the clock, the island with the Ring lighting, the two-soldier Squad lit beside the picker, a Wasp 9 pick reaching the seat, Ready saying "Waiting for 3 more, or the clock", the dive at once when the last person said Ready, control at 0 at the spawn with the Wasp 9 in hand, the mate still a person, no page errors. Desktop 1920x1080 and phone 390x844 checked.
