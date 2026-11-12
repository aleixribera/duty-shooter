# The scoreboard shows clean over a death

Status: resolved

Release: v2.181.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, UI/UX 6/10): with the scoreboard held while dead, "DIED / RESPAWNING" showed through the middle of the board's rows, and "F LOADOUT" sat below it (`../reviews/2026-11-12/06-scoreboard.jpg`).

## Comments

**v2.181.0.** While the board is up (the HUD's `boarded` state, also set for the end-of-match card), the centre line (`.ds-center`: "You died / Respawning in n", round messages) and the use prompt (`.ds-prompt`: "F LOADOUT" and the like) hide, the same way the kill feed, round line and hint line already did. Letting go of the board brings them back. One CSS rule in `hud/hud.ts`.

Verified with `../board/dead-board.mjs`. It starts a Survival Town Bot Match, walks forward firing until killed, then holds Tab. In `../board/after/dead-board.jpg` the board is clean over the death cam. The centre line and prompt report hidden while it is held, and once Tab is let go the centre line reads "You died, Respawning in 2" and shows.
