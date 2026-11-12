# Enemy markers apart

Status: resolved
Release: v2.187.40

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12g.md`), its third defect (07, x 972-1036, y 470-552): "two ENEMY markers stack on each other: the second's red triangle sits on the first label's M, the second label covers the first's distance, and only one 20 m shows. At the centre of the screen a player can't tell how many enemies there are or which is nearer."

## Comments

- 2026-11-12, pass 3: two causes, both fixed. An enemy marked again (often by a second squadmate) now replaces the earlier marker for that enemy (`PingBoard.add`, by `target`); a ground-marked enemy (no target) is never folded. And markers now keep clear of each other as well as of ally tags (`placePings`, formerly `clearOfAllies`): the nearest stays on its point and each farther one stands straight above whatever it would cover, so a column reads nearest-lowest. A marker lifted last frame keeps its place until it is 2 m nearer than the one under it, and 12 px past the border, so two at about the same range don't swap each frame. The two ally chevrons with no name in the same frame come from the ally tags' own rules (`ally-tags.ts`), outside this ticket; not changed.
- Checked: `ping-marks-clear` and `pings` tests (new cases for the stack, the order, side by side, the hold, tag plus marker, and the per-enemy board), the fps-client typecheck, and a Survival Town Bot Match where the player marks two enemies 12 m and 15 m ahead, 0.5 m apart, through `driver.mark`: two whole markers 66 px apart, 12 m on its point and 15 m above it (`../markers-apart/sheet.jpg`, review g's 07 on the left; script `../markers-apart/look.mjs`).
- A second-opinion review found the hold re-finding the box a lifted marker had just cleared, so from the second frame a stack of three, or a tag with two markers over it, fell back onto itself. The hold now widens only the test from the marker's own point; a multi-frame test feeding the lifted set back (as `hud.ts` does) fails without that and passes with it.
