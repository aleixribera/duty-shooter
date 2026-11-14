# Easy to understand in a short time

Status: open

Release: v2.193.0 (pass 1), v2.211.1 (pass 47)

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

### Pass 47 (2026-11-14): Gun Game's prompts and the free-for-all bar (review 2026-11-14a, defects 2 and 3)

- Gun Game hands everyone the ladder's gun in both slots, so it now offers no loadout at all: no "F Loadout" on the countdown card or under the crosshair, no "Main · 1 2 3 to switch · F Loadout" chip while dead, no "Change your loadout" hint (the scores' hint comes first instead), and F and 1 2 3 do nothing there. The "Swap to your other weapon" hint needs a different gun in the other slot. One rule in core, `pickedLoadouts(mode)`.
- The free-for-all and Gun Game bar's left box is the best player who isn't you: "Leader" when ahead, "Tied" when level with you at the top, their place ("2nd") while you lead. Your own name never sits there beside "You · 1st".
- One order for the race modes: the scoreboard, the bar and the results all rank a free-for-all by kills then fewest deaths and Gun Game by the ladder, kills, deaths (the scoreboard ranked by Score, so it said 3rd beside the bar's 4th). A free-for-all at its time limit now goes to the fewer deaths when kills are level, as Gun Game already did, so "Draw" never stands over a ranked 2nd (second opinion's finding).
- Proof: `gungame-hud/look.mjs` → `gungame-hud/after/` (1-countdown: no Loadout line; 2-leading: "Onyx 2nd" beside "You · 1st"; 4-dead: no chip; F at the countdown and while dead opened nothing; the dead hint was "Tab Hold for the scores"). Before: review 2026-11-14a frames 10, 11-kill-2, 12, 13-30s, 14-last-55s. Phone width not shot: the labels are shorter than "Leader".

Pass 48 (2026-11-14), the death screen's collisions (review 2026-11-14a, defect 5, 23-kill-1b): out of the fight, the score popup goes at the death and none stands while you're out (`.ds-hud.out`), so a "+150" can't run into the "Main · 1 2 3 to switch · F Loadout" plate; the kill feed keeps the kill. Markers and Battle Royale ally tags keep off the spectator's panel (`pinMarker`'s `panel`, measured from the DOM when its words or the frame's size change): over it, or beside it where it reaches the top of a short screen. The CI fix for pass 47's stale scoreboard test shipped first (v2.211.2).
Checked: `hud-corners.test.ts` (over the panel, its right edge, a short screen), `npx vitest related` on the touched files, typecheck. `../death-hud/look.mjs` (a Charge Bot Match on Switchyard, a popup added when hurt and again while out, 60 samples watching teammates): before, the popup lay on the prompt plate in 3 samples and a marker on the panel's words in 27 of 60; after, 0 and 0 at 1920x1080, and 0 and 0 at 844x390 (`../death-hud/sheet.jpg`, `corner-sheet.jpg`). Second opinion (one review subagent): no real bugs; the panel's size went stale on a resize (now keyed by the frame's size), the edge test didn't test the edge (now does), and the short-screen case found at 844x390 now moves the marker beside the panel.

Pass 51 (2026-11-14), Charge's goal said twice (review 2026-11-14a, 23-a): during a round's freeze the plate under the match bar ("Round 1 · Attacking / You carry the charge · plant it at A or B") stood over the round card, which said "Plant the charge at A or B and guard it". Now the plate waits for the round to go live, and the card is the one place the goal is said; the carrier's card says "You carry the charge · plant it at A or B" (the plate's own words, so the line carries on unchanged when the round goes live), everyone else's keeps `goalLine()`. Pattern: shooters with a pre-round phase (Valorant's buy phase, CS's freeze time) give the round's goal once, centre screen, and keep the persistent objective line for live play.
Checked: `hud-round-card.test.ts` (`freezeGoal`), typecheck. `../charge-goal/look.mjs` (a Charge Bot Match on Switchyard): freeze → plate hidden, card "You carry the charge · plant it at A or B"; live → plate "Round 1 · Attacking / You carry the charge · plant it at A or B", card gone (`charge-goal/after/1-freeze.jpg`, `2-live.jpg`, phone `after-phone/1-freeze.jpg`, one line at 844 px). Before: review 2026-11-14a `23-switchyard-charge-a.jpg`.

Pass 52 (2026-11-14), "WASD Move" over kills (review 2026-11-14a, 24-kill-1, 30-range-*): the move hint ("WASD Move. The mouse looks") went up at the spawn and stayed its full 12 s whatever happened, so a player who turned and shot someone read "Move" over their own kill. Now it is not given in a fight or the 4 s after (`HINT_CALM`, as the lessons), and a fight takes it down as a passed moment: up 2 s or more, it counts as a showing; either way it is back at the next spawn, not over the next lull of this life, so a range player firing at dummies sees no flicker. Pattern: onboarding prompts in well-loved shooters (Apex's and Titanfall 2's first-time prompts, Halo's control hints) give the controls on arrival and get out of the way once the player is engaged, never over a fight.
Checked: `hints.test.ts` (new case fails on the old rule, passes on the new), typecheck. `../move-hint/look.mjs` in the range, never moving, M4A1 on the 10 m dummy: before, the hint stood over the kill (`move-hint/before/2-kill-1920.jpg`); after, it goes with the first shot and the line at the kill is "R Reload" (`move-hint/after/2-kill-1920.jpg`, phone `2-kill-844.jpg`). At 844x390 that line still sits over "Eliminated Dummy" (BACKLOG, "Hint over the kill line on a phone").

Pass 53 (2026-11-14), the private lobby's rows (review 2026-11-14a, 41: "friend rows with no ping and open seats reading 'Bot'"): online, a seat the match fills with a bot is a friend's to take until the start (a friend joining by the link takes it), so it now has the open seat's dashed frame and reads "Open seat", with "Bot" small on its right for who plays it if no one joins; it is the bot's alone offline (Bot Match) and in Humans vs bots, which brings its bots on top of the people, so those still read "Bot". A person whose round trip isn't measured yet shows "– ms", unlit, instead of a gap. The friends' missing pings in the review were the capture's: its friends were bare sockets that never report a round trip, as every real client does in its `cmds`; `reviews/capture.mjs`'s friends now send one each second (Marta 38 ms, Pol 112 ms). Named bots in the lobby (CoD and Halo list them by name and skill) would need the server to name its bots before the start: left in BACKLOG.
Checked: typecheck, `ui-model.test.ts` and `bot-match-sides.test.ts`. `../lobby-seats/look.mjs` (host in a private lobby; Marta reports 38 ms, Pol nothing): before, Pol's row had no ping and the five bot seats read "Bot" (`lobby-seats/before/01-tdm.jpg`); after, Pol "– ms", Marta "38 ms", bot seats "Open seat · Bot" in Team deathmatch and Free-for-all, plain "Bot" in Humans vs bots, desktop and phone (`lobby-seats/after/01-tdm.jpg`, `02-ffa.jpg`, `04-phone-seats.jpg`, `05-hvb.jpg`, `sheet.jpg`).
