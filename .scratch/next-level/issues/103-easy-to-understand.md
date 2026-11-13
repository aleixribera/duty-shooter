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

**2026-11-13, loop pass 18 (pass 2: one speaker in the hint slot).** Review 13b's objective 5 gap: "the hint slot takes several speakers at once and repeats facts". Measured with `one-voice/look.mjs` (three Bot Matches, the slot sampled every 100 ms). Before (`one-voice/before/`): two lines at once in all three: Range Control's caption over the WASD hint at every match's opening; in Charge the round card, the caption "Attackers. Plant the charge." and the toast "Round 1: you attack." together; dead, the "F LOADOUT" plate and the hint "F Change your loadout before you respawn".

Built:
- Range Control's caption speaks in the toast's slot. A toast and a caption cut each other (a caption waits under a toast younger than 2 s, so a fresh fact is not wiped); the hint waits while either speaks, and its clock stops meanwhile, so time hidden is not counted as a showing. A notice waits for a caption too. The touch layout's CSS rule for this is gone (the HUD does it everywhere).
- Under the round card (countdown, Charge freeze) the caption is hidden: the card writes the round, the side and the goal. Charge no longer toasts "Round N: you attack."; the voice still says it.
- The "F LOADOUT" plate steps aside while the loadout hint (same key) shows.
- Found on the way: every line that comes in with `ds-in` and is centred by its transform (the hint, the round card, the end card) sat half its width to the right for the 160-240 ms it came in. `ds-in` now animates the `translate` property.

After (`one-voice/after/`, `after-phone/`, `sheet.jpg`): at most one line in the slot in all three matches at 1920 and 390 wide; the hint comes in centred.

Review (second opinion): a caption cut toasts posted the same frame (Kill Leader under "N squads left"), and hidden time counted as a hint showing: both fixed as above. Left: in a desktop window 1000 px wide or less the caption still sits at the top (phone rule) while the slot logic treats it as sharing the bottom.
