# Health and ammo bars overlap at 390 px

Status: resolved
Release: v2.108.12
Severity: S2 (clear UI break on a phone)
Found by: 35 (known leftover)

## Repro
Any match at 390 px wide (phone portrait). Look at the bottom of the screen.

## Evidence
- `.ds-health .bar` is 236 px wide and `.ds-ammo .bar` 220 px, right-aligned (`packages/fps-client/src/hud/hud.ts` ~42-51). At 390 px they overlap from x 138 to 268.
- Screenshot `.scratch/battle-royale/shots/bugs/09-phone-in-match.jpg`.

## Suspected area
`packages/fps-client/src/hud/hud.ts` CSS: the bar widths need a narrow-screen rule (`min()` against the viewport, or stacking).

## Comments
- Fix in `hud.ts` CSS: at 640 px and under, health and ammo each keep to half the screen (`max-width: 50vw`, no 300 px min-width), with bars `calc(50vw - 28px)` and the 16 px phone gutter on the outside edges.
- Seen at 390x844, Bot Match TDM: health bar 16..183, ammo bar 207..374, 24 px apart (before: 32..268 against 138..358). Same in Battle Royale. Desktop unchanged (236 and 220 px bars). Shots `shots/bugs/t41/before-botmatch-phone.jpg`, `after-botmatch-phone.jpg`, and `t45/after-phone-in-match.jpg`.
- No DOM test: the overlap is layout, which the Node tests can't measure; checked by browser rects instead.
