# The scoreboard drops a Ping column nobody has

Status: resolved

Release: v2.185.2

Spec: `../spec.md`

From the fresh capture of 2026-11-12 (`../reviews/2026-11-12b/`): in a Bot Match the held scoreboard's last column was "Ping" over a dash on every row. Bots have no ping and the local player has none offline, so the column took width and said nothing.

## Comments

**v2.185.2.** `boardHtml` in `hud.ts` leaves the Ping head and cells out when no row on the board has a ping. Online, where anyone has one, the column is back, with a dash for those who don't.

Verified:
- `test/board-ping.test.ts` (new, 2 tests): no "Ping" with no pings; the column, the value and a dash with one ping.
- Typecheck passes.
- `../board/held-board.mjs` holds Tab in a Survival Town team Bot Match. Both teams' heads read `# Player Score Kills Deaths Assists` (`../board/ping/held-board.jpg`). No console errors.
