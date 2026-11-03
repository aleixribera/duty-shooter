# The idle local player sometimes fires on its own

Status: resolved
Release: v2.125.3
Blocked by: none
Labels: bug

Noticed in ticket 65 (its Comments): in a dev Bot Match the idle local player sometimes fires with no input (ammo falls). Cause unknown; predates 65. Reproduce, find the cause (stuck input after pointer-lock loss or alt-tab, gamepad trigger noise (gamepads are hidden in scripted runs, so check), auto-fire from a bot driving the local seat, a stand-in bot from ticket 14/57 left on the seat...), fix test-first, and check no seat a person holds ever gets bot commands.

## Comments

**Cause: a real controller at this PC.** A DualShock 4 ("Wireless Controller", 054c:09cc) is connected to this PC and was in use while the scripted runs played. Chrome hands the controller to every page, headless and unfocused ones included, and the game read it whenever it was there: sticks moving, R2 (fire) and other buttons pressed. Reproduced with `.scratch/battle-royale/t77/idle.mjs` (explore Zero Island, no input at all from the script, logging every usercmd): in 24 s the idle player walked about 10 m, switched weapons, and fired 16 rounds; `navigator.getGamepads()` showed the pad with its stick at (-1.00, 0.57) and R2 held, and the usercmds carried movement and fire with no mouse or key event sent. Not the causes the ticket guessed: no stuck key (the keyboard and mouse sets were empty), no bot on the seat (offline explore has none).

**Fix (v2.125.3).**
- The game: `readPad()` (`packages/fps-client/src/gamepad.ts`) reads nothing while the page is hidden or another window has the focus, so a pad used in another window (another game, Steam, a person beside a scripted run) no longer plays a backgrounded duty-shooter. The input then treats the pad as gone: its held buttons are released and controller mode ends, as on a disconnect. A focused page still plays on the controller as before (checked: the same script with focus emulated, the pad walked and fired the player).
- The scripts: `launchChrome()` (`apps/range/scripts/chrome.mjs`) hides every controller from the page unless `PAD=1`, because a script's CDP click focuses the headless page and the real pad then counts again. The override is writable, so the scripts that stub their own fake pad still can. `docs/agents/codebase.md` says so under "Driving the game in a browser".

**Seen fail, then pass.** Before: the idle log above (moved, 16 rounds, `padMode: true`). After the game fix, same script, same pad in use (its stick and R2 still moving in the log): 1,267 usercmds over 24 s, all with no buttons and no movement, position unchanged, 0 rounds fired. After the script fix, with focus emulated: `pads: []`, nothing moved or fired.

**No person's seat gets bot commands.** The server sends bot commands only to seats in `server.bots`, and a person's return deletes their seat from it before any tick. New test in `packages/fps-core/test/battle-royale.test.ts`: a person drops three times; each time a bot plays the seat, the person resumes, and on every tick while they hold it the seat is not in `server.bots`, it stands still (after the bot's run carries 0.4 s) and its ammo doesn't fall. It passed first time: the server was already right, so this is a guard, not a fix.

Tests: `packages/fps-client/test/gamepad.test.ts` (3: reads the pad when focused; none when another window has the focus; none when hidden; the last two failed before the fix), the seat test above.
