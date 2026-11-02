# Health and ammo bars overlap at 390 px

Status: open
Severity: S2 (clear UI break on a phone)
Found by: 35 (known leftover)

## Repro
Any match at 390 px wide (phone portrait). Look at the bottom of the screen.

## Evidence
- `.ds-health .bar` is 236 px wide and `.ds-ammo .bar` 220 px, right-aligned (`packages/fps-client/src/hud/hud.ts` ~42-51). At 390 px they overlap from x 138 to 268.
- Screenshot `.scratch/battle-royale/shots/bugs/09-phone-in-match.jpg`.

## Suspected area
`packages/fps-client/src/hud/hud.ts` CSS: the bar widths need a narrow-screen rule (`min()` against the viewport, or stacking).
