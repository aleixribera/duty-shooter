# The whole UI in the Backlit style

Status: resolved
Release: v2.203.1

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

**2026-11-13, loop pass 35 (pass 2): the HUD in low light and every other screen, rough.**
- HUD: health and ammo on unlit plates at the bottom corners (the old scrim gradients gone), their figures in Chakra Petch; the match bar is three plates (the scores at display size, the clock lit, your side's plate your own); kill-feed lines are small plates and your own lines lit plates. The clock in its last act (the T-minus) stays in the alert colour: a critical state, not a light.
- The kill's beats: the marker is the hit's for 90 ms, then turns the kill colour with a small glow and pops again; +score is lit text at 120 ms; the reason lines come at 300 ms; a Medal lights on a lit plate at 750 ms. Lines and Medal keep their old end times (2.5 s, 2 s), so the stack is gone by 2.5 s, not 1.8 s: shortening it is a tuning call left for the review to judge.
- Screens: settings tabs (no plate at rest, the chosen tab lit, hover at half); settings rows light at half instead of the old light bar; pause is the destination list (Resume lit on a plate, the others half-lit under the pointer) with the controls on a plate; dialogs (loading, connecting, errors, tips) are plates at the lower left, an error's edge the alert; the countdown banner, the scoreboard, the end panel's head, toasts and the death recap are plates; the result ("Victory", "Defeat", "Orange wins") is lit text; your vote is the lit plate of its pair; your seat or slot in the lobby, the Battle Royale screen and Preparation is raised with a grey edge, not a light bar; a chosen loadout tile is a lit tile; lit touch controls carry the halo.
- Type: every bold title or figure at heading, title or display size in the UI and HUD is Chakra Petch now (34 rules, by a script over `ui/` and `hud/`); map names on the Bot Match tiles dropped to body size so "Switchyard" keeps one line.
- Frames: `../ui/backlit-screens/before|after/` (`look.mjs`: every page, the Battle Royale screen, a Bot Match's setup, HUD, scoreboard, pause and end, and the kill's beats at 200 ms and 1 s).
- Figures: Chakra Petch has no tabular digits (a 1 is 374 units, a 0 644), so the magazine, the match scores and the clock hold a fixed width in `ch` (DESIGN.md, Type); the plates beside them no longer move as they count.
- Second opinion (a review subagent on the diff): a scrolling plate (a long dialog, the held scoreboard) lost its fill past the first screenful, now `.is-scroll` carries the fill on the element itself; the lit tab's halo was clipped where the tabs scroll sideways, and a phone's full-width Resume carried a halo over half the screen, both now without one; a kill chained onto a standing stack left a blank row for 300 ms, now only a fresh stack waits for its lines; your vote's 2 px border moved its words by a pixel, now 1 px plus an inset line. All fixed in the same release.
- Left open: `design-audit` on every screen, throttled frame times, and whether the kill stack should end sooner. The opening banner covering the match bar on a sideways phone predates this pass (BACKLOG).

**2026-11-13, loop pass 36 (pass 3): the proof, and what the audit found.**
- `design-audit` on every screen (`docs/design-audit/2026-11-13.md`, 50 shots at desktop, sideways and upright phone; five reviewers): 68 findings, 2 high, 29 medium, 37 low, with no text failing contrast in play. Fixed in this release:
  - focus you can find (F12, F18): `--ds-light-half` raised from `#8c7a5c` (2.9:1 on an unlit edge) to `#b39d76` (4.6:1), and focus on an already-lit control adds a 2 px `--ds-text-2` ring 4 px out (inset on tabs, which clip);
  - a shut picker is unlit (F07, F08): dimmed words, its choice a grey edge with no light (the lobby's locked picks no longer dim twice);
  - Battle Royale with the server down puts Play on first on a phone (F01);
  - on a short screen (max-height 520) the match bar rises to the top, the opening card stands under it (under the zones or Charge strip when they show), and health and ammo shrink (F02, F28; F27 still open: the ammo plate stays 210 px wide; this was the BACKLOG item about the banner);
  - the countdown number is lit and the clock rests until play starts, Charge's freeze included (F24);
  - the clock holds the width of "T−10:00" (6.1ch), so the bar no longer re-centres (F25);
  - "1 kill" in the MVP line (F66).
  The phone shots ran with a mouse; a touch switches the page to its touch layout, which already placed the card and plates. Left: F16 (ten lit "Stock" tiles on the Loadout, a DESIGN.md call), F14/F15/F21 (a sideways phone scrolls in Bot Match and Settings), both in BACKLOG, and the 37 lows in the report.
- The kill stack now ends at 1.8 s (DESIGN.md, Motion): lines and Medal both, so a Medal at 750 ms stands about 1 s.
- Frame times (`../ui/backlit-screens/perf.mjs`, Bot Match on Survival Town and the main menu, the commit before the Backlit pass against this one, on dev servers, as a production build pauses a match without pointer lock). Unthrottled, before then after, two rounds each: menu 14.95/14.5 ms against 14.35/14.49 ms; match 5.27/8.09 ms (1% low 13.1/19.8) against 7.45/6.83 ms (1% low 13.9/12.4); no frame over 50 ms. Within noise. At 4x CPU throttle the PC (54% busy with other work) gave 56-100 ms against 53-62 ms in a match: noise too wide to say more than "no worse". The laptop's confirmation waits for its turn (item 1).
- Mint grep: nothing outside this ticket. Fonts: 59 KB for the four.
- Second opinion (a review subagent on the diff): locked lobby picks dimmed twice; the card on a short screen sat on the zones' and Charge's strips; Charge's freeze number wasn't lit; all fixed. Left: at HUD scale 1.3 on a window over 1000 px wide and under 520 px tall, the scaled bar can reach the card (scale.ts zooms the bar, not the card).
- Cut here, after three passes (the skill's two-pass rule, and PLAN's order puts a fresh review and item 7 next). The audit's open mediums go to BACKLOG; its 37 lows stay in the report. A test now holds the kill's beats and their 1.8 s end (`score-ui.test.ts`).
