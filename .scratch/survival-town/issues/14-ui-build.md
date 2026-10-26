# 14 UI build: menu, screens, HUD, scoreboard, end of match

Status: ready-for-agent
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

- [ ] The playtester agent goes through every screen and both offline entries, and plays a networked TDM match into the vote and the next match. It checks the Pages build and the error states (server stopped, server full, old version), with no console errors.
- [ ] Screenshots match the approved mockups.
- [ ] Gamepad navigation reaches every control.
- [ ] Settings carry over from the old UI.

## Comments
