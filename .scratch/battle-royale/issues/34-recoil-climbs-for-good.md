# Recoil accumulates until the aim can't go below a line

Status: open
Blocked by: 13

Owner bug report after playing one Battle Royale match: recoil accumulates, and eventually the crosshair can't be brought lower than a horizontal line, more or less.

Reproduce it first, headless and in a real browser: fire long and short bursts with every weapon over many minutes, with and without pulling down, across deaths, Downed, Revive, spectating and weapon swaps. Record view pitch, recoil offset and the pitch clamp every tick, on the client and on the server. Likely suspects to check by measurement, not by reading: recoil not decaying or not reset, the recoil offset added into the base pitch, prediction and server disagreeing so reconciliation keeps reapplying it, the pitch clamp applied to the sum instead of the base, and the Downed camera's tilt. Fix it, and add a regression test that fires a whole match's worth of bursts and checks the aim can still reach the bottom of its range. Check every mode, not only Battle Royale.

## Comments
