# The idle local player sometimes fires on its own

Status: open
Blocked by: none
Labels: bug

Noticed in ticket 65 (its Comments): in a dev Bot Match the idle local player sometimes fires with no input (ammo falls). Cause unknown; predates 65. Reproduce, find the cause (stuck input after pointer-lock loss or alt-tab, gamepad trigger noise (gamepads are hidden in scripted runs, so check), auto-fire from a bot driving the local seat, a stand-in bot from ticket 14/57 left on the seat...), fix test-first, and check no seat a person holds ever gets bot commands.

## Comments
