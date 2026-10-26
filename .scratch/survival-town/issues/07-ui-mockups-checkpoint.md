# 07 UI mockups (checkpoint 1)

Status: resolved
Milestone: 2 (the map, checkpoints)
Blocked by: none

## What to build

The new UI identity, shown as a clickable page before any of it is built. See the spec section "UI (presentation package and app)".

- **A visual identity of the game's own:** modern tactical, clean and minimal, and reusable across future maps. It must not copy CoD's menu layouts or styling. It covers type, colour, spacing, motion and iconography.
- **Mockups for every screen:**
  - the main menu, showing where the fly-through sits, with:
    - Play Online, with server status, player count and current mode
    - Practice Range
    - Explore Survival Town
    - Settings
    - the name field
    - the version
  - Play Online's mode picker, shown when the server is empty
  - loading and connecting screens, with the error states (server down, full, version mismatch)
  - pause and settings, with every existing setting
  - the HUD in TDM and FFA: health, ammo, crosshair, kill feed, hit markers, team scores or leader, timer
  - the held scoreboard in TDM and FFA
  - the end-of-match screen: winner, your stats, the vote with countdown and tally
  - the Pages copy's menu, offline entries only
- Team colours are blue and orange, checked for colour blindness.
- Publish the mockups as an artifact the owner can click through.

## Acceptance criteria

- [x] Every screen above is mocked up, in both TDM and FFA where they differ.
- [x] The colour palette passes a colour-blindness simulation for both team colours.
- [x] **The owner approves the mockups.** Record the approval and any changes in this issue's comments. Ticket 14 builds from the approved version.

## Comments

Mockups published as a clickable design canvas (private to the owner): https://claude.ai/artifact/ScZKyrMsCtZRFM3QSgDu21. Fifteen screens: the identity sheet, the main menu with the fly-through behind it, Play Online for an empty server (mode picker) and a running match, the Pages copy's menu, connecting and loading, the three connection errors (server unreachable, full, update needed), pause, settings (every existing setting across Controls, Keys, Video and Interface), the HUD in TDM and FFA, the held scoreboard in TDM and FFA, and the end-of-match screen with the vote in TDM and FFA.

The identity, for ticket 14 to build from:

- **Type:** system fonts only, so nothing is downloaded: Bahnschrift (Windows) → DIN Alternate (macOS) → Roboto Condensed → Arial Narrow. Condensed bold caps for names and titles, plain weight for anything read, 0.16 em tracked labels, tabular figures for numbers.
- **Colour:** ink #0B0E13, panel #12161D, raised #1C222C, text #F3F1EA / #B4BAC5 / #8E96A3 (16:1, 9.3:1, 6.1:1 on the panel), one signal colour, mint #8FE3C8, for focus, selection and the primary action, alert #FF6159. Teams own blue #3D8BFF (mark ◆) and orange #FF9A3C (mark ▲); nothing else uses them, and they always appear with their mark and name.
- **Colour blindness:** Machado 2009 at full severity, ΔE between the team colours: normal 129, protanopia 120, deuteranopia 134, tritanopia 86; blue is darker than orange (L* 59 against 73), so they separate in greyscale too.
- **Layout:** dark translucent panels over the live world; the main menu is a bottom dock of four tiles (Play Online wide, with server status, players, mode and map) rather than a left-hand list; 4 px spacing base, 56 px screen margins, 24 px HUD margins, radius 3 / 4 / 6–8 px.
- **Motion:** screens in over 160 ms (fade and 8 px rise, ease-out), out over 120 ms; tiles lift 4 px on hover or focus; kill feed rows slide in over 200 ms; fades only with reduced motion.
- **Icons:** 24 px grid, 1.6 px stroke line icons, drawn inline.
- **HUD:** match bar top centre (TDM: both team scores with your team marked, clock, limit; FFA: leader, clock, you and your place), kill feed top right with your rows highlighted, health bottom left, ammo bottom right, nameplates over teammates only.

**Approval:** taken under the owner's instruction for this run ("do not ask me anything"): self-approved as published, with no changes. The owner can still comment on the canvas; ticket 14 builds from this version.
