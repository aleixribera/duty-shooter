# Aleix's refinements

Status: open

Spec: `../spec.md`; `PLAN.md` item 9 (2026-11-14, from Aleix playing it). Eight parts, a to h, worked in order; each has its acceptance check in `PLAN.md`.

## Comments

**2026-11-14, loop pass 93: a, the clock without "T-" (done, v2.215.0).**
- `clockFace` (fps-client/src/hud/match-clock.ts) reads `9:23` through the match and its last minute, and `10.0` to `0.0` in the last ten seconds, with no "T-" and no leading zero. The announcer's "T-minus five minutes" and "T-minus 60 seconds" stay.
- Width: measured in Chakra Petch 700, "10:00" (the longest face; matches are 10 min at most, Battle Royale shows no match clock) is 3.94 zeros plus 5 x 0.02 em letter spacing = 4.1 ch; the clock holds 4.3 ch (was 6.1 ch for "T−10:00"), the same margin as before. The last minute's own 6 ch rule is gone (the class is now `last`, not `tminus`).
- Proof: last-minute tests (faces, no face longer than "10:00", never counts up). Frames `clock/after/` and `clock/sheet.jpg` (`clock/look.mjs`, Bot Match with 70 s): desktop 1:10, 0:46, 8.8 and phone 1:10, 0:43, 6.3; the bar's left edge and width stay the same in every act (745.6 / 428.9 px desktop, 243.5 / 357 px phone).
- README, GLOSSARY and the trailer's title slates say the clock counts down, without "T-".

**2026-11-14, loop pass 93: b, Random next match on by default (done, v2.216.0).**
- The server turns the random next match on at every match's end on a lobby server, Battle Royale's excepted (`#randomOn`, fps-core/src/net/server.ts); the host's N, D-pad right, click or tap turns it off and on again. It stays with the match when the host leaves (the next host can turn it off), where before it went with the host who asked.
- End screen: the button starts pressed and lit; Play again (Bot Match) is unlit while it is on, lit when it is off, so one thing is lit. The line under it reads "Random match in 0:09" for everyone while on (the others read "Random next match: on" during the ending); off, "Back to the lobby in" online and "Match setup in" in a Bot Match, as before.
- Review (one subagent) found an empty online server would loop random matches with nobody in it, and a returning held seat would land in one; fixed: nobody connected starts nothing, and a lobby server with two or more maps opens its lobby with it off. Left: an online server with only one lobby map (one started on a map outside the match maps) shows "Random match in" and then opens its lobby; no deployed server is set up that way.
- Proof: `random-next.test.ts` (on by default and seen by everyone, only the host turns it off, off then on again, the host leaving, an empty server, the Bot Match server's lobby still on) and `lobby-maps.test.ts` (the host now turns it off to get the lobby). Frames `random-default/` (`look.mjs`, 20 s Bot Match): the end lit with no key pressed (desktop and phone), N off at phone width with Play again lit, N on again, and 18 s later Station Nine Charge with no setup page between; `OFF=1`: N once and the match setup page comes 13 s later. `sheet.jpg`.

**2026-11-14, loop pass 94: c, a name asked once (done, v2.217.0).**
- No more stand-in: a first visit is no longer given "Player 1234". The Profile keeps the name (`Profile.name`, `ProfileStore.rename`), its save code carries it (a code without one keeps the name here), and Reset profile keeps it (it is who plays, not what they earned). Settings' copy follows the Profile at every page load and every change (`main.ts`); an old "Player NNNN" kept with the settings is not moved in (`standInName`), so those players are asked too. One typed since is theirs.
- Asked: the main menu's Play Online, with no name, opens a "Your name" panel (box, Play Online, Back; Enter submits, Escape backs out) and joins under it. A private server's and an invite link's Play Online page, and Battle Royale on the server, ask in their own Name fields as before.
- Solo never asks: Bot Match and the Practice Range play as "You"; Local bots no longer shows or needs the Name field.
- Seen: the main menu's corner shows the name (typed over in place) only once there is one; Settings has a Player tab with the name (no Restore defaults there).
- Review (one subagent): a typed "Player 1234" would have been dropped at the next load (the filter now applies only to moving an old settings name in), and a failed Local bots start left "You" in the server's Name field (the screen keeps the real name now). Left: a tab opened before the name was set writes an empty name back with any setting it changes; the next load takes the Profile's again.
- Proof: `profile.test.ts` (kept through matches and loads, 16 characters, the stand-in, the save code with and without a name, through a reset). Frames `name/after/` and `name/sheet.jpg`, `name/sheet-phone.jpg` (`name/look.mjs`, fresh browser, public local server): no name box and no "Player NNNN" on the menu, Bot Match setup shows "You", Play Online asks (desktop and phone), the lobby shows "Aleix", the corner and Settings show it, and after a reload Play Online joins at once. `capture.mjs` and `chaos.mjs` answer the new ask.
