# Easy to understand in a short time

Status: open

Release: v2.193.0 (pass 1)

Spec: `../spec.md`

`PLAN.md` item 7 (objective 5): from opening the link to playing in seconds, and a first match that teaches by doing.

Acceptance: with a fresh profile, a scripted newcomer reaches a live match in under 15 s from the page opening; the first match shows its hint line and goal, and the review's objective 5 passes.

## Comments

**2026-11-13, loop pass 12 (pass 1, rough).** Measured first with `newcomer/look.mjs` (fresh Chrome profile, dev server and a local public server; it presses the obvious way forward on each screen and logs each step).

Before (`newcomer/before/`):
- The menu answers in 0.4 s.
- **Play Online did nothing a newcomer could see.** It joins the public lobby in one click under the menu's name, and a fresh profile has none: the click only put the focus in the empty "Your name" box in the top corner (`before/online-1b-name.jpg`). Typing a name and pressing again: live at 11.4 s (four clicks; on an empty server you are the host and press Start Match).
- Bot Match: two clicks (Bot Match, Start Match), the goal plate in the countdown, live at 11.2 s, then the hint "WASD Move. The mouse looks".
- **Joining a match already under way never says what wins**: there is no countdown, so no goal plate; only "TDM · 75" on the match bar (`after` run 1, `online-4-live.jpg` before the fix).

Built:
- **A name from the first visit**: a browser with none gets "Player NNNN" (saved; the name box shows it and changes it). Play Online is now one click. Decided: a plain stand-in name, so it reads as one to change (PLAN: placeholder names stay plain). Overridable.
- **The goal plate for someone who joins under way**: the mode's name and its goal line, without a count, for 4 s once alive and unpaused (not Charge, whose own line says it all round, nor Battle Royale). The name wraps on a phone.

After (`newcomer/after/`, `after-phone/`): Play Online, one click, live at 6.2 s on a match under way, the plate "Team deathmatch / First team to 75 kills, or ahead when the clock runs out" with the WASD hint under it (`after/online-5-hint.jpg`, `after-phone/plate.jpg`). Bot Match unchanged at 11.7 s.

Review (second opinion): the plate could run out behind the pause menu or Firefox's tip; it now waits for the game to be unpaused. Left:
- A lobby member who stays on the lobby page through the countdown and joins after it gets no plate (their match was never "joined under way" by the rule).
- These times are the dev server on this PC with a warm cache; a first visit to the production server downloads the game first. The 15 s check wants a timed run against a production build over a real connection.
- Objective 5 needs the review to pass it; the last review's other gaps (the hint teaching WASD while the magazine is empty, "change loadout" twice) are untouched.
