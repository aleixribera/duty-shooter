# A clearer Ring: next-Ring preview, rising damage, a moving final Ring

Status: resolved
Release: v2.130.0
Blocked by: none
Labels: enhancement

Check what the Ring already does against this list and add what's missing: the next Ring shown on the island map and HUD before it closes (Stage, time, distance and direction to safety), damage outside rising each Stage (numbers in the stats file), and the last Ring moving/drifting instead of only shrinking so the final fight doesn't camp one spot. Bots plan rotations from the preview (coordinate with ticket 64). Keep the 10-minute match.

## Comments

Checked against the game first. Already there: damage rising each Stage (1, 2, 4, 7, 12, 20 HP a second, `STATS.royale.ring`), the next circle dashed on the island map, the Stage and its countdown in the HUD, the outside warning with an arrow, metres to safety and HP a second, a diamond on the compass for the next circle, and bots planning from `state.next` (ticket 64). The 10-minute timings are unchanged.

Added:
- **The way to the next circle while still inside the Ring.** A quiet plate under the Ring line (same spot as the outside warning, never both): an arrow turned toward the next circle and "N m to the next circle", measured to its edge. It hides inside the next circle, outside the Ring (the warning takes over), once you're out, and after the last close. `ringStatus().toNext` carries the metres.
- **The final Ring moves.** The last circle no longer shrinks onto a point inside the one before: it closes on a point `STATS.royale.finalDrift` = 1.25 of its starting radius away, along the way the Ring was already heading (from its centre toward the old end point, else away from the first centre), snapped to the nearest open ground. No randomness is drawn, so every other seeded draw (circles, drops) is unchanged. With the last circle around 60 m and a 30 s close, its far edge comes on at about 4 m/s, a jog, so nobody can hold one spot to the end.

Numbers: finalDrift 1.25 (estimate in the stats file). Tests: core 845, client 360, server 53, range 243 + 167, typecheck clean; the Trios length floor (350 s) still holds with the moving end. In a browser (Duos on the real server, 1920x1080 and 390x844): 121 m from the next circle the plate read "121 m to the next circle" with its arrow at 99 degrees, pointing east where the circle was; inside the next circle there was no plate; 40 m outside the Ring the hazard warning showed instead. The plan is made once when the match starts and the HUD line is a few DOM writes, so the server and worker ticks are unchanged (60 seats, ticket 66: p99 2.86 / 2.28 ms; worker p99 3.1-3.3 ms).

Not done: an "Outside: N HP a second" row in the map's side panel. The warning already says it the moment it matters. Also seen but not changed: on a phone, the outside warning sits over the top-right kill feed's first line (this was already the case before this ticket).

