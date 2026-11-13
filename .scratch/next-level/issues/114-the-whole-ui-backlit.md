# The whole UI in the Backlit style

Status: open

Spec: `../spec.md`; `PLAN.md` item 1b (Aleix chose Backlit on 2026-11-13). `DESIGN.md` describes it; the reference frames and the mockup's CSS are in `../ui/backlit/`.

Acceptance (`PLAN.md` 1b): frames of every screen at desktop and phone width beside the reference frames; `design-audit` passes on every screen; nothing of the old mint signal left (a grep); the four font files under 100 KB and the first screen painting before they load; the main menu's and a match's frame times on this PC's throttled run within noise of before, confirmed on the laptop when it has a turn.

Rough order: the system in `theme.ts`, the main menu, the HUD in low light, every other screen.

## Comments

**2026-11-13, loop pass 34 (pass 1): the system and the main menu.**
- `theme.ts`: the Backlit tokens (`--ds-signal*` renamed `--ds-light`, `--ds-light-edge`, `--ds-light-half`, `--ds-light-halo`, `--ds-light-glow`; no alias left), graphite plates, `--ds-scrim-menu`, and one plate class: `.ds-plate` with `.is-lit`, `.is-half`, `.is-own`, `.is-empty`, drawn as two clipped pseudo-element layers with the halo as a `drop-shadow` on the element. `.ds-btn` and `.ds-seg button` are plates too: the primary and the chosen segment are lit, hover and focus light the edge at half. A full-width primary on a narrow screen keeps no halo (a filter over half the screen).
- Fonts: Chakra Petch 600/700 and IBM Plex Sans Condensed 400/600, Latin woff2 from Fontsource 5.3.0 (SIL OFL, licences beside them in `apps/range/public/fonts/`), 59 KB for the four; `font-display: swap` on the old system stack; only Chakra Petch 700 preloaded.
- Main menu: the destinations with only the lit row on a plate, half-lit edge and 10 px slide on hover and focus; the lit row lights in one move the first time the menu shows; Profile and Settings in a small row under the list; the profile corner (Rank badge in the light, the name typed over in place, Rank and XP, the bar in the light); the Changelog at the foot in small type.
- The mint is gone from the code (`grep -rn "8fe3c8\|ds-signal"` finds nothing outside this ticket); the Battle Royale Beacon's light in the world is the warm light now. Status dots that meant "up" are the connection green, not the light. Ally tags are white: the light never stands for a team.
- Left for the Loadouts entry and its lit dot: item 7's loadout editor, which doesn't exist yet. The corner's "Next: <gun> at Rank N" line waits on item 7's unlocks (no invented unlock).
- Frames: `../ui/backlit-pass/before/` and `after/` (`look.mjs`).
- Second opinion (a review subagent on the diff): the HUD already had a `.ds-plate` class on 13 elements, which now draw as Backlit plates (their old flat fill removed, the MVP strip's plate cleared); the lit row's light-on no longer fights its rise; no halo on a full-width lit row on a phone; a controller's focus on the name lights the corner; the preload's path matches the `@font-face` one (`vite-ignore`); the desktop app's offline page lost its mint. All fixed in the same release.
