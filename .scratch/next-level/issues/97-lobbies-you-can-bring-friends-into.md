# Lobbies you can bring friends into

Status: resolved
Release: v2.188.0

Spec: `../spec.md`

`PLAN.md` item 2, pass 1 (rough). A private lobby of your own with a link to share; the host moves people between sides and removes them; a dropped player comes back to their seat.

Acceptance: three scripted clients. The host makes a private lobby and two join by its link; the host moves one to the other side, kicks the other and starts the match; a client cut off for 5 s comes back into its seat.

## Comments

**2026-11-13, loop pass 5.**

- **One game per lobby.** `/ws?lobby=<code>` (4-12 letters or digits, upper-cased) joins, or opens, a private lobby: a `GameServer` of its own on fresh worlds (props fall per match), sharing the maps' nav graphs, ticked in the same 60 Hz loop. At most 8 per server; one closes 60 s after its last person and its last held seat are gone. `/status?lobby=` reports one but never opens it, so a plain GET can't fill the server. Battle Royale stays in its own process (ADR 0009).
- **The host's controls** are three messages, `side`, `even`, `kick` (protocol 30, reject reason `kicked`). Lobby sides go out as `LobbyState.sides`. A newcomer goes to the smaller side; sides even out on their own as people come and go until the host moves someone, after which they stay as the host set them. Kicking bars that seat's token from resuming. Ignored from anyone but the host, and outside the lobby for sides.
- **Coming back.** A lobby seat is now held for reconnect before the first match too (it was held only once a match had given it a score). `reconnect.test.ts` "coming back to a lobby" failed before (the page came back as p3) and passes after.
- **The page.** "New private lobby" under the players in the public lobby makes a 6-character code (no 0/O/1/I/L), puts `?lobby=CODE` in the address bar and the invite link, and joins it; the title reads "Private lobby". A link with `?lobby=` opens Play Online straight into it. Seats carry Move and Kick for the host while the lobby waits, with "Even teams" under the sides. Leaving or being removed ("Removed from the lobby") clears the code, so Play Online goes back to the public lobby.
- **Check.** `apps/server/test/private-lobby.test.ts` runs the acceptance on real sockets (about 15 s). Frames from `.scratch/next-level/lobbies/look.mjs` in `../lobbies/after/`: public lobby with the button (01), host and two friends on their sides (02), one moved (03), one kicked (04), phone (05-06), the match playing on the host's sides (07); `result.json` shows the kicked page got `kicked` and no page errors.
- **Second opinion** found: idle lobbies closed while a seat was still held for someone coming back; `/status?lobby=` opened lobbies from a plain GET; sides weren't evened when the lobby reopened after a match; one lobby's failing tick would count toward restarting the whole process; a closed lobby left its sockets open. All fixed; a failing lobby now closes alone and cuts its sockets. Not fixed: the kicked-token set never empties (a few bytes per kick for the life of a lobby).
- **Deferred** to `BACKLOG.md`: confirm on Kick, a kick that survives a new token, the private lobby's status on the menu, the Move wording, synchronous world builds when a lobby opens.
