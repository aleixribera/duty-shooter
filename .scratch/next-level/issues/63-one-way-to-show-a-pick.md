# One way to show a pick

Status: resolved

Release: v2.187.10

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12d.md`, UI and UX), on the Bot Match setup (`03`):
- The map picker marked its choice with a signal outline, but Mode and Sides marked theirs with a cream fill: two ways of showing a selection on one screen.
- The Mode grid was 3 + 2 cells of different widths.
- The primary button said "START", not what it starts.

## Comments

- **One selection language.** Every segmented control (`.ds-seg` in `theme.ts`) now marks its lit option the way the map pictures do: framed in signal (a 2 px inset ring) on the raised step, in full-strength text. The cream fill is gone. DESIGN.md already says signal marks "the one choice that is selected"; this makes the segments follow it. On touch, the lit option keeps the same frame over the 1 px line the others carry.
- **Focus apart from the pick.** The first focus shot showed a keyboard-focused option as a second thin signal ring, too close to the lit frame. Focus now tints the option with signal-dim and rings it 2 px outside, as `.ds-btn` shows focus. Where you are and what is picked read apart.
- **Modes one under another.** All five modes sit in one column at one width (`lobby.ts`). A row of five cut "Team Deathmatch" at the cell edges, and 3 + 2 read as uneven.
- **"Start match".** The host's primary button names what it does. Every script clicks by text prefix (`startsWith`), so `'Start'` still finds it (`bot-runs`, `record`, `perf`, `chaos`, the trailer's `shots.mjs`).

Verified:
- The `fps-client` typecheck passes.
- `ui-model`, `royale-lobby-view` and `bot-setup` tests pass (57/57).
- `../setup/look.mjs` shot the menu's Bot Match at 1920x1080, phone landscape 844x390 and phone 390x844 (`../setup/after/`). The lit map, mode and side all wear the same signal frame, the modes form one even column, and the button reads "Start match".
- `desktop-focus.jpg` and `focus-crop.png` are from real Tab presses that moved focus to Free-for-all: a tinted, ringed row under the framed Team Deathmatch.
- No page errors.
- These were the first shots taken with the light `launchChrome()` from ticket 64.
