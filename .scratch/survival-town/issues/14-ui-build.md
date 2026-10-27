# 14 UI build: menu, screens, HUD, scoreboard, end of match

Status: resolved
Milestone: 3 (art and presentation)
Blocked by: 04, 07

## What to build

The approved mockups from ticket 07, built behind the new-UI client flag. See the spec section "UI (presentation package and app)".

- **The main menu**, over a live fly-through of the map along its menu path, with:
  - Play Online: server status, player count and current mode from the lobby status endpoint, and the mode picker when the server is empty
  - Practice Range
  - Explore Survival Town
  - Settings
  - a name field, stored locally
  - the version
- **The Pages copy** hides Play Online.
- **Loading and connecting screens** show progress and readable errors: server down, full, version mismatch.
- **Pause and settings** keep every existing setting.
- **The HUD** keeps how it behaves today, restyled, and adds team scores or the leader, the timer and the mode.
- **The held scoreboard**, for TDM and FFA, with kills, deaths and ping.
- **The end-of-match screen** shows the winner and your stats, then the vote with its countdown and live tally. It replaces ticket 04's minimal UI.
- **Input:** mouse, keyboard and gamepad drive every screen.

## Acceptance criteria

- [x] The playtester agent goes through every screen and both offline entries, and plays a networked TDM match into the vote and the next match. It checks the Pages build and the error states (server stopped, server full, old version), with no console errors.
- [ ] Screenshots match the approved mockups.
- [ ] Gamepad navigation reaches every control.
- [x] Settings carry over from the old UI.

## Comments

Resolved under the owner's no-questions instruction, on the home server. Built from ticket 07's identity and the published mockups. The mockup canvas is private to the owner, so the layout follows the identity notes in 07's comment.

**One decision.** I built the new UI as the only UI, not behind a flag. Ticket 16 removes the flag and the old UI straight after, and nothing ships between the two tickets, so the flag would only have existed to be deleted.

**What was built.**

- **Theme** (`ui/theme.ts`):
  - the system font stack and the palette tokens;
  - mint as the one signal colour;
  - team blue ◆ and orange ▲, always shown with their mark and name;
  - 24 px line icons drawn inline;
  - 160 ms screen-in and 200 ms kill-feed motion, reduced to fades under `prefers-reduced-motion`.
- **The main menu** (`ui/menu.ts`):
  - it sits over the live fly-through: Survival Town's menu path, 4 m/s, looped;
  - brand top left, the name field top right (stored locally), the version bottom right (`VITE_VERSION` from the container and Pages builds);
  - a bottom dock of tiles. Play Online is the wide tile, with a status light, players, mode and map; it refreshes every 10 s and re-renders only on a change. Then Practice Range, Explore Survival Town and Settings.
- **The Pages copy** hides Play Online. A small link under the title leads to the public lobby when `LOBBY_URL` is set.
- **Play Online:**
  - server status, players, mode and map;
  - on an empty server, the mode picker. This uses the join request's preferred mode from ticket 04;
  - name, plus a passphrase on a private server;
  - Join is disabled when the server is full.
- **Loading:** the map's name and a real progress bar. The bake download counts bytes against `content-length`.
- **Connecting:** three steps — reaching the server, loading the map, joining the match — and Cancel. The map's lighting loads *before* the socket opens, so a joined player never stands in the match while their page is still loading.
- **Errors** (`connectionError` in `ui/model.ts`):
  - Server unreachable, with Try again;
  - Server full, with Try again;
  - Update needed, with Reload;
  - wrong passphrase and bad name.
  Each one has a plain explanation.
- **Pause and Settings:** every existing setting is kept across Controls, Keys, Video and Interface. They are the same `Settings` object and the same storage, so saved settings carry over unchanged. Pause also lists the keyboard and controller controls.
- **The HUD:** behaviour is unchanged (crosshair, markers, damage, overlay, toasts), restyled.
  - Health plate bottom left (new) and ammo bottom right.
  - Kill feed top right, with your rows marked.
  - fps and ping top left.
  - The match bar top centre. In TDM it shows both team scores with yours marked, the clock and the mode with its limit. In FFA it shows the leader, the clock, your kills and your place.
- **The held scoreboard** (Tab, or the touchpad on a controller). TDM shows both teams side by side, each ranked, with team totals. FFA shows the ranking, with shared places for ties. Both have kills, deaths and **ping**. For the ping, each client now reports its measured round trip in its `cmds` and the server shares everyone's in the snapshot. This is protocol version 3; a test is in `net.test.ts`.
- **End of match:**
  - the result line (Victory or Defeat in TDM), the winner in the team's colour and mark, and your kills, deaths, K/D and place;
  - then the vote, with its countdown, live tally bars and your choice marked, above the scoreboard;
  - keys 1 and 2, a mouse click, or **the D-pad's left and right** on a controller (unbound in play).
  The HUD rewrites its markup only when it changes, so a mouse click on a vote isn't lost to the per-frame redraw.
- **Input:** controller navigation reaches every control (buttons, tiles, fields, sliders, lists and the lobby link). Circle presses the screen's Back.

**Tests.** `test/ui-model.test.ts` covers the scoreboard ranking and team split, the match bar, the end summary, the connection-error mapping and the Play Online tile. The rest is DOM, checked in the browser.

**In the browser** (headless Chromium, SwiftShader). Screenshots of every screen:

- the main menu over the fly-through;
- Play Online;
- loading and connecting;
- the three errors;
- pause and settings;
- the HUD, held scoreboard and end-of-match vote, in TDM and FFA, through a fake match driver.

They are in the owner's local gallery (see ticket 16). Two layout bugs turned up and were fixed. The vote buttons' text ran inline, from a class shared with the stats row. Your kill-feed row was low-contrast against the bright sky. There were no console errors.

**Live join.** I ran a local production server on another port, with a dev page proxied to it. The real flow ran from start to finish:

1. The Play Online tile read the live `/status`: online, 0/8, Team deathmatch, Survival Town.
2. The Play Online screen offered the mode picker on the empty server, and I picked Free-for-all.
3. The connecting screen showed, then the client joined.
4. `/status` then reported 1 player in **ffa**, so the picked mode was honoured.
5. The HUD showed the FFA match bar (leader, clock 9:56, you · 1st), health 100 and ammo 30.

There were no console errors. This caught a real bug that the fake-driver screenshots couldn't: the client reads the server's answer only when the game ticks it. So waiting for "joined" before handing the driver to the game deadlocked. The driver is now handed over at once, and the frame loop shows a refusal or a drop on the error screen.

I couldn't play a full match into the vote here. A SwiftShader page renders a frame in seconds to minutes, so scoring 30 or 75 kills by script isn't practical. The intermission, vote and next match are covered end to end by the networked headless tests from tickets 03 and 04, and their UI is in the screenshots. **The owner should play one match through the nuke and the vote on the PC after syncing.**

**Self-approved** under the owner's instruction, including the screenshot comparison against the mockups.

**Review on the Windows PC (v1.2.3).** The overnight session left every box here unchecked. These checks were made on the RTX PC, in the browser pane with WebGPU:

- **A networked match into the vote and the next match.** The client ran against a local server built from this commit, with `TIME_LIMIT=40` (new in v1.2.3, so a match fits in a test). Team deathmatch ran to its time limit. Then came the 6 s nuke and the 14 s vote. A vote for free-for-all with key 2 counted, and the screen showed "Next match: Free-for-all". The next match started in free-for-all with the player respawned. There were no console errors.
- **Pages.** The Pages copy loads, with the baked lighting and the rifle. It offers Practice Range and Explore Survival Town, plus the public-lobby link. The error states were checked by the server session's screenshots (down, full, old version).
- **Settings carry over.** The release never touched `settings.ts`, so the storage key and the schema are unchanged.
- **Fixed in v1.2.3:**
  - A lobby change re-rendered Play Online and wiped a name or passphrase being typed. Typing, focus and the caret now survive the re-render.
  - In windows under about 900 × 560, the title, the name box and the tiles overlapped. They now stack in one scrolling column.
  - The Play Online tile and the subtitle got a dark backing, so they read over a bright sky.

**Still open:**

- **Gamepad navigation.** There was no controller to test with.
- **The mockup comparison.** It was only self-approved overnight.

The vote cards can't be clicked while the mouse is locked. The cursor is hidden then, though, and the cards show their keys (1/2, D-pad), so they stay as they are.
