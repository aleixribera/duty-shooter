# Onboarding and open audit failures

Status: resolved
Release: v2.153.0

Spec: `../spec.md`

State the goal at the countdown, first-spawn hints, the grenade glyph, focus on opening Settings and the lobby, phone safe areas, the type scale and literal colours in hud.ts, the WebGPU badge.

## Comments

Built by the touch sub-agent on top of v2.151.0 (uncommitted; the owning session integrates). Decisions, each taken without asking:

- **The goal at the countdown (F24).** `goalLine()` in `ui/model.ts` writes one line per mode ("First team to 75 kills, or ahead when the clock runs out", "Hold the zones: first team to N points", "Plant the charge at A or B and guard it" for attackers and its counterpart for defenders, "Last Squad alive wins"). It stands under the countdown's number on a plate, under the mode's name; Charge's freeze says the side's own line; Preparation says Battle Royale's.
- **First-match hints (F08).** `hints.ts` is a pure state machine (`stepHints`), `hint-store.ts` its local-storage memory, `hud/hint-line.ts` the line. Eight hints: move, aim, sprint/slide, reload, swap, grenade, loadout, scoreboard. Each shows at the moment it matters (reload when the magazine is half gone, swap while reloading, the grenade after 20 s of fighting with one in hand, the loadout and the scores while dead), one at a time, never over a toast. Doing the thing dismisses it for good; already doing it means it is never told; a hint nobody acted on shows twice at most (12 s each). The words follow the device: key caps from the player's own bindings, the pad's glyphs for its layout, or the touch control's glyph.
- **"Show them again" is a button, not a settings field.** What a player has learned is a memory, not a preference: it lives in its own local-storage key and Settings > HUD has a "First-match hints" row with a "Show them again" button (disabled when there is nothing to forget). For the settings agent: that row is the one thing I added to the HUD tab.
- **The loadout has its key at the start (F08).** Use opens the loadout during the opening Countdown as it does while dead, and the prompt says so ("F Loadout", "Use Loadout" on touch).
- **Grenade count (F25).** Its glyph is a grenade (`icon('grenade')` in `ui/theme.ts`), with the count beside it and the fuse's seconds while one is cooking.
- **Squad-mate edge markers (F15).** A tag held to the screen's edge carries the mate's name (cut at 96 px). In view the name still follows the old rule (near and in sight).
- **Focus.** `Menu.show()` now puts the focus somewhere on every screen change: back on the control that led away when a screen is returned to (Settings > Back lands on Settings, the loadout's Done on Loadout, the Profile's Back on the Rank line), else on what the screen chose itself, else on the chosen tab, the primary button or the first control. `Menu.hide()` hands the focus back to whatever outside the menu opened it, so the lobby's Loadout and Settings buttons get it back. The lobby opens with the focus on Start (or Join). The main menu takes no focus as the page opens: nobody asked for it yet, and Tab or a pad's first press starts at the top. Preparation and the Battle Royale screen already focused their way on.
- **Safe areas (F13, F23).** One set of tokens (`--ds-safe-t/r/b/l`), read by the `.ds-ui` root's padding for every page, by each HUD corner (with `--ds-gutter`) and by every touch control. `viewport-fit=cover` is in `apps/range/index.html`.
- **Type scale (F16).** Every `font-size` in `packages/fps-client/src` is one of the five steps now. Rule used for the mapping: 11-14 px became small (13), 15-19 body (16), 20-26 heading (22), larger things title or display by their role. The lobby seat's name went from 20 to heading; DESIGN.md says so.
- **Literal colours in `hud/hud.ts`.** All CSS and canvas colours read theme tokens (the damage trace reads them from the computed style). What is left as literals is the portrait drawing's own palette, which is a picture, not chrome.
- **The WebGPU badge is gone.** Which backend drew the frame is no news to a player; scripts read it from `document.body.dataset.backend`, and Settings > Video shows it where it means something.
- **Short landscape pages.** Under 520 px of height the page shell's header is one line and its footer one row (see ticket 23).
- 2026-11-10, owner: shipped in v2.153.0 (checked in that tag). Verified with Chrome's touch emulation only; a real phone, iOS Safari above all, is still to be tried by a person.
- 2026-11-14, touch agent: **the design audit this ticket asked for is `docs/design-audit/2026-11-10.md`** (50 shots at 1920x1080, 844x390 and 390x844, the phone ones with real touches so the thumb controls are in them; five reviewers; 40 findings after one was dropped as not a fault). 26 pass in its After column; 14 are left, each with its reason there: the owner's screens (Profile, Battle Royale), the weapons and settings sessions' screens, and three low ones. Text failing contrast over the 50 shots went from 135 to 13, none of the 13 a line a player reads. Decisions the audit forced, all in DESIGN.md:
  - A phone on its side (under 520 px tall) gets its own main menu (name and Rank right of the list) and pause menu (the legend beside the actions), and its match end is the panel alone: the scoreboard comes in the panel's place when its button is on, and the kill feed goes.
  - One speaker at a time in the slot above the readouts on touch, at body size: a caption or toast first, the hint when it is quiet. The scoreboard is opaque there and hides what would read through it.
  - The countdown's mode, number and goal share one plate; the result heads the end panel on its plate; a ping's label has a solid one.
  - Ally tags never lie on each other (`allyTags` in `hud/ally-tags.ts`): the nearer ally keeps their name, edge tags step along the edge.
  - Settings tabs wrap on an upright phone; Play Online with no server leads with Check again and never focuses a typed field on touch.
  - Not changed on purpose: the HUD size stays locked on a phone (the layout is fitted to the thumb controls; what must be read grew to 16 px instead).
