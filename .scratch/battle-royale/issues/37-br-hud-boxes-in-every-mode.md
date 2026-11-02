# Empty Battle Royale HUD boxes show in every other mode

Status: resolved
Release: v2.108.12
Severity: S2 (clear UI break in every Bot Match and Play Online match)
Found by: 35

## Repro
1. Open the game, Bot Match, any mode (TDM on Survival Town), start.
2. Look at the top centre, the right side and the bottom of the screen.

Empty dark boxes for the compass, Ring line, "outside the Ring", out card and watch bar sit on screen.

## Evidence
- Measured rects in a Bot Match TDM (1920x1080): `.ds-br-top`/compass 715,19 490x46; `.ds-ringline` 947,74; `.ds-outside` 945,116; `.ds-out` 938,313; `.ds-watch` 945,1034. All visible and empty.
- Screenshots: `.scratch/battle-royale/shots/bugs/bot-runs/*.jpg` (every map and mode), `.scratch/battle-royale/shots/bugs/25-botmatch-phone-landscape.jpg`, `.scratch/battle-royale/shots/bugs/26-botmatch-1280.jpg`.

## Suspected area
`packages/fps-client/src/hud/royale-hud.ts`: `#shown = false` initially (line ~154) and `#show(on)` returns early when `on === this.#shown` (~195-201), so `update(null)` never hides the elements. Start them hidden, or start `#shown` as true so the first update hides them. Add a test in `royale-hud.test.ts` that a fresh HUD updated with no Battle Royale state shows nothing.

## Comments
- Cause as suspected: `RoyaleHud` started with `#shown = false`, so the constructor's `#show(false)` returned early and the boxes kept their default display. Fix: `#shown` starts true, so that first call hides every part until a Battle Royale state arrives.
- Regression test: `packages/fps-client/test/royale-hud-dom.test.ts` runs the real `RoyaleHud` on a small fake DOM (`test/helpers/fake-dom.ts`; the repo has no DOM library) and checks a fresh HUD updated with `null` shows none of `.ds-br-top`, `.ds-ringline`, `.ds-outside`, `.ds-out`, `.ds-watch`, and that they hide again after a Battle Royale. Red before, green after.
- Seen: Bot Match TDM at 1920x1080, all five parts measure 0x0 (before: 640x48 at the top, and so on). Shots `shots/bugs/t37/before-botmatch-tdm-1920.jpg`, `after-botmatch-tdm-1920.jpg`.
