# A spectator view worth watching

Status: resolved
Release: v2.198.0

Spec: `../spec.md` (objective 1, multiplayer with friends); Aleix's request 4 (2026-11-13): "Spectator view: improve it."

Acceptance: out of a Charge Bot Match on Switchyard, frames of Spectating behind a teammate, through their eyes, and after stepping to the next, desktop and phone: the one watched stands to the side of the screen's centre, not over it; the bottom right shows their weapon and magazine counting down as they fire; the panel shows their kills; nothing of yours stays in the middle of their view.

## Comments

- How well-loved shooters spectate (standing direction: copy the patterns, not the content). Fortnite and PUBG's third person put the camera over the player's right shoulder and turn it with their aim, so the player stands left of centre and what they aim at is in the middle. CS2, Valorant and Apex show the spectated player's own HUD: health, ammo, grenades. Fortnite and PUBG show the spectated player's eliminations. All of them clear the "you died" message off the middle quickly.
- Before (`spectate/before/`): the follow camera stood straight behind the head and did not move with their pitch, so the body covered the middle of the screen (`02-follow`), and looking up or down it lost them (`06-next`, only a helmet at the bottom). "You died / Back next round" stayed in the middle for the whole round. The bottom right was empty, the panel named only the weapon. Walking bots looked about 18° up at the sky, which is what you saw through their eyes: the look-ahead pitch ran from their feet to head height at the next nav node.
- Done: `followCamera` (`spectate.ts`) over the right shoulder (2.4 m back, 0.55 m right, 0.25 m over the eye), orbiting with their pitch (clamped -0.7..0.55), pulled in 0.2 m short of walls, ceilings and the ground on each leg. The bottom-right plate shows the watched player's gun, magazine and grenades in both views (CS2/Apex). The panel shows their kills in place of the weapon name, and in Charge "Back next round" beside "Watching"; the middle line clears 3 s after you're out.
- After (`spectate/after/`, `spectate/sheet.jpg` before | after): the watched player stands left of centre with the lane ahead clear (`01-follow`), indoors the camera stays under the ceiling (`02-follow`), firing the magazine counts down (`06-next`: 12 of 32), phone at 844x390 keeps the plate in its half (`01-follow-844`, `04-eyes-844`).
- Second opinion: the plate could show the last player's gun while a step's shot held for one not yet sent (fixed: only while the one followed is the one watched); the pivot could rise through a low ceiling (fixed: reached from the eye); glossary wording. Left: a watched player's reserve is not sent, so a Supply Drop sniper shows "/ ∞" while spectated.
- Cut: walking bots look about 18° up (`bot.ts`, the `else if (ahead)` look: `atan2(ahead[1] - self.position[1], …)` runs from the feet to head height at the next node; from `eye[1]` it reads -0.04 rad, frames in `spectate/after/` were taken with it). It changes every bot match's course, and `switchyard-bots-outposts.soak.test.ts` (6 a side) then finds p8 roaming in place 12.3 s at 18.0,0.0,-8.1 (limit 8 s; passes without the change). Moved to BACKLOG with that stuck spot.
