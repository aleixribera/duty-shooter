# The menu's first item says it is offline, and the way in leads

Status: resolved

Release: v2.182.0

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12.md`, UI/UX 6/10): the first, biggest item on the main menu was "PLAY ONLINE" in full white over a red dot and "No server". The first thing a player read was a dead end, drawn like the way in, and the lit bar that marks the way in sat on it.

## Comments

**v2.182.0.** With no server answering, whether none is set or the one set is down, Play Online keeps its place but steps back:
- its title is in the secondary text colour;
- the readout reads "Offline: no server is answering" by a neutral grey dot (red is kept for alerts);
- the lit bar moves to Bot Match, the way to play right now.

Online, nothing changes. The two old readouts, "No server" and "Server offline", are now one line that says what Play Online is waiting for (DESIGN.md: a control that can't be used says why).

Verified with `../menu/offline.mjs` against the dev server, which has no game server behind it. Screens at 1920×1080 and 390×844 are in `../menu/after/`. Play Online is dimmed with the grey dot and its line, Bot Match carries the lit bar, and the page logs no errors. Typecheck passes.
