# Spectator bar says "Esc Leave" but Esc opens the pause menu

Status: resolved
Release: v2.108.12
Severity: S3
Found by: 35

## Repro
Battle Royale, get eliminated (or arrive late), and press Esc as the bar says.

The pause menu opens; nothing leaves.

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/14-late-after-esc.jpg`.

## Suspected area
`packages/fps-client/src/hud/royale-hud.ts` ~252 (the watch bar text). Either say "Esc Menu" or make Esc while watching leave.

## Comments
- Decision: the bar names the key for what it does: "Esc Menu". The glossary says Esc opens the menu, where you can leave, and that is what happens; a key labelled Leave that opens a menu misleads. `RoyaleHudState.leaveKey` is now `menuKey`.
- Regression test in `royale-hud-dom.test.ts`: the watch bar contains "Esc Menu" and not "Leave".
- Seen live: "56th OF 60 WATCHING Gristle ESC MENU M MAP"; Esc opens the pause menu (Resume, Loadout, Settings, Leave). Shots `shots/bugs/t47/before-host-watching-1920.jpg`, `after-host-watching-1920.jpg`, `after-host-after-esc-1920.jpg`.
