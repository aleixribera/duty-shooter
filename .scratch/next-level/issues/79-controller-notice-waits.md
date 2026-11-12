# The controller notice waits for the card

Status: resolved

Release: v2.187.28

Spec: `../spec.md`

From the review of 2026-11-12 (`../reviews/2026-11-12f.md`), UI and UX (04): "a 'Controller connected: Wireless Controller' toast sits on the gun under the crosshair at the same moment as the opening card."

## Comments

- **What it is.** The browser reports a pad when it is first used or the page first sees it, often as a match opens. The page toasted it at once, in the toast's place above the readouts, while the opening card had the screen. Two messages spoke at once, and the second was about the machine, not the match.
- **What changed:**
  - `hud.ts`: `Hud.notice(text, seconds)` is a toast about the machine. It waits until no round card is up (the opening countdown, a Charge freeze) and no toast is speaking (`noticeDue`), then takes the toast's place. A newer notice replaces one still waiting.
  - `main.ts`: the controller connection uses it. A notice still waiting when the menu swaps to another map's game is passed on to it.
- **Left as toasts.** Charge's "Round N: you attack", the countdown lines and "The Ring is closing" are paired with Range Control's spoken lines. Holding them back would split the words from the voice.
- **Seen in the page** (`../pad-notice/start.mjs`, `sheet.jpg`): a Survival Town Bot Match, with a pad announced the moment play starts.
  - Before: the toast under the opening card at 1.5 s.
  - After: the card alone. Once the card has gone, the notice shows under Range Control's caption, where the movement hint stands aside for its 4 s.

A second-opinion review confirmed the order within the HUD's update and that a notice can't get stuck: the card drops whenever play isn't on. It found two cases where a notice was lost, both fixed:
- A pad's first press often comes at the menu. The menu's game never updates its HUD, and picking another map disposed of that game and its waiting notice. The waiting notice now passes to the new game.
- With Tab holding the scoreboard, or a Battle Royale's island map open, the toast's place is hidden. A notice due then counted down unseen. It now waits for the place to show.

Verified:
- The `fps-client` and `range` typechecks pass.
- `hud-round-card` tests pass (7/7, three new for `noticeDue`, one covering the hidden place).
- Match-start frames before and after at 1.5 and 7 s, the toast's text and opacity read from the page, with no page errors.
